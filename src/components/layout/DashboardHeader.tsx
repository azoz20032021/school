import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Check, CheckCheck, LogOut, Settings, User, X } from 'lucide-react';
import { UserData } from '../../types';
import { api, formatDateTime } from '../../lib/api';
import { LanguageToggle } from '../ui/LanguageToggle';
import { t } from '../../i18n';

interface DashboardHeaderProps {
    user: UserData;
    onLogout: () => void;
}

const ROLE_LABEL: Record<string, string> = {
    admin: 'مدير النظام',
    assistant_admin: 'مساعد إدارة',
    teacher: 'كادر تعليمي',
    student: 'طالب علم',
};

const POLL_INTERVAL_MS = 60_000;

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ user, onLogout }) => {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifs, setShowNotifs] = useState(false);
    const timerRef = useRef<number | null>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const data = await api.get<any[]>(`/api/notifications/${user.id}`);
            setNotifications(Array.isArray(data) ? data : []);
        } catch {
            // A failed poll is not worth interrupting the user for.
        }
    }, [user.id]);

    /**
     * Poll only while the tab is visible. The previous version kept a 30s timer
     * running in every background tab, so a class of students left open all day
     * generated a steady stream of pointless requests.
     */
    useEffect(() => {
        const start = () => {
            if (timerRef.current !== null) return;
            fetchNotifications();
            timerRef.current = window.setInterval(fetchNotifications, POLL_INTERVAL_MS);
        };
        const stop = () => {
            if (timerRef.current === null) return;
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        };
        const onVisibility = () => (document.hidden ? stop() : start());

        if (!document.hidden) start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            stop();
        };
    }, [fetchNotifications]);

    const markAsRead = async (id: string) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        try {
            await api.post(`/api/notifications/read/${id}`);
        } catch {
            fetchNotifications(); // put the badge back if the server disagreed
        }
    };

    const markAllRead = async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        try {
            await api.post('/api/notifications/read-all');
        } catch {
            fetchNotifications();
        }
    };

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return (
        <header
            className="bg-white border-b border-slate-100 px-4 md:px-6 py-3.5 sticky top-0 z-[100] flex items-center justify-between shadow-sm print:hidden"
           
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                    <User className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-sm font-black text-slate-800 leading-tight truncate">{user.name}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {t(ROLE_LABEL[user.role] || user.role)}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                <img src="/logo.png" alt={t('شعار المدرسة')} className="w-9 h-9 object-contain hidden sm:block" />
                <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block" />

                <div className="relative">
                    <button
                        onClick={() => setShowNotifs((v) => !v)}
                        className={`p-2.5 rounded-xl transition-all relative ${
                            showNotifs ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-indigo-600'
                        }`}
                        aria-label={t('الإشعارات')}
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-indigo-600 border-2 border-white text-white text-[8px] font-black rounded-full flex items-center justify-center">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showNotifs && (
                            <>
                                <div className="fixed inset-0 z-[190]" onClick={() => setShowNotifs(false)} />
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="fixed inset-x-3 top-16 sm:inset-x-auto sm:top-full sm:mt-3 ltr:sm:right-0 rtl:sm:left-0 sm:w-80 max-h-[80vh] sm:max-h-[32rem] bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-[200] flex flex-col"
                                >
                                    <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center shrink-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-black text-slate-800 text-sm">{t('الإشعارات')}</h4>
                                            {unreadCount > 0 && (
                                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black">
                                                    {unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {unreadCount > 0 && (
                                                <button
                                                    onClick={markAllRead}
                                                    className="text-[10px] font-black text-indigo-600 flex items-center gap-1 hover:underline"
                                                >
                                                    <CheckCheck className="w-3 h-3" />
                                                    {t('تعليم الكل كمقروء')}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setShowNotifs(false)}
                                                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg sm:hidden transition-colors"
                                                aria-label={t('إغلاق')}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto overscroll-contain py-1 flex-1 max-h-[calc(80vh-70px)] sm:max-h-96">
                                        {notifications.length > 0 ? (
                                            notifications.map((n) => (
                                                <div
                                                    key={n.id}
                                                    className={`p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors flex gap-3 ${
                                                        !n.isRead ? 'bg-indigo-50/30' : ''
                                                    }`}
                                                >
                                                    <div
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                                            n.type === 'absence'
                                                                ? 'bg-red-50 text-red-500'
                                                                : n.type === 'invoice' || n.type === 'payment'
                                                                    ? 'bg-amber-50 text-amber-600'
                                                                    : 'bg-emerald-50 text-emerald-500'
                                                        }`}
                                                    >
                                                        <Bell className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1 space-y-1 min-w-0">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <p className="text-xs font-black text-slate-800">{n.title}</p>
                                                            {!n.isRead && (
                                                                <button
                                                                    onClick={() => markAsRead(n.id)}
                                                                    className="p-1 hover:bg-white rounded-md transition-colors shrink-0"
                                                                    aria-label={t('تعليم كمقروء')}
                                                                >
                                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{n.message}</p>
                                                        <p className="text-[9px] text-slate-300 font-bold">{formatDateTime(n.createdAt)}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-10 text-center">
                                                <p className="text-xs text-slate-400 font-bold">{t('لا توجد إشعارات حالياً')}</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>

                <LanguageToggle />

                <Link
                    to="/settings"
                    className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all"
                    title={t('الإعدادات')}
                >
                    <Settings className="w-5 h-5" />
                </Link>

                <button
                    onClick={onLogout}
                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title={t('تسجيل الخروج')}
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
};
