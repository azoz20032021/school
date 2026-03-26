import React, { useState, useEffect } from 'react';
import { ClipboardList, PlusCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserData, ClassData } from '../../types';

interface TeacherDashboardProps {
    user: UserData;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user }) => {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [attendance, setAttendance] = useState<Record<string, string>>({});
    const [showAddGrade, setShowAddGrade] = useState<{ studentId: string, name: string } | null>(null);
    const [newGrade, setNewGrade] = useState({ subject: '', score: '', total: '100', category: 'يومي', semester: 'الفصل الأول' });

    useEffect(() => {
        fetch(`/api/teacher/classes/${user.id}`).then(res => res.json()).then(setClasses);
    }, [user.id]);

    useEffect(() => {
        if (user.subjects && user.subjects.length > 0) {
            setNewGrade(prev => ({ ...prev, subject: user.subjects![0] }));
        } else {
            setNewGrade(prev => ({ ...prev, subject: '' }));
        }
    }, [user.subjects]);

    useEffect(() => {
        if (['نصف السنة', 'السعي السنوي '].includes(newGrade.semester) && newGrade.category !== 'الكل') {
            setNewGrade(prev => ({ ...prev, category: 'الكل' }));
        }
    }, [newGrade.semester, newGrade.category]);

    const handleSelectClass = async (c: ClassData) => {
        setSelectedClass(c);
        const res = await fetch(`/api/class/${c.id}/students`);
        const data = await res.json();
        setStudents(data);
        const initialAttendance: Record<string, string> = {};
        data.forEach((s: any) => initialAttendance[s.id] = 'present');
        setAttendance(initialAttendance);
    };

    const submitAttendance = async () => {
        if (!selectedClass) return;
        const attendanceData = Object.entries(attendance).map(([studentId, status]) => ({
            studentId,
            status
        }));
        await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                classId: selectedClass.id,
                date: new Date().toISOString().split('T')[0],
                attendanceData
            })
        });
        alert('تم تسجيل الحضور بنجاح');
        setSelectedClass(null);
    };

    const handleAddGradeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showAddGrade || !selectedClass) return;

        if (!newGrade.subject) {
            alert('يرجى اختيار المادة أولاً');
            return;
        }

        const score = parseInt(newGrade.score);
        const total = parseInt(newGrade.total);

        if (isNaN(score) || isNaN(total)) {
            alert('يرجى إدخال أرقام صحيحة للدرجات');
            return;
        }

        let status = 'ممتاز';
        if (score < 50) status = 'راسب';
        else if (score < 70) status = 'جيد';
        else if (score < 90) status = 'جيد جداً';

        try {
            const res = await fetch('/api/grades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    student_id: showAddGrade.studentId,
                    class_id: selectedClass.id,
                    subject: newGrade.subject,
                    score,
                    status,
                    category: newGrade.category,
                    semester: newGrade.semester,
                    performed_by: user.id
                })
            });

            if (!res.ok) throw new Error('Failed to save grade');

            setShowAddGrade(null);
            setNewGrade({ ...newGrade, score: '' });
            alert(`تمت إضافة الدرجة للطالب ${showAddGrade.name} بنجاح`);
        } catch (error: any) {
            alert(`حدث خطأ أثناء حفظ الدرجة`);
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            {!selectedClass ? (
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-800">فصولي الدراسية</h3>
                    <div className="space-y-3">
                        {classes.map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleSelectClass(c)}
                                className="w-full text-right bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between"
                            >
                                <div>
                                    <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">اضغط لتسجيل الحضور</p>
                                </div>
                                <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center">
                                    <ClipboardList className="w-4 h-4 text-indigo-600" />
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                            <button onClick={() => setSelectedClass(null)} className="p-2 bg-slate-100 rounded-full">
                                <ArrowRight className="w-4 h-4 text-slate-600" />
                            </button>
                            <h3 className="font-bold text-slate-800">تسجيل حضور: {selectedClass.name}</h3>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                            {students.map(s => (
                                <div key={s.id} className="p-4 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-700">{s.name}</span>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setShowAddGrade({ studentId: s.id, name: s.name })}
                                            className="px-3 py-1 text-[10px] rounded-lg bg-blue-50 text-blue-600 font-bold border border-blue-100 flex items-center gap-1"
                                        >
                                            <PlusCircle className="w-3 h-3" /> درجة
                                        </button>
                                        <button
                                            onClick={() => setAttendance(prev => ({ ...prev, [s.id]: 'present' }))}
                                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${attendance[s.id] === 'present' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            حاضر
                                        </button>
                                        <button
                                            onClick={() => setAttendance(prev => ({ ...prev, [s.id]: 'absent' }))}
                                            className={`px-3 py-1 text-xs rounded-lg transition-colors ${attendance[s.id] === 'absent' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            غائب
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={submitAttendance}
                            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold shadow-lg shadow-indigo-200"
                        >
                            حفظ الحضور
                        </button>
                    </div>

                    {showAddGrade && (
                        <AnimatePresence>
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 text-right"
                                    dir="rtl"
                                >
                                    <h4 className="font-bold text-slate-800">إضافة درجة للطالب: {showAddGrade.name}</h4>
                                    <form onSubmit={handleAddGradeSubmit} className="space-y-4">
                                        <div>
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">نوع الدرجة</label>
                                                    <select
                                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50 font-sans transition-all"
                                                        value={newGrade.category}
                                                        onChange={e => setNewGrade({ ...newGrade, category: e.target.value })}
                                                    >
                                                        {newGrade.semester === 'نصف السنة' ? (
                                                            <option value="الكل">درجة نصف السنة</option>
                                                        ) : newGrade.semester === 'السعي السنوي ' ? (
                                                            <option value="الكل">درجة سنوية</option>
                                                        ) : (
                                                            <>
                                                                <option value="يومي">يومي</option>
                                                                <option value="شهر أول">شهر أول</option>
                                                                <option value="شهر ثاني">شهر ثاني</option>
                                                                <option value="امتحان فصل">
                                                                    {newGrade.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول'}
                                                                </option>
                                                            </>
                                                        )}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-400 mb-1">الفصل الدراسي</label>
                                                    <select
                                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50 font-sans"
                                                        value={newGrade.semester}
                                                        onChange={e => setNewGrade({ ...newGrade, semester: e.target.value })}
                                                    >
                                                        <option value="الفصل الأول">الفصل الأول</option>
                                                        <option value="الفصل الثاني">الفصل الثاني</option>
                                                        <option value="نصف السنة">نصف السنة</option>
                                                        <option value="السعي السنوي ">السعي السنوي </option>
                                                    </select>
                                                </div>
                                            </div>
                                            <label className="block text-[10px] font-bold text-slate-400 mb-1">المادة</label>
                                            <select
                                                className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50 font-sans"
                                                value={newGrade.subject}
                                                onChange={e => setNewGrade({ ...newGrade, subject: e.target.value })}
                                            >
                                                {user.subjects && user.subjects.length > 0 ? (
                                                    user.subjects.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))
                                                ) : (
                                                    <option value="" disabled>لا توجد مواد معينة - تواصل مع الإدارة</option>
                                                )}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">الدرجة</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50"
                                                    value={newGrade.score}
                                                    onChange={e => setNewGrade({ ...newGrade, score: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1">الدرجة الكلية</label>
                                                <input
                                                    type="number"
                                                    required
                                                    className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50"
                                                    value={newGrade.total}
                                                    onChange={e => setNewGrade({ ...newGrade, total: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowAddGrade(null)}
                                                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm"
                                            >
                                                إلغاء
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-1 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm"
                                            >
                                                حفظ
                                            </button>
                                        </div>
                                    </form>
                                </motion.div>
                            </div>
                        </AnimatePresence>
                    )}
                </>
            )}
        </div>
    );
};
