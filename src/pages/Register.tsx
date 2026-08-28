import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { ClassData } from '../types';
import { api, ApiError } from '../lib/api';

const RELATIONS = ['الأب', 'الأم', 'الأخ', 'العم', 'الخال', 'الجد', 'ولي أمر آخر'];

interface FormState {
    full_name: string;
    mother_name: string;
    national_id: string;
    birth_date: string;
    birth_place: string;
    phone: string;
    email: string;
    address: string;
    guardian_name: string;
    guardian_phone: string;
    guardian_relation: string;
    guardian_job: string;
    previous_school: string;
    last_grade: string;
    last_average: string;
    health_notes: string;
    notes: string;
    requested_class_id: string;
    password: string;
    confirm_password: string;
}

const EMPTY: FormState = {
    full_name: '', mother_name: '', national_id: '', birth_date: '', birth_place: '',
    phone: '', email: '', address: '',
    guardian_name: '', guardian_phone: '', guardian_relation: 'الأب', guardian_job: '',
    previous_school: '', last_grade: '', last_average: '', health_notes: '', notes: '',
    requested_class_id: '', password: '', confirm_password: '',
};

const STEPS = [
    { title: 'البيانات الشخصية', hint: 'كما هي في الهوية الرسمية' },
    { title: 'التواصل وولي الأمر', hint: 'نستخدمها للإشعارات المهمة' },
    { title: 'المعلومات الدراسية', hint: 'الصف المطلوب وسجلك السابق' },
    { title: 'كلمة المرور', hint: 'ستدخل بها بعد موافقة الإدارة' },
];

/** Fields that must be filled before each step is allowed to advance. */
const REQUIRED_PER_STEP: (keyof FormState)[][] = [
    ['full_name', 'national_id', 'birth_date'],
    ['phone', 'address', 'guardian_name', 'guardian_phone'],
    ['requested_class_id'],
    ['password', 'confirm_password'],
];

