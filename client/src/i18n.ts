import { Language } from './types';

// Strings for the recording / grading / media-library screens.
// Older screens still use inline `isArabic ? … : …`.
const dict = {
  // Learner gate
  myIdentity: { en: 'Student identity', ar: 'هوية الطالب', ur: 'طالب علم کی شناخت' },
  enterRollPin: { en: 'Enter your Roll No and PIN to open your recordings', ar: 'أدخل رقمك الجامعي والرمز السري لفتح تسجيلاتك', ur: 'اپنی ریکارڈنگز کھولنے کے لیے رول نمبر اور PIN درج کریں' },
  rollNo: { en: 'Roll No', ar: 'الرقم الجامعي', ur: 'رول نمبر' },
  fullName: { en: 'Full name', ar: 'الاسم الكامل', ur: 'پورا نام' },
  pin: { en: 'PIN (4–6 digits)', ar: 'الرمز السري (4–6 أرقام)', ur: 'PIN (4–6 ہندسے)' },
  confirmPin: { en: 'Confirm PIN', ar: 'تأكيد الرمز', ur: 'PIN کی تصدیق' },
  unlock: { en: 'Unlock', ar: 'فتح', ur: 'کھولیں' },
  register: { en: 'Create my profile', ar: 'إنشاء ملفي', ur: 'میری پروفائل بنائیں' },
  newStudent: { en: 'First time? Create profile', ar: 'أول مرة؟ أنشئ ملفك', ur: 'پہلی بار؟ پروفائل بنائیں' },
  haveProfile: { en: 'I already have a PIN', ar: 'لدي رمز سري', ur: 'میرے پاس PIN ہے' },
  pinMismatch: { en: 'PINs do not match.', ar: 'الرمزان غير متطابقين.', ur: 'PIN ایک جیسے نہیں ہیں۔' },
  lock: { en: 'Lock', ar: 'قفل', ur: 'لاک کریں' },
  lockedAuto: { en: 'Locks automatically after 5 minutes of inactivity', ar: 'يُقفل تلقائياً بعد 5 دقائق من عدم النشاط', ur: '5 منٹ غیر فعال رہنے پر خود لاک ہو جائے گا' },
  signedInAs: { en: 'Signed in as', ar: 'مسجّل باسم', ur: 'بطور' },

  // Recorder
  voiceRecorder: { en: 'Voice Recorder', ar: 'مسجّل الصوت', ur: 'وائس ریکارڈر' },
  recorderHint: { en: 'Record your pronunciation, listen back, then save it to your recordings.', ar: 'سجّل نطقك واستمع إليه ثم احفظه في تسجيلاتك.', ur: 'اپنا تلفظ ریکارڈ کریں، سن کر چیک کریں، پھر محفوظ کریں۔' },
  startRecording: { en: 'Start recording', ar: 'ابدأ التسجيل', ur: 'ریکارڈنگ شروع کریں' },
  stopRecording: { en: 'Stop', ar: 'إيقاف', ur: 'روکیں' },
  recording: { en: 'Recording…', ar: 'جارٍ التسجيل…', ur: 'ریکارڈنگ جاری…' },
  reRecord: { en: 'Record again', ar: 'سجّل مرة أخرى', ur: 'دوبارہ ریکارڈ کریں' },
  discard: { en: 'Discard', ar: 'تجاهل', ur: 'ختم کریں' },
  save: { en: 'Save', ar: 'حفظ', ur: 'محفوظ کریں' },
  saving: { en: 'Saving…', ar: 'جارٍ الحفظ…', ur: 'محفوظ ہو رہا ہے…' },
  title: { en: 'Title', ar: 'العنوان', ur: 'عنوان' },
  titlePlaceholder: { en: 'e.g. Surah Al-Fatiha – verse 1', ar: 'مثال: سورة الفاتحة – الآية 1', ur: 'مثلاً: سورۃ الفاتحہ – آیت 1' },
  maxLength: { en: 'Max 10 minutes', ar: 'الحد الأقصى 10 دقائق', ur: 'زیادہ سے زیادہ 10 منٹ' },
  micUnavailable: { en: 'Microphone is not available. Check that a headset is connected.', ar: 'الميكروفون غير متاح. تأكد من توصيل السماعة.', ur: 'مائیکروفون دستیاب نہیں۔ ہیڈسیٹ چیک کریں۔' },
  saved: { en: 'Saved to My Recordings', ar: 'تم الحفظ في تسجيلاتي', ur: 'میری ریکارڈنگز میں محفوظ ہو گیا' },

  // My recordings
  myRecordings: { en: 'My Recordings', ar: 'تسجيلاتي', ur: 'میری ریکارڈنگز' },
  noRecordings: { en: 'No recordings yet. Use the Voice Recorder to create one.', ar: 'لا توجد تسجيلات بعد.', ur: 'ابھی کوئی ریکارڈنگ نہیں۔' },
  submit: { en: 'Submit to professor', ar: 'إرسال للأستاذ', ur: 'پروفیسر کو بھیجیں' },
  submitted: { en: 'Submitted', ar: 'مُرسل', ur: 'بھیج دیا' },
  draft: { en: 'Draft', ar: 'مسودة', ur: 'ڈرافٹ' },
  graded: { en: 'Graded', ar: 'مُقيّم', ur: 'نمبر مل گئے' },
  locked: { en: 'Locked', ar: 'مقفل', ur: 'لاک' },
  unlocked: { en: 'Unlocked', ar: 'غير مقفل', ur: 'ان لاک' },
  delete: { en: 'Delete', ar: 'حذف', ur: 'حذف کریں' },
  play: { en: 'Play', ar: 'تشغيل', ur: 'چلائیں' },
  pause: { en: 'Pause', ar: 'إيقاف مؤقت', ur: 'روکیں' },
  stop: { en: 'Stop', ar: 'إيقاف', ur: 'بند کریں' },
  lockedReason: { en: 'Locked by the professor — cannot be deleted', ar: 'مقفل من الأستاذ — لا يمكن حذفه', ur: 'پروفیسر نے لاک کیا ہے — حذف نہیں ہو سکتا' },
  confirmDeleteRec: { en: 'Delete this recording permanently?', ar: 'حذف هذا التسجيل نهائياً؟', ur: 'یہ ریکارڈنگ ہمیشہ کے لیے حذف کریں؟' },
  remark: { en: 'Remark', ar: 'ملاحظة', ur: 'تبصرہ' },
  date: { en: 'Date', ar: 'التاريخ', ur: 'تاریخ' },
  time: { en: 'Time', ar: 'الوقت', ur: 'وقت' },
  duration: { en: 'Duration', ar: 'المدة', ur: 'دورانیہ' },
  marks: { en: 'Marks', ar: 'الدرجة', ur: 'نمبر' },

  // Materials player
  labMaterials: { en: 'Lab Materials', ar: 'مواد المختبر', ur: 'لیب مواد' },
  noMaterials: { en: 'Nothing shared yet. Files from your professor will appear here.', ar: 'لا شيء بعد. ستظهر هنا الملفات من الأستاذ.', ur: 'ابھی کچھ شیئر نہیں ہوا۔ پروفیسر کی فائلیں یہاں آئیں گی۔' },
  continuous: { en: 'Continuous play', ar: 'تشغيل متواصل', ur: 'مسلسل چلائیں' },
  repeatOne: { en: 'Repeat this file', ar: 'تكرار هذا الملف', ur: 'یہی فائل دہرائیں' },
  teacherLed: { en: 'Teacher-led', ar: 'بقيادة الأستاذ', ur: 'پروفیسر کنٹرول' },
  selfPaced: { en: 'Self-paced', ar: 'تحكم ذاتي', ur: 'اپنی رفتار' },
  speed: { en: 'Speed', ar: 'السرعة', ur: 'رفتار' },
  previous: { en: 'Previous', ar: 'السابق', ur: 'پچھلا' },
  next: { en: 'Next', ar: 'التالي', ur: 'اگلا' },
  newMaterial: { en: 'New material from your professor', ar: 'مادة جديدة من الأستاذ', ur: 'پروفیسر کی طرف سے نیا مواد' },
  gradeArrived: { en: 'Your recording was graded', ar: 'تم تقييم تسجيلك', ur: 'آپ کی ریکارڈنگ کو نمبر مل گئے' },

  // Professor: submissions
  submissions: { en: 'Submissions', ar: 'التسليمات', ur: 'جمع شدہ' },
  pending: { en: 'Pending', ar: 'قيد الانتظار', ur: 'باقی' },
  all: { en: 'All', ar: 'الكل', ur: 'سب' },
  searchStudent: { en: 'Search name, Roll No or cabin…', ar: 'ابحث بالاسم أو الرقم أو الكابينة…', ur: 'نام، رول نمبر یا کیبن تلاش کریں…' },
  selectSubmission: { en: 'Select a submission to listen and grade', ar: 'اختر تسليماً للاستماع والتقييم', ur: 'سننے اور نمبر دینے کے لیے انتخاب کریں' },
  noSubmissions: { en: 'No submissions here yet.', ar: 'لا توجد تسليمات.', ur: 'ابھی کوئی جمع شدہ ریکارڈنگ نہیں۔' },
  outOf: { en: 'out of', ar: 'من', ur: 'میں سے' },
  saveGrade: { en: 'Save marks', ar: 'حفظ الدرجة', ur: 'نمبر محفوظ کریں' },
  updateGrade: { en: 'Update marks', ar: 'تحديث الدرجة', ur: 'نمبر اپڈیٹ کریں' },
  unlockForStudent: { en: 'Unlock (student can delete)', ar: 'فتح (يمكن للطالب الحذف)', ur: 'ان لاک (طالب حذف کر سکے)' },
  lockForStudent: { en: 'Lock (student cannot delete)', ar: 'قفل (لا يمكن للطالب الحذف)', ur: 'لاک (طالب حذف نہ کر سکے)' },
  newSubmission: { en: 'New submission', ar: 'تسليم جديد', ur: 'نئی ریکارڈنگ موصول' },
  cabin: { en: 'Cabin', ar: 'الكابينة', ur: 'کیبن' },
  remarkPlaceholder: { en: 'Feedback for the student (optional)', ar: 'ملاحظات للطالب (اختياري)', ur: 'طالب کے لیے رائے (اختیاری)' },
  gradeSaved: { en: 'Marks saved — student notified', ar: 'تم حفظ الدرجة وإبلاغ الطالب', ur: 'نمبر محفوظ — طالب کو اطلاع دی گئی' },

  // Professor: media library
  mediaLibrary: { en: 'Media Library', ar: 'مكتبة الوسائط', ur: 'میڈیا لائبریری' },
  library: { en: 'Library', ar: 'المكتبة', ur: 'لائبریری' },
  recordAudio: { en: 'Record', ar: 'تسجيل', ur: 'ریکارڈ' },
  share: { en: 'Share', ar: 'مشاركة', ur: 'شیئر' },
  activeShares: { en: 'Shared now', ar: 'المشاركات الحالية', ur: 'ابھی شیئر شدہ' },
  uploadFiles: { en: 'Upload audio / video', ar: 'رفع صوت / فيديو', ur: 'آڈیو / ویڈیو اپلوڈ کریں' },
  dropHere: { en: 'or drag & drop files here', ar: 'أو اسحب الملفات وأفلتها هنا', ur: 'یا فائلیں یہاں ڈالیں' },
  uploading: { en: 'Uploading…', ar: 'جارٍ الرفع…', ur: 'اپلوڈ ہو رہا ہے…' },
  emptyLibrary: { en: 'Library is empty. Upload a file or record audio.', ar: 'المكتبة فارغة.', ur: 'لائبریری خالی ہے۔' },
  includeDesktopAudio: { en: 'Also capture desktop audio (file / video playing on this PC)', ar: 'التقاط صوت سطح المكتب أيضاً', ur: 'ڈیسک ٹاپ کی آواز بھی ریکارڈ کریں' },
  saveToLibrary: { en: 'Save to library', ar: 'حفظ في المكتبة', ur: 'لائبریری میں محفوظ کریں' },
  selectedFiles: { en: 'Selected files', ar: 'الملفات المحددة', ur: 'منتخب فائلیں' },
  selectFilesFirst: { en: 'Select files in the Library tab first', ar: 'حدد الملفات من المكتبة أولاً', ur: 'پہلے لائبریری سے فائلیں منتخب کریں' },
  sendTo: { en: 'Send to', ar: 'إرسال إلى', ur: 'بھیجیں' },
  allCabins: { en: 'All cabins', ar: 'كل الكبائن', ur: 'تمام کیبن' },
  selectedCabins: { en: 'Selected cabins', ar: 'كبائن محددة', ur: 'منتخب کیبن' },
  playbackControl: { en: 'Playback control', ar: 'التحكم في التشغيل', ur: 'پلے بیک کنٹرول' },
  studentControls: { en: 'Students control play / pause / repeat', ar: 'الطلاب يتحكمون', ur: 'طالب خود کنٹرول کریں' },
  teacherControls: { en: 'I control playback for everyone', ar: 'أتحكم للجميع', ur: 'میں سب کے لیے کنٹرول کروں' },
  shareNow: { en: 'Share now', ar: 'شارك الآن', ur: 'ابھی شیئر کریں' },
  sharedOk: { en: 'Shared successfully', ar: 'تمت المشاركة', ur: 'کامیابی سے شیئر ہو گیا' },
  revoke: { en: 'Remove from students', ar: 'إزالة من الطلاب', ur: 'طلبہ سے ہٹائیں' },
  noShares: { en: 'Nothing is shared right now.', ar: 'لا توجد مشاركات حالياً.', ur: 'ابھی کچھ شیئر نہیں۔' },
  online: { en: 'online', ar: 'متصل', ur: 'آن لائن' },
  selectAll: { en: 'Select all', ar: 'تحديد الكل', ur: 'سب منتخب کریں' },
  clear: { en: 'Clear', ar: 'مسح', ur: 'صاف کریں' },
  confirmDeleteMedia: { en: 'Delete this file from the library? Students will lose access to it.', ar: 'حذف هذا الملف؟ سيفقد الطلاب الوصول إليه.', ur: 'یہ فائل حذف کریں؟ طلبہ اسے نہیں دیکھ سکیں گے۔' },
  cancel: { en: 'Cancel', ar: 'إلغاء', ur: 'منسوخ' },
  confirm: { en: 'Confirm', ar: 'تأكيد', ur: 'تصدیق' },
  close: { en: 'Close', ar: 'إغلاق', ur: 'بند کریں' },
  students: { en: 'Students', ar: 'الطلاب', ur: 'طلبہ' },
  resetPin: { en: 'Reset PIN', ar: 'إعادة تعيين الرمز', ur: 'PIN ری سیٹ' },
  pinReset: { en: 'PIN reset successfully', ar: 'تمت إعادة تعيين الرمز', ur: 'PIN ری سیٹ ہو گیا' },
  screenSharedWithProf: { en: 'Your screen is visible to the professor', ar: 'شاشتك مرئية للأستاذ', ur: 'آپ کی اسکرین پروفیسر کو نظر آ رہی ہے' },
  shareScreenWithProf: { en: 'Share screen with professor', ar: 'مشاركة الشاشة مع الأستاذ', ur: 'اسکرین پروفیسر سے شیئر کریں' },
  showScreen: { en: 'Screen', ar: 'الشاشة', ur: 'اسکرین' },
  showCamera: { en: 'Camera', ar: 'الكاميرا', ur: 'کیمرہ' },
} as const;

export type I18nKey = keyof typeof dict;

export function t(lang: Language, key: I18nKey): string {
  const entry = dict[key];
  return entry[lang] || entry.en;
}

export function useT(lang: Language) {
  return (key: I18nKey) => t(lang, key);
}
