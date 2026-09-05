import React, { useEffect, useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Modal, ErrorBanner, inputClass, labelClass } from './ui';
import { t } from '../i18n';

/**
 * The admin's editor for an account.
 *
 * Until this existed the only things the office could change about a student
 * after approval were a handful of contact fields, and a mistyped national ID
 * or date of birth meant deleting the account and re-creating it. The admin now
 * corrects any part of the record, including the login number and the password,
 * from one place. An assistant sees the same form with the identity fields
 * locked, because those are what every printed document is built on.
 */

type Kind = 'student' | 'teacher';

interface FieldSpec {
    key: string;
    label: string;
    type?: 'text' | 'date' | 'tel' | 'email' | 'textarea';
    /** Only a full admin may change it. */
    adminOnly?: boolean;
    hint?: string;
}

const STUDENT_FIELDS: FieldSpec[] = [
    { key: 'name', label: 'الاسم الرباعي' },
    { key: 'mother_name', label: 'اسم الأم', adminOnly: true },
    { key: 'national_id', label: 'الرقم الوطني', adminOnly: true },
    { key: 'birth_date', label: 'تاريخ الميلاد', type: 'date', adminOnly: true },
    { key: 'birth_place', label: 'محل الولادة', adminOnly: true },
    { key: 'uid', label: 'الرقم التعريفي (للدخول)', adminOnly: true, hint: 'تغييره يغيّر اسم الدخول أيضاً' },
    { key: 'phone', label: 'هاتف الطالب', type: 'tel' },
    { key: 'email', label: 'البريد الإلكتروني', type: 'email' },
    { key: 'address', label: 'العنوان' },
    { key: 'guardian_name', label: 'اسم ولي الأمر' },
    { key: 'guardian_phone', label: 'هاتف ولي الأمر', type: 'tel' },
    { key: 'guardian_relation', label: 'صلة القرابة' },
    { key: 'guardian_job', label: 'مهنة ولي الأمر' },
    { key: 'previous_school', label: 'المدرسة السابقة', adminOnly: true },
    { key: 'health_notes', label: 'ملاحظات صحية', type: 'textarea' },
    { key: 'notes', label: 'ملاحظات إدارية', type: 'textarea', adminOnly: true },
];

const TEACHER_FIELDS: FieldSpec[] = [
    { key: 'name', label: 'الاسم الرباعي' },
    { key: 'mother_name', label: 'اسم الأم' },
    { key: 'national_id', label: 'الرقم الوطني' },
    { key: 'birth_date', label: 'تاريخ الميلاد', type: 'date' },
    { key: 'uid', label: 'الرقم التعريفي (للدخول)', hint: 'تغييره يغيّر اسم الدخول أيضاً' },
    { key: 'subjects', label: 'المواد', hint: 'افصل بين المواد بفاصلة' },
    { key: 'qualification', label: 'التحصيل الدراسي' },
    { key: 'experience_years', label: 'سنوات الخبرة' },
    { key: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { key: 'email', label: 'البريد الإلكتروني', type: 'email' },
    { key: 'address', label: 'العنوان' },
];

export const EditUserModal: React.FC<{
    open: boolean;
    onClose: () => void;
    /** The account being edited; only `id` is required to be accurate. */
    user: Record<string, any> | null;
    kind: Kind;
    /** Full admins may edit identity fields and set a password. */
    isAdmin: boolean;
    onSaved: () => void;
}> = ({ open, onClose, user, kind, isAdmin, onSaved }) => {
    const fields = kind === 'student' ? STUDENT_FIELDS : TEACHER_FIELDS;

    const [form, setForm] = useState<Record<string, string>>({});
    const [status, setStatus] = useState('active');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // Reload the form whenever a different account is opened.
    useEffect(() => {
        if (!user) return;
        const next: Record<string, string> = {};
        for (const f of fields) {
            const value = user[f.key];
            next[f.key] = Array.isArray(value) ? value.join('، ') : String(value ?? '');
        }
        setForm(next);
        setStatus(user.status || 'active');
        setPassword('');
        setError('');
    }, [user, kind]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user) return null;

    const set = (key: string) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const payload: Record<string, any> = { status };
            for (const f of fields) {
                if (f.adminOnly && !isAdmin) continue;
                const value = (form[f.key] ?? '').trim();
                // Sending an untouched empty optional field would be a no-op
                // write; sending a cleared one is a deliberate erase.
                if (value === '' && !user[f.key]) continue;
                payload[f.key] = f.key === 'subjects'
                    ? value.split(/[,،]/).map((s) => s.trim()).filter(Boolean)
                    : value;
            }

            const endpoint = kind === 'student' ? 'students' : 'teachers';
            await api.put(`/api/admin/${endpoint}/${user.id}`, payload);

            if (isAdmin && password.trim()) {
                await api.post(`/api/admin/users/${user.id}/reset-password`, {
                    new_password: password.trim(),
                });
            }

            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر حفظ التعديلات'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={t('تعديل بيانات الحساب')}
            subtitle={`${user.name || ''} — ${user.uid || ''}`}
            wide
        >
            <form onSubmit={save} className="space-y-3">
                {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

                <div className="grid md:grid-cols-2 gap-3">
                    {fields.map((f) => {
                        const locked = Boolean(f.adminOnly) && !isAdmin;
                        return (
                            <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                                <label className={labelClass}>
                                    {t(f.label)}
                                    {locked && <span className="text-slate-400 font-medium"> — {t('للمدير فقط')}</span>}
                                </label>
                                {f.type === 'textarea' ? (
                                    <textarea
                                        rows={2}
                                        className={inputClass}
                                        value={form[f.key] ?? ''}
                                        onChange={set(f.key)}
                                        disabled={locked}
                                    />
                                ) : (
                                    <input
                                        type={f.type === 'date' ? 'date' : 'text'}
                                        dir={f.type === 'tel' || f.type === 'email' ? 'ltr' : undefined}
                                        className={inputClass}
                                        value={form[f.key] ?? ''}
                                        onChange={set(f.key)}
                                        disabled={locked}
                                    />
                                )}
                                {f.hint && !locked && <p className="text-[10px] text-slate-400 mt-1">{t(f.hint)}</p>}
                            </div>
                        );
                    })}

                    <div>
                        <label className={labelClass}>{t('حالة الحساب')}</label>
                        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                            <option value="active">{t('فعّال')}</option>
                            <option value="suspended">{t('موقوف')}</option>
                        </select>
                    </div>
                </div>

                {isAdmin && (
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                        <label className={`${labelClass} flex items-center gap-1.5`}>
                            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                            {t('كلمة مرور جديدة (اختياري)')}
                        </label>
                        <input
                            type="text"
                            autoComplete="off"
                            className={inputClass}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('اتركه فارغاً للإبقاء على كلمة المرور الحالية')}
                        />
                        <p className="text-[10px] text-amber-700 mt-1 font-bold">
                            {t('سيصل إشعار لصاحب الحساب بأن الإدارة غيّرت كلمة المرور.')}
                        </p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                    <Save className="w-4 h-4" />
                    {busy ? t('جاري الحفظ...') : t('حفظ التعديلات')}
                </button>
            </form>
        </Modal>
    );
};
