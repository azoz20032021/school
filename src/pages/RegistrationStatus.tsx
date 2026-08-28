import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Loader2, Search, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';

interface StatusResult {
    tracking_code: string;
    full_name: string;
    status: 'pending' | 'approved' | 'rejected';
    requested_class_name?: string | null;
    rejection_reason?: string;
    assigned_uid?: string;
}

const PRESENTATION = {
    pending: {
        icon: Clock,
        tone: 'bg-amber-50 text-amber-600 border-amber-100',
        title: 'طلبك قيد المراجعة',
        body: 'استلمت الإدارة طلبك وهو الآن قيد التدقيق. عادةً تستغرق المراجعة يوماً إلى ثلاثة أيام عمل.',
    },
    approved: {
        icon: CheckCircle2,
        tone: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        title: 'تمت الموافقة على طلبك',
        body: 'أهلاً بك في ثانوية المعالي الأهلية. استخدم الرقم التعريفي أدناه مع كلمة المرور التي اخترتها عند التسجيل.',
    },
    rejected: {
        icon: XCircle,
        tone: 'bg-red-50 text-red-600 border-red-100',
        title: 'لم تتم الموافقة على الطلب',
        body: 'يمكنك مراجعة الإدارة لمعرفة التفاصيل أو تقديم طلب جديد بعد استكمال المطلوب.',
    },
} as const;

export const RegistrationStatus: React.FC = () => {
    const [code, setCode] = useState('');
    const [result, setResult] = useState<StatusResult | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const data = await api.get<StatusResult>(
                `/api/register/status/${encodeURIComponent(code.trim().toUpperCase())}`
            );
            setResult(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'حدث خطأ في الاتصال بالخادم');
        } finally {
            setLoading(false);
        }
    };

    const view = result ? PRESENTATION[result.status] : null;
    const Icon = view?.icon;

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
            >
                <div className="flex flex-col items-center mb-6">
                    <img src="/logo.png" alt="شعار المدرسة" className="w-16 h-16 object-contain mb-3" />
                    <h1 className="text-xl font-black text-slate-800">متابعة حالة الطلب</h1>
                    <p className="text-slate-500 text-xs font-medium mt-1">أدخل رقم المتابعة الذي استلمته عند التسجيل</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-4" />
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            dir="ltr"
                            className="w-full pr-11 pl-4 py-3 rounded-xl border border-slate-200 text-center tracking-[0.25em] font-black text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="ABCD1234"
                            maxLength={16}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'جاري البحث...' : 'استعلام'}
                    </button>
                </form>

                {error && (
                    <p className="mt-4 text-red-600 text-xs text-center bg-red-50 border border-red-100 rounded-xl py-2.5 px-3">
                        {error}
                    </p>
                )}

                {result && view && Icon && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-6 rounded-2xl border p-5 ${view.tone}`}
                    >
                        <div className="flex items-start gap-3">
                            <Icon className="w-6 h-6 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="font-black text-sm">{view.title}</p>
                                <p className="text-xs leading-relaxed opacity-90">{view.body}</p>
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-current/10 space-y-1.5 text-xs">
                            <p><span className="opacity-70">الاسم:</span> <span className="font-bold">{result.full_name}</span></p>
                            {result.requested_class_name && (
                                <p><span className="opacity-70">الصف:</span> <span className="font-bold">{result.requested_class_name}</span></p>
                            )}
                            {result.status === 'rejected' && result.rejection_reason && (
                                <p><span className="opacity-70">السبب:</span> <span className="font-bold">{result.rejection_reason}</span></p>
                            )}
                        </div>

                        {result.status === 'approved' && result.assigned_uid && (
                            <div className="mt-4 bg-white/70 rounded-xl p-4 text-center">
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">رقمك التعريفي</p>
                                <p className="text-2xl font-black tracking-widest" dir="ltr">{result.assigned_uid}</p>
                                <Link
                                    to="/login"
                                    className="mt-3 inline-block bg-emerald-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl"
                                >
                                    تسجيل الدخول الآن
                                </Link>
                            </div>
                        )}
                    </motion.div>
                )}

                <div className="mt-6 text-center">
                    <Link to="/login" className="text-slate-500 text-sm hover:underline">العودة لصفحة الدخول</Link>
                </div>
            </motion.div>
        </div>
    );
};
