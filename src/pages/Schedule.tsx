import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, User } from 'lucide-react';
import { UserData, ClassData } from '../types';
import { api, ApiError } from '../lib/api';
import { isStaff } from '../context/AuthContext';
import { Card, ErrorBanner, Modal, Spinner, inputClass, labelClass } from '../components/ui';
import { t } from '../i18n';

/**
 * The weekly timetable, as a timetable.
 *
 * It used to be a day picker over a list of cards: to see Tuesday you left
 * Monday, and nobody could look at the week at once — which is the entire point
 * of a school timetable. It is now a grid of periods against days. Staff fill an
 * empty cell by tapping it, and teachers and students read the same grid, with a
 * teacher's own lessons highlighted.
 */

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

/** The school's standard periods. Any other time already in the data is added. */
const PERIODS = [
    { label: 'الحصة الأولى', time: '08:00' },
    { label: 'الحصة الثانية', time: '08:45' },
    { label: 'الحصة الثالثة', time: '09:30' },
    { label: 'الحصة الرابعة', time: '10:30' },
    { label: 'الحصة الخامسة', time: '11:15' },
    { label: 'الحصة السادسة', time: '12:00' },
    { label: 'الحصة السابعة', time: '12:45' },
];

const FALLBACK_SUBJECTS = [
    'الرياضيات', 'اللغة العربية', 'اللغة الإنجليزية', 'الأحياء', 'الفيزياء',
    'الكيمياء', 'الحاسوب', 'التاريخ', 'الجغرافيا', 'الفنية', 'الرياضة',
];

interface Session {
    id: string;
    class_id: string;
    day: string;
    time: string;
    subject: string;
    teacher?: string;
    room?: string;
}

/** Cell colours cycle by subject so the same lesson looks the same all week. */
const TONES = [
    'bg-indigo-50 border-indigo-100 text-indigo-900',
    'bg-emerald-50 border-emerald-100 text-emerald-900',
    'bg-amber-50 border-amber-100 text-amber-900',
    'bg-rose-50 border-rose-100 text-rose-900',
    'bg-cyan-50 border-cyan-100 text-cyan-900',
    'bg-purple-50 border-purple-100 text-purple-900',
];

function toneFor(subject: string): string {
    let sum = 0;
    for (const ch of subject) sum += ch.charCodeAt(0);
    return TONES[sum % TONES.length];
}

