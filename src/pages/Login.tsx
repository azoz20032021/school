import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { UserData } from '../types';

export const Login: React.FC = () => {
    const [uid, setUid] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const data = await api.post<{ token: string; user: UserData }>('/api/login', {
                uid: uid.trim(),
                password,
            });
            login(data.token, data.user);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'حدث خطأ في الاتصال بالخادم');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans" dir="rtl">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border border-slate-100"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-4 shadow-sm border border-slate-50 overflow-hidden relative group">
                        <img
                            src="/logo.png"
                            alt="شعار المدرسة"
                            className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-500"
                        />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">ثانوية المعالي الأهلية</h1>
                    <p className="text-slate-500 font-medium mt-1">نظام إدارة شؤون الطلاب</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">الرقم التعريفي (UID)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={uid}
                            onChange={(e) => setUid(e.target.value)}
                            autoComplete="username"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            placeholder="أدخل الـ UID الخاص بك"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">كلمة المرور</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            placeholder="أدخل كلمة المرور"
                            required
                        />
                    </div>

                    {error && (
                        <p className="text-red-600 text-sm text-center bg-red-50 border border-red-100 rounded-xl py-2 px-3">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
                    </button>
                </form>

                <div className="mt-6 space-y-2 text-center">
                    <Link to="/register" className="block text-indigo-600 text-sm font-bold hover:underline">
                        ليس لديك حساب؟ قدّم طلب تسجيل جديد
                    </Link>
                    <Link to="/register/status" className="block text-slate-500 text-xs hover:underline">
                        لديك رقم متابعة؟ تحقق من حالة طلبك
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};
