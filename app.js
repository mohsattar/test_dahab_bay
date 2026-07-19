const SB_URL='https://flrujsfbqsbwrkdvmzih.supabase.co';
const SB_KEY='sb_publishable_OCYfPOwqy2gYPUPzY4fJzw_tG2T2DB9';
const AUTH_EMAIL_DOMAIN='dahabbay.example.com';
const SESSION_KEY='dahab_bay_auth_session';
const PASSWORD_POLICY=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
let authSession=null;
let refreshPromise=null;

function h(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function attr(value){return h(value).replace(/`/g,'&#96;');}
function actionCode(value){return attr(value);}
function jsArg(value){return JSON.stringify(String(value??'')).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
function normalizeUsername(value){return String(value||'').trim().toLowerCase();}
function usernameToEmail(username){return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;}
function parseApiError(text,status){
  try{
    const data=JSON.parse(text);
    const message=data.message||data.error_description||data.error||'Request failed';
    const knownCodes=['ROOM_CONFLICT','VERSION_CONFLICT','INVALID_DATES','NOT_AUTHORIZED','ADMIN_REQUIRED'];
    const err=new Error(message);err.status=status;err.code=knownCodes.includes(message)?message:(data.code||null);return err;
  }catch(_){const err=new Error('Request failed');err.status=status;return err;}
}
function saveSession(session){
  authSession=session||null;
  try{
    if(authSession)sessionStorage.setItem(SESSION_KEY,JSON.stringify(authSession));
    else sessionStorage.removeItem(SESSION_KEY);
  }catch(_){}
}
function loadStoredSession(){
  try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch(_){return null;}
}
async function authTokenRequest(grantType,body){
  const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SB_KEY},
    body:JSON.stringify(body)
  });
  const text=await r.text();
  if(!r.ok)throw parseApiError(text,r.status);
  const data=JSON.parse(text);
  data.expires_at=Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600);
  saveSession(data);
  return data;
}
async function signInWithPassword(username,password){
  return authTokenRequest('password',{email:usernameToEmail(username),password});
}
async function refreshSession(){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    if(!authSession?.refresh_token)throw new Error('Session expired');
    return authTokenRequest('refresh_token',{refresh_token:authSession.refresh_token});
  })();
  try{return await refreshPromise;}finally{refreshPromise=null;}
}
async function ensureSession(){
  if(!authSession)authSession=loadStoredSession();
  if(!authSession?.access_token)throw new Error('Not authenticated');
  const expiresAt=Number(authSession.expires_at)||0;
  if(expiresAt&&expiresAt-Math.floor(Date.now()/1000)<90)await refreshSession();
  return authSession;
}
async function authFetch(url,options={},retry=true){
  const session=await ensureSession();
  const headers={...(options.headers||{}),'apikey':SB_KEY,'Authorization':`Bearer ${session.access_token}`};
  const r=await fetch(url,{...options,headers});
  if(r.status===401&&retry){
    await refreshSession();
    return authFetch(url,options,false);
  }
  return r;
}
async function rpc(name,args={}){
  const r=await authFetch(`${SB_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
  const text=await r.text();
  if(!r.ok)throw parseApiError(text,r.status);
  return text?JSON.parse(text):null;
}
async function edgeAdmin(action,payload={}){
  const r=await authFetch(`${SB_URL}/functions/v1/admin-users`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,...payload})
  });
  const text=await r.text();
  if(!r.ok)throw parseApiError(text,r.status);
  return text?JSON.parse(text):null;
}
function isAdmin(){return currentUser?.role==='admin';}
function requireAdmin(){
  if(isAdmin())return true;
  alert(t('auth.admin_required'));
  return false;
}
function safeErrorMessage(error,fallback){
  console.error(error);
  return fallback||t('common.operation_failed');
}


