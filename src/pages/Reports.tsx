import React, { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Printer } from 'lucide-react';
import { ClassData, UserData } from '../types';
import { api, ApiError, formatMoney } from '../lib/api';
import { isStaff } from '../context/AuthContext';
import { Card, ErrorBanner, Spinner, inputClass, labelClass } from '../components/ui';
import { PickableStudent, StudentPicker } from '../components/StudentPicker';
import { localeOf, t } from '../i18n';

type ReportKind = 'student' | 'class' | 'attendance' | 'finance';

const TABS: { key: ReportKind; label: string }[] = [
    { key: 'student', label: 'كشف طالب' },
    { key: 'class', label: 'كشف درجات صف' },
    { key: 'attendance', label: 'كشف غياب' },
    { key: 'finance', label: 'كشف الديون' },
];

const STATUS_LABEL: Record<string, string> = {
    paid: 'مسدد بالكامل',
    partial: 'مسدد جزئياً',
    unpaid: 'غير مسدد',
    cancelled: 'ملغى',
};

/**
 * A statement is meant to be one sheet. These caps keep a student with a long
 * history from turning their report into a five-page printout; the count of
 * what was left out is printed underneath so nothing looks hidden.
 */
const BEHAVIOR_ROWS = 12;
const PAYMENT_ROWS = 14;

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
};

/**
 * A report is paperwork: a parent, a bank or the ministry reads it on paper.
 * These three pieces give every statement the same official shape — a letter
 * head, an identity block, and somewhere for the school to sign and stamp —
 * and they look the same on screen as they do on the sheet, so nobody has to
 * print one to find out how it came out.
 */

const SCHOOL_NAME = 'ثانوية المعالي الأهلية';

/**
 * One sheet of A4: bordered on screen, edge-to-edge on paper.
 *
 * A report listing a whole class or the school's debtors has far more columns
 * than one about a single student, so those ask for a landscape sheet — the
 * portrait one cut the last columns off the right edge.
 */
