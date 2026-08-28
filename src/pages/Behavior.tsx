import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { BehaviorNote, ClassData, UserData } from '../types';
import { api, ApiError, formatDate } from '../lib/api';
import { isAdmin, isStaff } from '../context/AuthContext';
import {
    Badge, Card, EmptyState, ErrorBanner, Modal, SectionTitle, Spinner, StatCard, inputClass, labelClass,
} from '../components/ui';
import { t } from '../i18n';

const CATEGORIES = {
    positive: ['تفوق دراسي', 'مشاركة فعالة', 'مساعدة الزملاء', 'التزام بالزي', 'أخرى'],
    negative: ['تأخر متكرر', 'إزعاج داخل الصف', 'عدم أداء الواجبات', 'مخالفة سلوكية', 'أخرى'],
};

/* ------------------------------------------------------------------ *
 * Student view — their own conduct record
 * ------------------------------------------------------------------ */

const StudentView: React.FC<{ user: UserData }> = ({ user }) => {
    const [notes, setNotes] = useState<BehaviorNote[]>([]);
    const [summary, setSummary] = useState({ positive: 0, negative: 0, conduct_score: 100 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        api.get<{ notes: BehaviorNote[]; summary: typeof summary }>(`/api/student/${user.id}/behavior`)
            .then((res) => {
                if (cancelled) return;
                setNotes(res.notes);
                setSummary(res.summary);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof ApiError ? err.message : t('تعذر تحميل السجل السلوكي'));
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user.id]);

    if (loading) return <div className="p-6"><Spinner label={t('جاري تحميل سجلك السلوكي')} /></div>;
    if (error) return <div className="p-6"><ErrorBanner message={error} /></div>;

    return (
        <div className="p-4 md:p-6 space-y-5">
            <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
                <div className="relative z-10">
                    <p className="text-indigo-100 text-[10px] uppercase tracking-widest font-bold mb-1">{t('درجة السلوك')}</p>
                    <h3 className="text-3xl font-black">{summary.conduct_score}/100</h3>
                    <div className="mt-4 flex gap-2">
                        <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold">
                            {summary.positive} ملاحظة إيجابية
                        </div>
                        <div className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold">
                            {summary.negative} ملاحظة سلبية
                        </div>
                    </div>
                </div>
                <div className="absolute -left-6 -bottom-6 w-36 h-36 bg-white/10 rounded-full blur-2xl" />
            </div>

            <div>
                <SectionTitle title={t('الملاحظات')} subtitle={t('كل ملاحظة سجلها معلموك أو الإدارة')} />
                <Card>
                    {notes.length === 0 ? (
                        <EmptyState message={t('لا توجد ملاحظات مسجلة')} hint={t('استمر بالمحافظة على سلوكك الجيد')} />
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {notes.map((n) => <NoteRow key={n.id} note={n} />)}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

const NoteRow: React.FC<{ note: BehaviorNote; onDelete?: () => void; showStudent?: boolean }> = ({
    note, onDelete, showStudent,
}) => (
    <div className="p-4 flex items-start gap-3">
        <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                note.type === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
        >
            {note.type === 'positive' ? <ThumbsUp className="w-4 h-4" /> : <ThumbsDown className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-black text-slate-800">{note.title}</p>
                <Badge tone={note.type === 'positive' ? 'emerald' : 'rose'}>{note.category}</Badge>
                <Badge tone="slate">{note.points > 0 ? `+${note.points}` : note.points}</Badge>
            </div>
            {showStudent && <p className="text-[11px] font-bold text-indigo-500 mt-0.5">{note.student_name}</p>}
            {note.description && (
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">{note.description}</p>
            )}
            <p className="text-[10px] text-slate-300 font-bold mt-1.5">
                {note.date} · {note.created_by_name}
            </p>
        </div>
        {onDelete && (
            <button onClick={onDelete} className="text-[10px] font-black text-red-500 hover:underline shrink-0">
                {t('حذف')}
            </button>
        )}
    </div>
);

/* ------------------------------------------------------------------ *
 * Staff / teacher view — record notes for a class
 * ------------------------------------------------------------------ */

const StaffView: React.FC<{ user: UserData }> = ({ user }) => {
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [roster, setRoster] = useState<{ id: string; name: string; uid: string }[]>([]);
    const [notes, setNotes] = useState<BehaviorNote[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [busy, setBusy] = useState(false);

    const [form, setForm] = useState({
        student_id: '',
        type: 'positive' as 'positive' | 'negative',
        category: 'تفوق دراسي',
        title: '',
        description: '',
        points: '5',
        date: '',
    });

    useEffect(() => {
        const endpoint = isStaff(user.role) ? '/api/classes' : `/api/teacher/classes/${user.id}`;
        api.get<ClassData[]>(endpoint)
            .then((list) => {
                setClasses(list);
                if (list.length > 0) setSelectedClass(list[0].id);
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('تعذر تحميل الصفوف')));
    }, [user.id, user.role]);

    const loadClass = useCallback(async (classId: string) => {
        if (!classId) return;
        setLoading(true);
        setError('');
        try {
            const [students, classNotes] = await Promise.all([
                api.get<{ id: string; name: string; uid: string }[]>(`/api/class/${classId}/students`),
                api.get<BehaviorNote[]>(`/api/class/${classId}/behavior`),
            ]);
            setRoster(students);
            setNotes(classNotes);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر تحميل بيانات الصف'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadClass(selectedClass); }, [selectedClass, loadClass]);

    const stats = useMemo(() => ({
        positive: notes.filter((n) => n.type === 'positive').length,
        negative: notes.filter((n) => n.type === 'negative').length,
    }), [notes]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await api.post('/api/behavior', {
                ...form,
                class_id: selectedClass,
                points: Number(form.points),
                date: form.date || undefined,
            });
            setShowAdd(false);
            setForm((f) => ({ ...f, student_id: '', title: '', description: '' }));
            await loadClass(selectedClass);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر حفظ الملاحظة'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        if (!confirm(t('هل أنت متأكد من حذف هذه الملاحظة؟'))) return;
        try {
            await api.del(`/api/behavior/${id}`);
            await loadClass(selectedClass);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('تعذر حذف الملاحظة'));
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-800">{t('السلوك والملاحظات')}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">{t('سجّل الملاحظات الإيجابية والسلبية لطلابك')}</p>
                </div>
                <button
                    onClick={() => setShowAdd(true)}
                    disabled={!selectedClass}
                    className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-indigo-100 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    {t('ملاحظة جديدة')}
                </button>
            </div>

            {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

            <select className={inputClass} value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                <option value="">{t('-- اختر الصف --')}</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <div className="grid grid-cols-3 gap-3">
                <StatCard label={t('إيجابية')} value={stats.positive} tone="emerald" icon={<ThumbsUp className="w-4 h-4 opacity-50" />} />
                <StatCard label={t('سلبية')} value={stats.negative} tone="rose" icon={<ThumbsDown className="w-4 h-4 opacity-50" />} />
                <StatCard label={t('عدد الطلاب')} value={roster.length} tone="indigo" icon={<Award className="w-4 h-4 opacity-50" />} />
            </div>

            <Card>
                {loading ? (
                    <Spinner />
                ) : notes.length === 0 ? (
                    <EmptyState message={t('لا توجد ملاحظات لهذا الصف')} hint={t('ابدأ بتسجيل ملاحظة من الزر بالأعلى')} />
                ) : (
                    <div className="divide-y divide-slate-50">
                        {notes.map((n) => (
                            <NoteRow
                                key={n.id}
                                note={n}
                                showStudent
                                onDelete={isAdmin(user.role) ? () => remove(n.id) : undefined}
                            />
                        ))}
                    </div>
                )}
            </Card>

            <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('تسجيل ملاحظة')} subtitle={t('سيصل إشعار للطالب فوراً')}>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        {(['positive', 'negative'] as const).map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, type: kind, category: CATEGORIES[kind][0] }))}
                                className={`py-3 rounded-xl text-xs font-black border transition-colors flex items-center justify-center gap-1.5 ${
                                    form.type === kind
                                        ? kind === 'positive'
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-rose-600 text-white border-rose-600'
                                        : 'bg-white text-slate-500 border-slate-200'
                                }`}
                            >
                                {kind === 'positive' ? <ThumbsUp className="w-3.5 h-3.5" /> : <ThumbsDown className="w-3.5 h-3.5" />}
                                {kind === 'positive' ? t('إيجابية') : t('سلبية')}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className={labelClass}>{t('الطالب')} <span className="text-red-500">*</span></label>
                        <select
                            className={inputClass}
                            value={form.student_id}
                            onChange={(e) => setForm((f) => ({ ...f, student_id: e.target.value }))}
                            required
                        >
                            <option value="">{t('-- اختر الطالب --')}</option>
                            {roster.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.uid}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>{t('التصنيف')}</label>
                            <select
                                className={inputClass}
                                value={form.category}
                                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                            >
                                {CATEGORIES[form.type].map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t('النقاط')}</label>
                            <input
                                type="number" min={0} max={100} className={inputClass} value={form.points}
                                onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>{t('العنوان')} <span className="text-red-500">*</span></label>
                        <input
                            className={inputClass} value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder={t('مثال: مشاركة متميزة في درس الرياضيات')} required
                        />
                    </div>

                    <div>
                        <label className={labelClass}>{t('التفاصيل')}</label>
                        <textarea
                            rows={3} className={inputClass} value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>{t('التاريخ')}</label>
                        <input
                            type="date" className={inputClass} value={form.date}
                            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60"
                    >
                        {busy ? t('جاري الحفظ...') : t('حفظ الملاحظة')}
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export const Behavior: React.FC<{ user: UserData }> = ({ user }) =>
    user.role === 'student' ? <StudentView user={user} /> : <StaffView user={user} />;
