import type { Request } from "express";

export type Lang = "ar" | "en";

/** The client sends `X-Lang`; anything unrecognised falls back to Arabic. */
export function langOf(req: Request): Lang {
  const header = String(req.headers["x-lang"] || "").toLowerCase();
  if (header === "en") return "en";
  if (header === "ar") return "ar";

  const accept = String(req.headers["accept-language"] || "").toLowerCase();
  if (accept.startsWith("en")) return "en";
  return "ar";
}

/* ------------------------------------------------------------------ *
 * Parameterised messages
 *
 * Validation errors embed a field name and bounds, so they cannot be looked up
 * as fixed strings. These carry a key plus parameters and are rendered at the
 * response boundary.
 * ------------------------------------------------------------------ */

export const TEMPLATES = {
  "field.required": {
    ar: 'الحقل "{field}" مطلوب',
    en: 'The "{field}" field is required',
  },
  "field.mustBeText": {
    ar: 'الحقل "{field}" يجب أن يكون نصاً',
    en: 'The "{field}" field must be text',
  },
  "field.tooShort": {
    ar: 'الحقل "{field}" قصير جداً',
    en: 'The "{field}" field is too short',
  },
  "field.tooLong": {
    ar: 'الحقل "{field}" طويل جداً (الحد {max} حرف)',
    en: 'The "{field}" field is too long (maximum {max} characters)',
  },
  "field.mustBeNumber": {
    ar: 'الحقل "{field}" يجب أن يكون رقماً',
    en: 'The "{field}" field must be a number',
  },
  "field.min": {
    ar: 'الحقل "{field}" يجب ألا يقل عن {min}',
    en: 'The "{field}" field must be at least {min}',
  },
  "field.max": {
    ar: 'الحقل "{field}" يجب ألا يزيد عن {max}',
    en: 'The "{field}" field must not exceed {max}',
  },
  "field.invalidChoice": {
    ar: 'القيمة المدخلة في "{field}" غير صالحة',
    en: 'The value selected for "{field}" is not valid',
  },
  "field.invalidDate": {
    ar: 'الحقل "{field}" يجب أن يكون تاريخاً صالحاً (YYYY-MM-DD)',
    en: 'The "{field}" field must be a valid date (YYYY-MM-DD)',
  },
  "field.invalidPhone": {
    ar: 'رقم الهاتف في "{field}" غير صالح',
    en: 'The phone number in "{field}" is not valid',
  },
  "field.invalidEmail": {
    ar: "البريد الإلكتروني غير صالح",
    en: "The email address is not valid",
  },
  "field.mustBeList": {
    ar: 'الحقل "{field}" يجب أن يكون قائمة',
    en: 'The "{field}" field must be a list',
  },
  "field.tooManyItems": {
    ar: 'عدد العناصر في "{field}" كبير جداً',
    en: 'The "{field}" field has too many items',
  },
  "password.tooShort": {
    ar: "يجب أن تكون كلمة المرور {min} أحرف على الأقل",
    en: "The password must be at least {min} characters",
  },
  "password.needsLettersAndDigits": {
    ar: "يجب أن تحتوي كلمة المرور على حروف وأرقام معاً",
    en: "The password must contain both letters and numbers",
  },
  "rate.tooManyAttempts": {
    ar: "محاولات كثيرة جداً. يرجى المحاولة بعد {seconds} ثانية",
    en: "Too many attempts. Please try again in {seconds} seconds",
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

/* ------------------------------------------------------------------ *
 * Fixed messages and field labels
 *
 * The Arabic text stays inline in the route code and doubles as the lookup
 * key, so no route needed rewriting and an untranslated message degrades to
 * readable Arabic instead of a missing-key placeholder.
 * ------------------------------------------------------------------ */

const EN: Record<string, string> = {
  // --- auth ---
  "بيانات الدخول غير صحيحة (تحقق من الـ UID وكلمة المرور)":
    "Incorrect sign-in details (check your UID and password)",
  "الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى": "Your session has expired. Please sign in again",
  "ليس لديك صلاحية للقيام بهذا الإجراء": "You do not have permission to perform this action",
  "تم إيقاف هذا الحساب. يرجى مراجعة الإدارة.": "This account has been suspended. Please contact the administration.",
  "حسابك قيد المراجعة من قبل الإدارة ولم تتم الموافقة عليه بعد.":
    "Your account is still under review and has not been approved yet.",
  "تم إيقاف هذا الحساب": "This account has been suspended",
  "الحساب لم يعد موجوداً": "This account no longer exists",
  "كلمة المرور الحالية غير صحيحة": "The current password is incorrect",
  "كلمة المرور الجديدة يجب أن تختلف عن الحالية": "The new password must differ from the current one",
  "لا يمكنك عرض إشعارات مستخدم آخر": "You cannot view another user's notifications",
  "لا يمكنك تعديل إشعار مستخدم آخر": "You cannot modify another user's notification",
  "لا يمكنك الاطلاع على بيانات طالب آخر": "You cannot view another student's data",
  "لا يمكنك عرض صفوف معلم آخر": "You cannot view another teacher's classes",
  "لا يمكنك عرض صفوف طالب آخر": "You cannot view another student's classes",

  // --- generic ---
  "العنصر المطلوب غير موجود": "The requested item was not found",
  "المسار المطلوب غير موجود": "The requested endpoint was not found",
  "حدث خطأ في الخادم، يرجى المحاولة لاحقاً": "A server error occurred. Please try again later",
  "قاعدة البيانات تحتاج فهرساً لهذا الاستعلام. نفّذ الأمر: firebase deploy --only firestore:indexes":
    "The database needs an index for this query. Run: firebase deploy --only firestore:indexes",
  "طلب غير صالح": "Invalid request",
  "لا توجد بيانات للتحديث": "There is nothing to update",
  "تعذر الاتصال بقاعدة البيانات، يرجى المحاولة بعد قليل":
    "Could not reach the database. Please try again shortly",
  "الخادم غير مصرح له بالوصول لقاعدة البيانات. تأكد من ضبط FIREBASE_SERVER_EMAIL و FIREBASE_SERVER_PASSWORD، وأن الـ UID في firestore.rules يطابق حساب الخدمة.":
    "The server is not authorised to access the database. Check FIREBASE_SERVER_EMAIL and FIREBASE_SERVER_PASSWORD, and that the UID in firestore.rules matches the service account.",

  // --- setup ---
  "تم تهيئة النظام مسبقاً. لا يمكن إنشاء مدير جديد من هنا.":
    "The system has already been set up. A new administrator cannot be created here.",
  "رمز التهيئة غير صحيح": "The setup token is incorrect",
  "الرقم التعريفي للمدير مطلوب": "An administrator UID is required",
  "كلمة المرور يجب أن تكون 8 أحرف على الأقل": "The password must be at least 8 characters",

  // --- registration ---
  "يوجد حساب مسجل مسبقاً بنفس رقم الهوية. يرجى تسجيل الدخول أو مراجعة الإدارة.":
    "An account with this national ID already exists. Please sign in or contact the administration.",
  "الصف المختار غير موجود": "The selected class does not exist",
  "لا يوجد طلب بهذا الرقم. تأكد من رقم المتابعة.":
    "No application found with that code. Please check your tracking number.",
  "طلب التسجيل غير موجود": "The application was not found",
  "يجب تحديد الصف الدراسي قبل الموافقة": "A class must be selected before approving",
  "تعذر توليد رقم تعريفي فريد، يرجى المحاولة مرة أخرى":
    "Could not generate a unique UID. Please try again.",

  // --- users ---
  "هذا الـ UID مستخدم بالفعل، يرجى اختيار واحد آخر": "This UID is already taken. Please choose another.",
  "هذا الـ UID موجود بالفعل": "This UID already exists",
  "الطالب غير موجود": "The student was not found",
  "المستخدم غير موجود": "The user was not found",
  "لا يمكنك حذف حسابك الخاص": "You cannot delete your own account",

  // --- classes & schedule ---
  "الصف غير موجود": "The class was not found",
  "يجب اختيار معلم واحد على الأقل": "At least one teacher must be selected",
  "الحصة غير موجودة": "The lesson was not found",
  "يوجد درس مسجل بالفعل في هذا اليوم والوقت لهذا الصف":
    "A lesson is already scheduled for this class at that day and time",

  // --- subjects ---
  "المادة غير موجودة": "The subject was not found",
  "هذه المادة مضافة بالفعل": "This subject has already been added",

  // --- attendance ---
  "لا توجد بيانات حضور للتسجيل": "There is no attendance data to record",
  "عدد الطلاب كبير جداً في طلب واحد": "Too many students in a single request",
  "لا يمكن تسجيل الحضور لتاريخ مستقبلي": "Attendance cannot be recorded for a future date",

  // --- grades ---
  "الدرجة غير موجودة": "The grade was not found",
  "غير مصرح لك برصد الدرجات": "You are not permitted to record grades",
  "رصد الدرجات مقتصر على المدير والمعلمين": "Recording grades is limited to the admin and teachers",

  // --- behaviour ---
  "الملاحظة غير موجودة": "The note was not found",

  // --- finance ---
  "سند الرسوم غير موجود": "The fee record was not found",
  "سند القبض غير موجود": "The payment receipt was not found",
  "لا يوجد طلاب مطابقون لإصدار الرسوم لهم": "No matching students to issue fees for",
  "الخصم لا يمكن أن يتجاوز المبلغ الأصلي": "The discount cannot exceed the original amount",
  "لا يمكن إلغاء سند تم تسديد جزء منه. قم بإرجاع الدفعات أولاً.":
    "A partially paid record cannot be cancelled. Reverse the payments first.",
  "لا يمكن التسديد على سند ملغى": "Payments cannot be recorded against a cancelled record",

  // --- field labels used by the validators ---
  "الرقم التعريفي": "UID",
  "كلمة المرور": "Password",
  "كلمة المرور الحالية": "Current password",
  "كلمة المرور الجديدة": "New password",
  "الاسم الرباعي": "Full name",
  "اسم الأم": "Mother's name",
  "رقم الهوية / البطاقة الوطنية": "National ID",
  "رقم الهوية": "National ID",
  "تاريخ الميلاد": "Date of birth",
  "محل الولادة": "Place of birth",
  "رقم هاتف الطالب": "Student phone number",
  "البريد الإلكتروني": "Email address",
  "عنوان السكن": "Home address",
  العنوان: "Address",
  "اسم ولي الأمر": "Guardian name",
  "هاتف ولي الأمر": "Guardian phone",
  "صلة القرابة": "Relationship",
  "مهنة ولي الأمر": "Guardian occupation",
  "المدرسة السابقة": "Previous school",
  "آخر صف دراسي": "Last grade completed",
  "المعدل السابق": "Previous average",
  "ملاحظات صحية": "Health notes",
  "ملاحظات إضافية": "Additional notes",
  "الصف المطلوب": "Requested class",
  "رقم المتابعة": "Tracking code",
  "سبب الرفض": "Rejection reason",
  "عنوان القسط": "Instalment title",
  "تاريخ الاستحقاق": "Due date",
  الاسم: "Name",
  "اسم الطالب": "Student name",
  "اسم المعلم": "Teacher name",
  "اسم المستخدم": "Username",
  "رقم الهاتف": "Phone number",
  الطالب: "Student",
  الصف: "Class",
  "اسم الصف": "Class name",
  السعة: "Capacity",
  المواد: "Subjects",
  المادة: "Subject",
  "حالة الحساب": "Account status",
  التاريخ: "Date",
  الوقت: "Time",
  اليوم: "Day",
  المعلم: "Teacher",
  القاعة: "Room",
  "معرّف الطالب": "Student ID",
  "حالة الحضور": "Attendance status",
  ملاحظة: "Note",
  الدرجة: "Score",
  "الدرجة الكلية": "Total marks",
  الحالة: "Status",
  "نوع التقييم": "Assessment type",
  "الفصل الدراسي": "Term",
  "عنوان الرسوم": "Fee title",
  "نوع الرسوم": "Fee type",
  المبلغ: "Amount",
  الخصم: "Discount",
  "السنة الدراسية": "Academic year",
  "الفئة المستهدفة": "Target group",
  "المبلغ المدفوع": "Amount paid",
  "طريقة الدفع": "Payment method",
  "تاريخ الدفع": "Payment date",
  "نوع الملاحظة": "Note type",
  التصنيف: "Category",
  "عنوان الملاحظة": "Note title",
  التفاصيل: "Details",
  النقاط: "Points",
  "عنوان الإشعار": "Notification title",
  "نص الإشعار": "Notification body",
  الحد: "Limit",
  العدد: "Count",
  "من تاريخ": "From date",
  "إلى تاريخ": "To date",
};

/** Render a parameterised message. */
export function tt(
  key: TemplateKey,
  lang: Lang,
  params: Record<string, string | number> = {}
): string {
  let out: string = TEMPLATES[key][lang];
  for (const [name, value] of Object.entries(params)) {
    const rendered = name === "field" ? tr(String(value), lang) : String(value);
    out = out.split(`{${name}}`).join(rendered);
  }
  return out;
}

/** Translate a fixed message, falling back to the Arabic source. */
export function tr(text: string, lang: Lang): string {
  if (lang === "ar") return text;
  return EN[text] ?? EN[text.trim()] ?? text;
}