const Sheet: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
    <div
        className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-5 md:p-8 mx-auto print:border-0 print:rounded-none print:shadow-none print:p-0 ${
            wide ? 'max-w-[1100px] print:max-w-none print-landscape' : 'max-w-[860px] print:max-w-none'
        }`}
    >
        {children}
    </div>
);

const SheetHeader: React.FC<{ title: string; meta?: string }> = ({ title, meta }) => (
    <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3 mb-4 print-block">
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-12 h-12 object-contain print:w-11 print:h-11" />
            <div>
                <p className="text-base font-black text-slate-900 leading-tight">{t(SCHOOL_NAME)}</p>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">{t('إدارة شؤون الطلاب')}</p>
            </div>
        </div>
        <div className="text-left shrink-0">
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                {t('تاريخ الإصدار')}: {new Date().toLocaleDateString(localeOf())}
            </p>
            {meta && <p className="text-[10px] text-slate-500 font-bold">{meta}</p>}
        </div>
    </div>
);

/**
 * The identity block. The order is deliberate and is the order the school reads
 * these out in: name first, then the class, then the national ID.
 */
const IdentityTable: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
    <table className="w-full text-[11px] border-collapse mb-4 print-block">
        <tbody>
            {rows.map(([label, value], i) => (
                <tr key={label} className={i % 2 ? 'bg-slate-50/60' : ''}>
                    <th className="text-right font-bold text-slate-500 border border-slate-200 px-3 py-1.5 w-36 whitespace-nowrap">
                        {t(label)}
                    </th>
                    <td className="font-black text-slate-800 border border-slate-200 px-3 py-1.5">{value || '—'}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

/**
 * One signature and the stamp. Anything about money is the accountant's to
 * sign; everything else is the administration's. No document carries both.
 */
const SignatureBlock: React.FC<{ finance?: boolean }> = ({ finance }) => (
    <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-slate-200 text-center print-block">
        <div>
            <p className="text-[11px] font-black text-slate-700">{t('ختم المدرسة')}</p>
            <div className="h-14 mt-1 border border-dashed border-slate-300 rounded-lg" />
        </div>
        <div>
            <p className="text-[11px] font-black text-slate-700">
                {finance ? t('توقيع المحاسب') : t('توقيع الإدارة')}
            </p>
            <div className="h-14 border-b border-slate-400 mt-1" />
        </div>
    </div>
);

/** A titled band inside a sheet — replaces the stack of separate cards. */
const Block: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
    <section className="mb-4 print-block">
        <div className="flex items-baseline justify-between gap-3 border-r-4 border-slate-800 pr-2 mb-2">
            <h4 className="text-xs font-black text-slate-800">{title}</h4>
            {note && <span className="text-[10px] font-bold text-slate-400">{note}</span>}
        </div>
        {children}
    </section>
);

/**
 * On screen a wide table scrolls sideways; on paper it cannot, so the print
 * rules let cells wrap and shrink instead. A list of two hundred students was
 * running off the right edge of the sheet with half the columns lost.
 */
const Table: React.FC<{ headers: string[]; rows: (string | number | React.ReactNode)[][] }> = ({ headers, rows }) => (
    <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full text-[11px] border-collapse print:text-[9px] print:table-fixed">
            <thead>
                <tr className="bg-slate-100">
                    {headers.map((h) => (
                        <th
                            key={h}
                            className="text-right font-black text-slate-700 border border-slate-300 px-2.5 py-1.5 whitespace-nowrap print:whitespace-normal print:px-1 print:py-1"
                        >
                            {t(h)}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={i}>
                        {row.map((cell, j) => (
                            <td
                                key={j}
                                className="border border-slate-200 px-2.5 py-1.5 text-slate-700 font-bold whitespace-nowrap print:whitespace-normal print:break-words print:px-1 print:py-1"
                            >
                                {cell}
                            </td>
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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState<any>(null);

    const [selectedClass, setSelectedClass] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(user.role === 'student' ? user.id : '');
    const [studentInfo, setStudentInfo] = useState<PickableStudent | null>(null);
    const [onlyDebtors, setOnlyDebtors] = useState(false);
    const [from, setFrom] = useState(monthAgo());
    const [to, setTo] = useState(today());

    useEffect(() => {
        const endpoint = isStaff(user.role) ? '/api/classes' : `/api/teacher/classes/${user.id}`;
        api.get<ClassData[]>(endpoint).then(setClasses).catch(() => {});
    }, [user.id, user.role]);

    const run = useCallback(async () => {
        setLoading(true);
        setError('');
        setData(null);
        try {
            let result;
            if (tab === 'student') {
                if (!selectedStudent) throw new ApiError(400, t('يرجى اختيار الطالب'));
                result = await api.get(`/api/reports/student/${selectedStudent}`);
            } else if (tab === 'class') {
                if (!selectedClass) throw new ApiError(400, t('يرجى اختيار الصف'));
                result = await api.get(`/api/reports/class/${selectedClass}`);
            } else if (tab === 'attendance') {
                const params = new URLSearchParams({ from, to });
                if (selectedClass) params.set('class_id', selectedClass);
                result = await api.get(`/api/reports/attendance?${params}`);
            } else if (selectedStudent) {
                // A statement for one student: their own bills, not the school's.
                const finance = await api.get<any>(`/api/student/${selectedStudent}/finance`);
                result = { single: true, student: studentInfo, ...finance };
            } else {
                const params = new URLSearchParams();
                if (selectedClass) params.set('class_id', selectedClass);
                if (onlyDebtors) params.set('only_debtors', '1');
                result = await api.get(`/api/admin/finance/students?${params}`);
            }
            setData(result);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر إنشاء التقرير'));
        } finally {
            setLoading(false);
        }
    }, [tab, selectedStudent, studentInfo, selectedClass, onlyDebtors, from, to]);

    // A student only ever has one report to look at — load it straight away.
    useEffect(() => {
        if (user.role === 'student') run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user.role]);

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 print:hidden">
                <div>
                    <h2 className="text-lg font-black text-slate-800">{t('التقارير')}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">{t(isStaff(user.role) ? 'اعرض التقرير ثم اطبعه أو احفظه PDF' : 'اعرض التقرير على الشاشة')}</p>
                </div>
                {data && isStaff(user.role) && (
                    <button
                        onClick={() => window.print()}
                        className="bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0"
                    >
                        <Printer className="w-4 h-4" />
                        {t('طباعة')}
                    </button>
                )}
            </div>

            {user.role !== 'student' && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar print:hidden">
                    {TABS.filter((tab_) => isStaff(user.role) || tab_.key !== 'finance').map((tab_) => (
                        <button
                            key={tab_.key}
                            onClick={() => { setTab(tab_.key); setData(null); setError(''); }}
                            className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-colors ${
                                tab === tab_.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-100'
                            }`}
                        >
                            {t(tab_.label)}
                        </button>
                    ))}
                </div>
            )}

            {user.role !== 'student' && (
                <Card className="p-4 space-y-3 print:hidden">
                    <div className="grid md:grid-cols-3 gap-3">
                        {tab === 'student' && (
                            <div className="md:col-span-2">
                                <StudentPicker
                                    label={t('الطالب')}
                                    required
                                    value={selectedStudent}
                                    onChange={(id, student) => { setSelectedStudent(id); setStudentInfo(student); setData(null); }}
                                />
                            </div>
                        )}

                        {tab !== 'student' && (
                            <div>
                                <label className={labelClass}>الصف {tab === 'class' && <span className="text-red-500">*</span>}</label>
                                <select className={inputClass} value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                                    <option value="">{tab === 'class' ? t('-- اختر الصف --') : t('كل الصفوف')}</option>
                                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        )}

                        {tab === 'finance' && (
                            <div className="md:col-span-2">
                                <StudentPicker
                                    label={t('طالب محدد (اختياري)')}
                                    hint={t('اتركه فارغاً ليشمل الكشف كل الطلاب')}
                                    value={selectedStudent}
                                    onChange={(id, student) => { setSelectedStudent(id); setStudentInfo(student); setData(null); }}
                                />
                            </div>
                        )}

                        {tab === 'attendance' && (
                            <>
                                <div>
                                    <label className={labelClass}>{t('من تاريخ')}</label>
                                    <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
                                </div>
                                <div>
                                    <label className={labelClass}>{t('إلى تاريخ')}</label>
                                    <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
                                </div>
                            </>
                        )}
                    </div>

                    {tab === 'finance' && !selectedStudent && (
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={onlyDebtors}
                                onChange={(e) => { setOnlyDebtors(e.target.checked); setData(null); }}
                                className="w-4 h-4 accent-indigo-600"
                            />
                            {t('اعرض من عليهم مستحقات فقط')}
                        </label>
                    )}

                    <button
                        onClick={run}
                        disabled={loading}
                        className="w-full md:w-auto bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                        <FileBarChart className="w-4 h-4" />
                        {loading ? t('جاري الإنشاء...') : t('إنشاء التقرير')}
                    </button>
                </Card>
            )}

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
            {loading && <Spinner label={t('جاري تجميع البيانات')} />}

            {data && tab === 'student' && (
                <Sheet>
                    <SheetHeader title={t('كشف حال الطالب')} meta={data.student.class_name || undefined} />

                    <IdentityTable
                        rows={[
                            ['الاسم', data.student.name],
                            ['الصف', data.student.class_name || '—'],
                            ['الرقم الوطني', data.student.national_id || '—'],
                            ['اسم الأم', data.student.mother_name || '—'],
                            ['ولي الأمر', [data.student.guardian_name, data.student.guardian_phone].filter(Boolean).join(' — ') || '—'],
                        ]}
                    />

                    <div className="grid grid-cols-3 gap-3 mb-4 print-block">
                        {[
                            ['المعدل العام', data.grades.stats.overall_percentage === null ? '—' : `${data.grades.stats.overall_percentage}%`, 'text-indigo-700'],
                            ['نسبة الحضور', `${data.attendance.stats.rate}%`, 'text-emerald-700'],
                            ['المتبقي مالياً', formatMoney(data.finance.outstanding), data.finance.is_clear ? 'text-emerald-700' : 'text-rose-700'],
                        ].map(([label, value, tone]) => (
                            <div key={label} className="border border-slate-300 rounded-lg px-3 py-2 text-center">
                                <p className="text-[10px] font-bold text-slate-500">{t(label)}</p>
                                <p className={`text-base font-black mt-0.5 ${tone}`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    <Block
                        title={t('المعدل حسب المادة')}
                        note={`${t('عدد المواد')}: ${data.grades.stats.subjects.length}`}
                    >
                        {data.grades.stats.subjects.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا توجد درجات مسجلة')}</p>
                        ) : (
                            <Table
                                headers={['المادة', 'عدد التقييمات', 'المجموع', 'النسبة']}
                                rows={data.grades.stats.subjects.map((s: any) => [
                                    s.subject, s.count, `${s.earned}/${s.possible}`, `${s.percentage}%`,
                                ])}
                            />
                        )}
                    </Block>

                    <Block
                        title={t('الحضور والغياب')}
                        note={`${data.attendance.stats.total} ${t('يوم مسجّل')}`}
                    >
                        <Table
                            headers={['حاضر', 'غائب', 'متأخر', 'بعذر', 'النسبة']}
                            rows={[[
                                data.attendance.stats.present,
                                data.attendance.stats.absent,
                                data.attendance.stats.late,
                                data.attendance.stats.excused,
                                `${data.attendance.stats.rate}%`,
                            ]]}
                        />
                    </Block>

                    <Block
                        title={t('السلوك والملاحظات')}
                        note={`${t('درجة السلوك')} ${data.behavior.conduct_score}/100 · ${data.behavior.positive} ${t('إيجابية')} · ${data.behavior.negative} ${t('سلبية')}`}
                    >
                        {data.behavior.notes.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا توجد ملاحظات سلوكية')}</p>
                        ) : (
                            <Table
                                headers={['التاريخ', 'النوع', 'التصنيف', 'الملاحظة', 'النقاط', 'المسجّل']}
                                rows={data.behavior.notes.slice(0, BEHAVIOR_ROWS).map((n: any) => [
                                    n.date,
                                    n.type === 'positive' ? t('إيجابية') : t('سلبية'),
                                    n.category,
                                    <span key="title" className="whitespace-normal">{n.title}{n.description ? ` — ${n.description}` : ''}</span>,
                                    n.points > 0 ? `+${n.points}` : n.points,
                                    n.created_by_name || '—',
                                ])}
                            />
                        )}
                        {data.behavior.notes.length > BEHAVIOR_ROWS && (
                            <p className="text-[10px] text-slate-400 font-bold mt-1.5">
                                {t('يعرض أحدث {shown} ملاحظة من أصل {total}', {
                                    shown: BEHAVIOR_ROWS,
                                    total: data.behavior.notes.length,
                                })}
                            </p>
                        )}
                    </Block>

                    <SignatureBlock />
                </Sheet>
            )}

            {data && tab === 'class' && (
                <Sheet wide>
                    <SheetHeader title={t('كشف درجات صف')} meta={data.class.name} />
                    <Block
                        title={data.class.name}
                        note={`${data.students.length} ${t('طالب')} · ${t('معدل الصف')} ${data.class_average ?? '—'}%`}
                    >
                        {data.students.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا يوجد طلاب في هذا الصف')}</p>
                        ) : (
                            <Table
                                headers={['الطالب', ...data.subjects, 'المعدل', 'الحضور', 'المتبقي']}
                                rows={data.students.map((s: any) => [
                                    s.name,
                                    ...data.subjects.map((sub: string) =>
                                        s.subjects[sub] === null || s.subjects[sub] === undefined ? '—' : `${s.subjects[sub]}%`
                                    ),
                                    s.overall_percentage === null ? '—' : `${s.overall_percentage}%`,
                                    `${s.attendance.rate}%`,
                                    formatMoney(s.outstanding),
                                ])}
                            />
                        )}
                    </Block>
                    <SignatureBlock />
                </Sheet>
            )}

            {data && tab === 'attendance' && (
                <Sheet wide>
                    <SheetHeader title={t('كشف الغياب')} meta={`${data.from} — ${data.to}`} />
                    <Block title={t('ملخص الحضور')} note={`${t('من')} ${data.from} ${t('إلى')} ${data.to}`}>
                        {data.students.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا توجد سجلات حضور في هذه الفترة')}</p>
                        ) : (
                            <Table
                                headers={['الطالب', 'حاضر', 'غائب', 'متأخر', 'بعذر', 'النسبة', 'هاتف ولي الأمر']}
                                rows={data.students.map((s: any) => [
                                    s.name, s.present, s.absent, s.late, s.excused, `${s.rate}%`, s.guardian_phone || '—',
                                ])}
                            />
                        )}
                    </Block>
                    <SignatureBlock />
                </Sheet>
            )}

            {data && tab === 'finance' && data.single && (
                <Sheet>
                    <SheetHeader title={t('كشف ديون طالب')} meta={data.student?.class_name || undefined} />

                    <IdentityTable
                        rows={[
                            ['الاسم', data.student?.name || '—'],
                            ['الصف', data.student?.class_name || '—'],
                            ['الرقم الوطني', data.student?.national_id || '—'],
                        ]}
                    />

                    <div className="grid grid-cols-3 gap-3 mb-4 print-block">
                        {[
                            ['إجمالي المستحق', formatMoney(data.summary.total_billed), 'text-slate-800'],
                            ['المسدد', formatMoney(data.summary.total_paid), 'text-emerald-700'],
                            ['المتبقي', formatMoney(data.summary.outstanding), data.summary.is_clear ? 'text-emerald-700' : 'text-rose-700'],
                        ].map(([label, value, tone]) => (
                            <div key={label} className="border border-slate-300 rounded-lg px-3 py-2 text-center">
                                <p className="text-[10px] font-bold text-slate-500">{t(label)}</p>
                                <p className={`text-base font-black mt-0.5 ${tone}`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    {data.summary.overdue_count > 0 && (
                        <p className="text-[11px] font-black text-rose-700 border border-rose-200 bg-rose-50 rounded-lg px-3 py-2 mb-4 print-block">
                            {t('عليه {count} سند متأخر بقيمة {amount}', {
                                count: data.summary.overdue_count,
                                amount: formatMoney(data.summary.overdue_amount),
                            })}
                        </p>
                    )}

                    <Block title={t('السندات')} note={`${data.invoices.length} ${t('سند')}`}>
                        {data.invoices.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا توجد رسوم مسجلة على هذا الطالب')}</p>
                        ) : (
                            <Table
                                headers={['السند', 'النوع', 'الاستحقاق', 'المبلغ', 'المسدد', 'المتبقي', 'الحالة']}
                                rows={data.invoices.map((i: any) => [
                                    i.title, i.category || '—', i.due_date || '—',
                                    formatMoney(i.net_amount), formatMoney(i.paid_amount), formatMoney(i.remaining),
                                    t(STATUS_LABEL[i.status] || i.status),
                                ])}
                            />
                        )}
                    </Block>

                    <Block title={t('الدفعات المستلمة')} note={`${data.payments.length} ${t('دفعة')}`}>
                        {data.payments.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا توجد دفعات مسجلة')}</p>
                        ) : (
                            <Table
                                headers={['التاريخ', 'المبلغ', 'الطريقة', 'رقم الوصل', 'المستلم']}
                                rows={data.payments.slice(0, PAYMENT_ROWS).map((p: any) => [
                                    p.paid_at || '—', formatMoney(p.amount), p.method || '—',
                                    p.receipt_no || '—', p.recorded_by_name || '—',
                                ])}
                            />
                        )}
                    </Block>

                    <p className="text-[10px] text-slate-500 font-bold border-t border-slate-200 pt-2 print-block">
                        {t('هذا الكشف صادر عن إدارة المدرسة ولا يؤخذ به إلا مختوماً وموقّعاً.')}
                    </p>

                    <SignatureBlock finance />
                </Sheet>
            )}

            {data && tab === 'finance' && !data.single && (
                <Sheet wide>
                    <SheetHeader
                        title={t('كشف الديون')}
                        meta={selectedClass ? classes.find((c) => c.id === selectedClass)?.name : t('كل الصفوف')}
                    />
                    <Block
                        title={t('حالة السداد')}
                        note={`${data.totals?.debtors ?? 0} ${t('طالب عليه مستحقات')} · ${t('إجمالي المتبقي')} ${formatMoney(data.totals?.outstanding)}`}
                    >
                        {data.students.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 py-3">{t('لا يوجد طلاب مطابقون')}</p>
                        ) : (
                            <Table
                                headers={['الطالب', 'الصف', 'الرقم الوطني', 'الإجمالي', 'المسدد', 'المتبقي', 'الحالة']}
                                rows={data.students.map((s: any) => [
                                    s.name, s.class_name, s.national_id || '—',
                                    formatMoney(s.total_billed), formatMoney(s.total_paid), formatMoney(s.outstanding),
                                    t(s.payment_status),
                                ])}
                            />
                        )}
                    </Block>
                    <SignatureBlock finance />
                </Sheet>
            )}
        </div>
    );
};
