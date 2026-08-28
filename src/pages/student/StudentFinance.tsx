import React, { useEffect, useState } from 'react';
import { CheckCircle2, Receipt, Wallet } from 'lucide-react';
import { UserData, Invoice, Payment, FinanceSummary } from '../../types';
import { api, ApiError, formatMoney } from '../../lib/api';
import { Badge, Card, EmptyState, ErrorBanner, SectionTitle, Spinner, StatCard } from '../../components/ui';
import { t } from '../../i18n';

interface FinancePayload {
    summary: FinanceSummary;
    invoices: Invoice[];
    payments: Payment[];
}

const STATUS_VIEW: Record<string, { tone: 'emerald' | 'amber' | 'rose' | 'slate'; label: string }> = {
    paid: { tone: 'emerald', label: 'مسدد' },
    partial: { tone: 'amber', label: 'مسدد جزئياً' },
    unpaid: { tone: 'rose', label: 'غير مسدد' },
    cancelled: { tone: 'slate', label: 'ملغى' },
};

export const StudentFinance: React.FC<{ user: UserData }> = ({ user }) => {
    const [data, setData] = useState<FinancePayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        api.get<FinancePayload>(`/api/student/${user.id}/finance`)
            .then((res) => { if (!cancelled) setData(res); })
            .catch((err) => {
                if (!cancelled) setError(err instanceof ApiError ? err.message : t('تعذر تحميل البيانات المالية'));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user.id]);

    if (loading) return <div className="p-6"><Spinner label={t('جاري تحميل حسابك المالي')} /></div>;
    if (error) return <div className="p-6"><ErrorBanner message={error} /></div>;
    if (!data) return null;

    const { summary, invoices, payments } = data;
    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div
                className={`rounded-3xl p-6 text-white shadow-xl relative overflow-hidden ${
                    summary.is_clear ? 'bg-emerald-600 shadow-emerald-100' : 'bg-rose-600 shadow-rose-100'
                }`}
            >
                <div className="relative z-10">
                    <p className="text-white/70 text-[10px] uppercase tracking-widest font-bold mb-1">
                        {summary.is_clear ? t('حالة الحساب') : t('المبلغ المتبقي عليك')}
                    </p>
                    <h3 className="text-3xl font-black">
                        {summary.is_clear ? t('لا توجد مستحقات') : formatMoney(summary.outstanding)}
                    </h3>
                    <div className="mt-4 flex gap-2 flex-wrap">
                        <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold">
                            إجمالي الرسوم {formatMoney(summary.total_billed)}
                        </div>
                        <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold">
                            المسدد {formatMoney(summary.total_paid)}
                        </div>
                    </div>
                    {summary.overdue_count > 0 && (
                        <p className="mt-3 text-[11px] font-bold bg-white/25 inline-block px-3 py-1.5 rounded-xl">
                            لديك {summary.overdue_count} سند متأخر بقيمة {formatMoney(summary.overdue_amount)}
                        </p>
                    )}
                </div>
                <div className="absolute -left-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-2xl" />
            </div>

            <div className="grid grid-cols-3 gap-3">
                <StatCard label={t('عدد السندات')} value={invoices.filter((i) => i.status !== 'cancelled').length} tone="indigo" />
                <StatCard label={t('مسددة')} value={invoices.filter((i) => i.status === 'paid').length} tone="emerald" />
                <StatCard label={t('دفعاتي')} value={payments.length} tone="slate" />
            </div>

            <div>
                <SectionTitle title={t('الرسوم المستحقة')} subtitle={t('تفاصيل كل سند وحالة سداده')} />
                <Card>
                    {invoices.length === 0 ? (
                        <EmptyState message={t('لا توجد رسوم مسجلة على حسابك')} />
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {invoices.map((inv) => {
                                const view = STATUS_VIEW[inv.status] || STATUS_VIEW.unpaid;
                                const overdue = inv.due_date && inv.due_date < today && (inv.remaining ?? 0) > 0;
                                return (
                                    <div key={inv.id} className="p-4 flex items-center gap-3">
                                        <div
                                            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                                                inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
                                            }`}
                                        >
                                            {inv.status === 'paid' ? <CheckCircle2 className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-black text-slate-800 text-sm truncate">{inv.title}</p>
                                                <Badge tone={view.tone}>{t(view.label)}</Badge>
                                                {overdue && <Badge tone="rose">{t('متأخر')}</Badge>}
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                {inv.category}
                                                {inv.due_date && ` · الاستحقاق ${inv.due_date}`}
                                            </p>
                                        </div>
                                        <div className="text-left shrink-0">
                                            <p className="text-sm font-black text-slate-800">
                                                {formatMoney(inv.net_amount ?? inv.amount)}
                                            </p>
                                            {(inv.remaining ?? 0) > 0 && (
                                                <p className="text-[10px] text-rose-500 font-bold">
                                                    متبقي {formatMoney(inv.remaining)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>

            <div>
                <SectionTitle title={t('سجل الدفعات')} subtitle={t('كل مبلغ استلمته الإدارة منك')} />
                <Card>
                    {payments.length === 0 ? (
                        <EmptyState message={t('لم يتم تسجيل أي دفعة بعد')} />
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {payments.map((p) => (
                                <div key={p.id} className="p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                                        <Wallet className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-800">{formatMoney(p.amount)}</p>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                                            {p.invoice_title} · {p.paid_at} · {p.method}
                                        </p>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-300 shrink-0" dir="ltr">{p.receipt_no}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};
