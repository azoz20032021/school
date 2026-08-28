import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Banknote, CircleDollarSign, FileText, Phone, Plus, Receipt, Search, TrendingUp, Wallet,
} from 'lucide-react';
import { ClassData, Invoice, Payment, StudentFinanceRow } from '../../types';
import { api, ApiError, formatMoney } from '../../lib/api';
import { isAdmin, useAuth } from '../../context/AuthContext';
import {
    Badge, Card, EmptyState, ErrorBanner, Modal, SectionTitle, Spinner, StatCard, inputClass, labelClass,
} from '../../components/ui';

const CATEGORIES = ['قسط دراسي', 'رسوم تسجيل', 'كتب وقرطاسية', 'نقل مدرسي', 'زي مدرسي', 'نشاطات', 'أخرى'];
const METHODS = ['نقدي', 'تحويل بنكي', 'محفظة إلكترونية', 'شيك'];

const STATUS_VIEW: Record<string, { tone: 'emerald' | 'amber' | 'rose' | 'slate'; label: string }> = {
    paid: { tone: 'emerald', label: 'مسدد بالكامل' },
    partial: { tone: 'amber', label: 'مسدد جزئياً' },
    unpaid: { tone: 'rose', label: 'غير مسدد' },
    cancelled: { tone: 'slate', label: 'ملغى' },
};

interface Overview {
    total_billed: number;
    total_collected: number;
    outstanding: number;
    invoice_count: number;
    paid_invoices: number;
    overdue_invoices: number;
    students_with_dues: number;
    collection_rate: number;
}

