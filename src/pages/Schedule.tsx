import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Clock, User, Trash2, Plus, Calendar } from 'lucide-react';
import { UserData, ClassData } from '../types';

interface ScheduleProps {
    user: UserData;
}

export const Schedule: React.FC<ScheduleProps> = ({ user }) => {
    const [activeDay, setActiveDay] = useState('الأحد');
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [schedules, setSchedules] = useState<any[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const [newSession, setNewSession] = useState({
        day: 'الأحد',
        time: '08:00 ص',
        subject: 'الرياضيات',
        teacher: '',
        room: 'قاعة 1'
    });

    const subjects = ['الرياضيات', 'اللغة العربية', 'اللغة الإنجليزية', 'الأحياء', 'الفنية', 'الرياضة', 'الفيزياء', 'الكيمياء', 'الحاسوب', 'التاريخ', 'الجغرافيا'];
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

    const fetchSchedules = async (classId: string) => {
        if (!classId) return;
        const res = await fetch(`/api/schedules/${classId}`);
        const data = await res.json();
        setSchedules(data);
    };

    useEffect(() => {
        if (user.role === 'admin' || user.role === 'assistant_admin') {
            fetch('/api/classes').then(res => res.json()).then(data => {
                setClasses(data);
                if (data.length > 0) {
                    setSelectedClassId(data[0].id);
                    fetchSchedules(data[0].id);
                }
            });
            fetch('/api/admin/teachers').then(res => res.json()).then(data => {
                setTeachers(data);
                if (data.length > 0) {
                    setNewSession(prev => ({ ...prev, teacher: data[0].name }));
                }
            });
        } else if (user.role === 'student') {
            fetch(`/api/student/classes/${user.id}`).then(res => res.json()).then(data => {
                if (data.length > 0) {
                    setSelectedClassId(data[0].id);
                    fetchSchedules(data[0].id);
                }
            });
        }
    }, [user.id, user.role]);

    const handleAddSession = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('/api/admin/schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newSession, class_id: selectedClassId }),
        });
        setShowAdd(false);
        fetchSchedules(selectedClassId);
    };

    const handleDeleteSession = async (id: string) => {
        if (confirm('حذف هذه الحصة من الجدول؟')) {
            await fetch(`/api/admin/schedules/${id}`, { method: 'DELETE' });
            fetchSchedules(selectedClassId);
        }
    };

    const currentSchedule = schedules.filter(s => s.day === activeDay);

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-lg">الجدول الدراسي</h3>
                {(user.role === 'admin' || user.role === 'assistant_admin') && (
                    <button
                        onClick={() => setShowAdd(!showAdd)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                        <Plus className="w-3 h-3" /> إضافة حصة
                    </button>
                )}
            </div>

            {(user.role === 'admin' || user.role === 'assistant_admin') && (
                <select
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none bg-white font-sans"
                    value={selectedClassId}
                    onChange={e => {
                        setSelectedClassId(e.target.value);
                        fetchSchedules(e.target.value);
                    }}
                >
                    {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            )}

            {showAdd && (
                <form onSubmit={handleAddSession} className="bg-white p-4 rounded-3xl border border-indigo-100 shadow-sm space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select
                            className="px-3 py-2 rounded-xl border border-slate-100 text-xs outline-none bg-slate-50 font-sans"
                            value={newSession.day}
                            onChange={e => setNewSession({ ...newSession, day: e.target.value })}
                        >
                            {days.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <input
                            type="text"
                            placeholder="الوقت (مثلاً 08:00 ص)"
                            className="px-3 py-2 rounded-xl border border-slate-100 text-xs outline-none bg-slate-50"
                            value={newSession.time}
                            onChange={e => setNewSession({ ...newSession, time: e.target.value })}
                            required
                        />
                    </div>
                    <select
                        className="w-full px-3 py-2 rounded-xl border border-slate-100 text-xs outline-none bg-slate-50 font-sans"
                        value={newSession.subject}
                        onChange={e => setNewSession({ ...newSession, subject: e.target.value })}
                        required
                    >
                        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                        className="w-full px-3 py-2 rounded-xl border border-slate-100 text-xs outline-none bg-slate-50 font-sans"
                        value={newSession.teacher}
                        onChange={e => setNewSession({ ...newSession, teacher: e.target.value })}
                        required
                    >
                        <option value="">-- اختر المعلم --</option>
                        {teachers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                    <input
                        type="text"
                        placeholder="القاعة/الغرفة"
                        className="w-full px-3 py-2 rounded-xl border border-slate-100 text-xs outline-none bg-slate-50"
                        value={newSession.room}
                        onChange={e => setNewSession({ ...newSession, room: e.target.value })}
                        required
                    />
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-xl text-xs font-bold">حفظ في الجدول</button>
                </form>
            )}

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {days.map(day => (
                    <button
                        key={day}
                        onClick={() => setActiveDay(day)}
                        className={`px-6 py-3 rounded-2xl text-sm font-bold transition-all flex-shrink-0 ${activeDay === day ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-400 border border-slate-100'}`}
                    >
                        {day}
                    </button>
                ))}
            </div>

            <div className="space-y-4">
                {currentSchedule.length > 0 ? (
                    currentSchedule.map((item, i) => (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            key={i}
                            className="bg-white p-4 md:p-5 rounded-3xl border border-slate-100 shadow-sm flex gap-3 md:gap-4 items-center group"
                        >
                            <div className="w-14 h-14 md:w-16 md:h-16 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-50 flex-shrink-0">
                                <Clock className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 mb-1" />
                                <span className="text-[9px] md:text-[10px] font-bold text-slate-500">{item.time.split(' ')[0]}</span>
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-slate-800 text-sm mb-1">{item.subject}</h4>
                                    {(user.role === 'admin' || user.role === 'assistant_admin') && (
                                        <button onClick={() => handleDeleteSession(item.id)} className="text-slate-200 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <User className="w-3 h-3" /> {item.teacher}
                                </p>
                                <div className="mt-2 text-[9px] bg-blue-50 text-blue-600 w-fit px-2 py-0.5 rounded-full font-bold">
                                    {item.room}
                                </div>
                            </div>
                        </motion.div>
                    ))
                ) : (
                    <div className="bg-white p-10 rounded-3xl border border-slate-100 text-center text-slate-400">
                        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="text-sm">لا توجد حصص مجدولة لهذا اليوم</p>
                    </div>
                )}
            </div>
        </div>
    );
};
