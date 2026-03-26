import React, { useState, useEffect } from 'react';
import { Users, BookOpen, Plus, ChevronRight, Trash2, ArrowRight, Printer, UserX } from 'lucide-react';
import { ClassData, UserData } from '../../types';
import { useAuth } from '../../context/AuthContext';



export const AdminDashboard: React.FC = () => {
    const { user: currentUser } = useAuth();
    const canManageTeachers = currentUser?.role === 'admin';
    const canManageClasses = currentUser?.role === 'admin';
    const canManageStudents = currentUser?.role === 'admin';

    const [classes, setClasses] = useState<ClassData[]>([]);
    const [students, setStudents] = useState<any[]>([]);
    const [teachers, setTeachers] = useState<UserData[]>([]);
    const [showAddClass, setShowAddClass] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
    const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
    const [classStudents, setClassStudents] = useState<any[]>([]);

    const [showAddStudent, setShowAddStudent] = useState(false);
    const [newStudent, setNewStudent] = useState({ name: '', username: '', password: '', uid: '' });

    const [showAddTeacher, setShowAddTeacher] = useState(false);
    const [newTeacher, setNewTeacher] = useState({ name: '', username: '', password: '' });
    const [viewingTeacher, setViewingTeacher] = useState<UserData | null>(null);

    const [showAddAssistant, setShowAddAssistant] = useState(false);
    const [newAssistant, setNewAssistant] = useState({ name: '', username: '', password: '' });
    const [assistants, setAssistants] = useState<any[]>([]);

    const [showBroadcast, setShowBroadcast] = useState<{ target: 'all' | 'class' | 'student', id?: string, name?: string, studentId?: string } | null>(null);
    const [broadcastMsg, setBroadcastMsg] = useState({ title: '', message: '' });
    const [allSubjects, setAllSubjects] = useState<any[]>([]);
    const [dailyAbsences, setDailyAbsences] = useState<any[]>([]);
    const [showAbsencesToday, setShowAbsencesToday] = useState(false);
    const [validUids, setValidUids] = useState<any[]>([]);
    const [showUidManager, setShowUidManager] = useState(false);
    const [newCustomUid, setNewCustomUid] = useState('');

    const fetchData = () => {
        fetch('/api/classes').then(res => res.json()).then(data => {
            setClasses(data);
            if (viewingTeacher) {
                // If modal is open, we don't need to do anything as it reads from 'classes'
                // which is now updated.
            }
        });
        fetch('/api/admin/students').then(res => res.json()).then(setStudents);
        fetch('/api/admin/teachers').then(res => res.json()).then(setTeachers);
        if (canManageTeachers) {
            fetch('/api/admin/assistants').then(res => res.json()).then(setAssistants);
        }
        fetch('/api/subjects').then(res => res.json()).then(setAllSubjects);
        fetch('/api/admin/absences/daily').then(res => res.json()).then(setDailyAbsences);
        fetch('/api/admin/uids').then(res => res.json()).then(setValidUids);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedTeacherIds.length === 0) {
            alert('يرجى اختيار معلم واحد على الأقل');
            return;
        }

        const selectedTeachersData = selectedTeacherIds.map(id => {
            const t = teachers.find(teacher => teacher.id === id);
            return { id: t?.id, name: t?.name };
        });

        await fetch('/api/admin/classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: newClassName,
                teachers: selectedTeachersData
            }),
        });
        setNewClassName('');
        setSelectedTeacherIds([]);
        setShowAddClass(false);
        fetchData();
    };

    const handleDeleteClass = async (id: number | string) => {
        if (confirm('هل أنت متأكد من حذف هذا الصف؟')) {
            await fetch(`/api/admin/classes/${id}`, { method: 'DELETE' });
            fetchData();
        }
    };

    const handleSelectClass = async (c: ClassData) => {
        setSelectedClass(c);
        const res = await fetch(`/api/class/${c.id}/students`);
        const data = await res.json();
        // data now includes: id, name, uid, absences
        setClassStudents(data);
    };

    const handleAssignStudent = async (studentId: string, classId: string) => {
        if (!classId) return;
        await fetch('/api/admin/enroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: studentId, class_id: classId }),
        });
        alert('تم تعيين الطالب للصف بنجاح');
        fetchData();
    };

    const handleDeleteStudent = async (id: string) => {
        if (confirm('هل أنت متأكد من حذف هذا الطالب بشكل نهائي؟')) {
            await fetch(`/api/admin/students/${id}`, { method: 'DELETE' });
            fetchData();
        }
    };

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('/api/admin/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newStudent),
        });
        setNewStudent({ name: '', username: '', password: '', uid: '' });
        setShowAddStudent(false);
        fetchData();
    };

    const handleAddTeacher = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('/api/admin/teachers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTeacher),
        });
        setNewTeacher({ name: '', username: '', password: '' });
        setShowAddTeacher(false);
        fetchData();
    };

    const handleDeleteTeacher = async (id: string) => {
        if (confirm('هل أنت متأكد من حذف هذا المعلم؟ سيؤدي ذلك لحذفه من كافة الفصول المعين عليها أيضاً.')) {
            await fetch(`/api/admin/teachers/${id}`, { method: 'DELETE' });
            setViewingTeacher(null);
            fetchData();
        }
    };

    const handleAddAssistant = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('/api/admin/assistants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAssistant),
        });
        setNewAssistant({ name: '', username: '', password: '' });
        setShowAddAssistant(false);
        fetchData();
    };

    const handleDeleteAssistant = async (id: string) => {
        if (confirm('هل أنت متأكد من حذف هذا المساعد؟')) {
            await fetch(`/api/admin/teachers/${id}`, { method: 'DELETE' }); // Teachers and assistants share the deletion endpoint as it's just 'users'
            fetchData();
        }
    };

    const handleAssignTeacherToClass = async (teacherId: string, classId: string) => {
        const targetClass = classes.find(c => c.id === classId);
        if (!targetClass) return;

        let updatedTeachers: { id: string, name: string }[] = [];

        // Build current teachers list from existing data
        if (targetClass.teacher_ids && targetClass.teacher_ids.length > 0) {
            updatedTeachers = targetClass.teacher_ids.map((id, index) => ({
                id,
                name: targetClass.teacher_names?.[index] || 'معلم'
            }));
        } else if (targetClass.teacher_id) {
            updatedTeachers = [{ id: targetClass.teacher_id, name: targetClass.teacher_name || 'معلم' }];
        }

        if (teacherId === '') {
            // Removing a teacher (the one currently being viewed)
            if (viewingTeacher) {
                updatedTeachers = updatedTeachers.filter(t => t.id !== viewingTeacher.id);
            }
        } else {
            // Adding a teacher
            const teacherToAdd = teachers.find(t => t.id === teacherId);
            if (teacherToAdd && !updatedTeachers.some(t => t.id === teacherId)) {
                updatedTeachers.push({ id: teacherToAdd.id, name: teacherToAdd.name });
            }
        }

        const res = await fetch(`/api/admin/classes/${classId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teachers: updatedTeachers
            })
        });

        if (res.ok) {
            alert(teacherId ? 'تم تحديث تعيين المعلمين بنجاح' : 'تمت إزالة المعلم من الصف');
            fetchData();
        }
    };

    const handleToggleTeacherSubject = async (teacherId: string, subject: string) => {
        const teacher = teachers.find(t => t.id === teacherId);
        if (!teacher) return;

        const currentSubjects = teacher.subjects || [];
        let newSubjects;
        if (currentSubjects.includes(subject)) {
            newSubjects = currentSubjects.filter(s => s !== subject);
        } else {
            newSubjects = [...currentSubjects, subject];
        }

        const res = await fetch(`/api/admin/teachers/${teacherId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subjects: newSubjects })
        });

        if (res.ok) {
            // Update local state for immediate feedback
            const updatedTeachers = teachers.map(t =>
                t.id === teacherId ? { ...t, subjects: newSubjects } : t
            );
            setTeachers(updatedTeachers);
            if (viewingTeacher && viewingTeacher.id === teacherId) {
                setViewingTeacher({ ...viewingTeacher, subjects: newSubjects });
            }
        }
    };

    const handleSendBroadcast = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showBroadcast || !broadcastMsg.message) return;

        const res = await fetch('/api/admin/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: broadcastMsg.title,
                message: broadcastMsg.message,
                classId: showBroadcast.target === 'class' ? showBroadcast.id : undefined,
                studentId: showBroadcast.target === 'student' ? showBroadcast.studentId : undefined
            })
        });

        if (res.ok) {
            alert('تم إرسال الرسالة لجميع الطلاب المستهدفين بنجاح');
            setBroadcastMsg({ title: '', message: '' });
            setShowBroadcast(null);
        } else {
            alert('فشل إرسال الرسالة');
        }
    };

    const handleGenerateUids = async () => {
        if (!confirm('هل أنت متأكد من توليد 10 UIDs جديدة؟')) return;
        const res = await fetch('/api/admin/uids/generate', { method: 'POST' });
        if (res.ok) {
            alert('تم توليد 10 UIDs بنجاح');
            fetchData();
        }
    };

    const handleDeleteUid = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('هل أنت متأكد من حذف هذا الـ UID؟')) return;
        const res = await fetch(`/api/admin/uids/${id}`, { method: 'DELETE' });
        if (res.ok) {
            fetchData();
        } else {
            alert('فشل حذف الـ UID');
        }
    };

    const handleAddCustomUid = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/admin/uids/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: newCustomUid }),
        });
        if (res.ok) {
            setNewCustomUid('');
            fetchData();
        } else {
            const data = await res.json();
            alert(data.error || 'فشل إضافة الـ UID');
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            {!selectedClass ? (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-3">
                                <Users className="w-5 h-5 text-blue-600" />
                            </div>
                            <p className="text-xs text-slate-500 font-bold">إجمالي الطلاب</p>
                            <p className="text-xl font-bold text-slate-800">{students.length}</p>
                        </div>
                        <button
                            onClick={() => setShowAbsencesToday(true)}
                            className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm transition-all hover:shadow-md hover:border-rose-200 text-right group"
                        >
                            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <UserX className="w-5 h-5 text-rose-600" />
                            </div>
                            <p className="text-xs text-slate-500 font-bold">غيابات اليوم</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xl font-bold text-slate-800">{dailyAbsences.length}</p>
                                <span className="text-[10px] bg-rose-500 text-white px-2 py-0.5 rounded-full">عرض الكل</span>
                            </div>
                        </button>
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
                            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3">
                                <BookOpen className="w-5 h-5 text-purple-600" />
                            </div>
                            <p className="text-xs text-slate-500 font-bold">الفصول الدراسية</p>
                            <p className="text-xl font-bold text-slate-800">{classes.length}</p>
                        </div>
                        <button
                            onClick={() => setShowBroadcast({ target: 'all' })}
                            className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg text-white flex flex-col justify-center gap-1 group overflow-hidden relative text-right"
                        >
                            <div className="relative z-10 font-sans">
                                <Plus className="w-5 h-5 text-amber-400 mb-2 group-hover:scale-125 transition-transform" />
                                <p className="text-xs text-slate-400 font-bold">إرسال تعميم</p>
                                <p className="text-sm font-black">رسالة عامة للكل</p>
                            </div>
                            <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl"></div>
                        </button>
                    </div>

                    {/* UID Management Section */}
                    <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-indigo-50 rounded-lg">
                                    <Users className="w-5 h-5 text-indigo-600" />
                                </div>
                                <h3 className="font-black text-slate-800">إدارة الـ UIDs للصلاحيات</h3>
                            </div>
                            <button
                                onClick={() => setShowUidManager(!showUidManager)}
                                className="text-indigo-600 text-xs font-bold px-3 py-1.5 bg-indigo-50 rounded-full hover:bg-indigo-100 transition-colors"
                            >
                                {showUidManager ? 'إخفاء القائمة' : 'عرض وإدارة الـ UIDs'}
                            </button>
                        </div>

                        {showUidManager && (
                            <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                        <p className="text-xs font-bold text-slate-500">توليد تلقائي</p>
                                        <p className="text-[10px] text-slate-400">يمكنك توليد 10 UIDs جديدة دفعة واحدة (تبدأ من الأرقام التسلسلية).</p>
                                        <button
                                            onClick={handleGenerateUids}
                                            className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all"
                                        >
                                            توليد 10 UIDs جديدة
                                        </button>
                                    </div>

                                    <form onSubmit={handleAddCustomUid} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                        <p className="text-xs font-bold text-slate-500">إضافة UID يدوي</p>
                                        <input
                                            type="text"
                                            placeholder="أدخل الـ UID المخصص (مثلاً: STD-2024-001)"
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold outline-none font-sans"
                                            value={newCustomUid}
                                            onChange={e => setNewCustomUid(e.target.value)}
                                            required
                                        />
                                        <button
                                            type="submit"
                                            className="w-full bg-slate-900 text-white py-2.5 rounded-xl text-xs font-black active:scale-95 transition-all"
                                        >
                                            حفظ الـ UID المخصص
                                        </button>
                                    </form>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between px-1">
                                        <p className="text-xs font-black text-slate-700">قائمة الـ UIDs المتوفرة ({validUids.filter(u => !u.used).length})</p>
                                        <button onClick={fetchData} className="text-[10px] text-indigo-600 font-bold hover:underline">تحديث القائمة</button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto p-2 bg-white rounded-2xl border border-slate-100 font-sans">
                                        {validUids.length > 0 ? (
                                            validUids.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds).map(u => (
                                                <div
                                                    key={u.id}
                                                    className={`p-2 rounded-lg border text-[10px] font-bold text-center transition-all flex justify-between items-center group relative cursor-copy ${u.used
                                                        ? 'bg-slate-50 text-slate-400 border-slate-100'
                                                        : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:scale-[1.02]'
                                                        }`}
                                                    onClick={() => {
                                                        if (!u.used) {
                                                            navigator.clipboard.writeText(u.uid);
                                                            alert('تم نسخ الـ UID');
                                                        }
                                                    }}
                                                    title={u.used ? 'مستخدم' : 'اضغط للنسخ'}
                                                >
                                                    <span className={u.used ? 'line-through' : ''}>{u.uid}</span>
                                                    {!u.used && (
                                                        <button
                                                            onClick={(e) => handleDeleteUid(u.id, e)}
                                                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="حذف الـ UID"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <p className="col-span-full py-10 text-center text-slate-400 text-xs italic">لا توجد UIDs حالياً. قم بتوليد بعضها للبدء.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">الفصول الدراسية</h3>
                            {canManageClasses && (
                                <button
                                    onClick={() => setShowAddClass(!showAddClass)}
                                    className="text-indigo-600 text-sm font-medium flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> {showAddClass ? 'إلغاء' : 'إضافة فصل'}
                                </button>
                            )}
                        </div>

                        {showAddClass && (
                            <form onSubmit={handleAddClass} className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm space-y-3">
                                <input
                                    type="text"
                                    placeholder="اسم الصف (مثلاً: الصف العاشر - أ)"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                                    value={newClassName}
                                    onChange={e => setNewClassName(e.target.value)}
                                    required
                                />
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-slate-400 block px-1">اختر المعلمين لهذا الصف:</label>
                                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                                        {teachers.map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTeacherIds(prev =>
                                                        prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                                    );
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border ${selectedTeacherIds.includes(t.id)
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-100'
                                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'
                                                    }`}
                                            >
                                                {t.name}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedTeacherIds.length === 0 && (
                                        <p className="text-[9px] text-amber-500 px-1 italic">* يجب اختيار معلم واحد على الأقل</p>
                                    )}
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-bold">
                                    إضافة الآن
                                </button>
                            </form>
                        )}

                        <div className="space-y-3">
                            {classes.map(c => (
                                <div key={c.id}
                                    onClick={() => handleSelectClass(c)}
                                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between transition-all hover:border-indigo-200 cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                                            <BookOpen className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">{c.name}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5 font-sans">
                                                المعلمون: {c.teacher_names && c.teacher_names.length > 0
                                                    ? c.teacher_names.join('، ')
                                                    : (c.teacher_name || 'لم يتم التعيين')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {canManageClasses && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteClass(c.id);
                                                }}
                                                className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                        <ChevronRight className="w-5 h-5 text-slate-300" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">إدارة المعلمين</h3>
                            {canManageTeachers && (
                                <button
                                    onClick={() => setShowAddTeacher(!showAddTeacher)}
                                    className="text-indigo-600 text-sm font-medium flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> {showAddTeacher ? 'إلغاء' : 'إضافة معلم'}
                                </button>
                            )}
                        </div>

                        {showAddTeacher && (
                            <form onSubmit={handleAddTeacher} className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                                <input
                                    type="text"
                                    placeholder="اسم المعلم بالكامل"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                                    value={newTeacher.name}
                                    onChange={e => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                    required
                                />
                                <input
                                    type="text"
                                    placeholder="اسم المستخدم"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                                    value={newTeacher.username}
                                    onChange={e => setNewTeacher({ ...newTeacher, username: e.target.value })}
                                    required
                                />
                                <input
                                    type="password"
                                    placeholder="كلمة المرور"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none"
                                    value={newTeacher.password}
                                    onChange={e => setNewTeacher({ ...newTeacher, password: e.target.value })}
                                    required
                                />
                                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-bold">
                                    حفظ بيانات المعلم
                                </button>
                            </form>
                        )}

                        <div className="grid grid-cols-2 gap-3 pb-4">
                            {teachers.map(t => (
                                <div key={t.id}
                                    onClick={() => setViewingTeacher(t)}
                                    className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-200 transition-all font-sans"
                                >
                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                        {t.name?.charAt(0)}
                                    </div>
                                    <p className="font-bold text-slate-800 text-xs text-center">{t.name}</p>
                                    <span className="text-[10px] bg-slate-50 px-2 py-0.5 rounded text-slate-400">{t.uid}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {currentUser?.role === 'admin' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-slate-700">مساعدي الإدارة</h3>
                                <button
                                    onClick={() => setShowAddAssistant(!showAddAssistant)}
                                    className="text-amber-600 text-sm font-medium flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> {showAddAssistant ? 'إلغاء' : 'إضافة مساعد'}
                                </button>
                            </div>

                            {showAddAssistant && (
                                <form onSubmit={handleAddAssistant} className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm space-y-3">
                                    <input
                                        type="text"
                                        placeholder="اسم المساعد"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                        value={newAssistant.name}
                                        onChange={e => setNewAssistant({ ...newAssistant, name: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="اسم المستخدم للدخول"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                        value={newAssistant.username}
                                        onChange={e => setNewAssistant({ ...newAssistant, username: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="password"
                                        placeholder="كلمة المرور"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                        value={newAssistant.password}
                                        onChange={e => setNewAssistant({ ...newAssistant, password: e.target.value })}
                                        required
                                    />
                                    <button type="submit" className="w-full bg-amber-600 text-white py-2 rounded-xl text-sm font-bold">
                                        حفظ بيانات المساعد
                                    </button>
                                </form>
                            )}

                            <div className="grid grid-cols-2 gap-3 pb-4">
                                {assistants.map(asst => (
                                    <div key={asst.id}
                                        className="bg-white p-4 rounded-2xl border border-amber-50 shadow-sm flex flex-col items-center gap-2 group relative"
                                    >
                                        <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 font-bold">
                                            {asst.name?.charAt(0)}
                                        </div>
                                        <p className="font-bold text-slate-800 text-[10px] text-center">{asst.name}</p>
                                        <span className="text-[10px] text-slate-400 font-mono">{asst.uid}</span>
                                        <button
                                            onClick={() => handleDeleteAssistant(asst.id)}
                                            className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-800">جميع الطلاب المسجلين</h3>
                            {canManageStudents && (
                                <button
                                    onClick={() => setShowAddStudent(!showAddStudent)}
                                    className="text-indigo-600 text-sm font-medium flex items-center gap-1"
                                >
                                    <Plus className="w-4 h-4" /> {showAddStudent ? 'إلغاء' : 'إضافة طالب'}
                                </button>
                            )}
                        </div>

                        {showAddStudent && (
                            <form onSubmit={handleAddStudent} className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                                <input
                                    type="text"
                                    placeholder="اسم الطالب الكامل"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                    value={newStudent.name}
                                    onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                                    required
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="text"
                                        placeholder="اسم المستخدم"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                        value={newStudent.username}
                                        onChange={e => setNewStudent({ ...newStudent, username: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="text"
                                        placeholder="الـ UID الخاص بالطالب"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                        value={newStudent.uid}
                                        onChange={e => setNewStudent({ ...newStudent, uid: e.target.value })}
                                        required
                                    />
                                </div>
                                <input
                                    type="password"
                                    placeholder="كلمة المرور"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none font-sans"
                                    value={newStudent.password}
                                    onChange={e => setNewStudent({ ...newStudent, password: e.target.value })}
                                    required
                                />
                                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100">
                                    حفظ وإضافة الطالب
                                </button>
                            </form>
                        )}

                        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm pb-20">
                            {students.map(s => (
                                <div key={s.id} className="p-4 border-b border-slate-50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-xs">
                                                {s.name.charAt(0)}
                                            </div>
                                            <p className="text-sm font-bold text-slate-800">{s.name}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{s.uid}</span>
                                            {canManageStudents && (
                                                <button
                                                    onClick={() => handleDeleteStudent(s.id)}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {canManageStudents && (
                                        <div className="flex gap-2">
                                            <select
                                                id={`assign-${s.id}`}
                                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-100 text-[10px] outline-none bg-slate-50 font-sans"
                                                defaultValue=""
                                            >
                                                <option value="">-- تعيين لصف --</option>
                                                {classes.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById(`assign-${s.id}`) as HTMLSelectElement;
                                                    handleAssignStudent(s.id, select.value);
                                                }}
                                                className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold"
                                            >
                                                تأكيد التعيين
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <button onClick={() => setSelectedClass(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                                <ArrowRight className="w-4 h-4 text-slate-600" />
                            </button>
                            <h3 className="font-bold text-slate-800 text-lg">طلاب صف: {selectedClass.name}</h3>
                        </div>
                        <button
                            onClick={() => setShowBroadcast({ target: 'class', id: selectedClass.id, name: selectedClass.name })}
                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border border-blue-100 flex items-center gap-2"
                        >
                            <Plus className="w-3.5 h-3.5" /> رسالة للصف
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                        {classStudents.length > 0 ? (
                            classStudents.map(s => (
                                <div key={s.id} className="p-4 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 font-bold">
                                            {s.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{s.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-slate-400">طالب في الصف</span>
                                                <span className="text-[10px] font-mono bg-emerald-100 px-2 py-0.5 rounded text-emerald-700 font-bold">{s.uid}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className={`px-3 py-1 rounded-lg ${s.absences > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400'} flex flex-col items-center`}>
                                            <span className="text-xs font-black">{s.absences || 0}</span>
                                            <span className="text-[8px] font-bold uppercase">غياب</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-10 text-center text-slate-400">
                                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>لا يوجد طلاب مسجلين في هذا الصف بعد</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Broadcast Modal */}
            {showBroadcast && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
                        <div className="p-6 bg-slate-50/50 border-b border-slate-50 flex justify-between items-center">
                            <div>
                                <h4 className="font-black text-slate-800 text-lg leading-tight">إرسال إشعار</h4>
                                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">
                                    {showBroadcast.target === 'all' ? 'لكل الطلاب في النظام' :
                                        showBroadcast.target === 'class' ? `جميع طلاب صف: ${showBroadcast.name}` :
                                            `طالب محدد من صف: ${showBroadcast.name}`}
                                </p>
                            </div>
                            <button onClick={() => setShowBroadcast(null)} className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-red-500">
                                <Plus className="w-4 h-4 rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSendBroadcast} className="p-6 space-y-4">
                            {(showBroadcast.target === 'class' || showBroadcast.target === 'student') && (
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 mr-1">المستهدف</label>
                                    <select
                                        className="w-full px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50/50 outline-none text-sm font-bold focus:border-blue-400 transition-colors bg-white font-sans"
                                        value={showBroadcast.target === 'student' ? showBroadcast.studentId : 'all'}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === 'all') {
                                                setShowBroadcast({ ...showBroadcast, target: 'class', studentId: undefined });
                                            } else {
                                                setShowBroadcast({ ...showBroadcast, target: 'student', studentId: val });
                                            }
                                        }}
                                    >
                                        <option value="all">كل طلاب الصف</option>
                                        {classStudents.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 mr-1">عنوان الرسالة</label>
                                <input
                                    type="text"
                                    placeholder="مثلاً: تنبيه مهم، غداً عطلة"
                                    className="w-full px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50/50 outline-none text-sm font-bold focus:border-blue-400 transition-colors"
                                    value={broadcastMsg.title}
                                    onChange={e => setBroadcastMsg({ ...broadcastMsg, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 mr-1">محتوى الرسالة</label>
                                <textarea
                                    className="w-full px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50/50 outline-none text-sm font-medium focus:border-blue-400 transition-colors h-32 resize-none"
                                    placeholder="اكتب رسالتك هنا..."
                                    value={broadcastMsg.message}
                                    onChange={e => setBroadcastMsg({ ...broadcastMsg, message: e.target.value })}
                                    required
                                ></textarea>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-slate-200 active:scale-95 transition-all"
                            >
                                إرسال للطلاب الآن
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {/* Teacher Details Modal */}
            {viewingTeacher && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 font-sans">
                        <div className="p-6 bg-slate-50/50 border-b border-slate-50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg">
                                    {viewingTeacher.name.charAt(0)}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 text-base">{viewingTeacher.name}</h4>
                                    <p className="text-[10px] font-bold text-indigo-600 lowercase tracking-widest">{viewingTeacher.uid}</p>
                                </div>
                            </div>
                            <button onClick={() => setViewingTeacher(null)} className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-red-500">
                                <Plus className="w-4 h-4 rotate-45" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-3">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">الفصول المعين عليها</h5>
                                <div className="space-y-2">
                                    {classes.filter(c => c.teacher_id === viewingTeacher.id || c.teacher_ids?.includes(viewingTeacher.id)).length > 0 ? (
                                        classes.filter(c => c.teacher_id === viewingTeacher.id || c.teacher_ids?.includes(viewingTeacher.id)).map(c => (
                                            <div key={c.id} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex justify-between items-center group/item">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-indigo-900">{c.name}</span>
                                                    <span className="text-[8px] text-indigo-400 font-bold">مدرس الفصل</span>
                                                </div>
                                                {canManageTeachers && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAssignTeacherToClass('', c.id);
                                                        }}
                                                        className="w-6 h-6 bg-white border border-indigo-100 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-all opacity-0 group-hover/item:opacity-100"
                                                        title="إزالة التعيين"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                                            <p className="text-[10px] text-slate-400">لم يتم تعيينه لأي فصل حالياً</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {canManageTeachers && (
                                <div className="space-y-3 pt-2">
                                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">تعيين لصف جديد</h5>
                                    <select
                                        className="w-full px-5 py-3 rounded-2xl border border-slate-100 bg-slate-50 outline-none text-xs font-bold focus:border-indigo-400 transition-colors font-sans"
                                        id="teacher-assign-select"
                                        defaultValue=""
                                        onChange={(e) => {
                                            const classId = e.target.value;
                                            if (classId) {
                                                handleAssignTeacherToClass(viewingTeacher.id, classId);
                                                e.target.value = ""; // Reset after action
                                            }
                                        }}
                                    >
                                        <option value="" disabled>-- اختر الصف المُراد تعيينه له --</option>
                                        {classes.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="space-y-3 pt-2">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">المواد التي يدرسها</h5>
                                <div className="flex flex-wrap gap-2">
                                    {allSubjects.map((subObj) => {
                                        const sub = subObj.name;
                                        const isSelected = viewingTeacher.subjects?.includes(sub);
                                        return (
                                            <button
                                                key={subObj.id}
                                                onClick={() => handleToggleTeacherSubject(viewingTeacher.id, sub)}
                                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border ${isSelected
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100'
                                                    : 'bg-white border-slate-100 text-slate-400 hover:border-indigo-200'
                                                    }`}
                                            >
                                                {sub}
                                            </button>
                                        );
                                    })}
                                </div>
                                {(allSubjects.length === 0) && (
                                    <p className="text-[9px] text-amber-500 font-bold px-1 italic">
                                        * لم يتم تحديد أي مواد له بعد.
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-slate-100">
                                {canManageTeachers && (
                                    <button
                                        onClick={() => handleDeleteTeacher(viewingTeacher.id)}
                                        className="flex-1 bg-red-50 text-red-600 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" /> حذف المعلم
                                    </button>
                                )}
                                <button
                                    onClick={() => setViewingTeacher(null)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-2xl font-bold text-xs"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Daily Absences Modal */}
            {showAbsencesToday && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 font-sans flex flex-col max-h-[90vh]">
                        <div className="p-6 bg-rose-50/50 border-b border-rose-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-rose-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
                                    <UserX className="w-6 h-6" />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 text-base">غيابات اليوم</h4>
                                    <p className="text-[10px] font-bold text-rose-600 tracking-widest uppercase">
                                        {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowAbsencesToday(false)} className="w-8 h-8 flex items-center justify-center bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400 hover:text-red-500">
                                <Plus className="w-4 h-4 rotate-45" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-3">
                            {dailyAbsences.length === 0 ? (
                                <div className="py-12 text-center space-y-3">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                                        <Users className="w-8 h-8" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-400">لا يوجد غيابات مسجلة لهذا اليوم حتى الآن</p>
                                </div>
                            ) : (
                                dailyAbsences.map((abs, idx) => (
                                    <div key={idx} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group hover:border-rose-200 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-50 group-hover:bg-rose-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-rose-500 transition-colors font-bold">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-800 text-sm">{abs.studentName}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg">{abs.studentUid}</span>
                                                    <span className="text-[9px] font-bold text-slate-400">في: {abs.className}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-left shrink-0">
                                            <p className="text-[9px] font-bold text-slate-300">
                                                {new Date(abs.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-50 bg-slate-50/30 shrink-0">
                            <button
                                onClick={() => setShowAbsencesToday(false)}
                                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-slate-200 hover:bg-slate-800 transition-colors"
                            >
                                إغلاق النافذة
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
