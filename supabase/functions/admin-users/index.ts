import { withSupabase } from 'npm:@supabase/server@^1'

type Json = Record<string, unknown>
type CallerProfile = {
  auth_user_id: string
  username: string
  fullname: string
  role: 'admin' | 'staff'
  is_active: boolean
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGIN') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const USERNAME_RE = /^[a-z0-9._-]{3,40}$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/
const AUTH_EMAIL_DOMAIN = 'dahabbay.example.com'

function responseHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
}

function jsonResponse(origin: string | null, status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  })
}

function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeRole(value: unknown): 'admin' | 'staff' {
  return value === 'admin' ? 'admin' : 'staff'
}

function errorResponse(origin: string | null, status: number, code: string): Response {
  return jsonResponse(origin, status, { error: code, code })
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const origin = req.headers.get('Origin')

    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      return errorResponse(origin, 403, 'ORIGIN_NOT_ALLOWED')
    }
    if (req.method !== 'POST') {
      return errorResponse(origin, 405, 'METHOD_NOT_ALLOWED')
    }

    // Use the same authenticated RPC that already succeeds in the browser.
    // This avoids misclassifying an admin-client lookup problem as a disabled account.
    const { data: profileData, error: profileError } = await ctx.supabase.rpc('api_my_profile')
    if (profileError) {
      console.error('Caller profile RPC failed', profileError.message, profileError.code, profileError.details)
      return errorResponse(origin, 500, 'PROFILE_LOOKUP_FAILED')
    }

    const callerProfile = profileData as CallerProfile | null
    if (!callerProfile?.auth_user_id) {
      console.error('Caller profile RPC returned no profile')
      return errorResponse(origin, 403, 'PROFILE_NOT_FOUND')
    }
    if (!callerProfile.is_active) {
      return errorResponse(origin, 403, 'ACCOUNT_DISABLED')
    }
    if (callerProfile.role !== 'admin') {
      return errorResponse(origin, 403, 'ADMIN_REQUIRED')
    }

    const callerId = callerProfile.auth_user_id
    const adminClient = ctx.supabaseAdmin
  let body: Json
  try {
    body = await req.json()
  } catch {
    return errorResponse(origin, 400, 'INVALID_JSON')
  }

  const action = String(body.action ?? '')

  async function audit(actionName: string, entityId: string | null, details: Json = {}) {
    const { error } = await adminClient.from('audit_log').insert({
      actor_id: callerId,
      actor_username: callerProfile.username,
      action: actionName,
      entity_type: 'user',
      entity_id: entityId,
      details,
    })
    if (error) console.error('Audit insert failed', error.message)
  }

  try {
    if (action === 'list') {
      const { data, error } = await adminClient
        .from('profiles')
        .select('auth_user_id,username,fullname,role,is_active,created_at,updated_at')
        .order('username', { ascending: true })
      if (error) throw error
      return jsonResponse(origin, 200, { users: data ?? [] })
    }

    if (action === 'create') {
      const username = normalizeUsername(body.username)
      const fullname = String(body.fullname ?? '').trim()
      const password = String(body.password ?? '')
      const role = normalizeRole(body.role)

      if (!USERNAME_RE.test(username)) return errorResponse(origin, 400, 'INVALID_USERNAME')
      if (fullname.length < 1 || fullname.length > 120) return errorResponse(origin, 400, 'INVALID_FULLNAME')
      if (!PASSWORD_RE.test(password)) return errorResponse(origin, 400, 'WEAK_PASSWORD')

      const { data: existing } = await adminClient
        .from('profiles')
        .select('auth_user_id')
        .eq('username', username)
        .maybeSingle()
      if (existing) return errorResponse(origin, 409, 'USERNAME_EXISTS')

      const email = `${username}@${AUTH_EMAIL_DOMAIN}`
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { username, role },
        user_metadata: { fullname },
      })
      if (createError || !created.user) {
        console.error('Auth create failed', createError?.message)
        return errorResponse(origin, 400, createError?.message?.toLowerCase().includes('already') ? 'USERNAME_EXISTS' : 'CREATE_FAILED')
      }

      const { error: profileError } = await adminClient.from('profiles').insert({
        auth_user_id: created.user.id,
        username,
        fullname,
        role,
        is_active: true,
        created_by: callerId,
      })

      if (profileError) {
        console.error('Profile create failed', profileError.message)
        await adminClient.auth.admin.deleteUser(created.user.id)
        return errorResponse(origin, 500, 'CREATE_FAILED')
      }

      await audit('create_user', created.user.id, { username, role })
      return jsonResponse(origin, 201, {
        user: { auth_user_id: created.user.id, username, fullname, role, is_active: true },
      })
    }

    if (action === 'update') {
      const targetId = String(body.auth_user_id ?? '')
      const fullname = String(body.fullname ?? '').trim()
      const role = normalizeRole(body.role)
      const password = body.password === undefined ? '' : String(body.password)

      if (!targetId) return errorResponse(origin, 400, 'INVALID_USER')
      if (fullname.length < 1 || fullname.length > 120) return errorResponse(origin, 400, 'INVALID_FULLNAME')
      if (password && !PASSWORD_RE.test(password)) return errorResponse(origin, 400, 'WEAK_PASSWORD')

      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('auth_user_id,username,fullname,role,is_active')
        .eq('auth_user_id', targetId)
        .single()
      if (targetError || !target) return errorResponse(origin, 404, 'USER_NOT_FOUND')

      if (targetId === callerId && role !== 'admin') {
        return errorResponse(origin, 409, 'SELF_DEMOTION')
      }

      if (target.role === 'admin' && role !== 'admin') {
        const { count } = await adminClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('is_active', true)
        if ((count ?? 0) <= 1) return errorResponse(origin, 409, 'LAST_ADMIN')
      }

      const { data: authTarget, error: authTargetError } = await adminClient.auth.admin.getUserById(targetId)
      if (authTargetError || !authTarget.user) return errorResponse(origin, 404, 'USER_NOT_FOUND')

      const authAttributes: Record<string, unknown> = {
        app_metadata: { ...(authTarget.user.app_metadata ?? {}), username: target.username, role },
        user_metadata: { ...(authTarget.user.user_metadata ?? {}), fullname },
      }
      if (password) authAttributes.password = password

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetId, authAttributes)
      if (authUpdateError) {
        console.error('Auth update failed', authUpdateError.message)
        return errorResponse(origin, 400, 'UPDATE_FAILED')
      }

      const { data: updated, error: profileUpdateError } = await adminClient
        .from('profiles')
        .update({ fullname, role })
        .eq('auth_user_id', targetId)
        .select('auth_user_id,username,fullname,role,is_active,created_at,updated_at')
        .single()

      if (profileUpdateError) {
        console.error('Profile update failed', profileUpdateError.message)
        return errorResponse(origin, 500, 'UPDATE_FAILED')
      }

      await audit('update_user', targetId, { username: target.username, role, password_changed: Boolean(password) })
      return jsonResponse(origin, 200, { user: updated })
    }

    if (action === 'delete') {
      const targetId = String(body.auth_user_id ?? '')
      if (!targetId) return errorResponse(origin, 400, 'INVALID_USER')
      if (targetId === callerId) return errorResponse(origin, 409, 'CANNOT_DELETE_SELF')

      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('auth_user_id,username,role,is_active')
        .eq('auth_user_id', targetId)
        .single()
      if (targetError || !target) return errorResponse(origin, 404, 'USER_NOT_FOUND')

      if (target.role === 'admin') {
        const { count } = await adminClient
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('is_active', true)
        if ((count ?? 0) <= 1) return errorResponse(origin, 409, 'LAST_ADMIN')
      }

      await audit('delete_user', targetId, { username: target.username, role: target.role })
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetId)
      if (deleteError) {
        console.error('Auth delete failed', deleteError.message)
        return errorResponse(origin, 500, 'DELETE_FAILED')
      }
      return jsonResponse(origin, 200, { ok: true })
    }

    return errorResponse(origin, 400, 'UNKNOWN_ACTION')
  } catch (error) {
    console.error('admin-users unexpected error', error)
    return errorResponse(origin, 500, 'UNEXPECTED_ERROR')
  }
  }),
}