const TRANSLATIONS={
  ar:{
    'hotel.name':'فندق دهب باي','hotel.system':'نظام الحجوزات والتشغيل','hotel.quote':'«ارتقِ بإقامتك وألهم يومك.»','hotel.eyebrow':'فندق دهب باي','hotel.design_credit':'تصميم مستوحى من هوية فندق دهب باي',
    'nav.main':'القائمة الرئيسية','auth.username':'اسم المستخدم','auth.password':'كلمة المرور','auth.username_placeholder':'أدخل اسم المستخدم','auth.password_placeholder':'أدخل كلمة المرور','auth.invalid':'اسم المستخدم أو كلمة المرور غير صحيحة','auth.login':'دخول','auth.logout':'خروج','auth.checking':'جارٍ التحقق...','auth.admin_required':'يتطلب هذا الإجراء صلاحية مدير','auth.account_disabled':'الحساب غير نشط','auth.session_expired':'انتهت صلاحية الجلسة','auth.not_authenticated':'لم يتم تسجيل الدخول',
    'page.dashboard.title':'لوحة التحكم','page.dashboard.subtitle':'نظرة واضحة على عمليات الفندق اليوم','page.new_booking.title':'حجز جديد','page.new_booking.subtitle':'سجل بيانات الإقامة والنزيل والدفع ضمن خطوات واضحة.','page.bookings.title':'الحجوزات','page.bookings.subtitle':'ابحث وراجع وأدر الحجوزات من شاشة واحدة.','page.rooms.title':'خريطة الغرف','page.rooms.subtitle':'راجع حالة الإشغال والإتاحة لكل غرف الفندق.','page.status.title':'حالة الفندق','page.status.subtitle':'تابع الغرف الشاغرة والمشغولة والحجوزات القادمة.','page.trips.title':'الرحلات والأنشطة','page.trips.subtitle':'نظّم الرحلات الخارجية واربطها بإقامة النزلاء.','page.users.title':'إدارة المستخدمين','page.users.subtitle':'تحكم في الأسماء والأدوار وصلاحيات الوصول الآمن.',
    'dashboard.eyebrow':'ضيافة دهب باي الساحلية','dashboard.welcome':'مرحباً بعودتك','dashboard.description':'لوحة تشغيل حديثة مستوحاة من أجواء فندق دهب باي الساحلية الدافئة وإطلالات البحر والضيافة الهادئة.','dashboard.create_booking':'إنشاء حجز','dashboard.view_rooms':'عرض خريطة الغرف','dashboard.today':'اليوم','dashboard.hotel_pulse':'ملخص الفندق','dashboard.arrivals':'الوصول','dashboard.departures':'المغادرة','dashboard.occupancy':'نسبة الإشغال',
    'users.management':'إدارة المستخدمين','users.add':'إضافة مستخدم','users.edit':'تعديل المستخدم','users.username':'اسم المستخدم','users.username_required':'اسم المستخدم *','users.username_placeholder':'username','users.fullname':'الاسم الكامل','users.fullname_required':'الاسم الكامل *','users.role_required':'الدور *','users.password_required':'كلمة المرور *','users.new_password':'كلمة مرور جديدة','users.confirm_password':'تأكيد كلمة المرور الجديدة','users.password_unchanged_placeholder':'اتركها فارغة بدون تغيير','users.password_policy':'كلمة المرور يجب ألا تقل عن 12 حرفًا وتحتوي على أحرف كبيرة وصغيرة ورقم ورمز.','users.leave_password_blank':'اترك حقول كلمة المرور فارغة للاحتفاظ بكلمة المرور الحالية.','users.none':'لا يوجد مستخدمون','users.load_failed':'تعذر تحميل المستخدمين','users.username_rule':'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة أو أرقام أو . _ -','users.fullname_required_error':'يرجى إدخال الاسم الكامل','users.password_policy_error':'كلمة المرور لا تطابق متطلبات الأمان','users.username_exists':'اسم المستخدم موجود بالفعل','users.add_failed':'تعذر إضافة المستخدم','users.added':'تمت إضافة "{username}" بنجاح','users.edit_title':'تعديل المستخدم — {username}','users.password_mismatch':'كلمتا المرور غير متطابقتين','users.password_changed':'تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى.','users.last_admin_demote':'لا يمكن إزالة آخر مدير','users.self_demotion':'لا يمكن للمدير تخفيض دوره بنفسه','users.save_failed':'تعذر حفظ التعديلات','users.last_admin_delete':'لا يمكن حذف آخر مدير','users.delete_confirm':'حذف المستخدم "{username}"؟','users.delete_failed':'خطأ في الحذف','users.admin':'مدير','users.staff':'موظف',
    'booking.load_failed':'تعذر تحميل الحجوزات','booking.save_atomic_failed':'تعذر حفظ الحجز. لم يتم حفظ أي بيانات جزئية.','booking.room_conflict':'الغرفة محجوزة بالفعل في الفترة المحددة','booking.version_conflict':'تم تعديل الحجز بواسطة مستخدم آخر. أعد تحميل الصفحة.',
    'print.popup_failed':'تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.','common.operation_failed':'تعذر إتمام العملية. يرجى المحاولة مرة أخرى.','common.save_changes':'حفظ التعديلات','common.cancel':'إلغاء','common.permanent_delete':'حذف نهائي','common.cannot_undo':'هذا الإجراء لا يمكن التراجع عنه','common.saving':'جارٍ الحفظ...','common.changes_saved':'تم حفظ التعديلات'
  },
  en:{
    'hotel.name':'Dahab Bay Hotel','hotel.system':'Reservation & Operations System','hotel.quote':'“Elevate your stay, inspire your day.”','hotel.eyebrow':'Dahab Bay Hotel','hotel.design_credit':'Design inspired by Dahab Bay Hotel','nav.main':'Main menu',
    'auth.username':'Username','auth.password':'Password','auth.username_placeholder':'Enter username','auth.password_placeholder':'Enter password','auth.invalid':'Incorrect username or password','auth.login':'Login','auth.logout':'Logout','auth.checking':'Checking...','auth.admin_required':'Administrator access is required','auth.account_disabled':'Account is disabled','auth.session_expired':'Your session has expired','auth.not_authenticated':'You are not signed in',
    'page.dashboard.title':'Dashboard','page.dashboard.subtitle':"A clear overview of today's hotel operations",'page.new_booking.title':'New Booking','page.new_booking.subtitle':'Capture stay, guest, and payment details in a clear workflow.','page.bookings.title':'Bookings','page.bookings.subtitle':'Search, review, and manage reservations from one screen.','page.rooms.title':'Room Map','page.rooms.subtitle':'Review occupancy and availability across the hotel.','page.status.title':'Hotel Status','page.status.subtitle':'Monitor vacant, occupied, and upcoming reservations.','page.trips.title':'Trips & Activities','page.trips.subtitle':'Organize external trips and link them to guest stays.','page.users.title':'User Management','page.users.subtitle':'Control names, roles, and secure access permissions.',
    'dashboard.eyebrow':'Dahab Bay coastal hospitality','dashboard.welcome':'Welcome back','dashboard.description':"A modern operations dashboard inspired by Dahab Bay Hotel's warm coastal atmosphere, sea views, and relaxed hospitality.",'dashboard.create_booking':'Create booking','dashboard.view_rooms':'View room map','dashboard.today':'Today','dashboard.hotel_pulse':'Hotel pulse','dashboard.arrivals':'Arrivals','dashboard.departures':'Departures','dashboard.occupancy':'Occupancy',
    'users.management':'User Management','users.add':'Add User','users.edit':'Edit User','users.username':'Username','users.username_required':'Username *','users.username_placeholder':'username','users.fullname':'Full Name','users.fullname_required':'Full Name *','users.role_required':'Role *','users.password_required':'Password *','users.new_password':'New Password','users.confirm_password':'Confirm New Password','users.password_unchanged_placeholder':'Leave blank to keep unchanged','users.password_policy':'The password must be at least 12 characters and contain uppercase and lowercase letters, a number, and a symbol.','users.leave_password_blank':'Leave the password fields blank to keep the current password.','users.none':'No users found','users.load_failed':'Unable to load users','users.username_rule':'Username may contain lowercase English letters, numbers, dots, underscores, and hyphens only','users.fullname_required_error':'Please enter the full name','users.password_policy_error':'The password does not meet the security requirements','users.username_exists':'The username already exists','users.add_failed':'Unable to add the user','users.added':'"{username}" was added successfully','users.edit_title':'Edit User — {username}','users.password_mismatch':'The passwords do not match','users.password_changed':'The password was changed. Please sign in again.','users.last_admin_demote':'The last administrator cannot be demoted','users.self_demotion':'An administrator cannot demote their own account','users.save_failed':'Unable to save the changes','users.last_admin_delete':'The last administrator cannot be deleted','users.delete_confirm':'Delete user "{username}"?','users.delete_failed':'Delete failed','users.admin':'Administrator','users.staff':'Staff',
    'booking.load_failed':'Unable to load bookings','booking.save_atomic_failed':'Unable to save the booking. No partial data was saved.','booking.room_conflict':'The room is already booked during the selected period','booking.version_conflict':'This booking was changed by another user. Reload the page.',
    'print.popup_failed':'Unable to open the print window. Please allow pop-ups.','common.operation_failed':'The operation could not be completed. Please try again.','common.save_changes':'Save Changes','common.cancel':'Cancel','common.permanent_delete':'Permanent Delete','common.cannot_undo':'This action cannot be undone','common.saving':'Saving...','common.changes_saved':'Changes saved'
  }
};
function t(key,vars={}){
  const table=TRANSLATIONS[currentLang]||TRANSLATIONS.ar;
  let value=table[key]??TRANSLATIONS.ar[key]??key;
  for(const [name,replacement] of Object.entries(vars||{}))value=value.split(`{${name}}`).join(String(replacement));
  return value;
}
function applyKeyTranslations(root=document){
  const base=root?.querySelectorAll?root:document;
  if(root?.matches?.('[data-i18n]'))root.textContent=t(root.dataset.i18n);
  base.querySelectorAll?.('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n);});
  if(root?.matches?.('[data-i18n-placeholder]'))root.placeholder=t(root.dataset.i18nPlaceholder);
  base.querySelectorAll?.('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder);});
  if(root?.matches?.('[data-i18n-title]'))root.title=t(root.dataset.i18nTitle);
  base.querySelectorAll?.('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle);});
}
const PAGE_I18N={dashboard:['page.dashboard.title','page.dashboard.subtitle'],'new-booking':['page.new_booking.title','page.new_booking.subtitle'],bookings:['page.bookings.title','page.bookings.subtitle'],rooms:['page.rooms.title','page.rooms.subtitle'],status:['page.status.title','page.status.subtitle'],trips:['page.trips.title','page.trips.subtitle'],users:['page.users.title','page.users.subtitle']};
function updatePageHeading(name){
  const keys=PAGE_I18N[name]||PAGE_I18N.dashboard;
  const title=document.getElementById('page-heading-title');const subtitle=document.getElementById('page-heading-subtitle');
  if(title)title.textContent=t(keys[0]);if(subtitle)subtitle.textContent=t(keys[1]);
}
function toggleSidebar(){document.getElementById('sidebar')?.classList.toggle('open');}
function closeSidebar(){document.getElementById('sidebar')?.classList.remove('open');}

const I18N_PAIRS=[["الدور *", "Role *"],["كلمة المرور يجب ألا تقل عن 12 حرفًا وتحتوي على أحرف كبيرة وصغيرة ورقم ورمز.", "The password must be at least 12 characters and contain uppercase and lowercase letters, a number, and a symbol."],["تعديل المستخدم", "Edit User"],["كلمة مرور جديدة", "New Password"],["تأكيد كلمة المرور الجديدة", "Confirm New Password"],["اتركها فارغة بدون تغيير", "Leave blank to keep unchanged"],["اترك حقول كلمة المرور فارغة للاحتفاظ بكلمة المرور الحالية.", "Leave the password fields blank to keep the current password."],["لا يوجد مستخدمون", "No users found"],["تعذر تحميل المستخدمين", "Unable to load users"],["اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة أو أرقام أو . _ -", "Username may contain lowercase English letters, numbers, dots, underscores, and hyphens only"],["يرجى إدخال الاسم الكامل", "Please enter the full name"],["كلمة المرور لا تطابق متطلبات الأمان", "The password does not meet the security requirements"],["اسم المستخدم موجود بالفعل", "The username already exists"],["تعذر إضافة المستخدم", "Unable to add the user"],["كلمتا المرور غير متطابقتين", "The passwords do not match"],["تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى.", "The password was changed. Please sign in again."],["لا يمكن إزالة آخر مدير", "The last administrator cannot be demoted"],["لا يمكن للمدير تخفيض دوره بنفسه", "An administrator cannot demote their own account"],["تعذر حفظ التعديلات", "Unable to save the changes"],["لا يمكن حذف آخر مدير", "The last administrator cannot be deleted"],["تعذر إتمام العملية. يرجى المحاولة مرة أخرى.", "The operation could not be completed. Please try again."],["تعذر تحميل الحجوزات", "Unable to load bookings"],["تعذر حفظ الحجز. لم يتم حفظ أي بيانات جزئية.", "Unable to save the booking. No partial data was saved."],["تعارض مع حجز آخر", "Conflict with another booking"],["تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.", "Unable to open the print window. Please allow pop-ups."],["التبديل إلى العربية", "Switch to Arabic"],["دبل توين (2)", "Double Twin (2)"],["دبل كوين (2)", "Double Queen (2)"],["ثلاثي (3)", "Triple (3)"],["رباعي (4)", "Quad (4)"],["فيلا (5)", "Villa (5)"],["عائلي بإطلالة بحر (5)", "Sea View Family (5)"],["إطلالة حديقة", "Garden View"],["الاسم *", "Name *"],["إضافة غرفة لنفس المجموعة", "Add Room to Same Group"],["تحويل لحجز جماعي وإضافة غرفة", "Convert to Group Booking and Add Room"],["جارٍ تحميل المستخدمين", "Loading users"],["نظام حجوزات فندق دهب باي","Dahab Bay Hotel Reservation System"],["فندق دهب باي — نظام الحجوزات","Dahab Bay Hotel — Reservation System"],["فندق دهب باي","Dahab Bay Hotel"],["اسم المستخدم أو كلمة المرور غير صحيحة","Incorrect username or password"],["اسم المستخدم","Username"],["كلمة المرور","Password"],["دخول","Login"],["خروج","Logout"],["لوحة التحكم","Dashboard"],["حجز جديد","New Booking"],["قائمة الحجوزات","Bookings"],["خريطة الغرف","Room Map"],["حالة الفندق","Hotel Status"],["الرحلات","Trips"],["المستخدمون","Users"],["إجمالي الغرف","Total Rooms"],["1–10 و 101–131","1–10 and 101–131"],["مشغولة الآن","Currently Occupied"],["حجز نشط","Active booking"],["متاحة","Available"],["غرفة فارغة","Vacant room"],["مغادرة اليوم","Checkout Today"],["يجب التسوية","Settlement required"],["إجمالي النزلاء الآن","Current Guests"],["في كل الغرف المشغولة","Across occupied rooms"],["وصول اليوم","Today's Check-ins"],["جارٍ التحميل...","Loading..."],["تاريخ وصول / مغادرة","Check-in / Checkout Dates"],["تاريخ وصول + عدد الليالي","Check-in + Number of Nights"],["تاريخ الوصول *","Check-in Date *"],["تاريخ المغادرة *","Checkout Date *"],["عدد الليالي *","Number of Nights *"],["عدد الليالي","Number of Nights"],["إجمالي الليالي","Total Nights"],["اختر التواريخ","Select dates"],["المبلغ الإجمالي (جنيه)","Total Amount (EGP)"],["المبلغ (جنيه)","Amount (EGP)"],["السعر (جنيه)","Price (EGP)"],["ملاحظات","Notes"],["أي ملاحظات إضافية...","Any additional notes..."],["المسؤول عن الحجز","Booking Responsible Person"],["نوع المسؤول","Responsible Person Type"],["نزيل الغرفة الأولى","First-room guest"],["مسؤول خارجي (مندوب / شركة سياحة)","External responsible person (representative / travel agency)"],["الاسم الكامل *","Full Name *"],["الاسم الكامل","Full Name"],["اسم المسؤول","Responsible person's name"],["الجنسية","Nationality"],["مصري، سعودي...","Egyptian, Saudi..."],["نوع الوثيقة","Document Type"],["بطاقة قومية","National ID"],["باسبورت","Passport"],["رقم الوثيقة","Document Number"],["مكان الإقامة / الشركة","Residence / Company"],["مكان الإقامة","Residence"],["المدينة أو العنوان","City or address"],["رقم البطاقة / الباسبورت","ID / passport number"],["إضافة غرفة","Add Room"],["تأكيد الحجز","Confirm Booking"],["مسح","Clear"],["بحث بالاسم أو رقم الغرفة أو الهاتف...","Search by name, room number, or phone..."],["كل الحالات","All Statuses"],["نشط","Active"],["منتهي","Completed"],["تصدير Excel","Export Excel"],["الغرفة","Room"],["النزيل","Guest"],["الوصول","Check-in"],["المغادرة","Checkout"],["ليالي","Nights"],["المبلغ","Amount"],["الحالة","Status"],["إجراء","Action"],["لا توجد حجوزات","No bookings found"],["مشغولة","Occupied"],["الطابق الأرضي","Ground Floor"],["الطابق الأول","First Floor"],["الغرف الشاغرة الآن","Vacant Rooms Now"],["الغرف المشغولة حاليًا","Currently Occupied Rooms"],["حجوزات قادمة — لسه ما وصلتش","Upcoming Bookings — Not Yet Checked In"],["الرحلات الخارجية","External Trips"],["كل الغرف","All Rooms"],["كل الحجوزات","All Bookings"],["حجوزات نشطة","Active Bookings"],["حجوزات منتهية","Completed Bookings"],["الإجمالي:","Total:"],["اسم الرحلة","Trip Name"],["التاريخ","Date"],["السعر","Price"],["لا توجد رحلات مسجلة","No trips recorded"],["إدارة المستخدمين","User Management"],["إضافة مستخدم","Add User"],["الاسم الكامل","Full Name"],["إضافة","Add"],["تعديل الحجز","Edit Booking"],["تعديل تاريخ المغادرة","Change Checkout Date"],["تاريخ المغادرة الجديد *","New Checkout Date *"],["اختر التاريخ","Select date"],["تأكيد","Confirm"],["إلغاء","Cancel"],["الحجز الجماعي","Group Booking"],["إضافة غرفة للمجموعة","Add Room to Group"],["حذف نهائي","Permanent Delete"],["هذا الإجراء لا يمكن التراجع عنه","This action cannot be undone"],["جارٍ التحقق...","Checking..."],["خطأ في الاتصال","Connection error"],["تنبيه:","Alert:"],["لا يوجد وصول اليوم","No check-ins today"],["لا يوجد مغادرة اليوم","No checkouts today"],["لا توجد غرف شاغرة حاليًا","No vacant rooms currently"],["غير محدد","Not specified"],["لا توجد غرف مشغولة حاليًا","No occupied rooms currently"],["لا توجد حجوزات قادمة حاليًا","No upcoming bookings currently"],["تجاوز المغادرة","Checkout overdue"],["حجوزات مستقبلية","Future Bookings"],["لا توجد حجوزات مستقبلية لهذه الغرفة","No future bookings for this room"],["تجاوز تاريخ المغادرة — يرجى التمديد أو تسجيل المغادرة","Checkout date has passed — extend the stay or check out"],["المسؤول الخارجي:","External responsible person:"],["النزلاء الإضافيون","Additional Guests"],["عرض كل رحلات الفندق ›","View all hotel trips ›"],["لا توجد رحلات مسجلة لهذا الحجز","No trips recorded for this booking"],["تسجيل مغادرة","Check Out"],["تعديل","Edit"],["تعديل المغادرة","Change Checkout"],["طباعة إيصال","Print Voucher"],["حذف","Delete"],["إغلاق","Close"],["الغرفة متاحة","Room is available"],["حجز الغرفة","Book Room"],["تأكيد تسجيل المغادرة؟","Confirm checkout?"],["خطأ في تسجيل المغادرة","Checkout failed"],["متأخر ⚠️","Overdue ⚠️"],["متأخر","Overdue"],["تفاصيل","Details"],["المجموعة","Group"],["مغادرة","Checkout"],["حذف نهائي","Permanent Delete"],["اختر الرحلة...","Choose a trip..."],["أخرى (اكتب اسم مختلف)","Other (enter a different name)"],["اسم الرحلة (اكتب هنا)","Trip Name (enter here)"],["اكتب اسم الرحلة","Enter trip name"],["تاريخ الرحلة","Trip Date"],["كل الأنواع","All Room Types"],["كل الإطلالات","All Views"],["لا توجد غرف مطابقة","No matching rooms"],["(مشغولة)","(Occupied)"],["(محجوز في الحجز)","(Selected in this booking)"],["نوع الغرفة *","Room Type *"],["فلتر الإطلالة","View Filter"],["رقم الغرفة *","Room Number *"],["الإطلالة","View"],["نوع الإقامة *","Board Type *"],["رحلات خارجية (اختياري)","External Trips (Optional)"],["إضافة رحلة","Add Trip"],["نزيل الغرفة الأولى = المسؤول","First-room guest = responsible person"],["مسؤول الغرفة","Room Responsible Person"],["اختياري","Optional"],["رقم الهاتف","Phone Number"],["يرجى تحديد التواريخ","Please select the dates"],["تاريخ المغادرة يجب أن يكون بعد الوصول","Checkout date must be after check-in"],["يرجى إضافة غرفة على الأقل","Please add at least one room"],["يرجى إدخال اسم المسؤول الخارجي","Please enter the external responsible person's name"],["عند حجز أكثر من غرفة يجب تحديد مسؤول خارجي","An external responsible person is required when booking multiple rooms"],["يرجى اختيار رقم الغرفة","Please select a room number"],["لا يمكن اختيار نفس الغرفة مرتين","The same room cannot be selected twice"],["جارٍ الحفظ...","Saving..."],["خطأ في حفظ الحجز — ","Booking save error — "],["بيانات الحجز","Booking Details"],["تاريخ مغادرة","Checkout Date"],["عدد ليالي","Number of Nights"],["الليالي","Nights"],["المسؤول الخارجي","External Responsible Person"],["النزيل الأول — مسؤول الغرفة","First Guest — Room Responsible Person"],["حفظ التعديلات","Save Changes"],["تواريخ غير صحيحة","Invalid dates"],["أدخل عدد الليالي","Enter number of nights"],["يرجى إدخال اسم النزيل","Please enter the guest name"],["يرجى التحقق من التواريخ","Please verify the dates"],["تم حفظ التعديلات","Changes saved"],["خطأ في الحفظ","Save error"],["اختر الغرفة","Select room"],["نوع الإقامة","Board Type"],["هيتم تحويل الحجز لحجز جماعي وإضافة الغرفة الجديدة بنفس تواريخ الإقامة","The booking will be converted to a group booking and the new room will use the same stay dates"],["هتتضاف الغرفة الجديدة لنفس المجموعة، بنفس تواريخ الإقامة","The new room will be added to the same group with the same stay dates"],["يرجى إدخال اسم النزيل الأول","Please enter the first guest's name"],["إضافة الغرفة","Add Room"],["اختر التاريخ الجديد","Select the new date"],["لم يتغير التاريخ","The date has not changed"],["التاريخ يجب أن يكون بعد الوصول","The date must be after check-in"],["تاريخ غير صحيح","Invalid date"],["لا توجد حجوزات في هذه المجموعة","No bookings found in this group"],["عدد الغرف","Number of Rooms"],["إجمالي المبلغ","Total Amount"],["غرف نشطة","Active Rooms"],["طباعة وصل المجموعة","Print Group Voucher"],["حذف المجموعة كاملة","Delete Entire Group"],["تسجيل مغادرة هذه الغرفة؟","Check out this room?"],["خطأ","Error"],["مدير","Administrator"],["موظف","Staff"],["يرجى إدخال اسم المستخدم وكلمة المرور","Please enter username and password"],["خطأ — قد يكون اسم المستخدم مكرراً","Error — the username may already exist"],["خطأ في الحذف","Delete error"],["المسؤول:","Responsible person:"],["طباعة","Print"],["غرفة","Room"],["النزلاء","Guests"],["النوع","Type"],["نوع الإقامة","Board Type"],["وصول","Check-in"],["مغادرة","Checkout"],["لا يوجد بيانات","No data available"],["النزيل الرئيسي","Primary Guest"],["رقم المجموعة","Group Number"],["إقامة بالفطار","Bed & Breakfast"],["نصف إقامة (فطار وعشاء)","Half Board (Breakfast & Dinner)"],["إقامة كاملة (فطار وغداء وعشاء)","Full Board (Breakfast, Lunch & Dinner)"],["إقامة بالفطار (Bed & Breakfast)","Bed & Breakfast"],["نصف إقامة — فطار وعشاء (Half Board)","Half Board (Breakfast & Dinner)"],["إقامة كاملة — فطار وغداء وعشاء (Full Board)","Full Board (Breakfast, Lunch & Dinner)"],["إطلالة بحر","Sea View"],["مواجهة بحر","Sea Side"],["حديقة","Garden View"],["إطلالة مسبح","Pool View"],["حفلة وادي استار في الطويلات","Wadi Star Party in Al-Tawilat"],["حفلة وادي القمر في الطويلات","Wadi Al-Qamar Party in Al-Tawilat"],["رحلة البلوهول وأبوجالوم والبلولاجون","Blue Hole, Abu Galum & Blue Lagoon Trip"],["رحلة محمية الثري بولز وسفاري البيتش باجي لوادي جني","Three Pools Reserve & Beach Buggy Safari to Wadi Gnai"],["سفاري بيتش باجي بانوراما دهب والطويلات","Beach Buggy Safari — Dahab Panorama & Al-Tawilat"],["الرحلة البحرية باليخت (صباحي)","Morning Yacht Trip"],["الرحلة البحرية باليخت (مسائي)","Evening Yacht Trip"],["حفلة جبل الطويلات خيمة الطباخ","Al-Tawilat Mountain Party — Al-Tabbakh Tent"],["حفلة جبل الطويلات واحة زين","Al-Tawilat Mountain Party — Zain Oasis"],["رحلة الغواصة","Submarine Trip"],["داي يوز شرم الشيخ كافيه فرشة والسوق القديم","Sharm El-Sheikh Day Use — Farsha Cafe & Old Market"],["رحلة وادي الوشواش وراس شطان","Wadi Al-Weshwash & Ras Shitan Trip"],["رحلة سانت كاترين وجبل موسى","Saint Catherine & Mount Moses Trip"]];
function getStoredLanguage(){try{return localStorage.getItem('dahab_bay_language')==='en'?'en':'ar';}catch(e){return 'ar';}}
let currentLang=getStoredLanguage();
let i18nApplying=false;
const i18nAttributeState=new WeakMap();

function bi(ar,en){return currentLang==='ar'?ar:en;}
function translateRuntimeText(value,targetLang=currentLang){
  if(value===null||value===undefined)return value;
  let text=String(value);
  const leading=(text.match(/^\s*/)||[''])[0];
  const trailing=(text.match(/\s*$/)||[''])[0];
  let s=text.slice(leading.length,text.length-trailing.length);
  if(!s)return text;
  if(targetLang==='en'){
    s=s.replace(/^تنبيه:\s*(\d+)\s*غرفة مغادرتها اليوم$/,(_,n)=>`Alert: ${n} room(s) checking out today`)
      .replace(/الغرفة\s+(\d+)\s+محجوزة من\s+(.+)\s+إلى\s+(.+)/g,(_,r,a,b)=>`Room ${r} is booked from ${a} to ${b}`)
      .replace(/تم الحجز بنجاح — (\d+) غرفة \((.+)\)/g,(_,n,r)=>`Booking completed successfully — ${n} room(s) (${r})`)
      .replace(/تم إضافة غرفة (\d+) للمجموعة/g,(_,r)=>`Room ${r} was added to the group`)
      .replace(/تعديل الحجز — غرفة (\d+)/g,(_,r)=>`Edit Booking — Room ${r}`)
      .replace(/تعديل المغادرة — غرفة (\d+)/g,(_,r)=>`Change Checkout — Room ${r}`)
      .replace(/المغادرة الحالية:\s*/g,'Current checkout: ')
      .replace(/مجموعة (.+) — (\d+) غرف/g,(_,g,n)=>`Group ${g} — ${n} rooms`)
      .replace(/مجموعة\s+([^\s]+)/g,(_,g)=>`Group ${g}`)
      .replace(/بعد (\d+) يوم/g,(_,n)=>`in ${n} day(s)`)
      .replace(/(\d+) ليلة متبقية/g,(_,n)=>`${n} night(s) remaining`)
      .replace(/(\d+) ليلة — يغادر (.+)/g,(_,n,d)=>`${n} night(s) — checkout ${d}`)
      .replace(/تمديد (\d+) ليلة ← إجمالي: (\d+) ليلة/g,(_,a,b)=>`Extended by ${a} night(s) ← Total: ${b} night(s)`)
      .replace(/مغادرة مبكرة بـ (\d+) ليلة ← إجمالي: (\d+) ليلة/g,(_,a,b)=>`Early checkout by ${a} night(s) ← Total: ${b} night(s)`)
      .replace(/تم التعديل إلى (.+)/g,(_,d)=>`Changed to ${d}`)
      .replace(/تعارض مع حجز(?: في غ (\d+))? من (.+) إلى (.+)/g,(_,r,a,b)=>`Conflict with a booking${r?' in Room '+r:''} from ${a} to ${b}`)
      .replace(/سيتم حذف حجز "(.+)" — غرفة (\d+) نهائياً\./g,(_,n,r)=>`Booking "${n}" — Room ${r} will be permanently deleted.`)
      .replace(/تم إضافة "(.+)" بنجاح/g,(_,u)=>`"${u}" was added successfully`)
      .replace(/حذف المستخدم "(.+)"؟/g,(_,u)=>`Delete user "${u}"?`)
      .replace(/تسجيل مغادرة (\d+) غرف دفعة واحدة؟/g,(_,n)=>`Check out ${n} rooms at once?`)
      .replace(/حذف (\d+) حجوزات نهائياً؟/g,(_,n)=>`Permanently delete ${n} bookings?`)
      .replace(/مغادرة جماعية \((\d+) غرف\)/g,(_,n)=>`Group Checkout (${n} rooms)`)
      .replace(/غرفة\s*(\d+)/g,(_,n)=>`Room ${n}`)
      .replace(/(^|[\s>·—(])غ\s*(\d+)/g,(_,p,n)=>`${p}Room ${n}`)
      .replace(/(\d+)\s*ليلة/g,(_,n)=>`${n} night(s)`)
      .replace(/(\d+)\s*غرفة/g,(_,n)=>`${n} room(s)`)
      .replace(/(\d+)\s*غرف(?!ة)/g,(_,n)=>`${n} rooms`)
      .replace(/(\d+)\s*نزيل/g,(_,n)=>`${n} guest(s)`);
  } else {
    s=s.replace(/Alert:\s*(\d+) room\(s\) checking out today/g,(_,n)=>`تنبيه: ${n} غرفة مغادرتها اليوم`)
      .replace(/Room\s*(\d+)/g,(_,n)=>`غرفة ${n}`)
      .replace(/(\d+) night\(s\) remaining/g,(_,n)=>`${n} ليلة متبقية`)
      .replace(/(\d+) night\(s\)/g,(_,n)=>`${n} ليلة`)
      .replace(/in (\d+) day\(s\)/g,(_,n)=>`بعد ${n} يوم`)
      .replace(/(\d+) rooms/g,(_,n)=>`${n} غرف`)
      .replace(/(\d+) room\(s\)/g,(_,n)=>`${n} غرفة`)
      .replace(/(\d+) guest\(s\)/g,(_,n)=>`${n} نزيل`);
  }
  const ordered=I18N_PAIRS.slice().sort((a,b)=>Math.max(b[0].length,b[1].length)-Math.max(a[0].length,a[1].length));
  for(const [ar,en] of ordered){
    const from=targetLang==='en'?ar:en;
    const to=targetLang==='en'?en:ar;
    if(from&&s.includes(from))s=s.split(from).join(to);
  }
  if(targetLang==='en')s=s.replace(/(^|[\s:()])ج(?=$|[\s:()])/g,'$1EGP');
  else s=s.replace(/(^|[\s:()])EGP(?=$|[\s:()])/g,'$1ج');
  return leading+s+trailing;
}

function translateTextNode(node){
  if(!node||!node.parentElement||['SCRIPT','STYLE','NOSCRIPT'].includes(node.parentElement.tagName))return;
  const current=node.nodeValue;
  if(node.__i18nOriginal===undefined||current!==node.__i18nApplied)node.__i18nOriginal=current;
  const translated=translateRuntimeText(node.__i18nOriginal);
  node.__i18nApplied=translated;
  if(current!==translated){i18nApplying=true;node.nodeValue=translated;i18nApplying=false;}
}
function translateElementAttributes(el){
  if(!el||!el.getAttribute)return;
  let state=i18nAttributeState.get(el)||{};
  for(const attr of ['placeholder','title','aria-label','alt']){
    if(!el.hasAttribute(attr))continue;
    const current=el.getAttribute(attr)||'';
    const item=state[attr]||{};
    if(item.original===undefined||current!==item.applied)item.original=current;
    const translated=translateRuntimeText(item.original);
    item.applied=translated;state[attr]=item;
    if(current!==translated)el.setAttribute(attr,translated);
  }
  i18nAttributeState.set(el,state);
}
function updateLanguageImages(root=document){
  root.querySelectorAll?.('img[data-src-ar][data-src-en]').forEach(img=>{img.src=currentLang==='ar'?img.dataset.srcAr:img.dataset.srcEn;});
  root.querySelectorAll?.('source[data-srcset-ar][data-srcset-en]').forEach(source=>{source.srcset=currentLang==='ar'?source.dataset.srcsetAr:source.dataset.srcsetEn;});
}
function applyTranslations(root=document){
  applyKeyTranslations(root);
  const base=root.nodeType===Node.TEXT_NODE?root:(root.body||root);
  if(base.nodeType===Node.TEXT_NODE)translateTextNode(base);
  else{
    translateElementAttributes(base);
    const walker=document.createTreeWalker(base,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    let n;while((n=walker.nextNode())){if(n.nodeType===Node.TEXT_NODE)translateTextNode(n);else translateElementAttributes(n);}
  }
  updateLanguageImages(root.body||root);
}
function updateCurrentDate(){
  const el=document.getElementById('current-date');if(!el)return;
  el.textContent=new Date().toLocaleDateString(currentLang==='ar'?'ar-EG':'en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
}
function updateLanguageToggles(){
  const label=currentLang==='ar'?'EN':'AR';
  document.querySelectorAll('.lang-toggle').forEach(btn=>{btn.textContent=label;btn.title=currentLang==='ar'?'Switch to English':'التبديل إلى العربية';});
}
function setLanguage(lang,persist=true){
  currentLang=lang==='en'?'en':'ar';
  if(persist){try{localStorage.setItem('dahab_bay_language',currentLang);}catch(e){}}
  document.documentElement.lang=currentLang;
  document.documentElement.dir=currentLang==='ar'?'rtl':'ltr';
  document.body.dir=document.documentElement.dir;
  document.title=bi('نظام حجوزات فندق دهب باي','Dahab Bay Hotel Reservation System');
  updateLanguageToggles();updateCurrentDate();applyTranslations(document);if(currentUser){const sidebarRole=document.getElementById('sidebar-user-role');if(sidebarRole)sidebarRole.textContent=isAdmin()?t('users.admin'):t('users.staff');}updatePageHeading(document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard');
}
function toggleLanguage(){setLanguage(currentLang==='ar'?'en':'ar');}

const nativeAlert=window.alert.bind(window);
const nativeConfirm=window.confirm.bind(window);
window.alert=(message)=>nativeAlert(translateRuntimeText(message));
window.confirm=(message)=>nativeConfirm(translateRuntimeText(message));

const i18nObserver=new MutationObserver(mutations=>{
  if(i18nApplying)return;
  for(const mutation of mutations){
    if(mutation.type==='characterData')translateTextNode(mutation.target);
    else if(mutation.type==='attributes')translateElementAttributes(mutation.target);
    else mutation.addedNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE)translateTextNode(node);else if(node.nodeType===Node.ELEMENT_NODE)applyTranslations(node);});
  }
});
i18nObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']});

const ROOM_DATA={
  1:{type:'double_twin',view:'garden'},2:{type:'double_twin',view:'garden'},3:{type:'double_twin',view:'garden'},
  4:{type:'double_twin',view:'garden'},5:{type:'double_twin',view:'garden'},6:{type:'quad',view:'garden'},
  7:{type:'quad',view:'garden'},8:{type:'double_twin',view:'garden'},9:{type:'double_twin',view:'garden'},
  10:{type:'double_twin',view:'garden'},
  101:{type:'double',view:'sea_view'},102:{type:'triple',view:'garden'},103:{type:'triple',view:'garden'},
  104:{type:'triple',view:'garden'},105:{type:'triple',view:'garden'},106:{type:'double_queen',view:'garden'},
  107:{type:'quad',view:'garden'},108:{type:'quad',view:'garden'},109:{type:'double_twin',view:'garden'},
  110:{type:'triple',view:'garden'},111:{type:'double_twin',view:'garden'},112:{type:'double_twin',view:'garden'},
  113:{type:'double_queen',view:'garden'},114:{type:'double_twin',view:'sea_view'},
  115:{type:'sea_view_family',view:'sea_view'},116:{type:'double_queen',view:'garden'},
  117:{type:'triple',view:'garden'},118:{type:'triple',view:'garden'},119:{type:'triple',view:'garden'},
  120:{type:'double_twin',view:'garden'},121:{type:'double_twin',view:'garden'},
  122:{type:'triple',view:'sea_view'},123:{type:'double_twin',view:'garden'},124:{type:'double_twin',view:'garden'},
  125:{type:'double_twin',view:'garden'},126:{type:'double_twin',view:'garden'},
  127:{type:'double',view:'sea_view'},128:{type:'double_queen',view:'sea_side'},
  129:{type:'double_twin',view:'garden'},130:{type:'villa',view:'pool_view'},131:{type:'villa',view:'pool_view'},
};
const TYPE_CAPACITY={double_twin:2,double_queen:2,double:2,triple:3,quad:4,villa:5,sea_view_family:5,'':2};
function getRoomCapacity(room){
  const d=ROOM_DATA[room]||{};
  return TYPE_CAPACITY[d.type]||2;
}
const TYPE_LABELS_I18N={
  ar:{double_twin:'دبل توين (2)',double_queen:'دبل كوين (2)',double:'دبل بإطلالة بحر (2)',triple:'ثلاثي (3)',quad:'رباعي (4)',villa:'فيلا (5)',sea_view_family:'عائلي بإطلالة بحر (5)','':'غير محدد'},
  en:{double_twin:'Double Twin (2)',double_queen:'Double Queen (2)',double:'Double Sea View (2)',triple:'Triple (3)',quad:'Quad (4)',villa:'Villa (5)',sea_view_family:'Sea View Family (5)','':'Not specified'}
};
const VIEW_LABELS_I18N={
  ar:{sea_view:'إطلالة بحر',sea_side:'مواجهة بحر',garden:'إطلالة حديقة',pool_view:'إطلالة مسبح'},
  en:{sea_view:'Sea View',sea_side:'Sea Side',garden:'Garden View',pool_view:'Pool View'}
};
const BOARD_LABELS_I18N={
  ar:{bb:'إقامة بالفطار',hb:'نصف إقامة — فطار وعشاء',fb:'إقامة كاملة — فطار وغداء وعشاء'},
  en:{bb:'Bed & Breakfast',hb:'Half Board — Breakfast & Dinner',fb:'Full Board — Breakfast, Lunch & Dinner'}
};
const TYPE_LABELS=new Proxy({}, {get:(_,key)=>(TYPE_LABELS_I18N[currentLang]||TYPE_LABELS_I18N.ar)[key]});
const VIEW_LABELS=new Proxy({}, {get:(_,key)=>(VIEW_LABELS_I18N[currentLang]||VIEW_LABELS_I18N.ar)[key]});
const BOARD_LABELS=new Proxy({}, {get:(_,key)=>(BOARD_LABELS_I18N[currentLang]||BOARD_LABELS_I18N.ar)[key]});
const BOARD_OPTIONS={toString:()=>currentLang==='ar'?'<option value="bb">إقامة بالفطار</option><option value="hb">نصف إقامة (فطار وعشاء)</option><option value="fb">إقامة كاملة (فطار وغداء وعشاء)</option>':'<option value="bb">Bed & Breakfast</option><option value="hb">Half Board (Breakfast & Dinner)</option><option value="fb">Full Board (Breakfast, Lunch & Dinner)</option>'};
const ROOMS=[1,2,3,4,5,6,7,8,9,10,...Array.from({length:31},(_,i)=>101+i)];

let bookings=[];
let currentUser=null;
let extendTarget=null;
let permDeleteTarget=null;
let addGroupRoomTarget=null;

function today(){return new Date().toISOString().split('T')[0]}
function d10(v){return v?String(v).slice(0,10):v;}
function formatDate(d){if(!d)return'—';const date=new Date(d+'T00:00:00');return date.toLocaleDateString(currentLang==='ar'?'ar-EG':'en-GB',{day:'numeric',month:'long',year:'numeric'});}
function nightsBetween(a,b){if(!a||!b)return 0;return Math.max(0,Math.round((new Date(b)-new Date(a))/86400000));}

function normalizeBooking(b){
  return{
    id:Number(b.id),room:Number(b.room),roomType:b.room_type,roomView:b.room_view,boardType:b.board_type||'bb',
    name:b.name||'—',phone:b.phone||null,nationality:b.nationality||'',idType:b.id_type||'national',idNumber:b.id_number||'',address:b.address||'',
    checkin:d10(b.checkin),checkout:d10(b.checkout),amount:b.amount,notes:b.notes||'',status:b.status,
    groupId:b.group_id||null,
    respName:b.resp_name||null,respNationality:b.resp_nationality||null,
    respIdType:b.resp_id_type||null,respIdNumber:b.resp_id_number||null,respAddress:b.resp_address||null,
    guests:Array.isArray(b.guests)?b.guests:[],
    trips:Array.isArray(b.trips)?b.trips:[],
    version:Number(b.version||1)
  };
}

async function loadBookings(){
  try{
    const data=await rpc('api_list_bookings');
    bookings=(Array.isArray(data)?data:[]).map(normalizeBooking);
  }catch(e){
    safeErrorMessage(e,t('booking.load_failed'));
    if(e?.status===401)await doLogout();
    throw e;
  }
}

async function initializeAuthenticatedApp(profile){
  currentUser=profile;
  if(!currentUser?.is_active)throw new Error('Account disabled');
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-wrapper').style.display='block';
  updateCurrentDate();
  const ub=document.getElementById('user-badge');
  ub.textContent=currentUser.fullname||currentUser.username;
  ub.style.cssText=`font-size:11px;font-weight:750;padding:8px 11px;border-radius:20px;background:${isAdmin()?'#e2eeee':'#e6f4ec'};color:${isAdmin()?'#195d62':'#277052'}`;
  const sidebarName=document.getElementById('sidebar-user-name');if(sidebarName)sidebarName.textContent=currentUser.fullname||currentUser.username;
  const sidebarRole=document.getElementById('sidebar-user-role');if(sidebarRole)sidebarRole.textContent=isAdmin()?t('users.admin'):t('users.staff');
  const sidebarAvatar=document.getElementById('sidebar-avatar');if(sidebarAvatar){const value=(currentUser.fullname||currentUser.username||'DB').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();sidebarAvatar.textContent=value||'DB';}
  document.getElementById('nav-users').style.display=isAdmin()?'':'none';
  const exportBtn=document.getElementById('export-excel-btn');
  if(exportBtn)exportBtn.style.display=isAdmin()?'':'none';
  await loadBookings();
  renderDashboard();
}

async function doLogin(){
  const u=normalizeUsername(document.getElementById('login-username').value);
  const p=document.getElementById('login-password').value;
  const err=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  err.classList.remove('show');
  if(!/^[a-z0-9._-]{3,40}$/.test(u)||!p){err.textContent=t('auth.invalid');err.classList.add('show');return;}
  btn.innerHTML='<span class="spinner"></span> '+h(t('auth.checking'));btn.disabled=true;
  try{
    await signInWithPassword(u,p);
    const profile=await rpc('api_my_profile');
    await initializeAuthenticatedApp(profile);
    document.getElementById('login-password').value='';
  }catch(e){
    saveSession(null);currentUser=null;
    err.textContent=t('auth.invalid');
    err.classList.add('show');
  }finally{
    btn.innerHTML='<i class="ti ti-login"></i> '+h(t('auth.login'));btn.disabled=false;
  }
}

async function doLogout(){
  try{
    if(authSession?.access_token){
      await fetch(`${SB_URL}/auth/v1/logout`,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':`Bearer ${authSession.access_token}`}});
    }
  }catch(_){}
  saveSession(null);currentUser=null;bookings=[];
  location.reload();
}

async function restoreAuthenticatedSession(){
  authSession=loadStoredSession();
  if(!authSession?.access_token)return;
  try{
    await ensureSession();
    const profile=await rpc('api_my_profile');
    await initializeAuthenticatedApp(profile);
  }catch(_){saveSession(null);currentUser=null;}
}

function showPage(name){
  if(!currentUser)return;
  if(name==='users'&&!requireAdmin())return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const page=document.getElementById('page-'+name);
  if(!page)return;
  page.classList.add('active');
  const idx={'dashboard':0,'new-booking':1,'bookings':2,'rooms':3,'status':4,'trips':5,'users':6};
  document.querySelectorAll('.nav-btn')[idx[name]]?.classList.add('active');
  updatePageHeading(name);closeSidebar();
  if(name==='dashboard')loadBookings().then(renderDashboard).catch(()=>{});
  else if(name==='bookings')loadBookings().then(renderBookings).catch(()=>{});
  else if(name==='rooms')loadBookings().then(renderRooms).catch(()=>{});
  else if(name==='status')loadBookings().then(renderStatus).catch(()=>{});
  else if(name==='trips')loadBookings().then(()=>{populateTripsRoomFilter();renderTrips();}).catch(()=>{});
  else if(name==='new-booking')loadBookings().then(()=>setupForm()).catch(()=>{});
  else if(name==='users')renderUsers();
}

function renderDashboard(){
  const td=today();
  const active=bookings.filter(b=>b.status!=='done'&&b.checkin<=td);
  const checkoutToday=active.filter(b=>b.checkout===td);
  const occupied=active.length;
  const totalGuests=active.reduce((s,b)=>s+1+((b.guests||[]).filter(g=>g.name).length),0);
  document.getElementById('stat-occupied').textContent=occupied;
  document.getElementById('stat-available').textContent=40-occupied;
  document.getElementById('stat-checkout').textContent=checkoutToday.length;
  document.getElementById('stat-guests').textContent=totalGuests;
  const arrivals=document.getElementById('hero-arrivals');if(arrivals)arrivals.textContent=bookings.filter(b=>b.checkin===td&&b.status!=='done').length;
  const departures=document.getElementById('hero-departures');if(departures)departures.textContent=checkoutToday.length;
  const occupancy=document.getElementById('hero-occupancy');if(occupancy)occupancy.textContent=Math.round((occupied/40)*100)+'%';
  const al=document.getElementById('checkout-alert');
  if(checkoutToday.length){al.textContent=`تنبيه: ${checkoutToday.length} غرفة مغادرتها اليوم`;al.classList.add('show');}
  else al.classList.remove('show');
  const ci=bookings.filter(b=>b.checkin===td&&b.status!=='done');
  document.getElementById('checkin-today-list').innerHTML=ci.length?ci.map(b=>`<div style="padding:8px 0;border-bottom:1px solid #f0f0ea;font-size:13px;display:flex;justify-content:space-between"><span><b>غ ${b.room}</b> — ${h(b.name)}</span><span style="color:#888">${nightsBetween(b.checkin,b.checkout)} ليلة</span></div>`).join(''):'<div class="empty-state">لا يوجد وصول اليوم</div>';
  document.getElementById('checkout-today-list').innerHTML=checkoutToday.length?checkoutToday.map(b=>`<div style="padding:8px 0;border-bottom:1px solid #f0f0ea;font-size:13px;display:flex;justify-content:space-between;align-items:center"><span><b>غ ${b.room}</b> — ${h(b.name)}</span><button class="btn btn-primary" style="padding:5px 12px;font-size:11px" data-on-click="checkoutBooking(${b.id})"><i class="ti ti-logout"></i> مغادرة</button></div>`).join(''):'<div class="empty-state">لا يوجد مغادرة اليوم</div>';
}

function getRoomStatus(room){
  const td=today();
  for(const b of bookings){
    if(b.room==room&&b.status!=='done'&&b.checkin<=td){
      if(b.checkout===td)return'checkout-today';
      return'occupied';
    }
  }
  return'available';
}
function getActiveBooking(room){
  const td=today();
  return bookings.find(b=>b.room==room&&b.status!=='done'&&b.checkin<=td);
}
function getFutureBookings(room){
  const td=today();
  return bookings.filter(b=>b.room==room&&b.status!=='done'&&b.checkin>td).sort((a,b)=>a.checkin<b.checkin?-1:1);
}

function renderVacantRooms(){
  const vacant=ROOMS.filter(r=>getRoomStatus(r)==='available');
  document.getElementById('status-vacant-count').textContent=vacant.length;
  if(!vacant.length){
    document.getElementById('status-vacant-list').innerHTML='<div class="empty-state">لا توجد غرف شاغرة حاليًا</div>';
    return;
  }
  const groups={};
  vacant.forEach(r=>{
    const d=ROOM_DATA[r]||{};
    const key=d.type||'';
    if(!groups[key])groups[key]=[];
    groups[key].push(r);
  });
  const order=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length);
  document.getElementById('status-vacant-list').innerHTML=order.map(key=>{
    const rooms=groups[key].sort((a,b)=>a-b);
    return`<div class="vacant-group">
      <div class="vacant-group-title">${TYPE_LABELS[key]||'غير محدد'} — ${rooms.length} غرفة</div>
      <div class="vacant-rooms-tags">${rooms.map(r=>`<span class="vacant-room-tag" data-on-click="showRoomDetails(${r})">غ ${r}</span>`).join('')}</div>
    </div>`;
  }).join('');
}

function renderStatus(){
  const td=today();
  renderVacantRooms();
  const occupied=bookings.filter(b=>b.status!=='done'&&b.checkin<=td).sort((a,b)=>a.room-b.room);
  const upcoming=bookings.filter(b=>b.status!=='done'&&b.checkin>td).sort((a,b)=>a.checkin<b.checkin?-1:a.checkin>b.checkin?1:a.room-b.room);
  document.getElementById('status-occupied-count').textContent=occupied.length;
  document.getElementById('status-upcoming-count').textContent=upcoming.length;
  document.getElementById('status-occupied-list').innerHTML=occupied.length?occupied.map(b=>{
    const d=ROOM_DATA[b.room]||{};
    const isOverdue=b.checkout<td;
    const nightsLeft=nightsBetween(td,b.checkout);
    return`<div class="status-row${isOverdue?' overdue':''}" data-on-click="showRoomDetails(${b.room})">
      <div class="status-room">غ ${b.room}</div>
      <div class="status-info">
        <div class="status-name">${h(b.name)}${b.groupId?' <i class="ti ti-users" style="color:#185FA5"></i>':''}</div>
        <div class="status-sub">${TYPE_LABELS[d.type]||'—'} · ${VIEW_LABELS[d.view]||'—'}</div>
      </div>
      <div class="status-dates">
        <div>${formatDate(b.checkin)} → ${formatDate(b.checkout)}</div>
        <div style="${isOverdue?'color:#CC2200;font-weight:700':'color:#888'}">${isOverdue?'تجاوز المغادرة':nightsLeft+' ليلة متبقية'}</div>
      </div>
    </div>`;
  }).join(''):'<div class="empty-state">لا توجد غرف مشغولة حاليًا</div>';
  document.getElementById('status-upcoming-list').innerHTML=upcoming.length?upcoming.map(b=>{
    const d=ROOM_DATA[b.room]||{};
    const daysUntil=nightsBetween(td,b.checkin);
    return`<div class="status-row" data-on-click="showRoomDetails(${b.room})">
      <div class="status-room">غ ${b.room}</div>
      <div class="status-info">
        <div class="status-name">${h(b.name)}${b.groupId?' <i class="ti ti-users" style="color:#185FA5"></i>':''}</div>
        <div class="status-sub">${TYPE_LABELS[d.type]||'—'} · ${VIEW_LABELS[d.view]||'—'}</div>
      </div>
      <div class="status-dates">
        <div>${formatDate(b.checkin)} → ${formatDate(b.checkout)}</div>
        <div style="color:#185FA5">بعد ${daysUntil} يوم</div>
      </div>
    </div>`;
  }).join(''):'<div class="empty-state">لا توجد حجوزات قادمة حاليًا</div>';
}

function renderRooms(){
  renderGrid('grid-ground',[1,2,3,4,5,6,7,8,9,10]);
  renderGrid('grid-first',Array.from({length:31},(_,i)=>101+i));
}
function renderGrid(id,rooms){
  const SHORT={double_twin:'Twin',double_queen:'Queen',double:'Sea View',triple:'Triple',quad:'Quad',villa:'Villa',sea_view_family:'Family',''  :''};
  const VDOT={sea_view:'🔵',sea_side:'🟤',garden:'🟢',pool_view:'🟣'};
  document.getElementById(id).innerHTML=rooms.map(r=>{
    const st=getRoomStatus(r);
    const d=ROOM_DATA[r]||{type:'',view:'garden'};
    const b=getActiveBooking(r);
    const sl=st==='occupied'?'مشغولة':st==='checkout-today'?'مغادرة':'';
    return`<div class="room-cell ${st}" data-on-click="showRoomDetails(${r})">
      <div>${VDOT[d.view]||''} ${r}</div>
      <div class="room-label">${SHORT[d.type]||''}</div>
      <div class="room-label">${sl}</div>
    </div>`;
  }).join('');
}

function showRoomDetails(room){
  const b=getActiveBooking(room);
  const td=today();
  const future=getFutureBookings(room);
  const futureHtml=future.length>0?
    `<div style="background:#EAF0FB;border-radius:8px;padding:10px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#185FA5;margin-bottom:8px"><i class="ti ti-calendar-event"></i> حجوزات مستقبلية (${future.length})</div>
      ${future.map(fb=>`<div style="font-size:12px;padding:5px 0;border-bottom:1px solid #dce5f5;display:flex;justify-content:space-between">
        <span><b>${h(fb.name)}</b>${fb.groupId?' <i class="ti ti-users" style="color:#185FA5"></i>':''}</span>
        <span style="color:#555">${formatDate(fb.checkin)} → ${formatDate(fb.checkout)}</span>
      </div>`).join('')}
    </div>`:
    `<div style="background:#f8f8f4;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:#888"><i class="ti ti-calendar-off"></i> لا توجد حجوزات مستقبلية لهذه الغرفة</div>`;
  document.getElementById('modal-title-text').textContent=`غرفة ${room}`;
  if(b){
    const isOverdue=b.checkout<td;
    const d=ROOM_DATA[room]||{};
    document.getElementById('modal-content').innerHTML=`
      ${isOverdue?`<div class="alert alert-warning show">تجاوز تاريخ المغادرة — يرجى التمديد أو تسجيل المغادرة</div>`:''}
      <div style="font-size:13px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">${h(b.name)}</div>
        ${b.phone?`<div style="font-size:12px;color:#555;margin-bottom:4px"><i class="ti ti-phone"></i> ${h(b.phone)}</div>`:''}
        <div style="font-size:11px;color:#888;margin-bottom:8px">${TYPE_LABELS[d.type]||'—'} · ${VIEW_LABELS[d.view]||'—'}</div>
        ${b.groupId?`<div style="margin-bottom:10px"><span class="badge badge-group" data-on-click="${actionCode('viewGroup('+jsArg(b.groupId)+')')}"><i class="ti ti-users"></i> مجموعة ${h(b.groupId)}</span></div>`:''}
        ${b.respName?`<div style="background:#EAF3DE;border-radius:6px;padding:7px 10px;font-size:11px;margin-bottom:10px"><b>المسؤول الخارجي:</b> ${h(b.respName)}</div>`:''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div><div style="color:#888;font-size:11px">الوصول</div><div style="font-weight:700">${formatDate(b.checkin)}</div></div>
          <div><div style="color:#888;font-size:11px">المغادرة</div><div style="font-weight:700;${isOverdue?'color:#993C1D':''}">${formatDate(b.checkout)}</div></div>
          <div><div style="color:#888;font-size:11px">الليالي</div><div style="font-weight:700">${nightsBetween(b.checkin,b.checkout)}</div></div>
          <div><div style="color:#888;font-size:11px">المبلغ</div><div style="font-weight:700">${b.amount?Number(b.amount).toLocaleString()+' ج':'—'}</div></div>
        </div>
        ${(b.guests&&b.guests.filter(g=>g.name).length>0)?`<div style="background:#f8f8f4;border-radius:8px;padding:10px;margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:#0F6E56;margin-bottom:8px"><i class="ti ti-users"></i> النزلاء الإضافيون (${b.guests.filter(g=>g.name).length})</div>${b.guests.filter(g=>g.name).map((g,i)=>`<div style="font-size:12px;padding:5px 0;border-bottom:1px solid #e0e0d8"><b>${i+2}. ${h(g.name)}</b>${g.nationality?' · '+h(g.nationality):''}${g.idNumber?' · '+h(g.idNumber):''}</div>`).join('')}</div>`:''}
        <div style="background:#FFF8E7;border-radius:8px;padding:10px;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:#854F0B;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <span><i class="ti ti-plane-departure"></i> الرحلات الخارجية (${(b.trips||[]).length})</span>
            <span style="cursor:pointer;color:#185FA5;font-weight:400;font-size:11px" data-on-click="closeModal();showTripsForRoom(${room})">عرض كل رحلات الفندق ›</span>
          </div>
          ${(b.trips&&b.trips.length)?b.trips.map(t=>`<div style="font-size:12px;padding:5px 0;border-bottom:1px solid #f0e6c8;display:flex;justify-content:space-between">
            <span><b>${h(t.name)}</b></span>
            <span style="color:#555">${t.date?formatDate(t.date):'—'}${t.price?' · '+Number(t.price).toLocaleString()+' ج':''}</span>
          </div>`).join(''):`<div style="font-size:12px;color:#aaa">لا توجد رحلات مسجلة لهذا الحجز</div>`}
        </div>
        ${futureHtml}
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" data-on-click="checkoutBooking(${b.id})"><i class="ti ti-logout"></i> تسجيل مغادرة</button>
        <button class="btn btn-secondary" style="background:#EAF3DE;color:#0F6E56;border:1px solid #C0DD97" data-on-click="closeModal();openEditModal(${b.id})"><i class="ti ti-edit"></i> تعديل</button>
        <button class="btn btn-secondary" style="background:#EAF3DE;color:#854F0B;border:1px solid #FAC775" data-on-click="closeModal();openExtendModal(${b.id})"><i class="ti ti-calendar-edit"></i> تعديل المغادرة</button>
        <button class="btn btn-secondary" style="background:#FFF8E7;color:#854F0B;border:1px solid #FAC775" data-on-click="printVoucher(${b.id})"><i class="ti ti-printer"></i> طباعة إيصال</button>
        ${isAdmin()?`<button class="btn btn-danger" data-on-click="closeModal();confirmPermanentDelete(${b.id})"><i class="ti ti-trash"></i> حذف</button>`:''}
        <button class="btn btn-secondary" data-on-click="closeModal()">إغلاق</button>
      </div>`;
  }else{
    const d=ROOM_DATA[room]||{type:'',view:'garden'};
    document.getElementById('modal-content').innerHTML=`
      <div style="text-align:center;padding:16px 0">
        <div style="font-size:32px;margin-bottom:8px;color:#3B6D11"><i class="ti ti-door"></i></div>
        <div style="font-size:14px;font-weight:700;margin-bottom:4px">الغرفة متاحة</div>
        <div style="font-size:12px;color:#888;margin-bottom:16px">${TYPE_LABELS[d.type]||'—'} · ${VIEW_LABELS[d.view]||'—'}</div>
      </div>
      ${futureHtml}
      <div class="btn-row" style="justify-content:center">
        <button class="btn btn-primary" data-on-click="closeModal();showPage('new-booking')"><i class="ti ti-plus"></i> حجز الغرفة</button>
        <button class="btn btn-secondary" data-on-click="closeModal()">إغلاق</button>
      </div>`;
  }
  document.getElementById('room-modal').classList.add('open');
}
function closeModal(){document.getElementById('room-modal').classList.remove('open');}

async function checkoutBooking(id){
  if(!currentUser||!confirm('تأكيد تسجيل المغادرة؟'))return;
  try{
    const updated=normalizeBooking(await rpc('api_checkout_booking',{p_id:Number(id)}));
    const idx=bookings.findIndex(x=>x.id===updated.id);
    if(idx>=0)bookings[idx]=updated;
    closeModal();renderDashboard();renderBookings();renderRooms();
  }catch(e){safeErrorMessage(e);alert('خطأ في تسجيل المغادرة');}
}

function renderBookings(){
  const search=(document.getElementById('search-input')?.value||'').toLowerCase();
  const status=document.getElementById('filter-status')?.value||'';
  const td=today();
  const filtered=bookings.filter(b=>{
    const m=b.name.toLowerCase().includes(search)||String(b.room).includes(search)||(b.groupId&&b.groupId.toLowerCase().includes(search))||(b.phone&&b.phone.toLowerCase().includes(search));
    if(!m)return false;
    if(status==='active'&&b.status==='done')return false;
    if(status==='done'&&b.status!=='done')return false;
    return true;
  });
  const tbody=document.getElementById('bookings-tbody');
  if(!filtered.length){tbody.innerHTML='';document.getElementById('no-bookings').style.display='';return;}
  document.getElementById('no-bookings').style.display='none';
  tbody.innerHTML=filtered.map(b=>{
    const isOverdue=b.status!=='done'&&b.checkout<td&&b.checkin<=td;
    const badge=b.status==='done'?'<span class="badge badge-done">منتهي</span>':isOverdue?'<span class="badge" style="background:#FAECE7;color:#993C1D">متأخر ⚠️</span>':b.checkout===td?'<span class="badge badge-checkout">مغادرة اليوم</span>':'<span class="badge badge-active">نشط</span>';
    const grp=b.groupId?`<br><span class="badge badge-group" data-on-click="${actionCode('viewGroup('+jsArg(b.groupId)+')')}" style="font-size:9px"><i class="ti ti-users"></i> ${h(b.groupId)}</span>`:'';
    return`<tr>
      <td style="font-weight:700">غ ${b.room}</td>
      <td title="${attr(b.name)}">${h(b.name)}${grp}</td>
      <td>${formatDate(b.checkin)}</td>
      <td style="${isOverdue?'color:#993C1D;font-weight:700':''}">${formatDate(b.checkout)}</td>
      <td>${nightsBetween(b.checkin,b.checkout)}</td>
      <td>${b.amount?Number(b.amount).toLocaleString()+' ج':'—'}</td>
      <td>${badge}</td>
      <td>
        <button class="action-btn" data-on-click="showRoomDetails(${b.room})" title="تفاصيل"><i class="ti ti-eye"></i></button>
        ${b.status!=='done'?`<button class="action-btn" data-on-click="openEditModal(${b.id})" title="تعديل"><i class="ti ti-edit" style="color:#0F6E56"></i></button>`:''}
        ${b.status!=='done'?`<button class="action-btn" data-on-click="openExtendModal(${b.id})" title="تعديل المغادرة"><i class="ti ti-calendar-edit" style="color:#854F0B"></i></button>`:''}
        ${b.groupId?`<button class="action-btn" data-on-click="${actionCode('viewGroup('+jsArg(b.groupId)+')')}" title="المجموعة"><i class="ti ti-users" style="color:#185FA5"></i></button>`:''}
        <button class="action-btn" data-on-click="printVoucher(${b.id})" title="طباعة إيصال"><i class="ti ti-printer" style="color:#854F0B"></i></button>
        ${b.status!=='done'?`<button class="action-btn" data-on-click="checkoutBooking(${b.id})" title="مغادرة"><i class="ti ti-logout"></i></button>`:''}
        ${isAdmin()?`<button class="action-btn" data-on-click="confirmPermanentDelete(${b.id})" title="حذف نهائي"><i class="ti ti-trash" style="color:#CC2200"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
}

// ========== الرحلات الخارجية ==========
function populateTripsRoomFilter(){
  const sel=document.getElementById('trips-room-filter');if(!sel)return;
  if(sel.options.length>1)return;
  ROOMS.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent='غرفة '+r;sel.appendChild(o);});
}
function showTripsForRoom(room){
  showPage('trips');
  populateTripsRoomFilter();
  const sel=document.getElementById('trips-room-filter');
  if(sel)sel.value=room;
  renderTrips();
}
function renderTrips(){
  const roomFilter=document.getElementById('trips-room-filter')?.value||'';
  const statusFilter=document.getElementById('trips-status-filter')?.value||'';
  let rows=[];
  bookings.forEach(b=>{
    if(!b.trips||!b.trips.length)return;
    if(roomFilter&&String(b.room)!==roomFilter)return;
    if(statusFilter==='active'&&b.status==='done')return;
    if(statusFilter==='done'&&b.status!=='done')return;
    b.trips.forEach(t=>rows.push({room:b.room,guest:b.name,name:t.name,date:t.date,price:t.price}));
  });
  rows.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const tbody=document.getElementById('trips-tbody');
  const total=rows.reduce((s,r)=>s+(Number(r.price)||0),0);
  document.getElementById('trips-total').textContent=total.toLocaleString();
  if(!rows.length){tbody.innerHTML='';document.getElementById('no-trips').style.display='';return;}
  document.getElementById('no-trips').style.display='none';
  tbody.innerHTML=rows.map(r=>`<tr>
    <td style="font-weight:700">غ ${r.room}</td>
    <td>${h(r.guest)}</td>
    <td>${h(r.name)}</td>
    <td>${r.date?formatDate(r.date):'—'}</td>
    <td>${r.price?Number(r.price).toLocaleString()+' ج':'—'}</td>
  </tr>`).join('');
}

// ========== فورم الحجز ==========
let roomRows=[];
let roomRowCounter=0;
let roomTripRows={};
let tripRowCounter=0;

const TRIP_OPTIONS=[
  'حفلة وادي استار في الطويلات',
  'حفلة وادي القمر في الطويلات',
  'رحلة البلوهول وأبوجالوم والبلولاجون',
  'رحلة محمية الثري بولز وسفاري البيتش باجي لوادي جني',
  'سفاري بيتش باجي بانوراما دهب والطويلات',
  'الرحلة البحرية باليخت (صباحي)',
  'الرحلة البحرية باليخت (مسائي)',
  'حفلة جبل الطويلات خيمة الطباخ',
  'حفلة جبل الطويلات واحة زين',
  'رحلة الغواصة',
  'داي يوز شرم الشيخ كافيه فرشة والسوق القديم',
  'رحلة وادي الوشواش وراس شطان',
  'رحلة سانت كاترين وجبل موسى'
]
const TRIP_LABELS_EN={"حفلة وادي استار في الطويلات":"Wadi Star Party in Al-Tawilat","حفلة وادي القمر في الطويلات":"Wadi Al-Qamar Party in Al-Tawilat","رحلة البلوهول وأبوجالوم والبلولاجون":"Blue Hole, Abu Galum & Blue Lagoon Trip","رحلة محمية الثري بولز وسفاري البيتش باجي لوادي جني":"Three Pools Reserve & Beach Buggy Safari to Wadi Gnai","سفاري بيتش باجي بانوراما دهب والطويلات":"Beach Buggy Safari — Dahab Panorama & Al-Tawilat","الرحلة البحرية باليخت (صباحي)":"Morning Yacht Trip","الرحلة البحرية باليخت (مسائي)":"Evening Yacht Trip","حفلة جبل الطويلات خيمة الطباخ":"Al-Tawilat Mountain Party — Al-Tabbakh Tent","حفلة جبل الطويلات واحة زين":"Al-Tawilat Mountain Party — Zain Oasis","رحلة الغواصة":"Submarine Trip","داي يوز شرم الشيخ كافيه فرشة والسوق القديم":"Sharm El-Sheikh Day Use — Farsha Cafe & Old Market","رحلة وادي الوشواش وراس شطان":"Wadi Al-Weshwash & Ras Shitan Trip","رحلة سانت كاترين وجبل موسى":"Saint Catherine & Mount Moses Trip"};
function getTripLabel(value){return currentLang==='ar'?value:(TRIP_LABELS_EN[value]||value);}
function buildTripSelectOptions(selected){
  const matched=TRIP_OPTIONS.includes(selected);
  let html=`<option value="">${bi('اختر الرحلة...','Choose a trip...')}</option>`;
  html+=TRIP_OPTIONS.map(o=>`<option value="${o}"${selected===o?' selected':''}>${getTripLabel(o)}</option>`).join('');
  html+=`<option value="__other__"${(!matched&&selected)?' selected':''}>${bi('أخرى (اكتب اسم مختلف)','Other (enter a different name)')}</option>`;
  return html;
}
function onTripNameChange(prefix,tid){
  const val=document.getElementById(`${prefix}-name-${tid}`)?.value;
  const wrap=document.getElementById(`${prefix}-custom-wrap-${tid}`);
  if(wrap)wrap.style.display=val==='__other__'?'':'none';
}

function addTripRow(rowId,trip){
  const tid=++tripRowCounter;
  roomTripRows[rowId]=roomTripRows[rowId]||[];
  roomTripRows[rowId].push(tid);
  const el=document.getElementById(`rr-trips-${rowId}`);if(!el)return;
  const selected=trip?.name||'';
  const isOther=selected&&!TRIP_OPTIONS.includes(selected);
  const div=document.createElement('div');
  div.id=`trip-row-${tid}`;
  div.style.cssText='background:#FFF8E7;border-radius:8px;padding:10px;margin-bottom:8px;position:relative';
  div.innerHTML=`
    <button type="button" data-on-click="removeTripRow(${rowId},${tid})" style="position:absolute;left:8px;top:8px;background:none;border:none;color:#CC2200;cursor:pointer;font-size:14px"><i class="ti ti-x"></i></button>
    <div class="form-grid">
      <div class="form-group full"><label>اسم الرحلة</label>
        <select id="trip-name-${tid}" data-on-change="onTripNameChange('trip',${tid})">${buildTripSelectOptions(selected)}</select>
      </div>
      <div class="form-group full" id="trip-custom-wrap-${tid}" style="display:${isOther?'':'none'}"><label>اسم الرحلة (اكتب هنا)</label><input type="text" id="trip-name-custom-${tid}" placeholder="اكتب اسم الرحلة" value="${attr(isOther?selected:'')}"></div>
      <div class="form-group"><label>تاريخ الرحلة</label><input type="date" id="trip-date-${tid}" value="${attr(trip?.date||'')}"></div>
      <div class="form-group"><label>السعر (جنيه)</label><input type="number" id="trip-price-${tid}" min="0" placeholder="0" value="${attr(trip?.price||'')}"></div>
    </div>`;
  el.appendChild(div);
}
function removeTripRow(rowId,tid){
  roomTripRows[rowId]=(roomTripRows[rowId]||[]).filter(x=>x!==tid);
  document.getElementById(`trip-row-${tid}`)?.remove();
}
function collectTrips(tripIds,prefix){
  prefix=prefix||'trip';
  return (tripIds||[]).map(tid=>{
    const nameSel=document.getElementById(`${prefix}-name-${tid}`)?.value||'';
    const name=nameSel==='__other__'?(document.getElementById(`${prefix}-name-custom-${tid}`)?.value||'').trim():nameSel;
    return{
      name,
      date:document.getElementById(`${prefix}-date-${tid}`)?.value||'',
      price:document.getElementById(`${prefix}-price-${tid}`)?.value?Number(document.getElementById(`${prefix}-price-${tid}`).value):0
    };
  }).filter(t=>t.name);
}

function onRespTypeChange(){
  document.getElementById('f-external-resp').style.display=document.getElementById('f-resp-type').value==='external'?'':'none';
}

let dateInputMode='dates';
function setDateMode(mode){
  dateInputMode=mode;
  const isNights=mode==='nights';
  document.getElementById('f-checkout-group').style.display=isNights?'none':'';
  document.getElementById('f-nights-input-group').style.display=isNights?'':'none';
  document.getElementById('mode-dates-btn').className='btn '+(isNights?'btn-secondary':'btn-primary');
  document.getElementById('mode-nights-btn').className='btn '+(isNights?'btn-primary':'btn-secondary');
  if(isNights){document.getElementById('f-checkout').value='';onNightsInput();}
  else{document.getElementById('f-nights-input').value='';onDatesChange();}
}

function onNightsInput(){
  const ci=document.getElementById('f-checkin').value;
  const n=parseInt(document.getElementById('f-nights-input').value)||0;
  const el=document.getElementById('nights-display');
  if(ci&&n>0){
    const d=new Date(ci);d.setDate(d.getDate()+n);
    const co=d.toISOString().split('T')[0];
    document.getElementById('f-checkout').value=co;
    el.textContent=n+' ليلة — يغادر '+formatDate(co);el.style.color='#0F6E56';
  }else{el.textContent='اختر التواريخ';el.style.color='#888';}
  updateAllRoomSelects();
}

function onDatesChange(){
  const ci=document.getElementById('f-checkin').value;
  const co=document.getElementById('f-checkout').value;
  const n=nightsBetween(ci,co);
  const el=document.getElementById('nights-display');
  if(n>0){el.textContent=n+' ليلة';el.style.color='#0F6E56';}
  else{el.textContent='اختر التواريخ';el.style.color='#888';}
  updateAllRoomSelects();
}

function buildRoomTypeOptions(selectedType){
  const types=[...new Set(Object.values(ROOM_DATA).map(d=>d.type))].filter(t=>t);
  let html=`<option value=""${!selectedType?' selected':''}>كل الأنواع</option>`;
  html+=types.map(t=>`<option value="${t}"${selectedType===t?' selected':''}>${TYPE_LABELS[t]||t}</option>`).join('');
  return html;
}
function buildViewFilterOptions(selectedView){
  const views=[...new Set(Object.values(ROOM_DATA).map(d=>d.view))].filter(v=>v);
  let html=`<option value=""${!selectedView?' selected':''}>كل الإطلالات</option>`;
  html+=views.map(v=>`<option value="${v}"${selectedView===v?' selected':''}>${VIEW_LABELS[v]||v}</option>`).join('');
  return html;
}
function buildRoomOptions(selectedRoom,ci,co,typeFilter,viewFilter){
  const occ=new Set(bookings.filter(b=>b.status!=='done'&&b.checkin<(co||'9999')&&b.checkout>(ci||'0000')).map(b=>b.room));
  // الغرف المختارة حاليًا في الفورم (بخلاف الغرفة الحالية)
  const chosenByOtherRows=new Set(
    roomRows.map(id=>{const s=document.getElementById(`rr-room-${id}`);return s?parseInt(s.value):null;})
      .filter(r=>r&&r!==selectedRoom)
  );
  const list=ROOMS.filter(r=>(!typeFilter||(ROOM_DATA[r]?.type===typeFilter))&&(!viewFilter||(ROOM_DATA[r]?.view===viewFilter)));
  if(!list.length)return`<option value="">لا توجد غرف مطابقة</option>`;
  return list.map(r=>{
    const busyInDB=occ.has(r)&&r!=selectedRoom;
    const chosenElsewhere=chosenByOtherRows.has(r);
    const dis=busyInDB||chosenElsewhere;
    const label=busyInDB?'(مشغولة)':chosenElsewhere?'(محجوز في الحجز)':'';
    return`<option value="${r}"${dis?' disabled':''}${r==selectedRoom?' selected':''}>${r}${label?' '+label:''}</option>`;
  }).join('');
}

function onRoomTypeChange(id){
  const typeSel=document.getElementById(`rr-typesel-${id}`);
  const type=typeSel?typeSel.value:'';
  const viewSel=document.getElementById(`rr-viewsel-${id}`);
  const view=viewSel?viewSel.value:'';
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  const roomSel=document.getElementById(`rr-room-${id}`);
  if(roomSel)roomSel.innerHTML=buildRoomOptions(null,ci,co,type,view);
  onRoomRowChange(id);
}

function onRoomViewFilterChange(id){
  const typeSel=document.getElementById(`rr-typesel-${id}`);
  const type=typeSel?typeSel.value:'';
  const viewSel=document.getElementById(`rr-viewsel-${id}`);
  const view=viewSel?viewSel.value:'';
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  const roomSel=document.getElementById(`rr-room-${id}`);
  if(roomSel)roomSel.innerHTML=buildRoomOptions(null,ci,co,type,view);
  onRoomRowChange(id);
}

function updateAllRoomSelects(changedId){
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  roomRows.forEach(id=>{
    const sel=document.getElementById(`rr-room-${id}`);if(!sel)return;
    const typeSel=document.getElementById(`rr-typesel-${id}`);
    const type=typeSel?typeSel.value:'';
    const viewSel=document.getElementById(`rr-viewsel-${id}`);
    const view=viewSel?viewSel.value:'';
    const cur=parseInt(sel.value);sel.innerHTML=buildRoomOptions(cur,ci,co,type,view);
  });
}

function addRoomRow(preRoom){
  const id=++roomRowCounter;
  roomRows.push(id);
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  const preType=preRoom?(ROOM_DATA[preRoom]?.type||''):'';
  const preView=preRoom?(ROOM_DATA[preRoom]?.view||''):'';
  const typeOpts=buildRoomTypeOptions(preType);
  const viewOpts=buildViewFilterOptions(preView);
  const opts=buildRoomOptions(preRoom,ci,co,preType,preView);
  const isFirst=roomRows.length===1;
  const div=document.createElement('div');
  div.className='room-block';div.id=`room-row-${id}`;
  div.innerHTML=`
    <div class="room-block-header" data-on-click="toggleRoomBlock(${id})">
      <span><i class="ti ti-door"></i> غرفة <span id="rr-label-${id}">${roomRows.length}</span>${isFirst?' &nbsp;<span style="color:#0F6E56;font-size:11px;font-weight:400">(نزيل الغرفة الأولى = المسؤول)</span>':''}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="rr-summary-${id}" style="font-size:11px;color:#888"></span>
        <button type="button" data-on-click="event.stopPropagation();removeRoomRow(${id})" style="background:none;border:none;color:#CC2200;cursor:pointer;font-size:16px"><i class="ti ti-x"></i></button>
      </div>
    </div>
    <div class="room-block-body" id="rr-body-${id}">
      <div class="form-grid" style="margin-bottom:12px">
        <div class="form-group"><label>نوع الغرفة *</label><select id="rr-typesel-${id}" data-on-change="onRoomTypeChange(${id})">${typeOpts}</select></div>
        <div class="form-group"><label>فلتر الإطلالة</label><select id="rr-viewsel-${id}" data-on-change="onRoomViewFilterChange(${id})">${viewOpts}</select></div>
        <div class="form-group"><label>رقم الغرفة *</label><select id="rr-room-${id}" data-on-change="onRoomRowChange(${id})">${opts}</select></div>
        <div class="form-group"><label>الإطلالة</label><div class="nights-box" id="rr-view-${id}" style="color:#888">—</div></div>
        <div class="form-group full"><label>نوع الإقامة *</label><select id="rr-board-${id}">${BOARD_OPTIONS}</select></div>
      </div>
      <div id="rr-guests-${id}"></div>
      <div style="margin-top:12px;border-top:1px dashed #ddd;padding-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:12px;font-weight:700;color:#854F0B"><i class="ti ti-plane-departure"></i> رحلات خارجية (اختياري)</div>
          <button type="button" class="btn btn-secondary" style="font-size:11px;padding:4px 10px" data-on-click="addTripRow(${id})"><i class="ti ti-plus"></i> إضافة رحلة</button>
        </div>
        <div id="rr-trips-${id}"></div>
      </div>
    </div>`;
  document.getElementById('rooms-list').appendChild(div);
  roomTripRows[id]=[];
  onRoomRowChange(id);
  renumberRoomRows();
}

function toggleRoomBlock(id){
  const b=document.getElementById(`rr-body-${id}`);
  if(b)b.style.display=b.style.display==='none'?'':'none';
}

function removeRoomRow(id){
  roomRows=roomRows.filter(x=>x!==id);
  delete roomTripRows[id];
  document.getElementById(`room-row-${id}`)?.remove();
  renumberRoomRows();
}

function renumberRoomRows(){
  roomRows.forEach((id,i)=>{
    const l=document.getElementById(`rr-label-${id}`);if(l)l.textContent=i+1;
  });
}

function onRoomRowChange(id){
  const room=parseInt(document.getElementById(`rr-room-${id}`)?.value);
  if(!room)return;
  const d=ROOM_DATA[room]||{type:'',view:'garden'};
  const cap=getRoomCapacity(room);
  const tEl=document.getElementById(`rr-type-${id}`);
  const vEl=document.getElementById(`rr-view-${id}`);
  const sEl=document.getElementById(`rr-summary-${id}`);
  if(tEl){tEl.textContent=TYPE_LABELS[d.type]||'—';tEl.style.color='#0F6E56';}
  if(vEl){vEl.textContent=VIEW_LABELS[d.view]||'—';vEl.style.color={sea_view:'#185FA5',sea_side:'#854F0B',garden:'#3B6D11',pool_view:'#7A2E8C'}[d.view]||'#888';}
  if(sEl)sEl.textContent=`غ ${room} · ${cap} نزيل`;
  buildGuestsSection(id,cap);
  // تحديث باقي الـ selectors عشان تخفي الغرفة المختارة
  updateAllRoomSelects(id);
}

function buildGuestsSection(rowId,cap){
  const el=document.getElementById(`rr-guests-${rowId}`);if(!el)return;
  let h='';
  for(let g=1;g<=cap;g++){
    const isMain=g===1;
    h+=`<div class="guest-section" style="margin-bottom:${g<cap?'10px':'0'}">
      <div class="guest-section-title"><i class="ti ti-user${isMain?'':'-plus'}"></i> النزيل ${g}/${cap}${isMain?' — مسؤول الغرفة':' &nbsp;<span style="color:#aaa;font-weight:400">(اختياري)</span>'}</div>
      <div class="form-grid">
        <div class="form-group"><label>الاسم الكامل${isMain?' *':''}</label><input type="text" id="rr-g${g}-name-${rowId}" placeholder="الاسم الكامل"></div>
        <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="rr-g${g}-phone-${rowId}" placeholder="01xxxxxxxxx"></div>
        <div class="form-group"><label>الجنسية</label><input type="text" id="rr-g${g}-nationality-${rowId}" placeholder="مصري، سعودي..."></div>
        <div class="form-group"><label>نوع الوثيقة</label><select id="rr-g${g}-idtype-${rowId}"><option value="national">بطاقة قومية</option><option value="passport">باسبورت</option></select></div>
        <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="rr-g${g}-idnumber-${rowId}" placeholder="رقم البطاقة / الباسبورت"></div>
        <div class="form-group full"><label>مكان الإقامة</label><input type="text" id="rr-g${g}-address-${rowId}" placeholder="المدينة أو العنوان"></div>
      </div>
    </div>`;
  }
  el.innerHTML=h;
}

async function setupForm(preRoom){
  document.getElementById('f-checkin').value=today();
  document.getElementById('f-checkout').value='';
  document.getElementById('f-amount').value='';
  document.getElementById('f-notes').value='';
  document.getElementById('f-resp-type').value='guest';
  document.getElementById('f-external-resp').style.display='none';
  document.getElementById('rooms-list').innerHTML='';
  document.getElementById('nights-display').textContent='اختر التواريخ';
  document.getElementById('nights-display').style.color='#888';
  roomRows=[];roomRowCounter=0;roomTripRows={};
  addRoomRow(preRoom);
}

function clearForm(){setupForm();}

async function addBooking(){
  if(!currentUser)return;
  const checkin=document.getElementById('f-checkin').value;
  const checkout=document.getElementById('f-checkout').value;
  const amount=document.getElementById('f-amount').value;
  const notes=document.getElementById('f-notes').value.trim();
  const respType=document.getElementById('f-resp-type').value;
  const errEl=document.getElementById('booking-error');
  const sucEl=document.getElementById('booking-success');
  errEl.classList.remove('show');sucEl.classList.remove('show');
  if(!checkin||!checkout){errEl.textContent='يرجى تحديد التواريخ';errEl.classList.add('show');return;}
  if(checkout<=checkin){errEl.textContent='تاريخ المغادرة يجب أن يكون بعد الوصول';errEl.classList.add('show');return;}
  if(!roomRows.length){errEl.textContent='يرجى إضافة غرفة على الأقل';errEl.classList.add('show');return;}

  let extResp=null;
  if(respType==='external'){
    const rn=document.getElementById('f-resp-name').value.trim();
    if(!rn){errEl.textContent='يرجى إدخال اسم المسؤول الخارجي';errEl.classList.add('show');return;}
    extResp={name:rn,nationality:document.getElementById('f-resp-nationality').value.trim(),
      idType:document.getElementById('f-resp-idtype').value,
      idNumber:document.getElementById('f-resp-idnumber').value.trim(),
      address:document.getElementById('f-resp-address').value.trim()};
  }
  if(roomRows.length>1&&respType!=='external'){
    errEl.textContent='عند حجز أكثر من غرفة يجب تحديد مسؤول خارجي';errEl.classList.add('show');
    document.getElementById('f-resp-type').value='external';
    document.getElementById('f-external-resp').style.display='';
    return;
  }

  const payloads=[];
  const chosenRooms=[];
  for(const id of roomRows){
    const room=parseInt(document.getElementById(`rr-room-${id}`)?.value);
    if(!room){errEl.textContent='يرجى اختيار رقم الغرفة';errEl.classList.add('show');return;}
    if(chosenRooms.includes(room)){errEl.textContent='لا يمكن اختيار نفس الغرفة مرتين';errEl.classList.add('show');return;}
    chosenRooms.push(room);
    const d=ROOM_DATA[room]||{type:'',view:'garden'};
    const cap=getRoomCapacity(room);
    const name=(document.getElementById(`rr-g1-name-${id}`)?.value||'').trim();
    if(!name){errEl.textContent='يرجى إدخال اسم النزيل الأول';errEl.classList.add('show');return;}
    const guests=[];
    for(let g=2;g<=cap;g++){
      const item={
        name:(document.getElementById(`rr-g${g}-name-${id}`)?.value||'').trim(),
        phone:(document.getElementById(`rr-g${g}-phone-${id}`)?.value||'').trim(),
        nationality:(document.getElementById(`rr-g${g}-nationality-${id}`)?.value||'').trim(),
        idType:document.getElementById(`rr-g${g}-idtype-${id}`)?.value||'national',
        idNumber:(document.getElementById(`rr-g${g}-idnumber-${id}`)?.value||'').trim(),
        address:(document.getElementById(`rr-g${g}-address-${id}`)?.value||'').trim()
      };
      if(item.name)guests.push(item);
    }
    const payload={
      room,room_type:d.type,room_view:d.view,board_type:document.getElementById(`rr-board-${id}`)?.value||'bb',
      name,phone:(document.getElementById(`rr-g1-phone-${id}`)?.value||'').trim()||null,
      nationality:(document.getElementById(`rr-g1-nationality-${id}`)?.value||'').trim(),
      id_type:document.getElementById(`rr-g1-idtype-${id}`)?.value||'national',
      id_number:(document.getElementById(`rr-g1-idnumber-${id}`)?.value||'').trim(),
      address:(document.getElementById(`rr-g1-address-${id}`)?.value||'').trim(),
      checkin,checkout,amount:payloads.length===0?(amount?Number(amount):null):null,
      notes:payloads.length===0?notes:'',status:'active',guests,
      trips:collectTrips(roomTripRows[id])
    };
    if(extResp){
      payload.resp_name=extResp.name;payload.resp_nationality=extResp.nationality;
      payload.resp_id_type=extResp.idType;payload.resp_id_number=extResp.idNumber;payload.resp_address=extResp.address;
    }
    payloads.push(payload);
  }

  const btn=document.getElementById('add-booking-btn');
  btn.innerHTML='<span class="spinner"></span> '+h(t('common.saving'));btn.disabled=true;
  try{
    const created=await rpc('api_create_bookings',{p_rows:payloads});
    const newRows=(Array.isArray(created)?created:[]).map(normalizeBooking);
    bookings=[...newRows,...bookings];
    const rNums=newRows.map(r=>`غ ${r.room}`).join('، ');
    sucEl.textContent=`تم الحجز بنجاح — ${newRows.length} غرفة (${rNums})`;sucEl.classList.add('show');
    renderDashboard();await setupForm();
  }catch(e){
    safeErrorMessage(e);
    errEl.textContent=e?.code==='ROOM_CONFLICT'?'الغرفة محجوزة بالفعل في الفترة المحددة':'تعذر حفظ الحجز. لم يتم حفظ أي بيانات جزئية.';
    errEl.classList.add('show');
  }finally{
    btn.innerHTML='<i class="ti ti-check"></i> تأكيد الحجز';btn.disabled=false;
  }
}

// ========== تعديل الحجز ==========
function openEditModal(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  const cap=getRoomCapacity(b.room);
  const gs=b.guests||[];
  // بناء options الغرف المتاحة (باستثناء الغرف المشغولة في نفس الفترة عدا الغرفة الحالية)
  const occ=new Set(bookings.filter(x=>x.id!==b.id&&x.status!=='done'&&x.checkin<b.checkout&&x.checkout>b.checkin).map(x=>x.room));
  const roomOpts=ROOMS.map(r=>{const dis=occ.has(r);return`<option value="${r}"${dis?' disabled':''}${r==b.room?' selected':''}>غ ${r}${ROOM_DATA[r]?' — '+TYPE_LABELS[ROOM_DATA[r].type]:''}${dis?' (مشغولة)':''}</option>`;}).join('');
  let gHtml='';
  for(let i=2;i<=cap;i++){
    const g=gs[i-2]||{};
    gHtml+=`<div class="guest-section" style="margin-top:10px">
      <div class="guest-section-title"><i class="ti ti-user-plus"></i> النزيل ${i}/${cap} <span style="color:#aaa;font-weight:400">(اختياري)</span></div>
      <div class="form-grid">
        <div class="form-group"><label>الاسم</label><input type="text" id="eg-name-${i}" value="${attr(g.name||'')}" placeholder="الاسم الكامل"></div>
        <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="eg-phone-${i}" value="${attr(g.phone||'')}" placeholder="01xxxxxxxxx"></div>
        <div class="form-group"><label>الجنسية</label><input type="text" id="eg-nationality-${i}" value="${attr(g.nationality||'')}"></div>
        <div class="form-group"><label>نوع الوثيقة</label><select id="eg-idtype-${i}"><option value="national"${(g.idType||'national')==='national'?' selected':''}>بطاقة قومية</option><option value="passport"${g.idType==='passport'?' selected':''}>باسبورت</option></select></div>
        <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="eg-idnumber-${i}" value="${attr(g.idNumber||'')}"></div>
        <div class="form-group full"><label>مكان الإقامة</label><input type="text" id="eg-address-${i}" value="${attr(g.address||'')}"></div>
      </div>
    </div>`;
  }
  const hasExt=b.respName;
  document.getElementById('edit-modal-title').textContent=`تعديل الحجز — غرفة ${b.room}`;
  document.getElementById('edit-modal-body').innerHTML=`
    <div id="edit-error" class="alert alert-warning"></div>
    <div id="edit-success" class="alert alert-success"></div>
    <div class="card" style="margin-bottom:10px">
      <div class="card-title" style="font-size:12px"><i class="ti ti-door"></i> الغرفة</div>
      <div class="form-group">
        <label>رقم الغرفة *</label>
        <select id="e-room" data-on-change="onEditRoomChange(${id})" style="font-size:13px">${roomOpts}</select>
      </div>
      <div id="e-room-info" style="font-size:11px;color:#0F6E56;margin-top:6px">${TYPE_LABELS[ROOM_DATA[b.room]?.type||'']||'—'} · ${VIEW_LABELS[ROOM_DATA[b.room]?.view||'']||'—'}</div>
      <button type="button" class="btn btn-secondary" style="font-size:11px;padding:5px 12px;margin-top:10px;background:#EAF3DE;color:#0F6E56;border:1px solid #C0DD97" data-on-click="openAddGroupRoomModal(${id})"><i class="ti ti-plus"></i> ${b.groupId?'إضافة غرفة لنفس المجموعة':'تحويل لحجز جماعي وإضافة غرفة'}</button>
    </div>
    <div class="card" style="margin-bottom:10px">
      <div class="card-title" style="font-size:12px"><i class="ti ti-calendar"></i> بيانات الحجز</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <button type="button" id="emode-dates-btn" data-on-click="setEditDateMode('dates')" class="btn btn-primary" style="font-size:11px;padding:5px 12px"><i class="ti ti-calendar"></i> تاريخ مغادرة</button>
        <button type="button" id="emode-nights-btn" data-on-click="setEditDateMode('nights')" class="btn btn-secondary" style="font-size:11px;padding:5px 12px"><i class="ti ti-moon"></i> عدد ليالي</button>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>تاريخ الوصول *</label><input type="date" id="e-checkin" value="${b.checkin}" data-on-change="updateEditNights()"></div>
        <div class="form-group" id="e-checkout-group"><label>تاريخ المغادرة *</label><input type="date" id="e-checkout" value="${b.checkout}" data-on-change="updateEditNights()"></div>
        <div class="form-group" id="e-nights-input-group" style="display:none"><label>عدد الليالي *</label><input type="number" id="e-nights-input" min="1" placeholder="عدد الليالي" data-on-input="onEditNightsInput()"></div>
        <div class="form-group"><label>الليالي</label><div class="nights-box" id="e-nights">${nightsBetween(b.checkin,b.checkout)} ليلة</div></div>
        <div class="form-group"><label>المبلغ (جنيه)</label><input type="number" id="e-amount" value="${b.amount||''}"></div>
        <div class="form-group"><label>نوع الإقامة *</label><select id="e-board">${BOARD_OPTIONS}</select></div>
        <div class="form-group full"><label>ملاحظات</label><textarea id="e-notes">${h(b.notes||'')}</textarea></div>
      </div>
    </div>
    ${hasExt?`<div class="card" style="margin-bottom:10px;background:#EAF3DE">
      <div class="card-title" style="font-size:12px"><i class="ti ti-user-check"></i> المسؤول الخارجي</div>
      <div class="form-grid">
        <div class="form-group"><label>الاسم *</label><input type="text" id="e-resp-name" value="${attr(b.respName||'')}"></div>
        <div class="form-group"><label>الجنسية</label><input type="text" id="e-resp-nationality" value="${attr(b.respNationality||'')}"></div>
        <div class="form-group"><label>نوع الوثيقة</label><select id="e-resp-idtype"><option value="national"${(b.respIdType||'national')==='national'?' selected':''}>بطاقة قومية</option><option value="passport"${b.respIdType==='passport'?' selected':''}>باسبورت</option></select></div>
        <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="e-resp-idnumber" value="${attr(b.respIdNumber||'')}"></div>
        <div class="form-group full"><label>مكان الإقامة / الشركة</label><input type="text" id="e-resp-address" value="${attr(b.respAddress||'')}"></div>
      </div>
    </div>`:''}
    <div class="card" style="margin-bottom:10px">
      <div class="card-title" style="font-size:12px"><i class="ti ti-user"></i> النزيل الأول — مسؤول الغرفة</div>
      <div class="form-grid">
        <div class="form-group"><label>الاسم *</label><input type="text" id="e-name" value="${attr(b.name)}"></div>
        <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="e-phone" value="${attr(b.phone||'')}" placeholder="01xxxxxxxxx"></div>
        <div class="form-group"><label>الجنسية</label><input type="text" id="e-nationality" value="${attr(b.nationality||'')}"></div>
        <div class="form-group"><label>نوع الوثيقة</label><select id="e-idtype"><option value="national"${(b.idType||'national')==='national'?' selected':''}>بطاقة قومية</option><option value="passport"${b.idType==='passport'?' selected':''}>باسبورت</option></select></div>
        <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="e-idnumber" value="${attr(b.idNumber||'')}"></div>
        <div class="form-group full"><label>مكان الإقامة</label><input type="text" id="e-address" value="${attr(b.address||'')}"></div>
      </div>
      ${gHtml}
    </div>
    <div class="card" style="margin-bottom:10px;background:#FFF8E7">
      <div class="card-title" style="font-size:12px;display:flex;justify-content:space-between;align-items:center">
        <span><i class="ti ti-plane-departure"></i> رحلات خارجية</span>
        <button type="button" class="btn btn-secondary" style="font-size:11px;padding:4px 10px" data-on-click="addEditTripRow()"><i class="ti ti-plus"></i> إضافة رحلة</button>
      </div>
      <div id="e-trips"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-primary" id="edit-save-btn" data-on-click="saveEditBooking(${id})"><i class="ti ti-check"></i> حفظ التعديلات</button>
      <button class="btn btn-secondary" data-on-click="closeEditModal()">إلغاء</button>
    </div>`;
  document.getElementById('edit-modal').classList.add('open');
  const eBoardEl=document.getElementById('e-board');if(eBoardEl)eBoardEl.value=b.boardType||'bb';
  editTripRows=[];
  (b.trips||[]).forEach(t=>addEditTripRow(t));
}
let editTripRows=[];
function addEditTripRow(trip){
  const tid=++tripRowCounter;
  editTripRows.push(tid);
  const el=document.getElementById('e-trips');if(!el)return;
  const selected=trip?.name||'';
  const isOther=selected&&!TRIP_OPTIONS.includes(selected);
  const div=document.createElement('div');
  div.id=`etrip-row-${tid}`;
  div.style.cssText='background:#fff;border-radius:8px;padding:10px;margin-bottom:8px;position:relative;border:1px solid #FAC775';
  div.innerHTML=`
    <button type="button" data-on-click="removeEditTripRow(${tid})" style="position:absolute;left:8px;top:8px;background:none;border:none;color:#CC2200;cursor:pointer;font-size:14px"><i class="ti ti-x"></i></button>
    <div class="form-grid">
      <div class="form-group full"><label>اسم الرحلة</label>
        <select id="etrip-name-${tid}" data-on-change="onTripNameChange('etrip',${tid})">${buildTripSelectOptions(selected)}</select>
      </div>
      <div class="form-group full" id="etrip-custom-wrap-${tid}" style="display:${isOther?'':'none'}"><label>اسم الرحلة (اكتب هنا)</label><input type="text" id="etrip-name-custom-${tid}" placeholder="اكتب اسم الرحلة" value="${attr(isOther?selected:'')}"></div>
      <div class="form-group"><label>تاريخ الرحلة</label><input type="date" id="etrip-date-${tid}" value="${attr(trip?.date||'')}"></div>
      <div class="form-group"><label>السعر (جنيه)</label><input type="number" id="etrip-price-${tid}" min="0" placeholder="0" value="${attr(trip?.price||'')}"></div>
    </div>`;
  el.appendChild(div);
}
function removeEditTripRow(tid){
  editTripRows=editTripRows.filter(x=>x!==tid);
  document.getElementById(`etrip-row-${tid}`)?.remove();
}

function updateEditNights(){
  const n=nightsBetween(document.getElementById('e-checkin')?.value,document.getElementById('e-checkout')?.value);
  const el=document.getElementById('e-nights');if(!el)return;
  el.textContent=n>0?n+' ليلة':'تواريخ غير صحيحة';el.style.color=n>0?'#0F6E56':'#CC2200';
}

function setEditDateMode(mode){
  const isNights=mode==='nights';
  document.getElementById('e-checkout-group').style.display=isNights?'none':'';
  document.getElementById('e-nights-input-group').style.display=isNights?'':'none';
  document.getElementById('emode-dates-btn').className='btn '+(isNights?'btn-secondary':'btn-primary');
  document.getElementById('emode-nights-btn').className='btn '+(isNights?'btn-primary':'btn-secondary');
  if(isNights){document.getElementById('e-checkout').value='';document.getElementById('e-nights-input').value='';updateEditNights();}
}

function onEditNightsInput(){
  const ci=document.getElementById('e-checkin')?.value;
  const n=parseInt(document.getElementById('e-nights-input')?.value)||0;
  const el=document.getElementById('e-nights');
  if(ci&&n>0){
    const d=new Date(ci);d.setDate(d.getDate()+n);
    const co=d.toISOString().split('T')[0];
    document.getElementById('e-checkout').value=co;
    if(el){el.textContent=n+' ليلة — يغادر '+formatDate(co);el.style.color='#0F6E56';}
  }else if(el){el.textContent='أدخل عدد الليالي';el.style.color='#888';}
}

function onEditRoomChange(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  const newRoom=parseInt(document.getElementById('e-room')?.value);
  if(!newRoom)return;
  const d=ROOM_DATA[newRoom]||{type:'',view:'garden'};
  const infoEl=document.getElementById('e-room-info');
  if(infoEl)infoEl.textContent=`${TYPE_LABELS[d.type]||'—'} · ${VIEW_LABELS[d.view]||'—'}`;
}

async function saveEditBooking(id){
  if(!currentUser)return;
  const b=bookings.find(x=>x.id===id);if(!b)return;
  const errEl=document.getElementById('edit-error');const sucEl=document.getElementById('edit-success');
  errEl.classList.remove('show');sucEl.classList.remove('show');
  const name=document.getElementById('e-name').value.trim();
  const checkin=document.getElementById('e-checkin').value;
  const checkout=document.getElementById('e-checkout').value;
  const newRoom=parseInt(document.getElementById('e-room')?.value)||b.room;
  if(!name){errEl.textContent='يرجى إدخال اسم النزيل';errEl.classList.add('show');return;}
  if(!checkin||!checkout||checkout<=checkin){errEl.textContent='يرجى التحقق من التواريخ';errEl.classList.add('show');return;}
  const newRoomData=ROOM_DATA[newRoom]||{type:'',view:'garden'};
  const cap=getRoomCapacity(newRoom);
  const guests=[];
  for(let i=2;i<=cap;i++){
    const item={name:(document.getElementById(`eg-name-${i}`)?.value||'').trim(),phone:(document.getElementById(`eg-phone-${i}`)?.value||'').trim(),nationality:(document.getElementById(`eg-nationality-${i}`)?.value||'').trim(),idType:document.getElementById(`eg-idtype-${i}`)?.value||'national',idNumber:(document.getElementById(`eg-idnumber-${i}`)?.value||'').trim(),address:(document.getElementById(`eg-address-${i}`)?.value||'').trim()};
    if(item.name)guests.push(item);
  }
  const patch={room:newRoom,room_type:newRoomData.type,room_view:newRoomData.view,board_type:document.getElementById('e-board')?.value||'bb',name,phone:document.getElementById('e-phone').value.trim()||null,nationality:document.getElementById('e-nationality').value.trim(),id_type:document.getElementById('e-idtype').value,id_number:document.getElementById('e-idnumber').value.trim(),address:document.getElementById('e-address').value.trim(),checkin,checkout,amount:document.getElementById('e-amount').value?Number(document.getElementById('e-amount').value):null,notes:document.getElementById('e-notes').value.trim(),guests,trips:collectTrips(editTripRows,'etrip'),expected_version:b.version};
  if(document.getElementById('e-resp-name')){
    patch.resp_name=document.getElementById('e-resp-name').value.trim();
    patch.resp_nationality=document.getElementById('e-resp-nationality').value.trim();
    patch.resp_id_type=document.getElementById('e-resp-idtype').value;
    patch.resp_id_number=document.getElementById('e-resp-idnumber').value.trim();
    patch.resp_address=document.getElementById('e-resp-address').value.trim();
  }
  const btn=document.getElementById('edit-save-btn');btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  try{
    const updated=normalizeBooking(await rpc('api_update_booking',{p_id:b.id,p_payload:patch}));
    const idx=bookings.findIndex(x=>x.id===b.id);if(idx>=0)bookings[idx]=updated;
    sucEl.textContent='تم حفظ التعديلات';sucEl.classList.add('show');
    renderDashboard();renderBookings();renderRooms();setTimeout(closeEditModal,1200);
  }catch(e){
    safeErrorMessage(e);
    errEl.textContent=e?.code==='ROOM_CONFLICT'?'تعارض مع حجز آخر في نفس الغرفة':e?.code==='VERSION_CONFLICT'?'تم تعديل الحجز بواسطة مستخدم آخر. أعد تحميل الصفحة.':'تعذر حفظ التعديلات';
    errEl.classList.add('show');
  }finally{btn.innerHTML='<i class="ti ti-check"></i> '+h(t('common.save_changes'));btn.disabled=false;}
}
function closeEditModal(){document.getElementById('edit-modal').classList.remove('open');}

// ========== إضافة غرفة لمجموعة ==========
function openAddGroupRoomModal(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  addGroupRoomTarget=id;
  const occ=new Set(bookings.filter(x=>x.status!=='done'&&x.checkin<b.checkout&&x.checkout>b.checkin).map(x=>x.room));
  const roomOpts='<option value="">اختر الغرفة</option>'+ROOMS.filter(r=>!occ.has(r)).map(r=>`<option value="${r}">غ ${r} — ${TYPE_LABELS[ROOM_DATA[r]?.type||'']||'—'}</option>`).join('');
  document.getElementById('add-group-room-title').textContent=`إضافة غرفة${b.groupId?' لمجموعة '+b.groupId:''}`;
  document.getElementById('add-group-room-body').innerHTML=`
    <div id="agr-error" class="alert alert-warning"></div>
    <div id="agr-success" class="alert alert-success"></div>
    <div style="font-size:12px;color:#666;margin-bottom:12px">
      ${b.groupId?'هتتضاف الغرفة الجديدة لنفس المجموعة، بنفس تواريخ الإقامة':'هيتم تحويل الحجز لحجز جماعي وإضافة الغرفة الجديدة بنفس تواريخ الإقامة'}
      (${formatDate(b.checkin)} → ${formatDate(b.checkout)})
    </div>
    <div class="form-grid">
      <div class="form-group full"><label>رقم الغرفة *</label><select id="agr-room" data-on-change="onAgrRoomChange()">${roomOpts}</select></div>
      <div class="form-group"><label>نوع الإقامة</label><select id="agr-board">${BOARD_OPTIONS}</select></div>
      <div class="form-group"><label>المبلغ (جنيه)</label><input type="number" id="agr-amount" min="0"></div>
    </div>
    <div id="agr-guests"></div>
    <div class="btn-row">
      <button class="btn btn-primary" id="agr-confirm-btn" data-on-click="confirmAddGroupRoom()"><i class="ti ti-check"></i> إضافة الغرفة</button>
      <button class="btn btn-secondary" data-on-click="closeAddGroupRoomModal()">إلغاء</button>
    </div>`;
  document.getElementById('add-group-room-modal').classList.add('open');
  onAgrRoomChange();
}
function onAgrRoomChange(){
  const room=parseInt(document.getElementById('agr-room')?.value);
  const cap=room?getRoomCapacity(room):2;
  let html=`<div class="guest-section" style="margin-top:10px">
    <div class="guest-section-title"><i class="ti ti-user"></i> النزيل 1/${cap} — مسؤول الغرفة</div>
    <div class="form-grid">
      <div class="form-group"><label>الاسم *</label><input type="text" id="agr-g1-name" placeholder="الاسم الكامل"></div>
      <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="agr-g1-phone" placeholder="01xxxxxxxxx"></div>
      <div class="form-group"><label>الجنسية</label><input type="text" id="agr-g1-nationality"></div>
      <div class="form-group"><label>نوع الوثيقة</label><select id="agr-g1-idtype"><option value="national">بطاقة قومية</option><option value="passport">باسبورت</option></select></div>
      <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="agr-g1-idnumber"></div>
      <div class="form-group full"><label>مكان الإقامة / الشركة</label><input type="text" id="agr-g1-address"></div>
    </div>
  </div>`;
  for(let i=2;i<=cap;i++){
    html+=`<div class="guest-section" style="margin-top:10px">
      <div class="guest-section-title"><i class="ti ti-user-plus"></i> النزيل ${i}/${cap} <span style="color:#aaa;font-weight:400">(اختياري)</span></div>
      <div class="form-grid">
        <div class="form-group"><label>الاسم</label><input type="text" id="agr-g${i}-name" placeholder="الاسم الكامل"></div>
        <div class="form-group"><label>رقم الهاتف</label><input type="tel" id="agr-g${i}-phone" placeholder="01xxxxxxxxx"></div>
        <div class="form-group"><label>الجنسية</label><input type="text" id="agr-g${i}-nationality"></div>
        <div class="form-group"><label>نوع الوثيقة</label><select id="agr-g${i}-idtype"><option value="national">بطاقة قومية</option><option value="passport">باسبورت</option></select></div>
        <div class="form-group"><label>رقم الوثيقة</label><input type="text" id="agr-g${i}-idnumber"></div>
        <div class="form-group full"><label>مكان الإقامة</label><input type="text" id="agr-g${i}-address"></div>
      </div>
    </div>`;
  }
  document.getElementById('agr-guests').innerHTML=html;
}
function closeAddGroupRoomModal(){document.getElementById('add-group-room-modal').classList.remove('open');addGroupRoomTarget=null;}
async function confirmAddGroupRoom(){
  if(!currentUser)return;
  const b=bookings.find(x=>x.id===addGroupRoomTarget);if(!b)return;
  const errEl=document.getElementById('agr-error');const sucEl=document.getElementById('agr-success');
  errEl.classList.remove('show');sucEl.classList.remove('show');
  const room=parseInt(document.getElementById('agr-room').value);
  const name=document.getElementById('agr-g1-name').value.trim();
  if(!room){errEl.textContent='يرجى اختيار رقم الغرفة';errEl.classList.add('show');return;}
  if(!name){errEl.textContent='يرجى إدخال اسم النزيل الأول';errEl.classList.add('show');return;}
  const cap=getRoomCapacity(room);
  const guests=[];
  for(let i=2;i<=cap;i++){
    const item={
      name:(document.getElementById(`agr-g${i}-name`)?.value||'').trim(),
      phone:(document.getElementById(`agr-g${i}-phone`)?.value||'').trim(),
      nationality:(document.getElementById(`agr-g${i}-nationality`)?.value||'').trim(),
      idType:document.getElementById(`agr-g${i}-idtype`)?.value||'national',
      idNumber:(document.getElementById(`agr-g${i}-idnumber`)?.value||'').trim(),
      address:(document.getElementById(`agr-g${i}-address`)?.value||'').trim()
    };
    if(item.name)guests.push(item);
  }
  const d=ROOM_DATA[room]||{type:'',view:'garden'};
  const payload={
    room,room_type:d.type,room_view:d.view,board_type:document.getElementById('agr-board').value||'bb',
    name,phone:document.getElementById('agr-g1-phone').value.trim()||null,
    nationality:document.getElementById('agr-g1-nationality').value.trim(),
    id_type:document.getElementById('agr-g1-idtype').value,
    id_number:document.getElementById('agr-g1-idnumber').value.trim(),
    address:document.getElementById('agr-g1-address').value.trim(),
    amount:document.getElementById('agr-amount').value?Number(document.getElementById('agr-amount').value):null,
    notes:'',guests,trips:[]
  };
  const btn=document.getElementById('agr-confirm-btn');btn.innerHTML='<span class="spinner"></span> '+h(t('common.saving'));btn.disabled=true;
  try{
    const result=await rpc('api_add_group_room',{p_base_id:b.id,p_row:payload});
    await loadBookings();
    const created=normalizeBooking(result.booking||result);
    const groupId=result.group_id||created.groupId;
    sucEl.textContent=`تم إضافة غرفة ${room} للمجموعة`;sucEl.classList.add('show');
    renderDashboard();renderBookings();renderRooms();
    setTimeout(()=>{closeAddGroupRoomModal();closeEditModal();viewGroup(groupId);},900);
  }catch(e){
    safeErrorMessage(e);
    errEl.textContent=e?.code==='ROOM_CONFLICT'?'الغرفة محجوزة بالفعل في الفترة المحددة':'تعذر إضافة الغرفة';
    errEl.classList.add('show');
  }finally{btn.innerHTML='<i class="ti ti-check"></i> إضافة الغرفة';btn.disabled=false;}
}

// ========== تعديل المغادرة ==========
function openExtendModal(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  extendTarget=id;
  document.getElementById('extend-modal-title').textContent=`تعديل المغادرة — غرفة ${b.room}`;
  document.getElementById('extend-info').innerHTML=`<b>${h(b.name)}</b> · المغادرة الحالية: <b>${formatDate(b.checkout)}</b>`;
  const el=document.getElementById('extend-new-checkout');el.value=b.checkout;el.min=b.checkin;
  document.getElementById('extend-nights-display').textContent='اختر التاريخ الجديد';
  document.getElementById('extend-error').classList.remove('show');
  document.getElementById('extend-success').classList.remove('show');
  updateExtendNights();
  document.getElementById('extend-modal').classList.add('open');
}
function updateExtendNights(){
  const b=bookings.find(x=>x.id===extendTarget);if(!b)return;
  const nc=document.getElementById('extend-new-checkout').value;
  const el=document.getElementById('extend-nights-display');
  if(!nc||nc===b.checkout){el.textContent='لم يتغير التاريخ';el.style.color='#888';return;}
  const nn=nightsBetween(b.checkin,nc);
  if(nc>b.checkout){el.textContent=`تمديد ${nightsBetween(b.checkout,nc)} ليلة ← إجمالي: ${nn} ليلة`;el.style.color='#0F6E56';}
  else if(nc>b.checkin){el.textContent=`مغادرة مبكرة بـ ${nightsBetween(nc,b.checkout)} ليلة ← إجمالي: ${nn} ليلة`;el.style.color='#854F0B';}
  else{el.textContent='التاريخ يجب أن يكون بعد الوصول';el.style.color='#CC2200';}
}
async function confirmExtend(){
  if(!currentUser)return;
  const b=bookings.find(x=>x.id===extendTarget);if(!b)return;
  const nc=document.getElementById('extend-new-checkout').value;
  const errEl=document.getElementById('extend-error');const sucEl=document.getElementById('extend-success');
  errEl.classList.remove('show');sucEl.classList.remove('show');
  if(!nc||nc===b.checkout||nc<=b.checkin){errEl.textContent='تاريخ غير صحيح';errEl.classList.add('show');return;}
  const btn=document.getElementById('extend-confirm-btn');btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  try{
    const updated=normalizeBooking(await rpc('api_update_booking',{p_id:b.id,p_payload:{checkout:nc,expected_version:b.version}}));
    const idx=bookings.findIndex(x=>x.id===b.id);if(idx>=0)bookings[idx]=updated;
    sucEl.textContent=`تم التعديل إلى ${formatDate(nc)}`;sucEl.classList.add('show');
    renderDashboard();renderBookings();renderRooms();setTimeout(closeExtendModal,1200);
  }catch(e){
    safeErrorMessage(e);
    errEl.textContent=e?.code==='ROOM_CONFLICT'?'تعارض مع حجز آخر':e?.code==='VERSION_CONFLICT'?'تم تعديل الحجز بواسطة مستخدم آخر. أعد تحميل الصفحة.':'تعذر حفظ التعديل';
    errEl.classList.add('show');
  }finally{btn.innerHTML='<i class="ti ti-check"></i> تأكيد';btn.disabled=false;}
}
function closeExtendModal(){document.getElementById('extend-modal').classList.remove('open');extendTarget=null;}

// ========== المجموعة ==========
function viewGroup(groupId){
  const members=bookings.filter(b=>b.groupId===groupId);
  if(!members.length){alert('لا توجد حجوزات في هذه المجموعة');return;}
  const td=today();
  const totalAmt=members.reduce((s,b)=>s+(Number(b.amount)||0),0);
  const active=members.filter(b=>b.status!=='done');
  const resp=members[0];
  const extRespHtml=resp.respName?`<div style="background:#EAF3DE;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px"><b><i class="ti ti-user-check"></i> المسؤول الخارجي:</b> ${h(resp.respName)}${resp.respNationality?' · '+h(resp.respNationality):''}</div>`:'';
  document.getElementById('group-modal-title').textContent=`مجموعة ${groupId} — ${members.length} غرف`;
  document.getElementById('group-modal-body').innerHTML=`
    ${extRespHtml}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div class="nights-box" style="text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">عدد الغرف</div><div style="font-size:22px;font-weight:700">${members.length}</div></div>
      <div class="nights-box" style="text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">إجمالي المبلغ</div><div style="font-size:18px;font-weight:700;color:#0F6E56">${totalAmt.toLocaleString()} ج</div></div>
      <div class="nights-box" style="text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">غرف نشطة</div><div style="font-size:22px;font-weight:700;color:#1D9E75">${active.length}</div></div>
    </div>
    <div style="overflow-x:auto;margin-bottom:14px">
      <table>
        <thead><tr><th>الغرفة</th><th>النزيل</th><th>الوصول</th><th>المغادرة</th><th>ليالي</th><th>المبلغ</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${members.map(b=>{
          const isOv=b.status!=='done'&&b.checkout<td&&b.checkin<=td;
          const badge=b.status==='done'?'<span class="badge badge-done">منتهي</span>':isOv?'<span class="badge" style="background:#FAECE7;color:#993C1D">متأخر</span>':b.checkout===td?'<span class="badge badge-checkout">مغادرة اليوم</span>':'<span class="badge badge-active">نشط</span>';
          return`<tr>
            <td style="font-weight:700">غ ${b.room}</td><td>${h(b.name)}</td>
            <td>${formatDate(b.checkin)}</td><td>${formatDate(b.checkout)}</td>
            <td>${nightsBetween(b.checkin,b.checkout)}</td>
            <td>${b.amount?Number(b.amount).toLocaleString()+' ج':'—'}</td>
            <td>${badge}</td>
            <td>
              <button class="action-btn" data-on-click="closeGroupModal();setTimeout(()=>openEditModal(${b.id}),200)"><i class="ti ti-edit" style="color:#0F6E56"></i></button>
              <button class="action-btn" data-on-click="closeGroupModal();openExtendModal(${b.id})"><i class="ti ti-calendar-edit" style="color:#854F0B"></i></button>
              ${b.status!=='done'?`<button class="action-btn" data-on-click="${actionCode('groupCheckoutOne('+b.id+','+jsArg(groupId)+')')}"><i class="ti ti-logout"></i></button>`:''}
              ${isAdmin()?`<button class="action-btn" data-on-click="closeGroupModal();confirmPermanentDelete(${b.id})"><i class="ti ti-trash" style="color:#CC2200"></i></button>`:''}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" style="background:#FFF8E7;color:#854F0B;border:1px solid #FAC775" data-on-click="${actionCode('printGroupVoucher('+jsArg(groupId)+')')}"><i class="ti ti-printer"></i> طباعة وصل المجموعة</button>
      ${active.length>1?`<button class="btn btn-primary" data-on-click="${actionCode('groupCheckoutAll('+jsArg(groupId)+')')}"><i class="ti ti-logout"></i> مغادرة جماعية (${active.length} غرف)</button>`:''}
      ${isAdmin()&&members.length>1?`<button class="btn btn-danger" data-on-click="${actionCode('groupDeleteAll('+jsArg(groupId)+')')}"><i class="ti ti-trash"></i> حذف المجموعة كاملة</button>`:''}
      <button class="btn btn-secondary" data-on-click="closeGroupModal()">إغلاق</button>
    </div>`;
  document.getElementById('group-modal').classList.add('open');
}
async function groupCheckoutOne(id,gId){
  if(!currentUser||!confirm('تسجيل مغادرة هذه الغرفة؟'))return;
  try{
    await rpc('api_checkout_booking',{p_id:Number(id)});
    await loadBookings();renderDashboard();renderBookings();renderRooms();viewGroup(gId);
  }catch(e){safeErrorMessage(e);alert('خطأ');}
}
async function groupCheckoutAll(gId){
  if(!currentUser)return;
  const act=bookings.filter(b=>b.groupId===gId&&b.status!=='done');
  if(!confirm(`تسجيل مغادرة ${act.length} غرف دفعة واحدة؟`))return;
  try{
    await rpc('api_checkout_group',{p_group_id:gId});
    await loadBookings();renderDashboard();renderBookings();renderRooms();closeGroupModal();
  }catch(e){safeErrorMessage(e);alert('خطأ');}
}
async function groupDeleteAll(gId){
  if(!requireAdmin())return;
  const mem=bookings.filter(b=>b.groupId===gId);
  if(!confirm(`حذف ${mem.length} حجوزات نهائياً؟`))return;
  try{
    await rpc('api_delete_group',{p_group_id:gId});
    await loadBookings();renderDashboard();renderBookings();renderRooms();closeGroupModal();
  }catch(e){safeErrorMessage(e);alert('خطأ');}
}
function closeGroupModal(){document.getElementById('group-modal').classList.remove('open');}

// ========== حذف نهائي ==========
function confirmPermanentDelete(id){
  if(!requireAdmin())return;
  const b=bookings.find(x=>x.id===id);if(!b)return;
  permDeleteTarget=id;
  document.getElementById('perm-delete-info').textContent=`سيتم حذف حجز "${b.name}" — غرفة ${b.room} نهائياً.`;
  document.getElementById('perm-delete-modal').classList.add('open');
}
async function executePermanentDelete(){
  if(!requireAdmin())return;
  const btn=document.getElementById('perm-delete-confirm-btn');btn.innerHTML='<span class="spinner"></span>';btn.disabled=true;
  try{
    await rpc('api_delete_booking',{p_id:Number(permDeleteTarget)});
    await loadBookings();closePermDeleteModal();renderDashboard();renderBookings();renderRooms();
  }catch(e){safeErrorMessage(e);alert('خطأ في الحذف');}
  finally{btn.innerHTML='<i class="ti ti-trash"></i> حذف نهائي';btn.disabled=false;}
}
function closePermDeleteModal(){document.getElementById('perm-delete-modal').classList.remove('open');permDeleteTarget=null;}

// ========== المستخدمون ==========
async function renderUsers(){
  if(!requireAdmin())return;
  const list=document.getElementById('users-list');
  list.textContent='';
  try{
    const result=await edgeAdmin('list');
    const users=Array.isArray(result?.users)?result.users:[];
    if(!users.length){list.innerHTML='<div class="empty-state">'+h(t('users.none'))+'</div>';return;}
    for(const user of users){
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0ea;font-size:13px;gap:10px';
      const info=document.createElement('div');
      const name=document.createElement('b');name.textContent=user.fullname||user.username;
      const username=document.createElement('span');username.style.cssText='color:#888;font-size:11px';username.textContent=` (${user.username})`;
      info.append(name,username);
      const actions=document.createElement('div');actions.style.cssText='display:flex;align-items:center;gap:8px';
      const role=document.createElement('span');role.style.cssText=`font-size:11px;color:${user.role==='admin'?'#185FA5':'#3B6D11'}`;role.textContent=user.role==='admin'?t('users.admin'):t('users.staff');
      const edit=document.createElement('button');edit.className='action-btn';edit.title=t('users.edit');edit.innerHTML='<i class="ti ti-edit" style="color:#0F6E56"></i>';edit.addEventListener('click',()=>openEditUserModal(user));
      actions.append(role,edit);
      if(user.auth_user_id!==currentUser.auth_user_id){
        const del=document.createElement('button');del.className='action-btn';del.title=t('common.permanent_delete');del.innerHTML='<i class="ti ti-trash" style="color:#CC2200"></i>';del.addEventListener('click',()=>deleteUser(user.auth_user_id,user.username));
        actions.append(del);
      }
      row.append(info,actions);list.appendChild(row);
    }
  }catch(e){
    safeErrorMessage(e);
    list.innerHTML='<div class="empty-state">'+h(t('users.load_failed'))+'</div>';
  }
}
async function addUser(){
  if(!requireAdmin())return;
  const username=normalizeUsername(document.getElementById('nu-username').value);
  const fullname=document.getElementById('nu-fullname').value.trim();
  const password=document.getElementById('nu-password').value;
  const role=document.getElementById('nu-role').value;
  const errEl=document.getElementById('add-user-error');const sucEl=document.getElementById('add-user-success');
  errEl.classList.remove('show');sucEl.classList.remove('show');
  if(!/^[a-z0-9._-]{3,40}$/.test(username)){errEl.textContent=t('users.username_rule');errEl.classList.add('show');return;}
  if(!fullname){errEl.textContent=t('users.fullname_required_error');errEl.classList.add('show');return;}
  if(!PASSWORD_POLICY.test(password)){errEl.textContent=t('users.password_policy_error');errEl.classList.add('show');return;}
  try{
    await edgeAdmin('create',{username,fullname,password,role});
    sucEl.textContent=t('users.added',{username});sucEl.classList.add('show');
    document.getElementById('nu-username').value='';document.getElementById('nu-fullname').value='';document.getElementById('nu-password').value='';document.getElementById('nu-role').value='staff';
    await renderUsers();
  }catch(e){
    safeErrorMessage(e);
    errEl.textContent=e?.code==='USERNAME_EXISTS'?t('users.username_exists'):t('users.add_failed');
    errEl.classList.add('show');
  }
}
function openEditUserModal(user){
  if(!requireAdmin())return;
  document.getElementById('eu-auth-id').value=user.auth_user_id;
  document.getElementById('eu-username').value=user.username;
  document.getElementById('eu-fullname').value=user.fullname||user.username;
  document.getElementById('eu-role').value=user.role==='admin'?'admin':'staff';
  document.getElementById('eu-password').value='';
  document.getElementById('eu-password-confirm').value='';
  document.getElementById('edit-user-title').textContent=t('users.edit_title',{username:user.username});
  document.getElementById('edit-user-error').classList.remove('show');
  document.getElementById('edit-user-success').classList.remove('show');
  document.getElementById('edit-user-modal').classList.add('open');
}
function closeEditUserModal(){document.getElementById('edit-user-modal').classList.remove('open');}
async function saveEditUser(){
  if(!requireAdmin())return;
  const authUserId=document.getElementById('eu-auth-id').value;
  const fullname=document.getElementById('eu-fullname').value.trim();
  const role=document.getElementById('eu-role').value;
  const password=document.getElementById('eu-password').value;
  const passwordConfirm=document.getElementById('eu-password-confirm').value;
  const err=document.getElementById('edit-user-error');const suc=document.getElementById('edit-user-success');
  err.classList.remove('show');suc.classList.remove('show');
  if(!fullname){err.textContent=t('users.fullname_required_error');err.classList.add('show');return;}
  if(password||passwordConfirm){
    if(password!==passwordConfirm){err.textContent=t('users.password_mismatch');err.classList.add('show');return;}
    if(!PASSWORD_POLICY.test(password)){err.textContent=t('users.password_policy_error');err.classList.add('show');return;}
  }
  const btn=document.getElementById('edit-user-save-btn');btn.disabled=true;btn.innerHTML='<span class="spinner"></span> '+h(t('common.saving'));
  try{
    await edgeAdmin('update',{auth_user_id:authUserId,fullname,role,password:password||undefined});
    suc.textContent=t('common.changes_saved');suc.classList.add('show');
    if(authUserId===currentUser.auth_user_id){
      currentUser=await rpc('api_my_profile');
      document.getElementById('user-badge').textContent=currentUser.fullname||currentUser.username;
    }
    await renderUsers();
    if(authUserId===currentUser.auth_user_id&&password){
      alert(t('users.password_changed'));
      await doLogout();
      return;
    }
    setTimeout(closeEditUserModal,900);
  }catch(e){
    safeErrorMessage(e);
    err.textContent=e?.code==='LAST_ADMIN'?t('users.last_admin_demote'):e?.code==='SELF_DEMOTION'?t('users.self_demotion'):t('users.save_failed');
    err.classList.add('show');
  }finally{btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> '+h(t('common.save_changes'));}
}
async function deleteUser(authUserId,username){
  if(!requireAdmin())return;
  if(!confirm(t('users.delete_confirm',{username})))return;
  try{await edgeAdmin('delete',{auth_user_id:authUserId});await renderUsers();}
  catch(e){safeErrorMessage(e);alert(e?.code==='LAST_ADMIN'?t('users.last_admin_delete'):t('users.delete_failed'));}
}

// ========== طباعة الإيصال ==========
const PRINT_EN_AR_PAIRS=[["RESERVATION VOUCHER","قسيمة الحجز"],["GROUP RESERVATION VOUCHER","قسيمة حجز المجموعة"],["Place Hotel :","مكان الفندق:"],["Hotel Name :","اسم الفندق:"],["Invoice room","فاتورة الغرفة"],["ITEM DESCRIPTION","وصف البند"],["NUM","الرقم"],["Booking name","اسم الحجز"],["Entry datetrip all Day","تاريخ الوصول"],["Checkout date","تاريخ المغادرة"],["Deposit","العربون"],["Rest","المتبقي"],["Total amount","إجمالي المبلغ"],["Thank you for your trust and happy journey.","شكراً لثقتكم ونتمنى لكم رحلة سعيدة."],["Payment Info :","بيانات الدفع:"],["Phone Number :","رقم الهاتف:"],["Website","الموقع الإلكتروني"],["Email Address :","البريد الإلكتروني:"],["Address","العنوان"],["Terms and Condition","الشروط والأحكام"],["According to the Egyptian Tourism Authority :","وفقاً لهيئة تنشيط السياحة المصرية:"],["Please be careful and take the necessary precautions for covid 19","يرجى توخي الحذر واتخاذ الاحتياطات اللازمة."],["Dahab Bay Hotel Policy :","سياسة فندق دهب باي:"],["Our official Check-in time is 12:00 PM and Check-out time is 11:00 AM","موعد تسجيل الوصول الرسمي الساعة 12:00 ظهراً، وتسجيل المغادرة الساعة 11:00 صباحاً."],["Directions :","تعليمات:"],["It is not possible to cancel the reservation before the flight date by 48","لا يمكن إلغاء الحجز خلال 48 ساعة قبل موعد الرحلة."],["You cannot complete the trip before paying the rest of the reservation value","يجب سداد باقي قيمة الحجز قبل إتمام الرحلة."],["This receipt is not official, but to ensure the right of the customer","هذا الإيصال غير رسمي ويُستخدم لإثبات حق العميل."],["Breakfast :","الإفطار:"],["Breakfast is served daily from 8:30 AM to 10:30 AM, featuring a daily set menu.","يُقدم الإفطار يومياً من 8:30 صباحاً إلى 10:30 صباحاً وفق قائمة يومية محددة."],["Hotel CEO","مدير الفندق"],["Group :","المجموعة:"],["Rooms :","الغرف:"],["Total Deposit","إجمالي العربون"],["Total Rest","إجمالي المتبقي"],["Grand Total","الإجمالي العام"]];
function localizePrintHtml(html){
  let out=html.replace(/<html dir="rtl"/,'<html dir="'+(currentLang==='ar'?'rtl':'ltr')+'" lang="'+currentLang+'"');
  if(currentLang==='ar'){for(const [en,ar] of PRINT_EN_AR_PAIRS)out=out.split(en).join(ar);out=translateRuntimeText(out,'ar');}
  else out=translateRuntimeText(out,'en');
  return out;
}
function mountPrintDocument(printWindow,html,buttonId){
  if(!printWindow){alert('تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة.');return false;}
  const parsed=new DOMParser().parseFromString(localizePrintHtml(html),'text/html');
  const imported=printWindow.document.importNode(parsed.documentElement,true);
  printWindow.document.replaceChild(imported,printWindow.document.documentElement);
  printWindow.document.getElementById(buttonId)?.addEventListener('click',()=>printWindow.print());
  try{printWindow.opener=null;}catch(_){}
  return true;
}
function printVoucher(id){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  const nights=nightsBetween(b.checkin,b.checkout);
  const roomD=ROOM_DATA[b.room]||{type:'',view:'garden'};
  const typeLabel=(TYPE_LABELS[roomD.type]||'').toUpperCase();
  const viewLabel=(VIEW_LABELS[roomD.view]||'').toUpperCase();
  const roomTypeStr=typeLabel+(viewLabel?' '+viewLabel:'');
  const allGuests=[];
  // النزيل الرئيسي
  if(b.name&&b.name!=='—') allGuests.push(h(b.name));
  // باقي النزلاء
  if(b.guests&&b.guests.length) b.guests.filter(g=>g.name).forEach(g=>allGuests.push(h(g.name)));
  // المسؤول الخارجي
  const respLine=b.respName?`<div style="font-size:13px;color:#555;margin-bottom:6px">المسؤول: <b>${h(b.respName)}</b></div>`:'';
  const amount=b.amount?Number(b.amount):0;
  const depositRegex=/(?:عربون|ديبوزيت|مقدم|deposit|downpayment)[:\s]+(\d+)/i;
  const deposit=b.notes&&b.notes.match(depositRegex)?Number(b.notes.match(depositRegex)[1]):0;
  const rest=amount-deposit;

  const w=window.open('','_blank','width=800,height=950');if(!w){alert('تعذر فتح نافذة الطباعة');return;}try{w.opener=null;}catch(_){}
  const voucherHtml=`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>Voucher — Room ${b.room}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Arial',sans-serif;background:#fff;color:#111;padding:30px;max-width:680px;margin:0 auto}
    .stars{color:#D4A017;font-size:22px;letter-spacing:3px;text-align:center;margin-bottom:4px}
    .hotel-name{font-size:32px;font-weight:900;text-align:center;letter-spacing:1px;line-height:1.1}
    .voucher-title{background:#D4A017;color:#fff;font-size:16px;font-weight:700;text-align:center;padding:5px 20px;display:inline-block;margin:10px auto 20px;letter-spacing:2px}
    .voucher-title-wrap{text-align:center}
    .meta-row{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;color:#444}
    .section-bar{background:#D4A017;color:#fff;display:flex;justify-content:space-between;padding:5px 10px;font-size:12px;font-weight:700;margin-bottom:0}
    .booking-name-box{border:2px solid #111;padding:10px 14px;margin-bottom:0}
    .booking-name{font-size:22px;font-weight:900}
    .extra-name{font-size:18px;font-weight:700;margin-top:6px}
    .room-type-bar{background:#111;color:#fff;font-size:14px;font-weight:700;padding:7px 14px;margin-bottom:18px}
    .dates-section{display:flex;gap:0;margin-bottom:18px}
    .date-box{flex:1;border:1px solid #ddd;padding:10px 14px}
    .date-label{font-size:11px;color:#888;margin-bottom:4px}
    .date-val{font-size:15px;font-weight:700}
    .divider{border:none;border-top:1px solid #ddd;margin:16px 0}
    .amounts{text-align:left;font-size:13px;line-height:2}
    .total-line{font-size:15px;font-weight:700}
    .thank-you{text-align:center;font-size:14px;font-weight:700;margin:20px 0 10px}
    .payment-info{font-size:11px;color:#444;margin-bottom:14px}
    .payment-info b{color:#111}
    .terms{font-size:11px;color:#444}
    .terms h4{font-size:12px;margin-bottom:6px}
    .terms li{margin-bottom:3px;margin-right:14px}
    .footer-bar{text-align:center;color:#D4A017;font-size:18px;font-weight:900;letter-spacing:3px;margin-top:20px;padding-top:14px;border-top:2px solid #D4A017}
    .stamp-area{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px}
    .stamp-placeholder{border:2px dashed #ccc;border-radius:50%;width:90px;height:90px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#bbb;text-align:center}
    .ceo-line{font-size:12px;text-align:center;margin-top:6px;color:#555}
    @media print{body{padding:10px}button{display:none!important}}
  </style></head><body>
  <div style="text-align:left;margin-bottom:10px"><button id="voucher-print-btn" type="button" style="padding:8px 20px;background:#D4A017;border:none;color:#fff;font-weight:700;cursor:pointer;font-size:13px;border-radius:4px">🖨️ طباعة</button></div>
  <div class="stars">★ ★ ★ ★ ★</div>
  <div class="hotel-name">DAHAB BAY<br>HOTEL</div>
  <div class="voucher-title-wrap"><div class="voucher-title">RESERVATION VOUCHER</div></div>
  <div class="meta-row">
    <div><b>Place Hotel :</b> Dahab<br><b>Hotel Name :</b> Dahab bay hotel</div>
    <div style="text-align:left"><b>Invoice room ${b.room}</b></div>
  </div>
  <div class="section-bar"><span>ITEM DESCRIPTION</span><span>NUM</span></div>
  <div class="booking-name-box">
    ${allGuests.length>0?allGuests.map((n,i)=>i===0?`<div class="booking-name">Booking name &nbsp; <span style="font-size:20px">${n}</span></div>`:
    `<div class="extra-name">${n}</div>`).join(''):`<div class="booking-name">Booking name &nbsp; <span style="font-size:16px;color:#888">—</span></div>`}
    ${respLine}
  </div>
  <div class="room-type-bar">${roomTypeStr||'ROOM '+b.room}</div>
  <div class="board-type-bar" style="background:#F5EBD8;color:#7A4E00;font-size:12px;font-weight:700;padding:6px 14px;margin-bottom:18px">${(BOARD_LABELS[b.boardType]||BOARD_LABELS.bb).toUpperCase()}</div>
  <div class="dates-section">
    <div class="date-box" style="border-left:none">
      <div class="date-label">Entry datetrip all Day</div>
      <div class="date-val">${b.checkin.split('-').reverse().join('/')} &nbsp; 12 pm</div>
    </div>
    <div class="date-box">
      <div class="date-label">Checkout date</div>
      <div class="date-val">${b.checkout.split('-').reverse().join('/')} &nbsp; 11 am</div>
    </div>
  </div>
  <hr class="divider">
  <div class="amounts" style="direction:ltr">
    ${deposit>0?`<div>Deposit &nbsp; ${deposit.toLocaleString()}</div><div>Rest &nbsp; ${rest>0?rest.toLocaleString():0}</div>`:''}
    <div class="total-line">Total amount &nbsp; ${amount>0?amount.toLocaleString():'—'}</div>
  </div>
  <hr class="divider">
  <div class="stamp-area">
    <div>
      <div class="thank-you">Thank you for your trust and happy journey.</div>
      <div class="payment-info">
        <b>Payment Info :</b><br>
        Phone Number : 01288250908 - 01090071183<br>
        Website &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: www.Dahab Bay Hotel.com<br>
        Email Address : DahabBayHotel@gmail.com<br>
        Address &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Dahab , South of Sinaa ,Egypt
      </div>
      <div class="terms">
        <h4>Terms and Condition</h4>
        <ul>
          <li>According to the Egyptian Tourism Authority :</li>
          <li style="margin-right:24px">1- Please be careful and take the necessary precautions for covid 19</li>
          <li>Dahab Bay Hotel Policy :</li>
          <li style="margin-right:24px">1- Our official Check-in time is 12:00 PM and Check-out time is 11:00 AM</li>
          <li>Directions :</li>
          <li style="margin-right:24px">1- It is not possible to cancel the reservation before the flight date by 48</li>
          <li style="margin-right:24px">2- You cannot complete the trip before paying the rest of the reservation value</li>
          <li style="margin-right:24px">3- This receipt is not official, but to ensure the right of the customer</li>
          <li>Breakfast :</li>
          <li style="margin-right:24px">1- Breakfast is served daily from 8:30 AM to 10:30 AM, featuring a daily set menu.</li>
        </ul>
      </div>
    </div>
    <div style="text-align:center">
      <div class="stamp-placeholder">Dahab<br>Bay<br>Hotel</div>
      <div class="ceo-line">Hotel CEO</div>
    </div>
  </div>
  <div class="footer-bar">DAHAB BAY HOTEL</div>
  </body></html>`;
  mountPrintDocument(w,voucherHtml,'voucher-print-btn');
}
// ========== طباعة وصل المجموعة ==========
function printGroupVoucher(groupId){
  const members=bookings.filter(b=>b.groupId===groupId);
  if(!members.length){alert('لا توجد حجوزات في هذه المجموعة');return;}
  const together=confirm('هل تدفع المجموعة معاً في وصل واحد مجمّع؟\n\nOK = وصل واحد مجمّع لكل الغرف\nCancel = وصل منفصل لكل غرفة على حدة');
  if(together){
    printCombinedVoucher(groupId,members);
  }else{
    members.forEach(b=>printVoucher(b.id));
  }
}
function printCombinedVoucher(groupId,members){
  const depositRegex=/(?:عربون|ديبوزيت|مقدم|deposit|downpayment)[:\s]+(\d+)/i;
  const td=today();
  let totalAmount=0,totalDeposit=0;
  const rowsHtml=members.map(b=>{
    const roomD=ROOM_DATA[b.room]||{type:'',view:'garden'};
    const typeLabel=(TYPE_LABELS[roomD.type]||'').toUpperCase();
    const viewLabel=(VIEW_LABELS[roomD.view]||'').toUpperCase();
    const roomTypeStr=typeLabel+(viewLabel?' '+viewLabel:'');
    const allGuests=[];
    if(b.name&&b.name!=='—') allGuests.push(h(b.name));
    if(b.guests&&b.guests.length) b.guests.filter(g=>g.name).forEach(g=>allGuests.push(h(g.name)));
    const amount=b.amount?Number(b.amount):0;
    const deposit=b.notes&&b.notes.match(depositRegex)?Number(b.notes.match(depositRegex)[1]):0;
    totalAmount+=amount;totalDeposit+=deposit;
    const boardLabel=BOARD_LABELS[b.boardType]||BOARD_LABELS.bb;
    return`<tr>
      <td style="font-weight:700">غ ${b.room}</td>
      <td>${allGuests.join('، ')||'—'}</td>
      <td>${roomTypeStr||'—'}</td>
      <td>${boardLabel}</td>
      <td>${b.checkin.split('-').reverse().join('/')}</td>
      <td>${b.checkout.split('-').reverse().join('/')}</td>
      <td style="text-align:left">${amount>0?amount.toLocaleString():'—'}</td>
    </tr>`;
  }).join('');
  const resp=members[0];
  const respLine=resp.respName?`<div style="font-size:13px;color:#555;margin-bottom:6px">المسؤول: <b>${h(resp.respName)}</b>${resp.respNationality?' · '+h(resp.respNationality):''}</div>`:'';
  const totalRest=totalAmount-totalDeposit;
  const w=window.open('','_blank','width=850,height=950');if(!w){alert('تعذر فتح نافذة الطباعة');return;}try{w.opener=null;}catch(_){}
  const groupVoucherHtml=`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>Group Voucher — ${h(groupId)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Arial',sans-serif;background:#fff;color:#111;padding:30px;max-width:760px;margin:0 auto}
    .stars{color:#D4A017;font-size:22px;letter-spacing:3px;text-align:center;margin-bottom:4px}
    .hotel-name{font-size:32px;font-weight:900;text-align:center;letter-spacing:1px;line-height:1.1}
    .voucher-title{background:#D4A017;color:#fff;font-size:16px;font-weight:700;text-align:center;padding:5px 20px;display:inline-block;margin:10px auto 20px;letter-spacing:2px}
    .voucher-title-wrap{text-align:center}
    .meta-row{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;color:#444}
    table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px}
    th,td{border:1px solid #ddd;padding:8px 10px;text-align:right}
    th{background:#111;color:#fff;font-size:11px}
    .divider{border:none;border-top:1px solid #ddd;margin:16px 0}
    .amounts{text-align:left;font-size:13px;line-height:2}
    .total-line{font-size:16px;font-weight:900}
    .thank-you{text-align:center;font-size:14px;font-weight:700;margin:20px 0 10px}
    .payment-info{font-size:11px;color:#444;margin-bottom:14px}
    .payment-info b{color:#111}
    .terms{font-size:11px;color:#444}
    .terms h4{font-size:12px;margin-bottom:6px}
    .terms li{margin-bottom:3px;margin-right:14px}
    .footer-bar{text-align:center;color:#D4A017;font-size:18px;font-weight:900;letter-spacing:3px;margin-top:20px;padding-top:14px;border-top:2px solid #D4A017}
    .stamp-area{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px}
    .stamp-placeholder{border:2px dashed #ccc;border-radius:50%;width:90px;height:90px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#bbb;text-align:center}
    .ceo-line{font-size:12px;text-align:center;margin-top:6px;color:#555}
    @media print{body{padding:10px}button{display:none!important}}
  </style></head><body>
  <div style="text-align:left;margin-bottom:10px"><button id="group-print-btn" type="button" style="padding:8px 20px;background:#D4A017;border:none;color:#fff;font-weight:700;cursor:pointer;font-size:13px;border-radius:4px">🖨️ طباعة</button></div>
  <div class="stars">★ ★ ★ ★ ★</div>
  <div class="hotel-name">DAHAB BAY<br>HOTEL</div>
  <div class="voucher-title-wrap"><div class="voucher-title">GROUP RESERVATION VOUCHER</div></div>
  <div class="meta-row">
    <div><b>Place Hotel :</b> Dahab<br><b>Hotel Name :</b> Dahab bay hotel</div>
    <div style="text-align:left"><b>Group :</b> ${h(groupId)}<br><b>Rooms :</b> ${members.length}</div>
  </div>
  ${respLine}
  <table>
    <thead><tr><th>غرفة</th><th>النزلاء</th><th>النوع</th><th>نوع الإقامة</th><th>وصول</th><th>مغادرة</th><th>المبلغ</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <hr class="divider">
  <div class="amounts" style="direction:ltr">
    ${totalDeposit>0?`<div>Total Deposit &nbsp; ${totalDeposit.toLocaleString()}</div><div>Total Rest &nbsp; ${totalRest>0?totalRest.toLocaleString():0}</div>`:''}
    <div class="total-line">Grand Total &nbsp; ${totalAmount>0?totalAmount.toLocaleString():'—'}</div>
  </div>
  <hr class="divider">
  <div class="stamp-area">
    <div>
      <div class="thank-you">Thank you for your trust and happy journey.</div>
      <div class="payment-info">
        <b>Payment Info :</b><br>
        Phone Number : 01288250908 - 01090071183<br>
        Website &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: www.Dahab Bay Hotel.com<br>
        Email Address : DahabBayHotel@gmail.com<br>
        Address &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: Dahab , South of Sinaa ,Egypt
      </div>
      <div class="terms">
        <h4>Terms and Condition</h4>
        <ul>
          <li>According to the Egyptian Tourism Authority :</li>
          <li style="margin-right:24px">1- Please be careful and take the necessary precautions for covid 19</li>
          <li>Dahab Bay Hotel Policy :</li>
          <li style="margin-right:24px">1- Our official Check-in time is 12:00 PM and Check-out time is 11:00 AM</li>
          <li>Directions :</li>
          <li style="margin-right:24px">1- It is not possible to cancel the reservation before the flight date by 48</li>
          <li style="margin-right:24px">2- You cannot complete the trip before paying the rest of the reservation value</li>
          <li style="margin-right:24px">3- This receipt is not official, but to ensure the right of the customer</li>
          <li>Breakfast :</li>
          <li style="margin-right:24px">1- Breakfast is served daily from 8:30 AM to 10:30 AM, featuring a daily set menu.</li>
        </ul>
      </div>
    </div>
    <div style="text-align:center">
      <div class="stamp-placeholder">Dahab<br>Bay<br>Hotel</div>
      <div class="ceo-line">Hotel CEO</div>
    </div>
  </div>
  <div class="footer-bar">DAHAB BAY HOTEL</div>
  </body></html>`;
  mountPrintDocument(w,groupVoucherHtml,'group-print-btn');
}
function exportExcel(){
  if(!requireAdmin())return;
  if(!bookings.length){alert('لا يوجد بيانات');return;}
  const header=(currentLang==='ar'?['الغرفة','النزيل الرئيسي','الجنسية','نوع الوثيقة','رقم الوثيقة','مكان الإقامة','النزيل 2','النزيل 3','النزيل 4','النزيل 5','المسؤول الخارجي','نوع الإقامة','الوصول','المغادرة','الليالي','المبلغ','الحالة','رقم المجموعة']:['Room','Primary Guest','Nationality','Document Type','Document Number','Residence','Guest 2','Guest 3','Guest 4','Guest 5','External Responsible Person','Board Type','Check-in','Checkout','Nights','Amount','Status','Group Number']);
  const rows=bookings.map(b=>{
    const gs=b.guests||[];
    return[b.room,b.name,b.nationality||'',b.idType==='passport'?bi('باسبورت','Passport'):bi('بطاقة قومية','National ID'),b.idNumber||'',b.address||'',
      gs[0]?gs[0].name:'',gs[1]?gs[1].name:'',gs[2]?gs[2].name:'',gs[3]?gs[3].name:'',
      b.respName||'',BOARD_LABELS[b.boardType]||BOARD_LABELS.bb,b.checkin,b.checkout,nightsBetween(b.checkin,b.checkout),b.amount||'',b.status==='done'?bi('منتهي','Completed'):bi('نشط','Active'),b.groupId||''];
  });
  const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cell=v=>`<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const xml=`<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${bi('الحجوزات','Bookings')}"><Table><Row>${header.map(cell).join('')}</Row>${rows.map(r=>`<Row>${r.map(cell).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`;
  const a=document.createElement('a');
  a.href='data:application/vnd.ms-excel;charset=utf-8,\uFEFF'+encodeURIComponent(xml);
  a.download='dahab_bay_'+today()+'.xls';a.click();
}

const ACTION_HANDLERS=Object.freeze({
  toggleLanguage,toggleSidebar,doLogin,doLogout,showPage,setDateMode,onDatesChange,onNightsInput,onRespTypeChange,
  addRoomRow,addBooking,clearForm,renderBookings,exportExcel,renderTrips,closeModal,openEditModal,
  openExtendModal,printVoucher,printGroupVoucher,confirmPermanentDelete,showTripsForRoom,showRoomDetails,
  viewGroup,checkoutBooking,addTripRow,onTripNameChange,removeTripRow,onRoomTypeChange,onRoomViewFilterChange,
  onRoomRowChange,toggleRoomBlock,removeRoomRow,setEditDateMode,updateEditNights,onEditNightsInput,
  onEditRoomChange,openAddGroupRoomModal,saveEditBooking,closeEditModal,addEditTripRow,removeEditTripRow,
  onAgrRoomChange,confirmAddGroupRoom,closeAddGroupRoomModal,updateExtendNights,confirmExtend,
  closeExtendModal,groupCheckoutOne,groupCheckoutAll,groupDeleteAll,closeGroupModal,closePermDeleteModal,
  executePermanentDelete,addUser,saveEditUser,closeEditUserModal
});

function splitActionStatements(code){
  const parts=[];let current='';let quote='';let escaped=false;let depth=0;
  for(const char of String(code||'')){
    if(escaped){current+=char;escaped=false;continue;}
    if(char==='\\'){current+=char;escaped=true;continue;}
    if(quote){
      current+=char;
      if(char===quote)quote='';
      continue;
    }
    if(char==="'"||char==='"'){quote=char;current+=char;continue;}
    if(char==='('){depth++;current+=char;continue;}
    if(char===')'){depth=Math.max(0,depth-1);current+=char;continue;}
    if(char===';'&&depth===0){if(current.trim())parts.push(current.trim());current='';continue;}
    current+=char;
  }
  if(current.trim())parts.push(current.trim());
  return parts;
}
function splitActionArgs(source){
  if(!String(source||'').trim())return[];
  const args=[];let current='';let quote='';let escaped=false;let depth=0;
  for(const char of source){
    if(escaped){current+=char;escaped=false;continue;}
    if(char==='\\'){current+=char;escaped=true;continue;}
    if(quote){
      current+=char;
      if(char===quote)quote='';
      continue;
    }
    if(char==="'"||char==='"'){quote=char;current+=char;continue;}
    if(char==='('||char==='['||char==='{'){depth++;current+=char;continue;}
    if(char===')'||char===']'||char==='}'){depth=Math.max(0,depth-1);current+=char;continue;}
    if(char===','&&depth===0){args.push(current.trim());current='';continue;}
    current+=char;
  }
  if(current.trim())args.push(current.trim());
  return args;
}
function parseActionValue(token){
  const value=String(token||'').trim();
  if(!value)return undefined;
  if(/^[-+]?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(value==='true')return true;
  if(value==='false')return false;
  if(value==='null')return null;
  if(value.startsWith('"')&&value.endsWith('"')){
    try{return JSON.parse(value);}catch(_){throw new Error('Invalid action string');}
  }
  if(value.startsWith("'")&&value.endsWith("'")){
    return value.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\');
  }
  throw new Error('Unsupported action argument');
}
function invokeActionCall(statement,event,target){
  const call=statement.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/s);
  if(!call)throw new Error('Invalid action');
  const handler=ACTION_HANDLERS[call[1]];
  if(typeof handler!=='function')throw new Error('Action not allowed');
  const args=splitActionArgs(call[2]).map(parseActionValue);
  return handler(...args);
}
function executeActionCode(code,event,target){
  for(const statement of splitActionStatements(code)){
    if(statement==='event.stopPropagation()'){event.stopPropagation();continue;}
    if(statement==='event.preventDefault()'){event.preventDefault();continue;}
    if(statement==='window.print()'){window.print();continue;}

    let match=statement.match(/^if\(event\.target===this\)([A-Za-z_$][\w$]*\(.*\))$/s);
    if(match){if(event.target===target)invokeActionCall(match[1],event,target);continue;}

    match=statement.match(/^if\(event\.key===['"]Enter['"]\)([A-Za-z_$][\w$]*\(.*\))$/s);
    if(match){if(event.key==='Enter')invokeActionCall(match[1],event,target);continue;}

    match=statement.match(/^setTimeout\(\(\)=>\s*([A-Za-z_$][\w$]*\(.*\))\s*,\s*(\d+)\)$/s);
    if(match){
      const delay=Math.min(Number(match[2])||0,5000);
      setTimeout(()=>invokeActionCall(match[1],event,target),delay);
      continue;
    }

    invokeActionCall(statement,event,target);
  }
}
function installActionDelegation(){
  const bindings=[
    ['click','data-on-click'],
    ['change','data-on-change'],
    ['input','data-on-input'],
    ['keydown','data-on-keydown']
  ];
  for(const [eventName,attribute] of bindings){
    document.addEventListener(eventName,event=>{
      const source=event.target instanceof Element?event.target.closest(`[${attribute}]`):null;
      if(!source)return;
      const code=source.getAttribute(attribute);
      if(!code)return;
      try{executeActionCode(code,event,source);}catch(error){console.error('Blocked invalid UI action',error);}
    });
  }
}

installActionDelegation();
setLanguage(currentLang,false);
restoreAuthenticatedSession();
setInterval(()=>{if(authSession?.refresh_token)ensureSession().catch(()=>doLogout());},60000);
