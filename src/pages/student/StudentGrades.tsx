import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, Book, Calendar, Award, BookOpen, Star, TrendingUp } from 'lucide-react';
import { UserData } from '../../types';

interface StudentGradesProps {
    user: UserData;
}

export const StudentGrades: React.FC<StudentGradesProps> = ({ user }) => {
    const [grades, setGrades] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState('الكل');

    useEffect(() => {
        fetch(`/api/class/grades/student/${user.id}`).then(res => res.json()).then(setGrades);
    }, [user.id]);

    const semesters = ['الكل', 'الفصل الأول', 'الفصل الثاني', 'نصف السنة', 'السعي السنوي '];

    const filteredGrades = activeTab === 'الكل'
        ? grades
        : grades.filter(g => g.semester === activeTab);

    const average = filteredGrades.length > 0
        ? (filteredGrades.reduce((acc, g) => acc + (g.score / g.total), 0) / filteredGrades.length * 100).toFixed(1)
        : 0;

    const subjects = [...new Set(filteredGrades.map(g => g.subject))];

    return (
        <div className="p-4 md:p-8 space-y-6 pb-20 bg-slate-50 min-h-screen" dir="rtl">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="font-extrabold text-slate-900 text-2xl tracking-tight">سجلي الأكاديمي</h3>
                    <p className="text-slate-500 text-sm mt-1">مرحباً {user.name}، إليك ملخص لدرجاتك</p>
                </div>
                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm self-start">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <GraduationCap className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">الحالة الدراسية</p>
                        <p className="text-sm font-bold text-slate-800">طالب نشط</p>
                    </div>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div
                    whileHover={{ y: -5 }}
                    className="bg-indigo-600 rounded-[2rem] p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden flex flex-col justify-between min-h-[160px]"
                >
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <p className="text-indigo-100/80 text-xs font-bold uppercase tracking-widest">المعدل التراكمي</p>
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                                <TrendingUp className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        <h3 className="text-4xl font-black">{average}%</h3>
                    </div>
                    <div className="relative z-10 flex items-center gap-2 mt-2">
                        <div className="px-3 py-1 bg-white/20 rounded-full backdrop-blur-md text-[10px] font-bold">
                            {Number(average) >= 90 ? 'ممتاز جداً' : Number(average) >= 75 ? 'جيد جداً' : Number(average) >= 50 ? 'ناجح' : 'يحتاج تحسين'}
                        </div>
                    </div>
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl"></div>
                </motion.div>

                <div className="grid grid-cols-2 gap-4 md:col-span-2">
                    <div className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center space-y-2">
                        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                            <BookOpen className="w-6 h-6 text-blue-600" />
                        </div>
                        <p className="text-2xl font-black text-slate-800">{subjects.length}</p>
                        <p className="text-xs font-bold text-slate-400 italic">عدد المواد</p>
                    </div>
                    <div className="bg-white rounded-[2rem] p-5 border border-slate-100 shadow-sm flex flex-col justify-center items-center text-center space-y-2">
                        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                            <Star className="w-6 h-6 text-amber-500" />
                        </div>
                        <p className="text-2xl font-black text-slate-800">{grades.filter(g => (g.score / g.total) >= 0.9).length}</p>
                        <p className="text-xs font-bold text-slate-400 italic">درجات التفوق</p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex overflow-x-auto pb-2 gap-2 no-scrollbar scroll-smooth">
                {semesters.map(sem => (
                    <button
                        key={sem}
                        onClick={() => setActiveTab(sem)}
                        className={`px-6 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all duration-300 border ${activeTab === sem
                            ? 'bg-slate-900 text-white border-slate-900 shadow-lg shadow-slate-200'
                            : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50'
                            }`}
                    >
                        {sem}
                    </button>
                ))}
            </div>

            {/* Grades List */}
            <div className="space-y-6">
                <div className="flex items-center gap-2 px-1">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                    <h4 className="font-black text-slate-800 text-sm">كشف الموارد الدراسية</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                        {subjects.length > 0 ? (
                            subjects.map((sub, idx) => {
                                const subjectGrades = filteredGrades.filter(g => g.subject === sub);
                                return (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.2 }}
                                        key={sub}
                                        className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                                                    <Book className="w-5 h-5 text-slate-400 group-hover:text-emerald-500" />
                                                </div>
                                                <div>
                                                    <h5 className="font-bold text-slate-800 text-base">{sub}</h5>
                                                    <p className="text-[10px] text-slate-400">{subjectGrades.length} سجلات</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {subjectGrades.map((g, i) => {
                                                let catLabel = g.category || 'يومي';
                                                if (catLabel === 'امتحان فصل') {
                                                    catLabel = (g.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول');
                                                } else if (catLabel === 'الكل') {
                                                    catLabel = g.semester === 'نصف السنة' ? 'درجة نصف السنة' : 'درجة سنوية';
                                                }

                                                const ratio = g.score / g.total;
                                                const colorClass = ratio >= 0.9 ? 'emerald' : ratio >= 0.5 ? 'blue' : 'red';

                                                return (
                                                    <div key={i} className="space-y-2">
                                                        <div className="flex justify-between items-center px-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-black uppercase text-${colorClass}-600 bg-${colorClass}-50 px-2 py-0.5 rounded-md`}>
                                                                    {catLabel}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm font-black text-slate-800">
                                                                {g.score} <span className="text-slate-300 text-[10px] font-normal">/ {g.total}</span>
                                                            </p>
                                                        </div>
                                                        <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden border border-slate-100/50">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${ratio * 100}%` }}
                                                                transition={{ duration: 1, delay: i * 0.1 }}
                                                                className={`h-full rounded-full bg-${colorClass}-500 shadow-sm`}
                                                            ></motion.div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                );
                            })
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="col-span-full py-20 text-center space-y-3"
                            >
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="w-8 h-8 text-slate-300" />
                                </div>
                                <h5 className="font-bold text-slate-700">لا توجد درجات في هذا القسم</h5>
                                <p className="text-xs text-slate-400">سيتم عرض نتائجك هنا فور رصده من قبل المعلمين</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Achievement Badge (Bottom) */}
            {Number(average) >= 90 && (
                <div className="fixed bottom-24 left-4 right-4 z-50">
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        className="bg-amber-400 rounded-2xl p-4 shadow-xl flex items-center justify-between border-4 border-amber-300"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-inner">
                                <Award className="w-8 h-8 text-amber-500" />
                            </div>
                            <div>
                                <h6 className="font-black text-amber-900 text-sm italic">وسام التفوق الدراسي</h6>
                                <p className="text-[10px] text-amber-800">لقد أحرزت تقدماً مبهراً هذا الفصل!</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};
