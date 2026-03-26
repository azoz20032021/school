import React, { useState, useEffect } from 'react';
import { Calendar, ChevronRight, ArrowRight } from 'lucide-react';
import { UserData, ClassData } from '../../types';

interface StudentDashboardProps {
    user: UserData;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
    const [attendance, setAttendance] = useState<any[]>([]);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);

    const fetchStudentData = () => {
        fetch(`/api/student/${user.id}/attendance`).then(res => res.json()).then(setAttendance);
        fetch(`/api/student/classes/${user.id}`).then(res => res.json()).then(setClasses);
    };

    useEffect(() => {
        fetchStudentData();
    }, [user.id]);

    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    const totalAttendance = attendance.length;
    const attendanceRate = totalAttendance > 0 ? ((presentCount / totalAttendance) * 100).toFixed(0) : 0;

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            {!selectedClass ? (
                <>
                    <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-indigo-100 text-xs uppercase tracking-wider mb-1">معدل الحضور</p>
                            <h3 className="text-3xl font-bold">{attendanceRate}%</h3>
                            <div className="mt-4 flex gap-2">
                                <div className="bg-white/20 px-3 py-1 rounded-full text-[10px]">{presentCount} يوم حاضر</div>
                                <div className="bg-white/20 px-3 py-1 rounded-full text-[10px]">{absentCount} يوم غياب</div>
                            </div>
                        </div>
                        <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800">فصولي الدراسية</h3>
                        <div className="space-y-3">
                            {classes.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedClass(c)}
                                    className="w-full text-right bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"
                                >
                                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                                        <Calendar className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">اضغط لعرض التفاصيل</p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800">سجل الحضور الأخير</h3>
                        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                            {attendance.slice(-5).reverse().map(a => (
                                <div key={a.id} className="p-4 border-b border-slate-50 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{a.class_name}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{a.date}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${a.status === 'present' ? 'bg-indigo-100 text-indigo-700' : 'bg-red-100 text-red-700'}`}>
                                        {a.status === 'present' ? 'حاضر' : 'غائب'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedClass(null)} className="p-2 bg-slate-100 rounded-full">
                            <ArrowRight className="w-4 h-4 text-slate-600" />
                        </button>
                        <h3 className="font-bold text-slate-800">{selectedClass.name}</h3>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
                        <h4 className="font-bold text-blue-800 text-sm mb-2">معلومات الصف</h4>
                        <p className="text-xs text-blue-600 leading-relaxed">
                            أهلاً بك في صف {selectedClass.name}. يمكنك هنا متابعة دروسك ومهامك الدراسية. يرجى التأكد من حضورك في الموعد المحدد.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
