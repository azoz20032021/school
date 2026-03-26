import React, { useState, useEffect } from 'react';
import { User, Bell, LogOut, Check } from 'lucide-react';
import { UserData } from '../../types';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardHeaderProps {
    user: UserData;
    onLogout: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ user, onLogout }) => {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifs, setShowNotifs] = useState(false);

    const fetchNotifications = async () => {
        try {
            const res = await fetch(`/api/notifications/${user.id}`);
            const data = await res.json();
            setNotifications(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [user.id]);

    const markAsRead = async (id: string) => {
        await fetch(`/api/notifications/read/${id}`, { method: 'POST' });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <header className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-[100] flex items-center justify-between shadow-sm" dir="rtl">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                    <User className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-sm font-black text-slate-800 leading-tight">{user.name}</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {user.role === 'admin' ? 'مدير النظام' : user.role === 'teacher' ? 'كادر تعليمي' : 'طالب علم'}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {/* Logo moved to the left side */}
                <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center p-1 shadow-sm border border-slate-50 overflow-hidden transform hover:rotate-6 transition-transform">
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>

                <div className="h-8 w-[1px] bg-slate-100 mx-1"></div>

                <div className="relative">

                    <button
                        onClick={() => setShowNotifs(!showNotifs)}
                        className={`p-2.5 rounded-xl transition-all relative ${showNotifs ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:bg-slate-50 hover:text-indigo-600'}`}
                    >
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-2 right-2 w-4 h-4 bg-indigo-600 border-2 border-white text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showNotifs && (
                            <>
                                <div className="fixed inset-0 z-[-1]" onClick={() => setShowNotifs(false)}></div>
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute left-0 mt-3 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-[200]"
                                >
                                    <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                                        <h4 className="font-black text-slate-800 text-sm">الإشعارات</h4>
                                        {unreadCount > 0 && (
                                            <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                                                {unreadCount} جديد
                                            </span>
                                        )}
                                    </div>
                                    <div className="max-h-96 overflow-y-auto no-scrollbar py-2">
                                        {notifications.length > 0 ? (
                                            notifications.map((n) => (
                                                <div
                                                    key={n.id}
                                                    className={`p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors flex gap-3 ${!n.isRead ? 'bg-blue-50/20' : ''}`}
                                                >
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${n.type === 'absence' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                                        <Bell className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1 space-y-1">
                                                        <div className="flex justify-between items-start">
                                                            <p className="text-xs font-black text-slate-800">{n.title}</p>
                                                            {!n.isRead && (
                                                                <button
                                                                    onClick={() => markAsRead(n.id)}
                                                                    className="p-1 hover:bg-white rounded-md transition-colors"
                                                                >
                                                                    <Check className="w-3 h-3 text-emerald-500" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{n.message}</p>
                                                        <p className="text-[8px] text-slate-300 font-bold">{new Date(n.createdAt?.seconds * 1000).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-10 text-center">
                                                <p className="text-xs text-slate-400 font-bold">لا توجد إشعارات حالياً</p>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>

                <button
                    onClick={onLogout}
                    className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title="تسجيل الخروج"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
};
