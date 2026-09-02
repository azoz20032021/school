import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Eye, UserCheck, XCircle } from 'lucide-react';
import { ClassData, Registration, RegistrationStatus } from '../../types';
import { api, ApiError, formatDateTime } from '../../lib/api';
import {
    Badge, Card, EmptyState, ErrorBanner, Modal, Spinner, inputClass, labelClass,
} from '../../components/ui';
import { t } from '../../i18n';

const TABS: { key: RegistrationStatus; label: string; icon: React.ElementType }[] = [
    { key: 'pending', label: 'قيد المراجعة', icon: Clock },
    { key: 'approved', label: 'مقبولة', icon: CheckCircle2 },
    { key: 'rejected', label: 'مرفوضة', icon: XCircle },
];

const STATUS_BADGE = {
    pending: { tone: 'amber' as const, label: 'قيد المراجعة' },
    approved: { tone: 'emerald' as const, label: 'مقبول' },
    rejected: { tone: 'rose' as const, label: 'مرفوض' },
};

const DetailRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
    value ? (
        <div className="flex justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
            <span className="text-[11px] text-slate-400 font-bold shrink-0">{label}</span>
            <span className="text-xs text-slate-800 font-bold text-left">{value}</span>
        </div>
    ) : null;

export const Registrations: React.FC = () => {
    const [tab, setTab] = useState<RegistrationStatus>('pending');
    const [rows, setRows] = useState<Registration[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [viewing, setViewing] = useState<Registration | null>(null);
    const [decisionClass, setDecisionClass] = useState('');
    const [initialFee, setInitialFee] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [mode, setMode] = useState<'view' | 'reject'>('view');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (status: RegistrationStatus) => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get<{ data: Registration[]; nextCursor: string | null }>(`/api/admin/registrations?status=${status}`);
            const list = res?.data || (Array.isArray(res) ? res : []);
            setRows(list.filter((r) => !(r as any).archived));
            setNextCursor(res?.nextCursor || null);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر تحميل طلبات التسجيل'));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await api.get<{ data: Registration[]; nextCursor: string | null }>(`/api/admin/registrations?status=${tab}&after=${nextCursor}`);
            const list = res?.data || (Array.isArray(res) ? res : []);
            setRows((prev) => [...prev, ...list.filter((r) => !(r as any).archived)]);
            setNextCursor(res?.nextCursor || null);
        } catch {
            /* ignore */
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { load(tab); }, [tab, load]);
    useEffect(() => { api.get<ClassData[]>('/api/classes').then(setClasses).catch(() => {}); }, []);

    const openDetails = (row: Registration) => {
        setViewing(row);
        setMode('view');
        setDecisionClass(row.requested_class_id || '');
        setInitialFee('');
        setRejectReason('');
        setError('');
    };

    const approve = async () => {
        if (!viewing) return;
        if (!decisionClass) { setError(t('يرجى تحديد الصف الدراسي')); return; }

        setBusy(true);
        setError('');
        try {
            const res = await api.post<{ uid: string }>(`/api/admin/registrations/${viewing.id}/approve`, {
                class_id: decisionClass,
                initial_fee_amount: initialFee ? Number(initialFee) : 0,
            });
            setViewing(null);
            await load(tab);
            alert(t('تمت الموافقة بنجاح. الرقم التعريفي للطالب: {uid}', { uid: res.uid }));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر إتمام الموافقة'));
        } finally {
            setBusy(false);
        }
    };

    const reject = async () => {
        if (!viewing) return;
        if (rejectReason.trim().length < 3) { setError(t('يرجى كتابة سبب واضح للرفض')); return; }

        setBusy(true);
        setError('');
        try {
            await api.post(`/api/admin/registrations/${viewing.id}/reject`, { reason: rejectReason.trim() });
            setViewing(null);
            await load(tab);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر رفض الطلب'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div>
                <h2 className="text-lg font-black text-slate-800">{t('طلبات التسجيل')}</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {t('راجع بيانات الطالب، ثم وافق لإنشاء حسابه تلقائياً أو ارفض الطلب مع بيان السبب')}
                </p>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-colors ${
                            tab === key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border border-slate-100'
                        }`}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {t(label)}
                    </button>
                ))}
            </div>

            {error && !viewing && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            <Card>
                {loading ? (
                    <Spinner label={t('جاري تحميل الطلبات')} />
                ) : rows.length === 0 ? (
                    <EmptyState
                        message={tab === 'pending' ? t('لا توجد طلبات قيد المراجعة') : t('لا توجد طلبات في هذه القائمة')}
                        hint={tab === 'pending' ? t('ستظهر هنا فور تقديم الطلاب لطلباتهم') : undefined}
                    />
                ) : (
                    <div className="divide-y divide-slate-50">
                        {rows.map((row) => (
                            <button
                                key={row.id}
                                onClick={() => openDetails(row)}
                                className="w-full text-right p-4 hover:bg-slate-50/60 transition-colors flex items-center gap-3"
                            >
                                <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                                    <UserCheck className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="font-black text-slate-800 text-sm truncate">{row.full_name}</p>
                                        <Badge tone={STATUS_BADGE[row.status].tone}>{t(STATUS_BADGE[row.status].label)}</Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 truncate">
                                        {row.requested_class_name || t('بدون صف محدد')} · {row.tracking_code} · {formatDateTime(row.createdAt)}
                                    </p>
                                </div>
                                <Eye className="w-4 h-4 text-slate-300 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
                {!loading && nextCursor && (
                    <div className="p-4 border-t border-slate-50 text-center">
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="px-5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-black transition-all disabled:opacity-50"
                        >
                            {loadingMore ? t('جاري التحميل...') : t('تحميل المزيد')}
                        </button>
                    </div>
                )}
            </Card>

            <Modal
                open={Boolean(viewing)}
                onClose={() => setViewing(null)}
                title={viewing?.full_name || ''}
                subtitle={`رقم المتابعة ${viewing?.tracking_code || ''}`}
                wide
            >
                {viewing && (
                    <div className="space-y-5">
                        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                        <div className="grid md:grid-cols-2 gap-x-6">
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{t('البيانات الشخصية')}</p>
                                <DetailRow label={t('الاسم الرباعي')} value={viewing.full_name} />
                                <DetailRow label={t('اسم الأم')} value={viewing.mother_name} />
                                <DetailRow label={t('رقم البطاقة')} value={viewing.national_id} />
                                <DetailRow label={t('تاريخ الميلاد')} value={viewing.birth_date} />
                                <DetailRow label={t('محل الولادة')} value={viewing.birth_place} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 mt-4 md:mt-0">{t('التواصل وولي الأمر')}</p>
                                <DetailRow label={t('هاتف الطالب')} value={viewing.phone} />
                                <DetailRow label={t('البريد')} value={viewing.email} />
                                <DetailRow label={t('العنوان')} value={viewing.address} />
                                <DetailRow label={t('ولي الأمر')} value={viewing.guardian_name} />
                                <DetailRow label={t('هاتف ولي الأمر')} value={viewing.guardian_phone} />
                                <DetailRow label={t('صلة القرابة')} value={viewing.guardian_relation} />
                                <DetailRow label={t('مهنة ولي الأمر')} value={viewing.guardian_job} />
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{t('المعلومات الدراسية')}</p>
                            <DetailRow label={t('الصف المطلوب')} value={viewing.requested_class_name} />
                            <DetailRow label={t('المدرسة السابقة')} value={viewing.previous_school} />
                            <DetailRow label={t('آخر صف')} value={viewing.last_grade} />
                            <DetailRow label={t('المعدل السابق')} value={viewing.last_average} />
                            <DetailRow label={t('ملاحظات صحية')} value={viewing.health_notes} />
                            <DetailRow label={t('ملاحظات إضافية')} value={viewing.notes} />
                        </div>

                        {viewing.status === 'pending' && mode === 'view' && (
                            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                                <div>
                                    <label className={labelClass}>{t('الصف الذي سيُسجَّل فيه')} <span className="text-red-500">*</span></label>
                                    <select className={inputClass} value={decisionClass} onChange={(e) => setDecisionClass(e.target.value)}>
                                        <option value="">{t('-- اختر الصف --')}</option>
                                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>{t('القسط الدراسي الأولي (اختياري)')}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className={inputClass}
                                        value={initialFee}
                                        onChange={(e) => setInitialFee(e.target.value)}
                                        placeholder={t('مثال: 750000')}
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        {t('عند إدخال مبلغ سيتم إصدار سند رسوم للطالب مباشرة بعد الموافقة')}
                                    </p>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={approve}
                                        disabled={busy}
                                        className="flex-1 bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 disabled:opacity-60"
                                    >
                                        {busy ? t('جاري التنفيذ...') : t('موافقة وإنشاء الحساب')}
                                    </button>
                                    <button
                                        onClick={() => { setMode('reject'); setError(''); }}
                                        disabled={busy}
                                        className="px-5 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-60"
                                    >
                                        {t('رفض')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {viewing.status === 'pending' && mode === 'reject' && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-3">
                                <label className={labelClass}>{t('سبب الرفض (سيظهر للطالب)')} <span className="text-red-500">*</span></label>
                                <textarea
                                    rows={3}
                                    className={inputClass}
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder={t('مثال: المستمسكات غير مكتملة، يرجى مراجعة الإدارة')}
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={reject}
                                        disabled={busy}
                                        className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-bold disabled:opacity-60"
                                    >
                                        {busy ? t('جاري التنفيذ...') : t('تأكيد الرفض')}
                                    </button>
                                    <button
                                        onClick={() => setMode('view')}
                                        className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold"
                                    >
                                        {t('رجوع')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {viewing.status === 'approved' && (
                            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-center">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t('تمت الموافقة')}</p>
                                <p className="text-2xl font-black text-emerald-700 mt-1" dir="ltr">{viewing.assigned_uid}</p>
                                <p className="text-[11px] text-emerald-600 mt-1">
                                    بواسطة {viewing.reviewed_by_name} · {formatDateTime(viewing.reviewed_at)}
                                </p>
                            </div>
                        )}

                        {viewing.status === 'rejected' && (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                                <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">{t('سبب الرفض')}</p>
                                <p className="text-xs text-red-700 font-bold leading-relaxed">{viewing.rejection_reason}</p>
                                <p className="text-[11px] text-red-500 mt-2">
                                    بواسطة {viewing.reviewed_by_name} · {formatDateTime(viewing.reviewed_at)}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};
