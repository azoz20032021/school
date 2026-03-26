import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GraduationCap, ChevronRight, ArrowRight, Plus, Trash2, Edit2, Users, Printer } from 'lucide-react';
import { UserData, ClassData } from '../types';

interface GradesManagementProps {
    user: UserData;
}

export const GradesManagement: React.FC<GradesManagementProps> = ({ user }) => {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
    const [classStudents, setClassStudents] = useState<any[]>([]);
    const [allGrades, setAllGrades] = useState<any[]>([]);
    const [showAddGrade, setShowAddGrade] = useState<{ studentId: string, name: string } | null>(null);
    const [editingGradeId, setEditingGradeId] = useState<string | null>(null);
    const [newGrade, setNewGrade] = useState({ subject: '', score: '', total: '100', category: 'يومي', semester: 'الفصل الأول' });
    const [showPrintOptions, setShowPrintOptions] = useState(false);
    const [printFilter, setPrintFilter] = useState({ category: 'الكل', semester: 'الكل' });
    const [subjects, setSubjects] = useState<any[]>([]);

    const fetchData = async () => {
        const url = (user.role === 'admin' || user.role === 'assistant_admin') ? '/api/classes' : `/api/teacher/classes/${user.id}`;
        const res = await fetch(url);
        const data = await res.json();
        setClasses(data);
    };

    useEffect(() => {
        fetchData();
        fetch('/api/subjects').then(res => res.json()).then(data => {
            setSubjects(data);
            if ((user.role === 'admin' || user.role === 'assistant_admin') && data.length > 0) {
                setNewGrade(prev => ({ ...prev, subject: data[0].name }));
            }
        });

        if (user.role === 'teacher' && user.subjects && user.subjects.length > 0) {
            setNewGrade(prev => ({ ...prev, subject: user.subjects![0] }));
        }
    }, [user.id, user.role, user.subjects]);

    useEffect(() => {
        if (['نصف السنة', 'السعي السنوي '].includes(newGrade.semester) && newGrade.category !== 'الكل') {
            setNewGrade(prev => ({ ...prev, category: 'الكل' }));
        }
    }, [newGrade.semester, newGrade.category]);

    const handleSelectClass = async (c: ClassData) => {
        setSelectedClass(c);
        const [studentsRes, gradesRes] = await Promise.all([
            fetch(`/api/class/${c.id}/students`),
            fetch(`/api/class/${c.id}/grades`)
        ]);
        const studentsData = await studentsRes.json();
        const gradesData = await gradesRes.json();
        setClassStudents(studentsData);
        setAllGrades(gradesData);
    };

    const handlePrint = () => {
        if (!selectedClass) return;

        let filteredGrades = allGrades;
        if (printFilter.category !== 'الكل') {
            filteredGrades = filteredGrades.filter(g => (g.category || 'يومي') === printFilter.category);
        }
        if (printFilter.semester !== 'الكل') {
            filteredGrades = filteredGrades.filter(g => (g.semester || 'الفصل الأول') === printFilter.semester);
        }

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
            return;
        }

        const htmlContent = `
      <html dir="rtl">
        <head>
          <title>تقرير درجات: ${selectedClass.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; }
            h1 { text-align: center; color: #334155; }
            .header { margin-bottom: 30px; text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: right; }
            th { background-color: #f8fafc; font-weight: bold; }
            .student-name { background-color: #f1f5f9; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>تقرير درجات الطلاب</h1>
            <p>الصف: ${selectedClass.name}</p>
            <p>نوع التقرير: ${printFilter.category === 'الكل' ? 'جميع الدرجات' : printFilter.category} - ${printFilter.semester === 'الكل' ? 'جميع الفصول' : printFilter.semester}</p>
            <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 200px;">اسم الطالب</th>
                ${[...new Set(filteredGrades.map(g => g.subject))].map(sub => `<th>${sub}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${classStudents.map(s => {
            const sGrades = filteredGrades.filter(g => g.student_id === s.id);
            const uniqueSubjects = [...new Set(filteredGrades.map(g => g.subject))];
            return `
                  <tr>
                    <td class="student-name">${s.name}</td>
                    ${uniqueSubjects.map(sub => {
                const grade = sGrades.find(g => g.subject === sub);
                let catLabel = grade?.category || 'يومي';
                if (catLabel === 'امتحان فصل') {
                    catLabel = (grade?.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول');
                } else if (catLabel === 'الكل') {
                    if (grade?.semester === 'نصف السنة') catLabel = 'درجة نصف السنة';
                    else if (grade?.semester === 'السعي السنوي ') catLabel = 'درجة سنوية';
                }
                return `<td>${grade ? `${grade.score} / ${grade.total}<br><small>(${catLabel})</small>` : '-'}</td>`;
            }).join('')}
                  </tr>
                `;
        }).join('')}
            </tbody>
          </table>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setShowPrintOptions(false);
    };

    const handleAddGrade = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showAddGrade || !selectedClass) return;

        if (!newGrade.subject && user.role === 'teacher') {
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
        const ratio = score / total;
        if (ratio < 0.5) status = 'راسب';
        else if (ratio < 0.75) status = 'جيد';
        else if (ratio < 0.9) status = 'جيد جداً';

        try {
            const payload = {
                student_id: showAddGrade.studentId,
                class_id: selectedClass.id,
                subject: newGrade.subject,
                score,
                total,
                status,
                category: newGrade.category,
                semester: newGrade.semester,
                performed_by: user.id
            };

            const res = await fetch(editingGradeId ? `/api/grades/${editingGradeId}` : '/api/grades', {
                method: editingGradeId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save grade');

            setShowAddGrade(null);
            setEditingGradeId(null);
            const defaultSub = (user.role === 'teacher' && user.subjects && user.subjects.length > 0) ? user.subjects[0] : (editingGradeId ? newGrade.subject : 'الرياضيات');
            setNewGrade({ subject: defaultSub, score: '', total: '100', category: 'يومي', semester: 'الفصل الأول' });
            alert(editingGradeId ? 'تم تحديث الدرجة بنجاح' : 'تمت إضافة الدرجة بنجاح');
            handleSelectClass(selectedClass);
        } catch (error: any) {
            alert(`حدث خطأ أثناء حفظ الدرجة`);
        }
    };

    const handleEditGrade = (g: any, studentName: string) => {
        setEditingGradeId(g.id);
        setShowAddGrade({ studentId: g.student_id, name: studentName });
        setNewGrade({
            subject: g.subject,
            score: g.score.toString(),
            total: g.total.toString(),
            category: g.category || 'يومي',
            semester: g.semester || 'الفصل الأول'
        });
    };

    const handleDeleteGrade = async (gradeId: string) => {
        if (confirm('هل أنت متأكد من حذف هذه الدرجة نهائياً؟ لا يمكن التراجع عن هذه الخطوة.')) {
            await fetch(`/api/grades/${gradeId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ performed_by: user.id })
            });
            if (selectedClass) handleSelectClass(selectedClass);
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            {!selectedClass ? (
                <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 text-lg">
                        {user.role === 'admin' ? 'إدارة درجات جميع الصفوف' : 'اختيار الصف لتعديل الدرجات'}
                    </h3>
                    <div className="space-y-3">
                        {classes.map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleSelectClass(c)}
                                className="w-full text-right bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between hover:border-emerald-200 transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                                        <GraduationCap className="w-6 h-6" />
                                    </div>
                                    <p className="font-bold text-slate-800">{c.name}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300" />
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => setSelectedClass(null)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                            <ArrowRight className="w-4 h-4 text-slate-600" />
                        </button>
                        <h3 className="font-bold text-slate-800 text-lg truncate">درجات صف: {selectedClass.name}</h3>
                    </div>

                    {(user.role === 'admin' || user.role === 'assistant_admin') && (
                        <button
                            onClick={() => setShowPrintOptions(true)}
                            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg"
                        >
                            <Printer className="w-5 h-5 text-amber-400" />
                            طباعة تقرير الدرجات
                        </button>
                    )}
                    <div className="space-y-4">
                        {classStudents.length > 0 ? (
                            classStudents.map(student => {
                                let studentGrades = allGrades.filter(g => g.student_id === student.id);
                                if (user.role === 'teacher' && user.subjects) {
                                    studentGrades = studentGrades.filter(g => user.subjects?.includes(g.subject));
                                }
                                return (
                                    <div key={student.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                                    {student.name.charAt(0)}
                                                </div>
                                                <p className="font-bold text-slate-800 text-sm">{student.name}</p>
                                            </div>
                                            {(user.role === 'admin' || user.role === 'teacher') && (
                                                <button
                                                    onClick={() => setShowAddGrade({ studentId: student.id, name: student.name })}
                                                    className="text-indigo-600 text-xs font-bold flex items-center gap-1 bg-indigo-50 px-3 py-1.5 rounded-full"
                                                >
                                                    <Plus className="w-3 h-3" /> إضافة درجة
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            {studentGrades.length > 0 ? (
                                                studentGrades.map(g => (
                                                    <div key={g.id} className="flex justify-between items-center bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-700">
                                                                {g.subject} - {g.category === 'امتحان فصل' ? (g.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول') : (g.category === 'الكل' ? (g.semester === 'نصف السنة' ? 'درجة نصف السنة' : 'درجة سنوية') : (g.category || 'يومي'))}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400">{(g.semester || 'الفصل الأول')} | {g.category === 'امتحان فصل' ? (g.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول') : (g.category === 'الكل' ? (g.semester === 'نصف السنة' ? 'درجة نصف السنة' : 'درجة سنوية') : (g.category || 'يومي'))}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-slate-800 text-sm ml-2">{g.score} <span className="text-[10px] text-slate-300">/ {g.total}</span></p>
                                                            {(user.role === 'admin' || user.role === 'teacher') && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleEditGrade(g, student.name)}
                                                                        className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                                                                    >
                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteGrade(g.id)}
                                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100"
                                                                    >
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-[10px] text-slate-400 text-center py-2">لا توجد درجات مضافة بعد</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-10 text-center text-slate-400">
                                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>لا يوجد طلاب مسجلين في هذا الصف</p>
                            </div>
                        )}
                    </div>

                    {showAddGrade && (
                        <AnimatePresence>
                            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-white w-full max-sm rounded-3xl p-6 shadow-2xl space-y-4"
                                >
                                    <h4 className="font-bold text-slate-800">{editingGradeId ? 'تعديل درجة الطالب' : 'إضافة درجة للطالب'}: {showAddGrade.name}</h4>
                                    <form onSubmit={handleAddGrade} className="space-y-4">
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
                                                        <option value="نصف السنة">نصف السنة </option>
                                                        <option value="السعي السنوي ">السعي السنوي  </option>
                                                    </select>
                                                </div>
                                            </div>
                                            <label className="block text-[10px] font-bold text-slate-400 mb-1">المادة</label>
                                            <select
                                                className="w-full px-4 py-2 rounded-xl border border-slate-100 outline-none text-sm bg-slate-50 font-sans"
                                                value={newGrade.subject}
                                                onChange={e => setNewGrade({ ...newGrade, subject: e.target.value })}
                                                disabled={!!editingGradeId}
                                            >
                                                {user.role === 'admin' || user.role === 'assistant_admin' ? (
                                                    subjects.map(s => (
                                                        <option key={s.id} value={s.name}>{s.name}</option>
                                                    ))
                                                ) : (
                                                    user.subjects && user.subjects.length > 0 ? (
                                                        user.subjects.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))
                                                    ) : (
                                                        <option value="" disabled>لا توجد مواد معينة</option>
                                                    )
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
                                                onClick={() => {
                                                    setShowAddGrade(null);
                                                    setEditingGradeId(null);
                                                    const defaultSub = (user.role === 'teacher' && user.subjects && user.subjects.length > 0) ? user.subjects[0] : 'الرياضيات';
                                                    setNewGrade({ subject: defaultSub, score: '', total: '100', category: 'يومي', semester: 'الفصل الأول' });
                                                }}
                                                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm"
                                            >
                                                إلغاء
                                            </button>
                                            <button
                                                type="submit"
                                                className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm"
                                            >
                                                {editingGradeId ? 'تحديث' : 'حفظ'}
                                            </button>
                                        </div>
                                    </form>
                                </motion.div>
                            </div>
                        </AnimatePresence>
                    )}
                </div>
            )}

            {showPrintOptions && (
                <AnimatePresence>
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[999] p-6">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4"
                        >
                            <h4 className="font-bold text-slate-800 text-center">خيارات طباعة التقرير</h4>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 mb-3">الفصل الدراسي</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['الكل', 'الفصل الأول', 'الفصل الثاني', 'نصف السنة', 'السعي السنوي '].map(sem => (
                                            <button
                                                key={sem}
                                                type="button"
                                                onClick={() => {
                                                    const newFilter = { ...printFilter, semester: sem };
                                                    if (['نصف السنة', 'السعي السنوي '].includes(sem)) {
                                                        newFilter.category = 'الكل';
                                                    }
                                                    setPrintFilter(newFilter);
                                                }}
                                                className={`py-2 px-1 rounded-xl text-[10px] font-bold transition-all border ${printFilter.semester === sem ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`}
                                            >
                                                {sem}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {!['نصف السنة', 'السعي السنوي '].includes(printFilter.semester) && (
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-3">نوع الدرجات المراد طباعتها</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['الكل', 'يومي', 'شهر أول', 'شهر ثاني', 'امتحان فصل'].map(cat => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => setPrintFilter({ ...printFilter, category: cat })}
                                                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${printFilter.category === cat ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`}
                                                >
                                                    {cat === 'امتحان فصل' ? (printFilter.semester === 'الفصل الثاني' ? 'درجة فصل ثاني' : 'درجة فصل اول') : cat}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 pt-4 border-t border-slate-50">
                                <button
                                    type="button"
                                    onClick={() => setShowPrintOptions(false)}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
                                >
                                    بدء الطباعة
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>
            )}
        </div>
    );
};