export const Finance: React.FC = () => {
    const { user } = useAuth();
    const canDelete = isAdmin(user?.role);

    const [tab, setTab] = useState<'students' | 'invoices'>('students');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [students, setStudents] = useState<StudentFinanceRow[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [search, setSearch] = useState('');
    const [classFilter, setClassFilter] = useState('');
    const [onlyDebtors, setOnlyDebtors] = useState(false);

    const [showIssue, setShowIssue] = useState(false);
    const [issueForm, setIssueForm] = useState({
        target: 'class' as 'student' | 'class' | 'all',
        student_id: '',
        class_id: '',
        title: 'القسط الدراسي',
        category: 'قسط دراسي',
        amount: '',
        discount: '',
        due_date: '',
        term: '',
    });

    const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
    const [payForm, setPayForm] = useState({ amount: '', method: 'نقدي', paid_at: '', note: '' });
    const [invoicePayments, setInvoicePayments] = useState<Payment[]>([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [ov, st, inv, cls] = await Promise.all([
                api.get<Overview>('/api/admin/finance/summary'),
                api.get<{ students: StudentFinanceRow[] }>('/api/admin/finance/students'),
                api.get<Invoice[]>('/api/admin/invoices'),
                api.get<ClassData[]>('/api/classes'),
            ]);
            setOverview(ov);
            setStudents(st.students);
            setInvoices(inv);
            setClasses(cls);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر تحميل البيانات المالية');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const visibleStudents = useMemo(() => {
        const term = search.trim();
        return students.filter((s) => {
            if (onlyDebtors && s.is_clear) return false;
            if (classFilter && s.class_id !== classFilter) return false;
            if (!term) return true;
            return s.name.includes(term) || s.uid.includes(term);
        });
    }, [students, search, classFilter, onlyDebtors]);

    const visibleInvoices = useMemo(() => {
        const term = search.trim();
        return invoices.filter((i) => {
            if (classFilter && i.class_id !== classFilter) return false;
            if (onlyDebtors && (i.remaining ?? 0) <= 0) return false;
            if (!term) return true;
            return i.student_name?.includes(term) || i.student_uid?.includes(term) || i.title.includes(term);
        });
    }, [invoices, search, classFilter, onlyDebtors]);

    const issueInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await api.post<{ count: number }>('/api/admin/invoices', {
                ...issueForm,
                amount: Number(issueForm.amount),
                discount: issueForm.discount ? Number(issueForm.discount) : 0,
                due_date: issueForm.due_date || undefined,
                term: issueForm.term || undefined,
            });
            setShowIssue(false);
            setIssueForm((f) => ({ ...f, amount: '', discount: '', due_date: '' }));
            await load();
            alert(`تم إصدار الرسوم لعدد ${res.count} طالب`);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر إصدار الرسوم');
        } finally {
            setBusy(false);
        }
    };

    const openPayment = async (invoice: Invoice) => {
        setPayingInvoice(invoice);
        setPayForm({ amount: String(invoice.remaining ?? 0), method: 'نقدي', paid_at: '', note: '' });
        setInvoicePayments([]);
        setError('');
        try {
            setInvoicePayments(await api.get<Payment[]>(`/api/admin/invoices/${invoice.id}/payments`));
        } catch { /* the history is supplementary; the form still works */ }
    };

    const recordPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payingInvoice) return;
        setBusy(true);
        setError('');
        try {
            await api.post(`/api/admin/invoices/${payingInvoice.id}/payments`, {
                amount: Number(payForm.amount),
                method: payForm.method,
                paid_at: payForm.paid_at || undefined,
                note: payForm.note || undefined,
            });
            setPayingInvoice(null);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدفعة');
        } finally {
            setBusy(false);
        }
    };

    const reversePayment = async (paymentId: string) => {
        if (!confirm('هل أنت متأكد من إرجاع هذه الدفعة؟ سيتم تعديل رصيد السند.')) return;
        try {
            await api.del(`/api/admin/payments/${paymentId}`);
            if (payingInvoice) await openPayment(payingInvoice);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر إرجاع الدفعة');
        }
    };

    if (loading) return <div className="p-6"><Spinner label="جاري تحميل البيانات المالية" /></div>;

    return (
        <div className="p-4 md:p-6 space-y-4" dir="rtl">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">الإدارة المالية</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">الأقساط والرسوم وحالة السداد لكل طالب</p>
                </div>
                <button
                    onClick={() => setShowIssue(true)}
                    className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 flex items-center gap-1.5 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    إصدار رسوم
                </button>
            </div>

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            {overview && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        label="إجمالي المستحق"
                        value={formatMoney(overview.total_billed)}
                        tone="indigo"
                        icon={<FileText className="w-4 h-4 opacity-50" />}
                        hint={`${overview.invoice_count} سند`}
                    />
                    <StatCard
                        label="المحصّل"
                        value={formatMoney(overview.total_collected)}
                        tone="emerald"
                        icon={<TrendingUp className="w-4 h-4 opacity-50" />}
                        hint={`نسبة التحصيل ${overview.collection_rate}%`}
                    />
                    <StatCard
                        label="المتبقي"
                        value={formatMoney(overview.outstanding)}
                        tone="rose"
                        icon={<Wallet className="w-4 h-4 opacity-50" />}
                        hint={`${overview.students_with_dues} طالب عليه مستحقات`}
                    />
                    <StatCard
                        label="سندات متأخرة"
                        value={overview.overdue_invoices}
                        tone="amber"
                        icon={<CircleDollarSign className="w-4 h-4 opacity-50" />}
                        hint="تجاوزت تاريخ الاستحقاق"
                    />
                </div>
            )}

            <Card className="p-3 space-y-3">
                <div className="flex gap-2">
                    <button
                        onClick={() => setTab('students')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                            tab === 'students' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500'
                        }`}
                    >
                        حالة الطلاب
                    </button>
                    <button
                        onClick={() => setTab('invoices')}
                        className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${
                            tab === 'invoices' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500'
                        }`}
                    >
                        السندات
                    </button>
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={`${inputClass} pr-10`}
                            placeholder="ابحث بالاسم أو الرقم التعريفي"
                        />
                    </div>
                    <select className={`${inputClass} md:w-52`} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                        <option value="">كل الصفوف</option>
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                        onClick={() => setOnlyDebtors((v) => !v)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap border transition-colors ${
                            onlyDebtors ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'
                        }`}
                    >
                        المتبقي عليهم فقط
                    </button>
                </div>
            </Card>

            {tab === 'students' ? (
                <Card>
                    {visibleStudents.length === 0 ? (
                        <EmptyState message="لا يوجد طلاب مطابقون للبحث" />
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {visibleStudents.map((s) => (
                                <div key={s.student_id} className="p-4 flex items-center gap-3">
                                    <div
                                        className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                                            s.is_clear ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                        }`}
                                    >
                                        <Banknote className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-black text-slate-800 text-sm truncate">{s.name}</p>
                                            <Badge tone={s.is_clear ? 'emerald' : s.overdue_amount > 0 ? 'rose' : 'amber'}>
                                                {s.payment_status}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                            {s.uid} · {s.class_name}
                                        </p>
                                    </div>
                                    <div className="text-left shrink-0">
                                        <p className={`text-sm font-black ${s.is_clear ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {formatMoney(s.outstanding)}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold">
                                            من {formatMoney(s.total_billed)}
                                        </p>
                                        {s.guardian_phone && (
                                            <a
                                                href={`tel:${s.guardian_phone}`}
                                                className="text-[10px] text-indigo-500 font-bold inline-flex items-center gap-1 mt-1"
                                                dir="ltr"
                                            >
                                                <Phone className="w-3 h-3" />
                                                {s.guardian_phone}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            ) : (
                <Card>
                    {visibleInvoices.length === 0 ? (
                        <EmptyState message="لا توجد سندات مطابقة" hint="أصدر رسوماً جديدة من الزر بالأعلى" />
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {visibleInvoices.map((inv) => {
                                const view = STATUS_VIEW[inv.status] || STATUS_VIEW.unpaid;
                                return (
                                    <div key={inv.id} className="p-4 flex items-center gap-3">
                                        <div className="w-11 h-11 bg-slate-50 text-slate-500 rounded-2xl flex items-center justify-center shrink-0">
                                            <Receipt className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-slate-800 text-sm truncate">{inv.title}</p>
                                                <Badge tone={view.tone}>{view.label}</Badge>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                                                {inv.student_name} · {inv.student_uid}
                                                {inv.due_date && ` · استحقاق ${inv.due_date}`}
                                            </p>
                                        </div>
                                        <div className="text-left shrink-0">
                                            <p className="text-sm font-black text-slate-800">{formatMoney(inv.net_amount ?? inv.amount)}</p>
                                            <p className="text-[10px] text-rose-500 font-bold">متبقي {formatMoney(inv.remaining)}</p>
                                        </div>
                                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                            <button
                                                onClick={() => openPayment(inv)}
                                                className="bg-emerald-600 text-white text-[11px] font-black px-3 py-2 rounded-xl shrink-0"
                                            >
                                                تسديد
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {/* Issue fees */}
            <Modal open={showIssue} onClose={() => setShowIssue(false)} title="إصدار رسوم" subtitle="لطالب واحد أو صف كامل أو جميع الطلاب">
                <form onSubmit={issueInvoice} className="space-y-3">
                    <div>
                        <label className={labelClass}>الفئة المستهدفة</label>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { key: 'student', label: 'طالب' },
                                { key: 'class', label: 'صف كامل' },
                                { key: 'all', label: 'كل الطلاب' },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setIssueForm((f) => ({ ...f, target: key }))}
                                    className={`py-2.5 rounded-xl text-xs font-black border transition-colors ${
                                        issueForm.target === key
                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                            : 'bg-white text-slate-500 border-slate-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {issueForm.target === 'student' && (
                        <div>
                            <label className={labelClass}>الطالب <span className="text-red-500">*</span></label>
                            <select
                                className={inputClass}
                                value={issueForm.student_id}
                                onChange={(e) => setIssueForm((f) => ({ ...f, student_id: e.target.value }))}
                                required
                            >
                                <option value="">-- اختر الطالب --</option>
                                {students.map((s) => (
                                    <option key={s.student_id} value={s.student_id}>{s.name} — {s.uid}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {issueForm.target === 'class' && (
                        <div>
                            <label className={labelClass}>الصف <span className="text-red-500">*</span></label>
                            <select
                                className={inputClass}
                                value={issueForm.class_id}
                                onChange={(e) => setIssueForm((f) => ({ ...f, class_id: e.target.value }))}
                                required
                            >
                                <option value="">-- اختر الصف --</option>
                                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>العنوان <span className="text-red-500">*</span></label>
                            <input
                                className={inputClass}
                                value={issueForm.title}
                                onChange={(e) => setIssueForm((f) => ({ ...f, title: e.target.value }))}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>النوع</label>
                            <select
                                className={inputClass}
                                value={issueForm.category}
                                onChange={(e) => setIssueForm((f) => ({ ...f, category: e.target.value }))}
                            >
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>المبلغ (د.ع) <span className="text-red-500">*</span></label>
                            <input
                                type="number" min={1} className={inputClass} value={issueForm.amount}
                                onChange={(e) => setIssueForm((f) => ({ ...f, amount: e.target.value }))}
                                placeholder="750000" required
                            />
                        </div>
                        <div>
                            <label className={labelClass}>الخصم (اختياري)</label>
                            <input
                                type="number" min={0} className={inputClass} value={issueForm.discount}
                                onChange={(e) => setIssueForm((f) => ({ ...f, discount: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>تاريخ الاستحقاق</label>
                            <input
                                type="date" className={inputClass} value={issueForm.due_date}
                                onChange={(e) => setIssueForm((f) => ({ ...f, due_date: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>الفصل الدراسي</label>
                            <input
                                className={inputClass} value={issueForm.term}
                                onChange={(e) => setIssueForm((f) => ({ ...f, term: e.target.value }))}
                                placeholder="الفصل الأول"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60"
                    >
                        {busy ? 'جاري الإصدار...' : 'إصدار الرسوم'}
                    </button>
                </form>
            </Modal>

            {/* Record a payment */}
            <Modal
                open={Boolean(payingInvoice)}
                onClose={() => setPayingInvoice(null)}
                title="تسجيل دفعة"
                subtitle={payingInvoice ? `${payingInvoice.student_name} — ${payingInvoice.title}` : ''}
            >
                {payingInvoice && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">الإجمالي</p>
                                <p className="text-xs font-black text-slate-800 mt-1">{formatMoney(payingInvoice.net_amount ?? payingInvoice.amount)}</p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-emerald-500 uppercase">المسدد</p>
                                <p className="text-xs font-black text-emerald-700 mt-1">{formatMoney(payingInvoice.paid_amount)}</p>
                            </div>
                            <div className="bg-rose-50 rounded-xl p-3">
                                <p className="text-[9px] font-bold text-rose-500 uppercase">المتبقي</p>
                                <p className="text-xs font-black text-rose-700 mt-1">{formatMoney(payingInvoice.remaining)}</p>
                            </div>
                        </div>

                        <form onSubmit={recordPayment} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>المبلغ <span className="text-red-500">*</span></label>
                                    <input
                                        type="number" min={1} max={payingInvoice.remaining} className={inputClass}
                                        value={payForm.amount}
                                        onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>طريقة الدفع</label>
                                    <select
                                        className={inputClass} value={payForm.method}
                                        onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                                    >
                                        {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>تاريخ الدفع</label>
                                <input
                                    type="date" className={inputClass} value={payForm.paid_at}
                                    onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>ملاحظة</label>
                                <input
                                    className={inputClass} value={payForm.note}
                                    onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                                    placeholder="اسم الدافع، رقم الوصل الورقي..."
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={busy}
                                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 disabled:opacity-60"
                            >
                                {busy ? 'جاري الحفظ...' : 'تأكيد الدفعة'}
                            </button>
                        </form>

                        {invoicePayments.length > 0 && (
                            <div>
                                <SectionTitle title="الدفعات السابقة" />
                                <div className="space-y-2">
                                    {invoicePayments.map((p) => (
                                        <div key={p.id} className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-slate-800">{formatMoney(p.amount)}</p>
                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">
                                                    {p.paid_at} · {p.method} · {p.recorded_by_name}
                                                </p>
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-400" dir="ltr">{p.receipt_no}</span>
                                            {canDelete && (
                                                <button
                                                    onClick={() => reversePayment(p.id)}
                                                    className="text-[10px] font-black text-red-500 hover:underline shrink-0"
                                                >
                                                    إرجاع
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};
