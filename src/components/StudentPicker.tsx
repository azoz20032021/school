import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { t } from '../i18n';
import { inputClass, labelClass } from './ui';

/**
 * "Pick one student" for a school with hundreds of them.
 *
 * The screens that needed this were using a plain `<select>` filled from one
 * page of the student list, so most of the school was simply not offered, and
 * scrolling a dropdown of hundreds of names to find one is unusable anyway.
 * This searches the whole roster by name or identifying number, shows a
 * bounded number of matches, and never paints more rows than a person can read.
 */

export interface PickableStudent {
    id: string;
    name: string;
    uid: string;
    class_id: string | null;
    class_name: string;
    guardian_phone?: string;
}

/** Matches the server-side folding so both ends agree on what "أحمد" means. */
function normalizeArabic(text: string): string {
    return (text || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[إأآٱا]/g, 'ا')
        .replace(/[ىی]/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * The roster is shared across every picker on the page and cached for the life
 * of the tab, so opening four different pickers costs one request, not four.
 */
let rosterPromise: Promise<PickableStudent[]> | null = null;

export function loadStudentRoster(force = false): Promise<PickableStudent[]> {
    if (force) rosterPromise = null;
    if (!rosterPromise) {
        rosterPromise = api.get<PickableStudent[]>('/api/admin/students/lookup').catch((err) => {
            rosterPromise = null; // let the next mount retry rather than cache a failure
            throw err;
        });
    }
    return rosterPromise;
}

const MAX_RESULTS = 40;

export const StudentPicker: React.FC<{
    value: string;
    onChange: (studentId: string, student: PickableStudent | null) => void;
    label?: string;
    placeholder?: string;
    /** Limit the choices to one class, when the screen already filtered by it. */
    classId?: string | null;
    required?: boolean;
    /** Shown under the field when nothing is selected yet. */
    hint?: string;
}> = ({ value, onChange, label, placeholder, classId, required, hint }) => {
    const [roster, setRoster] = useState<PickableStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [term, setTerm] = useState('');
    const [open, setOpen] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;
        loadStudentRoster()
            .then((list) => { if (alive) { setRoster(list); setFailed(false); } })
            .catch(() => { if (alive) setFailed(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    // Clicking anywhere else closes the list, the way a native select does.
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    const selected = useMemo(() => roster.find((s) => s.id === value) || null, [roster, value]);

    const matches = useMemo(() => {
        const needle = normalizeArabic(term);
        const pool = classId ? roster.filter((s) => s.class_id === classId) : roster;
        if (!needle) return pool.slice(0, MAX_RESULTS);
        return pool
            .filter((s) => normalizeArabic(s.name).includes(needle) || (s.uid || '').includes(needle))
            .slice(0, MAX_RESULTS);
    }, [roster, term, classId]);

    const pool = classId ? roster.filter((s) => s.class_id === classId).length : roster.length;

    const pick = (student: PickableStudent) => {
        onChange(student.id, student);
        setTerm('');
        setOpen(false);
    };

    return (
        <div ref={boxRef} className="relative">
            {label && (
                <label className={labelClass}>
                    {label} {required && <span className="text-red-500">*</span>}
                </label>
            )}

            {selected ? (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                    <Check className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800 truncate">{selected.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold">
                            {selected.uid} · {selected.class_name}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { onChange('', null); setOpen(true); }}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-white rounded-lg transition-colors shrink-0"
                        aria-label={t('إلغاء الاختيار')}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none" />
                    <input
                        value={term}
                        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        className={`${inputClass} pr-10`}
                        placeholder={placeholder || t('ابحث باسم الطالب أو رقمه التعريفي')}
                        autoComplete="off"
                    />
                    {loading && (
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin absolute top-1/2 -translate-y-1/2 left-3.5" />
                    )}
                </div>
            )}

            {!selected && hint && !open && (
                <p className="text-[10px] text-slate-400 font-medium mt-1.5">{hint}</p>
            )}

            {failed && (
                <p className="text-[10px] text-rose-500 font-bold mt-1.5">
                    {t('تعذر تحميل قائمة الطلاب، حدّث الصفحة وحاول مرة أخرى')}
                </p>
            )}

            {open && !selected && (
                <div className="absolute z-50 mt-1.5 w-full bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto">
                    {loading ? (
                        <p className="p-4 text-xs text-slate-400 font-bold text-center">{t('جاري التحميل...')}</p>
                    ) : matches.length === 0 ? (
                        <p className="p-4 text-xs text-slate-400 font-bold text-center">{t('لا يوجد طالب مطابق')}</p>
                    ) : (
                        <>
                            {matches.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => pick(s)}
                                    className="w-full text-right px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                                >
                                    <p className="text-xs font-black text-slate-800 truncate">{s.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold">{s.uid} · {s.class_name}</p>
                                </button>
                            ))}
                            {pool > matches.length && (
                                <p className="px-4 py-2 text-[10px] text-slate-400 font-bold text-center bg-slate-50">
                                    {t('يعرض {shown} من {total} طالب — اكتب للبحث', { shown: matches.length, total: pool })}
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