const Field: React.FC<{
    label: string;
    required?: boolean;
    children: React.ReactNode;
    hint?: string;
}> = ({ label, required, children, hint }) => (
    <div>
        <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
            {label}{' '}
            {required
                ? <span className="text-red-500">*</span>
                : <span className="text-slate-400 font-medium">(اختياري)</span>}
        </label>
        {children}
        {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
);

const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white';

export const Register: React.FC = () => {
    const [form, setForm] = useState<FormState>(EMPTY);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [step, setStep] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [trackingCode, setTrackingCode] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        api.get<ClassData[]>('/api/classes').then(setClasses).catch(() => setClasses([]));
    }, []);

    const set = (key: keyof FormState) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        setForm((prev) => ({ ...prev, [key]: e.target.value }));
        setError('');
    };

    const canAdvance = useMemo(
        () => REQUIRED_PER_STEP[step].every((key) => String(form[key]).trim().length > 0),
        [form, step]
    );

    const goNext = () => {
        if (!canAdvance) {
            setError('يرجى تعبئة جميع الحقول المطلوبة في هذه الخطوة');
            return;
        }
        setError('');
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Enter inside a field submits the form even when the visible button is
        // "next". Treat any submit before the last step as a request to advance.
        if (step < STEPS.length - 1) {
            goNext();
            return;
        }

        if (form.password !== form.confirm_password) {
            setError('كلمتا المرور غير متطابقتين');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const { confirm_password, ...payload } = form;
            const res = await api.post<{ tracking_code: string }>('/api/register', payload);
            setTrackingCode(res.tracking_code);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'حدث خطأ في الاتصال بالخادم');
        } finally {
            setLoading(false);
        }
    };

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(trackingCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable — the code is on screen anyway */ }
    };

    /* ------------------------------ Success ------------------------------ */

    if (trackingCode) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans" dir="rtl">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-center"
                >
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
                        <Check className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-black text-slate-800 mb-2">تم استلام طلبك</h1>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6">
                        طلبك الآن قيد المراجعة من قبل الإدارة. احتفظ برقم المتابعة أدناه لمعرفة حالة الطلب،
                        وعند الموافقة ستستلم رقمك التعريفي للدخول.
                    </p>

                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 mb-6">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">رقم المتابعة</p>
                        <p className="text-3xl font-black text-indigo-600 tracking-[0.2em]" dir="ltr">{trackingCode}</p>
                        <button
                            onClick={copyCode}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            {copied ? 'تم النسخ' : 'نسخ الرقم'}
                        </button>
                    </div>

                    <div className="space-y-2">
                        <Link
                            to="/register/status"
                            className="block w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200"
                        >
                            متابعة حالة الطلب
                        </Link>
                        <Link to="/login" className="block text-slate-500 text-sm hover:underline pt-2">
                            العودة لصفحة الدخول
                        </Link>
                    </div>
                </motion.div>
            </div>
        );
    }

    /* ------------------------------- Form -------------------------------- */

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-6 font-sans" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg bg-white rounded-3xl shadow-xl p-6 md:p-8 border border-slate-100"
            >
                <div className="flex flex-col items-center mb-6">
                    <img src="/logo.png" alt="شعار المدرسة" className="w-16 h-16 object-contain mb-3" />
                    <h1 className="text-xl font-black text-slate-800">طلب تسجيل طالب جديد</h1>
                    <p className="text-slate-500 text-xs font-medium mt-1">ثانوية المعالي الأهلية</p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-1.5 mb-2">
                    {STEPS.map((s, i) => (
                        <div key={s.title} className="flex-1">
                            <div
                                className={`h-1.5 rounded-full transition-colors ${
                                    i < step ? 'bg-emerald-500' : i === step ? 'bg-indigo-600' : 'bg-slate-200'
                                }`}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex items-baseline justify-between mb-5">
                    <p className="text-sm font-black text-slate-800">{STEPS[step].title}</p>
                    <p className="text-[10px] text-slate-400 font-bold">
                        الخطوة {step + 1} من {STEPS.length}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    {step === 0 && (
                        <>
                            <Field label="الاسم الرباعي" required hint="مثال: محمد علي حسين الجبوري">
                                <input className={inputClass} value={form.full_name} onChange={set('full_name')} />
                            </Field>
                            <Field label="اسم الأم الثلاثي">
                                <input className={inputClass} value={form.mother_name} onChange={set('mother_name')} />
                            </Field>
                            <Field label="رقم البطاقة الوطنية" required>
                                <input className={inputClass} value={form.national_id} onChange={set('national_id')} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="تاريخ الميلاد" required>
                                    <input type="date" className={inputClass} value={form.birth_date} onChange={set('birth_date')} />
                                </Field>
                                <Field label="محل الولادة">
                                    <input className={inputClass} value={form.birth_place} onChange={set('birth_place')} />
                                </Field>
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="هاتف الطالب" required>
                                    <input type="tel" dir="ltr" className={inputClass} value={form.phone} onChange={set('phone')} placeholder="07XXXXXXXXX" />
                                </Field>
                                <Field label="البريد الإلكتروني">
                                    <input type="email" dir="ltr" className={inputClass} value={form.email} onChange={set('email')} />
                                </Field>
                            </div>
                            <Field label="عنوان السكن" required hint="المحافظة / المنطقة / أقرب نقطة دالة">
                                <input className={inputClass} value={form.address} onChange={set('address')} />
                            </Field>
                            <div className="h-px bg-slate-100 my-2" />
                            <Field label="اسم ولي الأمر" required>
                                <input className={inputClass} value={form.guardian_name} onChange={set('guardian_name')} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="هاتف ولي الأمر" required>
                                    <input type="tel" dir="ltr" className={inputClass} value={form.guardian_phone} onChange={set('guardian_phone')} placeholder="07XXXXXXXXX" />
                                </Field>
                                <Field label="صلة القرابة">
                                    <select className={inputClass} value={form.guardian_relation} onChange={set('guardian_relation')}>
                                        {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <Field label="مهنة ولي الأمر">
                                <input className={inputClass} value={form.guardian_job} onChange={set('guardian_job')} />
                            </Field>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Field label="الصف الدراسي المطلوب" required>
                                <select className={inputClass} value={form.requested_class_id} onChange={set('requested_class_id')}>
                                    <option value="">-- اختر الصف --</option>
                                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </Field>
                            <Field label="المدرسة السابقة">
                                <input className={inputClass} value={form.previous_school} onChange={set('previous_school')} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="آخر صف أكملته">
                                    <input className={inputClass} value={form.last_grade} onChange={set('last_grade')} />
                                </Field>
                                <Field label="المعدل السابق">
                                    <input className={inputClass} value={form.last_average} onChange={set('last_average')} placeholder="مثال: 78.5" />
                                </Field>
                            </div>
                            <Field label="ملاحظات صحية" hint="أمراض مزمنة، حساسية، أدوية — تبقى سرية لدى الإدارة">
                                <textarea rows={2} className={inputClass} value={form.health_notes} onChange={set('health_notes')} />
                            </Field>
                            <Field label="ملاحظات إضافية">
                                <textarea rows={2} className={inputClass} value={form.notes} onChange={set('notes')} />
                            </Field>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-800 leading-relaxed">
                                اختر كلمة مرور تتذكرها. بعد موافقة الإدارة ستحصل على رقم تعريفي (UID)
                                وتدخل به مع كلمة المرور هذه.
                            </div>
                            <Field label="كلمة المرور" required hint="8 أحرف على الأقل، وتحتوي على حروف وأرقام">
                                <input type="password" autoComplete="new-password" className={inputClass} value={form.password} onChange={set('password')} />
                            </Field>
                            <Field label="تأكيد كلمة المرور" required>
                                <input type="password" autoComplete="new-password" className={inputClass} value={form.confirm_password} onChange={set('confirm_password')} />
                            </Field>
                        </>
                    )}

                    {error && (
                        <p className="text-red-600 text-xs text-center bg-red-50 border border-red-100 rounded-xl py-2 px-3">
                            {error}
                        </p>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={() => setStep((s) => s - 1)}
                                className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold flex items-center gap-1 hover:bg-slate-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                                السابق
                            </button>
                        )}

                        {step < STEPS.length - 1 ? (
                            <button
                                type="button"
                                onClick={goNext}
                                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200 flex items-center justify-center gap-1"
                            >
                                التالي
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-emerald-200 disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
                            </button>
                        )}
                    </div>
                </form>

                <div className="mt-6 text-center">
                    <Link to="/login" className="text-slate-500 text-sm hover:underline">
                        لديك حساب بالفعل؟ سجّل دخولك
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};
