import React, { useCallback, useEffect, useState } from 'react';
import { BookMarked, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { ClassData, UserData } from '../types';
import { api, ApiError, formatDate } from '../lib/api';
import { isStaff } from '../context/AuthContext';
import {
    Badge, Card, EmptyState, ErrorBanner, Modal, Spinner, inputClass, labelClass,
} from '../components/ui';
import { t } from '../i18n';

/**
 * Homework.
 *
 * A teacher sets an assignment for one of their classes and every student in it
 * is notified; the students see everything set for them, newest first, with
 * anything still due highlighted.
 */

interface Assignment {
    id: string;
    class_id: string;
    class_name: string;
    subject: string;
    title: string;
    description?: string;
    due_date?: string | null;
    created_by: string;
    created_by_name: string;
    createdAt?: unknown;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Days left until the due date; negative once it has passed. */
function daysLeft(due?: string | null): number | null {
    if (!due) return null;
    const diff = new Date(due).getTime() - new Date(today()).getTime();
    return Math.round(diff / 86_400_000);
}

const AssignmentCard: React.FC<{
    row: Assignment;
    canDelete: boolean;
    onDelete: (id: string) => void;
}> = ({ row, canDelete, onDelete }) => {
    const left = daysLeft(row.due_date);
    const overdue = left !== null && left < 0;

    return (
        <div className="p-4 flex items-start gap-3">
            <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    overdue ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'
                }`}
            >
                <BookMarked className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-slate-800 text-sm">{row.title}</p>
                    <Badge tone="slate">{row.subject}</Badge>
                    {left !== null && (
                        <Badge tone={overdue ? 'slate' : left <= 1 ? 'rose' : left <= 3 ? 'amber' : 'emerald'}>
                            {overdue
                                ? t('انتهى موعد التسليم')
                                : left === 0
                                    ? t('التسليم اليوم')
                                    : t('باقٍ {days} يوم', { days: left })}
                        </Badge>
                    )}
                </div>

                {row.description && (
                    <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed whitespace-pre-wrap">
                        {row.description}
                    </p>
                )}

                <p className="text-[10px] text-slate-400 font-bold mt-1.5 flex items-center gap-1 flex-wrap">
                    <CalendarClock className="w-3 h-3" />
                    {row.due_date ? `${t('التسليم')} ${row.due_date}` : t('بدون موعد تسليم')}
                    <span>·</span>
                    {row.class_name}
                    <span>·</span>
                    {row.created_by_name}
                    <span>·</span>
                    {formatDate(row.createdAt)}
                </p>
            </div>

            {canDelete && (
                <button
                    onClick={() => onDelete(row.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                    aria-label={t('حذف الواجب')}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};

export const Homework: React.FC<{ user: UserData }> = ({ user }) => {
    const isStudent = user.role === 'student';
    const canAdd = !isStudent;

    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [rows, setRows] = useState<Assignment[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [showAdd, setShowAdd] = useState(false);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ subject: '', title: '', description: '', due_date: '' });

    const loadClassHomework = useCallback(async (classId: string) => {
        if (!classId) { setRows([]); return; }
        const res = await api.get<{ data: Assignment[]; nextCursor: string | null }>(
            `/api/class/${classId}/homework`
        );
        setRows(res?.data || []);
        setNextCursor(res?.nextCursor || null);
    }, []);

    useEffect(() => {
        if (isStudent) {
            api.get<Assignment[]>(`/api/student/${user.id}/homework`)
                .then((list) => setRows(Array.isArray(list) ? list : []))
                .catch((err) => setError(err instanceof ApiError ? err.message : t('تعذر تحميل الواجبات')))
                .finally(() => setLoading(false));
            return;
        }

        const endpoint = isStaff(user.role) ? '/api/classes' : `/api/teacher/classes/${user.id}`;
        api.get<ClassData[]>(endpoint)
            .then(async (list) => {
                setClasses(list);
                if (list.length > 0) {
                    setSelectedClass(list[0].id);
                    await loadClassHomework(list[0].id);
                }
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('تعذر تحميل الصفوف')))
            .finally(() => setLoading(false));

        api.get<{ name: string }[]>('/api/subjects')
            .then((list) => setSubjects(list.map((s) => s.name).filter(Boolean)))
            .catch(() => setSubjects([]));
    }, [user.id, user.role, isStudent, loadClassHomework]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await api.get<{ data: Assignment[]; nextCursor: string | null }>(
                `/api/class/${selectedClass}/homework?after=${nextCursor}`
            );
            setRows((prev) => [...prev, ...(res?.data || [])]);
            setNextCursor(res?.nextCursor || null);
        } catch {
            /* ignore */
        } finally {
            setLoadingMore(false);
        }
    };

    const changeClass = async (classId: string) => {
        setSelectedClass(classId);
        setError('');
        try {
            await loadClassHomework(classId);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر تحميل الواجبات'));
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            const res = await api.post<{ notified: number }>('/api/homework', {
                class_id: selectedClass,
                subject: form.subject,
                title: form.title,
                description: form.description || undefined,
                due_date: form.due_date || undefined,
            });
            setShowAdd(false);
            setForm({ subject: form.subject, title: '', description: '', due_date: '' });
            await loadClassHomework(selectedClass);
            alert(t('تم نشر الواجب وإشعار {count} طالب', { count: res.notified }));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر إضافة الواجب'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm(t('حذف هذا الواجب؟'))) return;
        try {
            await api.del(`/api/homework/${id}`);
            setRows((prev) => prev.filter((r) => r.id !== id));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر حذف الواجب'));
        }
    };

    if (loading) return <div className="p-6"><Spinner label={t('جاري تحميل الواجبات')} /></div>;

    // The subject list falls back to whatever this teacher is registered to teach.
    const subjectOptions = subjects.length > 0 ? subjects : (user.subjects || []);

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">{t('الواجبات')}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {isStudent ? t('واجباتك المطلوبة مرتبة من الأحدث') : t('أضف واجباً لصفك وسيصل إشعار لكل طلابه')}
                    </p>
                </div>
                {canAdd && classes.length > 0 && (
                    <button
                        onClick={() => { setShowAdd(true); setError(''); }}
                        className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 flex items-center gap-1.5 shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        {t('إضافة واجب')}
                    </button>
                )}
            </div>

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            {canAdd && classes.length > 1 && (
                <select className={inputClass} value={selectedClass} onChange={(e) => changeClass(e.target.value)}>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            )}

            <Card>
                {rows.length === 0 ? (
                    <EmptyState
                        message={isStudent ? t('لا توجد واجبات مطلوبة حالياً') : t('لا توجد واجبات لهذا الصف بعد')}
                        hint={canAdd ? t('أضف واجباً من الزر بالأعلى') : undefined}
                    />
                ) : (
                    <div className="divide-y divide-slate-50">
                        {rows.map((row) => (
                            <AssignmentCard
                                key={row.id}
                                row={row}
                                canDelete={!isStudent && (user.role !== 'teacher' || row.created_by === user.id)}
                                onDelete={remove}
                            />
                        ))}
                    </div>
                )}

                {nextCursor && (
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
                open={showAdd}
                onClose={() => setShowAdd(false)}
                title={t('إضافة واجب')}
                subtitle={classes.find((c) => c.id === selectedClass)?.name}
            >
                <form onSubmit={submit} className="space-y-3">
                    <div>
                        <label className={labelClass}>{t('المادة')} <span className="text-red-500">*</span></label>
                        {subjectOptions.length > 0 ? (
                            <select
                                className={inputClass}
                                value={form.subject}
                                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                                required
                            >
                                <option value="">{t('-- اختر المادة --')}</option>
                                {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        ) : (
                            <input
                                className={inputClass}
                                value={form.subject}
                                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                                required
                            />
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>{t('عنوان الواجب')} <span className="text-red-500">*</span></label>
                        <input
                            className={inputClass}
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder={t('مثال: حل تمارين الفصل الثالث')}
                            required
                        />
                    </div>

                    <div>
                        <label className={labelClass}>{t('التفاصيل')}</label>
                        <textarea
                            rows={4}
                            className={inputClass}
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder={t('الصفحات، التمارين المطلوبة، ملاحظات...')}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>{t('تاريخ التسليم')}</label>
                        <input
                            type="date"
                            className={inputClass}
                            value={form.due_date}
                            min={today()}
                            onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60"
                    >
                        {busy ? t('جاري النشر...') : t('نشر الواجب')}
                    </button>
                </form>
            </Modal>
        </div>
    );
};
