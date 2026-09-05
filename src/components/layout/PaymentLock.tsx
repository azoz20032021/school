import React, { useState } from 'react';
import { Lock, LogOut, Phone, RefreshCw } from 'lucide-react';
import { StudentDues } from '../../types';
import { formatMoney } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n';

/**
 * The screen a student sees once a fee has gone past its due date.
 *
 * The school asked for the account to close itself rather than to keep nagging:
 * grades, timetable and homework are all withheld until the office is paid. The
 * "I have paid" button simply re-reads the account from the server, so the
 * moment the accountant records the payment the student is let back in without
 * signing out and in again.
 */
export const PaymentLock: React.FC<{
    dues: StudentDues;
    name: string;
    onLogout: () => void;
}> = ({ dues, name, onLogout }) => {
    const { refresh } = useAuth();
    const [checking, setChecking] = useState(false);
    const [stillOwing, setStillOwing] = useState(false);

    const recheck = async () => {
        setChecking(true);
        setStillOwing(false);
        try {
            await refresh();
            // If the server still reports a lock, this component simply stays.
            setStillOwing(true);
        } catch {
            setStillOwing(true);
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 font-sans">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-7 text-center">
                <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <Lock className="w-8 h-8" />
                </div>

                <h1 className="text-lg font-black text-slate-800">{t('حسابك موقوف مؤقتاً')}</h1>
                <p className="text-sm text-slate-500 font-medium leading-relaxed mt-2">
                    {t('أهلاً {name}، تجاوز موعد تسديد القسط ولم يُسجَّل الدفع بعد. يرجى مراجعة إدارة المدرسة للتسديد ليُفتح حسابك.', { name })}
                </p>

                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 mt-5 text-right">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-rose-500">{t('المبلغ المتبقي')}</span>
                        <span className="text-lg font-black text-rose-700">{formatMoney(dues.outstanding)}</span>
                    </div>
                    {dues.next_due_date && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-rose-100">
                            <span className="text-[11px] font-bold text-rose-500">{t('تاريخ الاستحقاق الفائت')}</span>
                            <span className="text-sm font-black text-rose-700" dir="ltr">{dues.next_due_date}</span>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-slate-400 font-bold mt-4 flex items-center justify-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {t('للاستفسار راجع محاسب المدرسة')}
                </p>

                {stillOwing && (
                    <p className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-4">
                        {t('لم يُسجَّل الدفع بعد. راجع الإدارة ثم أعد المحاولة.')}
                    </p>
                )}

                <div className="mt-6 space-y-2">
                    <button
                        onClick={recheck}
                        disabled={checking}
                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                        {checking ? t('جاري التحقق...') : t('سددت المبلغ — تحقق الآن')}
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                        <LogOut className="w-4 h-4" />
                        {t('تسجيل الخروج')}
                    </button>
                </div>
            </div>
        </div>
    );
};
