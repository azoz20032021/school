import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { ClassData } from '../types';
import { useAuth } from '../context/AuthContext';

export const Register: React.FC = () => {
    const [formData, setFormData] = useState({
        name: '',
        password: '',
        uid: '',
        classId: ''
    });
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();

    useEffect(() => {
        fetch('/api/classes').then(res => res.json()).then(setClasses);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (res.ok) {
                const userData = await res.json();
                login(userData);
            } else {
                const data = await res.json();
                setError(data.error || 'فشل إنشاء الحساب');
            }
        } catch (err) {
            setError('حدث خطأ في الاتصال');
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
                <div className="flex flex-col items-center mb-6">
                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-slate-50 overflow-hidden">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-contain p-1" />
                    </div>
                    <h1 className="text-2xl font-black text-slate-800">إنشاء حساب جديد</h1>
                    <p className="text-slate-500 font-medium mt-1">انضم لثانوية المعالي الأهلية</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">الاسم الكامل</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">الـ UID (من المدير)</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.uid}
                            onChange={e => setFormData({ ...formData, uid: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">كلمة المرور</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">اختر الصف الدراسي</label>
                        <select
                            required
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            value={formData.classId}
                            onChange={e => setFormData({ ...formData, classId: e.target.value })}
                        >
                            <option value="">-- اختر الصف --</option>
                            {classes.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {error && <p className="text-red-500 text-xs text-center">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-blue-200 disabled:opacity-50 mt-4"
                    >
                        {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <Link
                        to="/login"
                        className="text-slate-500 text-sm hover:underline"
                    >
                        لديك حساب بالفعل؟ سجل دخولك
                    </Link>
                </div>
            </motion.div>
        </div>
    );
};
