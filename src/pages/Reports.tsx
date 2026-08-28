import React, { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Printer } from 'lucide-react';
import { ClassData, UserData } from '../types';
import { api, ApiError, formatMoney } from '../lib/api';
import { isStaff } from '../context/AuthContext';
import { Card, EmptyState, ErrorBanner, SectionTitle, Spinner, inputClass, labelClass } from '../components/ui';

type ReportKind = 'student' | 'class' | 'attendance' | 'finance';

const TABS: { key: ReportKind; label: string }[] = [
    { key: 'student', label: 'كشف طالب' },
    { key: 'class', label: 'كشف درجات صف' },
    { key: 'attendance', label: 'كشف غياب' },
    { key: 'finance', label: 'كشف الديون' },
];

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
};

const PrintHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
    <div className="hidden print:flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-5">
        <div>
            <p className="text-lg font-black">ثانوية المعالي الأهلية</p>
            <p className="text-xs">{title}{subtitle ? ` — ${subtitle}` : ''}</p>
        </div>
        <p className="text-[10px]">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
    </div>
);

const Table: React.FC<{ headers: string[]; rows: (string | number | React.ReactNode)[][] }> = ({ headers, rows }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
            <thead>
                <tr className="bg-slate-50 print:bg-slate-100">
                    {headers.map((h) => (
                        <th key={h} className="text-right font-black text-slate-600 px-3 py-2.5 border-b border-slate-200 whitespace-nowrap">
                            {h}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                        {row.map((cell, j) => (
                            <td key={j} className="px-3 py-2.5 text-slate-700 font-bold whitespace-nowrap">{cell}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export const Reports: React.FC<{ user: UserData }> = ({ user }) => {
    const [tab, setTab] = useState<ReportKind>(isStaff(user.role) ? 'class' : 'student');
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [students, setStudents] = useState<{ id: string; name: string; uid: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);

    const [selectedClass, setSelectedClass] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(user.role === 'student' ? user.id : '');
    const [from, setFrom] = useState(monthAgo());
    const [to, setTo] = useState(today());

    useEffect(() => {
        const endpoint = isStaff(user.role) ? '/api/classes' : `/api/teacher/classes/${user.id}`;
        api.get<ClassData[]>(endpoint).then(setClasses).catch(() => {});
        if (isStaff(user.role)) {
            api.get<any[]>('/api/admin/students')
                .then((list) => setStudents(list.map((s) => ({ id: s.id, name: s.name, uid: s.uid }))))
                .catch(() => {});
        }
    }, [user.id, user.role]);

    const run = useCallback(async () => {
        setLoading(true);
        setError('');
        setData(null);
        try {
            let result;
            if (tab === 'student') {
                if (!selectedStudent) throw new ApiError(400, 'يرجى اختيار الطالب');
                result = await api.get(`/api/reports/student/${selectedStudent}`);
            } else if (tab === 'class') {
                if (!selectedClass) throw new ApiError(400, 'يرجى اختيار الصف');
                result = await api.get(`/api/reports/class/${selectedClass}`);
            } else if (tab === 'attendance') {
                const params = new URLSearchParams({ from, to });
                if (selectedClass) params.set('class_id', selectedClass);
                result = await api.get(`/api/reports/attendance?${params}`);
            } else {
                const params = selectedClass ? `?class_id=${selectedClass}` : '';
                result = await api.get(`/api/admin/finance/students${params}`);
            }
            setData(result);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر إنشاء التقرير');
        } finally {
            setLoading(false);
        }
    }, [tab, selectedStudent, selectedClass, from, to]);

    // A student only ever has one report to look at — load it straight away.
    useEffect(() => {
        if (user.role === 'student') run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.role]);

    return (
        <div className="p-4 md:p-6 space-y-4" dir="rtl">
            <div className="flex items-start justify-between gap-3 print:hidden">
                <div>
                    <h2 className="text-lg font-black text-slate-800">التقارير</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">اعرض التقرير ثم اطبعه أو احفظه PDF</p>
                </div>
                {data && (
                    <button
                        onClick={() => window.print()}
                        className="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0"
                    >
                        <Printer className="w-4 h-4" />
                        طباعة
                    </button>
                )}
            </div>

            {user.role !== 'student' && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar print:hidden">
                    {TABS.filter((t) => isStaff(user.role) || t.key !== 'finance').map((t) => (
                        <button
                            key={t.key}
                            onClick={() => { setTab(t.key); setData(null); }}
                            className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-colors ${
                                tab === t.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-100'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {user.role !== 'student' && (
                <Card className="p-4 space-y-3 print:hidden">
                    <div className="grid md:grid-cols-3 gap-3">
                        {tab === 'student' && (
                            <div className="md:col-span-2">
                                <label className={labelClass}>الطالب</label>
                                <select className={inputClass} value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                                    <option value="">-- اختر الطالب --</option>
                                    {students.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.uid}</option>)}
                                </select>
                            </div>
                        )}

                        {tab !== 'student' && (
                            <div>
                                <label className={labelClass}>الصف {tab === 'class' && <span className="text-red-500">*</span>}</label>
                                <select className={inputClass} value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                                    <option value="">{tab === 'class' ? '-- اختر الصف --' : 'كل الصفوف'}</option>
                                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        {tab === 'attendance' && (
                            <>
                                <div>
                                    <label className={labelClass}>من تاريخ</label>
                                    <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
                                </div>
                                <div>
                                    <label className={labelClass}>إلى تاريخ</label>
                                    <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={run}
                        disabled={loading}
                        className="w-full md:w-auto bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                        <FileBarChart className="w-4 h-4" />
                        {loading ? 'جاري الإنشاء...' : 'إنشاء التقرير'}
                    </button>
                </Card>
            )}

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
            {loading && <Spinner label="جاري تجميع البيانات" />}

            {data && tab === 'student' && (
                <div className="space-y-4 print:space-y-3">
                    <PrintHeader title="كشف الطالب" subtitle={data.student.name} />

                    <Card className="p-5 print:shadow-none print:border-slate-300">
                        <SectionTitle title="بيانات الطالب" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {[
                                ['الاسم', data.student.name],
                                ['الرقم التعريفي', data.student.uid],
                                ['الصف', data.student.class_name || '—'],
                                ['هاتف ولي الأمر', data.student.guardian_phone || '—'],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-slate-50 rounded-xl p-3 print:bg-white print:border print:border-slate-200">
                                    <p className="text-[10px] text-slate-400 font-bold">{label}</p>
                                    <p className="font-black text-slate-800 mt-0.5">{value}</p>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div className="grid md:grid-cols-3 gap-4">
                        <Card className="p-5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">المعدل العام</p>
                            <p className="text-2xl font-black text-indigo-600 mt-1">
                                {data.grades.stats.overall_percentage ?? '—'}%
                            </p>
                        </Card>
                        <Card className="p-5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">نسبة الحضور</p>
                            <p className="text-2xl font-black text-emerald-600 mt-1">{data.attendance.stats.rate}%</p>
                            <p className="text-[10px] text-slate-400 mt-1">
                                {data.attendance.stats.absent} غياب من {data.attendance.stats.total} يوم
                            </p>
                        </Card>
                        <Card className="p-5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">المتبقي مالياً</p>
                            <p className={`text-2xl font-black mt-1 ${data.finance.is_clear ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatMoney(data.finance.outstanding)}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">من {formatMoney(data.finance.total_billed)}</p>
                        </Card>
                    </div>

                    <Card className="p-5">
                        <SectionTitle title="المعدل حسب المادة" />
                        {data.grades.stats.subjects.length === 0 ? (
                            <EmptyState message="لا توجد درجات مسجلة" />
                        ) : (
                            <Table
                                headers={['المادة', 'عدد التقييمات', 'المجموع', 'النسبة']}
                                rows={data.grades.stats.subjects.map((s: any) => [
                                    s.subject, s.count, `${s.earned}/${s.possible}`, `${s.percentage}%`,
                                ])}
                            />
                        )}
                    </Card>

                    <Card className="p-5">
                        <SectionTitle title="السلوك" subtitle={`درجة السلوك ${data.behavior.conduct_score}/100`} />
                        {data.behavior.notes.length === 0 ? (
                            <EmptyState message="لا توجد ملاحظات سلوكية" />
                        ) : (
                            <Table
                                headers={['التاريخ', 'النوع', 'التصنيف', 'الملاحظة']}
                                rows={data.behavior.notes.map((n: any) => [
                                    n.date, n.type === 'positive' ? 'إيجابية' : 'سلبية', n.category, n.title,
                                ])}
                            />
                        )}
                    </Card>
                </div>
            )}

            {data && tab === 'class' && (
                <div className="space-y-4">
                    <PrintHeader title="كشف درجات" subtitle={data.class.name} />
                    <Card className="p-5">
                        <SectionTitle
                            title={data.class.name}
                            subtitle={`${data.students.length} طالب · معدل الصف ${data.class_average ?? '—'}%`}
                        />
                        {data.students.length === 0 ? (
                            <EmptyState message="لا يوجد طلاب في هذا الصف" />
                        ) : (
                            <Table
                                headers={['الطالب', 'الرقم', ...data.subjects, 'المعدل', 'الحضور', 'المتبقي']}
                                rows={data.students.map((s: any) => [
                                    s.name,
                                    s.uid,
                                    ...data.subjects.map((sub: string) =>
                                        s.subjects[sub] === null || s.subjects[sub] === undefined ? '—' : `${s.subjects[sub]}%`
                                    ),
                                    s.overall_percentage === null ? '—' : `${s.overall_percentage}%`,
                                    `${s.attendance.rate}%`,
                                    formatMoney(s.outstanding),
                                ])}
                            />
                        )}
                    </Card>
                </div>
            )}

            {data && tab === 'attendance' && (
                <div className="space-y-4">
                    <PrintHeader title="كشف الغياب" subtitle={`${data.from} إلى ${data.to}`} />
                    <Card className="p-5">
                        <SectionTitle title="ملخص الحضور" subtitle={`من ${data.from} إلى ${data.to}`} />
                        {data.students.length === 0 ? (
                            <EmptyState message="لا توجد سجلات حضور في هذه الفترة" />
                        ) : (
                            <Table
                                headers={['الطالب', 'الرقم', 'حاضر', 'غائب', 'متأخر', 'بعذر', 'النسبة', 'هاتف ولي الأمر']}
                                rows={data.students.map((s: any) => [
                                    s.name, s.uid, s.present, s.absent, s.late, s.excused, `${s.rate}%`, s.guardian_phone || '—',
                                ])}
                            />
                        )}
                    </Card>
                </div>
            )}

            {data && tab === 'finance' && (
                <div className="space-y-4">
                    <PrintHeader title="كشف الديون" />
                    <Card className="p-5">
                        <SectionTitle
                            title="حالة السداد"
                            subtitle={`${data.students.filter((s: any) => !s.is_clear).length} طالب عليه مستحقات`}
                        />
                        <Table
                            headers={['الطالب', 'الرقم', 'الصف', 'الإجمالي', 'المسدد', 'المتبقي', 'الحالة', 'هاتف ولي الأمر']}
                            rows={data.students.map((s: any) => [
                                s.name, s.uid, s.class_name,
                                formatMoney(s.total_billed), formatMoney(s.total_paid), formatMoney(s.outstanding),
                                s.payment_status, s.guardian_phone || '—',
                            ])}
                        />
                    </Card>
                </div>
            )}
        </div>
    );
};
