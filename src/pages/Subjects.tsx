import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Plus, Trash2, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { UserData } from '../types';

interface SubjectsProps {
    user: UserData;
}

export const Subjects: React.FC<SubjectsProps> = ({ user }) => {
    const [grades, setGrades] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [activeSubject, setActiveSubject] = useState<string | null>(null);
    const [showAddSubject, setShowAddSubject] = useState(false);
    const [newSubjectName, setNewSubjectName] = useState('');

    const fetchSubjects = () => {
        fetch('/api/subjects').then(res => res.json()).then(setSubjects);
    };

    useEffect(() => {
        fetchSubjects();
        if (user.role === 'student') {
            fetch(`/api/class/grades/student/${user.id}`).then(res => res.json()).then(setGrades);
        }
    }, [user.id, user.role]);

    const handleAddSubject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/admin/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newSubjectName }),
            });
            if (res.ok) {
                setNewSubjectName('');
                setShowAddSubject(false);
                fetchSubjects();
                alert('تمت إضافة المادة بنجاح');
            } else {
                const errorData = await res.json();
                alert(`حدث خطأ: ${errorData.error || 'فشل إضافة المادة'}`);
            }
        } catch (error) {
            console.error('Error adding subject:', error);
            alert('حدث خطأ في الاتصال بالخادم');
        }
    };

    const handleDeleteSubject = async (id: string) => {
        if (confirm('هل أنت متأكد من حذف هذه المادة؟')) {
            await fetch(`/api/admin/subjects/${id}`, { method: 'DELETE' });
            fetchSubjects();
        }
    };

    const filteredGrades = grades.filter(g => g.subject === activeSubject);

    if (activeSubject) {
        return (
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 bg-slate-50 min-h-screen" dir="rtl">
                <div className="flex items-center gap-3 mb-4">
                    <button onClick={() => setActiveSubject(null)} className="p-2 bg-white rounded-full border border-slate-100 shadow-sm hover:bg-slate-50">
                        <ArrowRight className="w-4 h-4 text-slate-600" />
                    </button>
                    <h3 className="font-extrabold text-slate-900 text-xl tracking-tight">{activeSubject}</h3>
                </div>

                {filteredGrades.length > 0 ? (
                    <div className="space-y-4">
                        {filteredGrades.map((g, i) => (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                key={g.id}
                                className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4"
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full w-fit">
                                            {g.semester} | {g.category}
                                        </p>
                                        <p className="text-sm font-black text-slate-500 pt-2 italic">
                                            {g.status}
                                        </p>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-2xl font-black text-slate-900">{g.score}</p>
                                        <p className="text-[10px] text-slate-400 font-bold">من {g.total}</p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white p-12 rounded-[2rem] border border-slate-100 text-center space-y-3">
                        <div className="w-16 h-16 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto">
                            <AlertCircle className="w-8 h-8 text-slate-300" />
                        </div>
                        <h4 className="font-bold text-slate-800 text-sm">لا توجد درجات حالياً</h4>
                        <p className="text-xs text-slate-400">سيظهر تقييمك فور رصده من قبل المدرس</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 bg-slate-50 min-h-screen" dir="rtl">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h3 className="font-extrabold text-slate-900 text-2xl tracking-tight">المواد الدراسية</h3>
                    <p className="text-slate-500 text-sm">إدارة وعرض المواد التعليمية</p>
                </div>
                {(user.role === 'admin' || user.role === 'assistant_admin') && (
                    <button
                        onClick={() => setShowAddSubject(!showAddSubject)}
                        className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg shadow-indigo-200 hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                )}
            </div>

            <AnimatePresence>
                {showAddSubject && (
                    <motion.form
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        onSubmit={handleAddSubject}
                        className="bg-white p-6 rounded-[2rem] border border-indigo-100 shadow-xl shadow-indigo-50/50 space-y-4 overflow-hidden"
                    >
                        <div className="relative">
                            <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                            <input
                                type="text"
                                placeholder="اسم المادة الجديدة (مثل: التاريخ، الجغرافيا...)"
                                className="w-full pl-12 pr-6 py-4 rounded-2xl border border-slate-100 bg-slate-50/50 outline-none focus:border-indigo-400 focus:bg-white transition-all font-bold text-sm"
                                value={newSubjectName}
                                onChange={e => setNewSubjectName(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-slate-200">
                            إضافة المادة الجديدة للمنهج
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-4">
                {subjects.map((sub, i) => (
                    <motion.div
                        key={sub.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ y: -5 }}
                        className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center gap-4 text-center group relative overflow-hidden"
                    >
                        <div
                            onClick={() => user.role === 'student' && setActiveSubject(sub.name)}
                            className="w-full flex flex-col items-center gap-4 cursor-pointer"
                        >
                            <div className={`w-14 h-14 ${sub.color || 'bg-slate-400'} rounded-[1.8rem] flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                                <Book className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="font-black text-slate-800 text-sm mb-1">{sub.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold">
                                    {user.role === 'student' ? 'مشاهدة درجاتي' : 'عرض التفاصيل'}
                                </p>
                            </div>
                        </div>

                        {(user.role === 'admin' || user.role === 'assistant_admin') && (
                            <button
                                onClick={() => handleDeleteSubject(sub.id)}
                                className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </motion.div>
                ))}
            </div>

            {subjects.length === 0 && (
                <div className="text-center py-20 px-10 bg-white rounded-[3rem] border border-dashed border-slate-200">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Book className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-bold text-sm">لا توجد مواد مضافة حالياً</p>
                    <p className="text-slate-300 text-[10px] mt-1">ابدأ بإضافة أول مادة للمنهج الدراسي</p>
                </div>
            )}
        </div>
    );
};
