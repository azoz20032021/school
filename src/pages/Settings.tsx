import React, { useEffect, useState } from 'react';
import { KeyRound, ScrollText, ShieldCheck, User as UserIcon } from 'lucide-react';
import { AuditEntry, UserData } from '../types';
import { api, ApiError, formatDateTime } from '../lib/api';
import { isAdmin } from '../context/AuthContext';
import {
    Badge, Card, EmptyState, ErrorBanner, SectionTitle, Spinner, inputClass, labelClass,
} from '../components/ui';

const ACTION_LABEL: Record<string, string> = {
    login: 'تسجيل دخول',
    login_failed: 'محاولة دخول فاشلة',
    password_change: 'تغيير كلمة مرور',
    password_reset: 'إعادة تعيين كلمة مرور',
    create: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
    approve: 'موافقة',
    reject: 'رفض',
    enroll: 'تسجيل بصف',
    attendance: 'تسجيل حضور',
    broadcast: 'إشعار جماعي',
    payment: 'دفعة مالية',
};

const ACTION_TONE: Record<string, 'emerald' | 'rose' | 'amber' | 'indigo' | 'slate'> = {
    delete: 'rose',
    reject: 'rose',
    login_failed: 'rose',
    approve: 'emerald',
    payment: 'emerald',
    create: 'indigo',
    update: 'amber',
};

const ROLE_LABEL: Record<string, string> = {
    admin: 'مدير النظام',
    assistant_admin: 'مساعد إدارة',
    teacher: 'كادر تعليمي',
    student: 'طالب',
};

export const Settings: React.FC<{ user: UserData }> = ({ user }) => {
    const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState('');

    useEffect(() => {
        if (!isAdmin(user.role)) return;
        setAuditLoading(true);
        api.get<AuditEntry[]>('/api/admin/audit?limit=100')
            .then(setAudit)
            .catch((err) => setAuditError(err instanceof ApiError ? err.message : 'تعذر تحميل سجل العمليات'))
            .finally(() => setAuditLoading(false));
    }, [user.role]);

    const changePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (form.newPassword !== form.confirmPassword) {
            setError('كلمتا المرور الجديدتان غير متطابقتين');
            return;
        }

        setBusy(true);
        try {
            await api.post('/api/change-password', {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            });
            setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setMessage('تم تغيير كلمة المرور بنجاح');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'تعذر تغيير كلمة المرور');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-5" dir="rtl">
            <div>
                <h2 className="text-lg font-black text-slate-800">الإعدادات</h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">بيانات حسابك وأمانه</p>
            </div>

            <Card className="p-5">
                <SectionTitle title="حسابي" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        ['الاسم', user.name, UserIcon],
                        ['الرقم التعريفي', user.uid, ShieldCheck],
                        ['الصلاحية', ROLE_LABEL[user.role] || user.role, ShieldCheck],
                        ['الحالة', user.status === 'suspended' ? 'موقوف' : 'نشط', ShieldCheck],
                    ].map(([label, value]) => (
                        <div key={String(label)} className="bg-slate-50 rounded-2xl p-4">
                            <p className="text-[10px] text-slate-400 font-bold">{label}</p>
                            <p className="font-black text-slate-800 text-sm mt-1">{value}</p>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="p-5">
                <SectionTitle title="تغيير كلمة المرور" subtitle="8 أحرف على الأقل، وتحتوي على حروف وأرقام" />
                <form onSubmit={changePassword} className="space-y-3 max-w-md">
                    <div>
                        <label className={labelClass}>كلمة المرور الحالية</label>
                        <input
                            type="password" autoComplete="current-password" className={inputClass}
                            value={form.currentPassword}
                            onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>كلمة المرور الجديدة</label>
                        <input
                            type="password" autoComplete="new-password" className={inputClass}
                            value={form.newPassword}
                            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className={labelClass}>تأكيد كلمة المرور الجديدة</label>
                        <input
                            type="password" autoComplete="new-password" className={inputClass}
                            value={form.confirmPassword}
                            onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                            required
                        />
                    </div>

                    {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
                    {message && (
                        <p className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl p-3 text-xs font-bold">
                            {message}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center gap-1.5"
                    >
                        <KeyRound className="w-4 h-4" />
                        {busy ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
                    </button>
                </form>
            </Card>

            {isAdmin(user.role) && (
                <Card>
                    <div className="p-5 pb-0">
                        <SectionTitle
                            title="سجل العمليات"
                            subtitle="آخر 100 عملية على النظام — من فعلها ومتى"
                            action={<ScrollText className="w-4 h-4 text-slate-300" />}
                        />
                    </div>

                    {auditError && <div className="px-5 pb-5"><ErrorBanner message={auditError} /></div>}

                    {auditLoading ? (
                        <Spinner />
                    ) : audit.length === 0 ? (
                        <EmptyState message="لا توجد عمليات مسجلة بعد" />
                    ) : (
                        <div className="divide-y divide-slate-50 max-h-[32rem] overflow-y-auto">
                            {audit.map((entry) => (
                                <div key={entry.id} className="px-5 py-3.5 flex items-start gap-3">
                                    <Badge tone={ACTION_TONE[entry.action] || 'slate'}>
                                        {ACTION_LABEL[entry.action] || entry.action}
                                    </Badge>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 leading-relaxed">{entry.summary}</p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-1">
                                            {entry.actor_name} ({ROLE_LABEL[entry.actor_role] || entry.actor_role})
                                            {' · '}{formatDateTime(entry.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};