export const Schedule: React.FC<{ user: UserData }> = ({ user }) => {
    const canEdit = isStaff(user.role);

    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState('');
    const [sessions, setSessions] = useState<Session[]>([]);
    const [subjects, setSubjects] = useState<string[]>(FALLBACK_SUBJECTS);
    const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    /** The slot being filled: which day and which period. */
    const [slot, setSlot] = useState<{ day: string; time: string } | null>(null);
    const [form, setForm] = useState({ subject: '', teacher: '', room: '' });

    const loadSessions = useCallback(async (classId: string) => {
        if (!classId) { setSessions([]); return; }
        try {
            setSessions(await api.get<Session[]>(`/api/schedules/${classId}`));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر تحميل الجدول'));
            setSessions([]);
        }
    }, []);

    useEffect(() => {
        const endpoint = canEdit
            ? '/api/classes'
            : user.role === 'teacher'
                ? `/api/teacher/classes/${user.id}`
                : `/api/student/classes/${user.id}`;

        api.get<ClassData[]>(endpoint)
            .then(async (list) => {
                setClasses(list);
                if (list.length > 0) {
                    setSelectedClassId(list[0].id);
                    await loadSessions(list[0].id);
                }
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('تعذر تحميل الصفوف')))
            .finally(() => setLoading(false));

        api.get<{ name: string }[]>('/api/subjects')
            .then((list) => {
                const names = list.map((s) => s.name).filter(Boolean);
                if (names.length > 0) setSubjects(names);
            })
            .catch(() => { /* the built-in list still works */ });

        if (canEdit) {
            api.get<{ data: { id: string; name: string }[] }>('/api/admin/teachers?limit=100')
                .then((res) => setTeachers(res?.data || []))
                .catch(() => setTeachers([]));
        }
    }, [user.id, user.role, canEdit, loadSessions]);

    /**
     * Rows are the standard periods plus any other time already saved, so a
     * lesson entered before this grid existed still has somewhere to appear.
     */
    const rows = useMemo(() => {
        const known = new Set<string>(PERIODS.map((p) => p.time));
        const seen = new Set<string>(sessions.map((s) => String(s.time)));
        const extras = [...seen]
            .filter((time) => !known.has(time))
            .sort()
            .map((time) => ({ label: '', time }));
        return [...PERIODS, ...extras];
    }, [sessions]);

    const bySlot = useMemo(() => {
        const map = new Map<string, Session>();
        for (const s of sessions) map.set(`${s.day}|${s.time}`, s);
        return map;
    }, [sessions]);

    const openSlot = (day: string, time: string) => {
        setSlot({ day, time });
        setForm({ subject: subjects[0] || '', teacher: '', room: '' });
        setError('');
    };

    const saveSession = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!slot) return;
        setBusy(true);
        setError('');
        try {
            await api.post('/api/admin/schedules', {
                class_id: selectedClassId,
                day: slot.day,
                time: slot.time,
                subject: form.subject,
                teacher: form.teacher || undefined,
                room: form.room || undefined,
            });
            setSlot(null);
            await loadSessions(selectedClassId);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر إضافة الحصة'));
        } finally {
            setBusy(false);
        }
    };

    const removeSession = async (id: string) => {
        if (!confirm(t('حذف هذه الحصة من الجدول؟'))) return;
        try {
            await api.del(`/api/admin/schedules/${id}`);
            await loadSessions(selectedClassId);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر حذف الحصة'));
        }
    };

    if (loading) return <div className="p-6"><Spinner label={t('جاري تحميل الجدول')} /></div>;

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 print:hidden">
                <div>
                    <h2 className="text-lg font-black text-slate-800">{t('الجدول الأسبوعي')}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {canEdit ? t('اضغط على أي خانة فارغة لإضافة درس') : t('جدول الحصص لكامل الأسبوع')}
                    </p>
                </div>
                {classes.length > 1 && (
                    <select
                        className={`${inputClass} w-auto min-w-40 shrink-0`}
                        value={selectedClassId}
                        onChange={(e) => { setSelectedClassId(e.target.value); loadSessions(e.target.value); }}
                    >
                        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                )}
            </div>

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            {classes.length === 0 ? (
                <Card className="p-10 text-center">
                    <Calendar className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                    <p className="text-sm font-bold text-slate-400">{t('لا يوجد صف مرتبط بحسابك بعد')}</p>
                </Card>
            ) : (
                <Card className="p-2 md:p-4 overflow-x-auto">
                    <table className="w-full border-collapse min-w-[680px]">
                        <thead>
                            <tr>
                                <th className="w-28 text-[10px] font-black text-slate-400 p-2 text-right">{t('الحصة')}</th>
                                {DAYS.map((day) => (
                                    <th key={day} className="text-xs font-black text-slate-700 bg-slate-50 border border-slate-100 rounded-t-xl p-2">
                                        {t(day)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((period) => (
                                <tr key={period.time}>
                                    <th className="text-right align-top p-2 border-t border-slate-50">
                                        <p className="text-[11px] font-black text-slate-700">{period.label ? t(period.label) : period.time}</p>
                                        <p className="text-[10px] text-slate-400 font-bold" dir="ltr">{period.time}</p>
                                    </th>

                                    {DAYS.map((day) => {
                                        const session = bySlot.get(`${day}|${period.time}`);
                                        const mine = session && user.role === 'teacher' && session.teacher === user.name;

                                        if (!session) {
                                            return (
                                                <td key={day} className="p-1 align-top">
                                                    {canEdit ? (
                                                        <button
                                                            onClick={() => openSlot(day, period.time)}
                                                            className="w-full h-16 rounded-xl border border-dashed border-slate-200 text-slate-300 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/40 transition-colors flex items-center justify-center"
                                                            aria-label={t('إضافة درس')}
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <div className="w-full h-16 rounded-xl border border-dashed border-slate-100" />
                                                    )}
                                                </td>
                                            );
                                        }

                                        return (
                                            <td key={day} className="p-1 align-top">
                                                <div
                                                    className={`w-full h-16 rounded-xl border px-2 py-1.5 flex flex-col justify-center relative group ${toneFor(session.subject)} ${
                                                        mine ? 'ring-2 ring-indigo-400' : ''
                                                    }`}
                                                >
                                                    <p className="text-[11px] font-black truncate">{session.subject}</p>
                                                    {session.teacher && (
                                                        <p className="text-[9px] font-bold opacity-70 truncate flex items-center gap-0.5">
                                                            <User className="w-2.5 h-2.5 shrink-0" />
                                                            {session.teacher}
                                                        </p>
                                                    )}
                                                    {session.room && (
                                                        <p className="text-[9px] font-bold opacity-60 truncate">{session.room}</p>
                                                    )}
                                                    {canEdit && (
                                                        <button
                                                            onClick={() => removeSession(session.id)}
                                                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-600"
                                                            aria-label={t('حذف الحصة')}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <Modal
                open={Boolean(slot)}
                onClose={() => setSlot(null)}
                title={t('إضافة درس')}
                subtitle={slot ? `${t(slot.day)} — ${slot.time}` : ''}
            >
                <form onSubmit={saveSession} className="space-y-3">
                    <div>
                        <label className={labelClass}>{t('المادة')} <span className="text-red-500">*</span></label>
                        <select
                            className={inputClass}
                            value={form.subject}
                            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                            required
                        >
                            <option value="">{t('-- اختر المادة --')}</option>
                            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>{t('المعلم')}</label>
                        <select
                            className={inputClass}
                            value={form.teacher}
                            onChange={(e) => setForm((f) => ({ ...f, teacher: e.target.value }))}
                        >
                            <option value="">{t('-- اختر المعلم --')}</option>
                            {teachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.name}>{teacher.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>{t('القاعة')}</label>
                        <input
                            className={inputClass}
                            value={form.room}
                            onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                            placeholder={t('مثال: قاعة 1')}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60"
                    >
                        {busy ? t('جاري الحفظ...') : t('حفظ في الجدول')}
                    </button>
                </form>
            </Modal>
        </div>
    );
};
