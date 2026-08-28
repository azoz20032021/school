import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
    BookOpen, Calendar, CheckCircle, FileBarChart, Home, MoreHorizontal, Settings as SettingsIcon,
    Smile, UserCheck, Wallet, X,
} from 'lucide-react';
import { Role } from '../../types';
import { t } from '../../i18n';

interface NavItem {
    to: string;
    label: string;
    icon: React.ElementType;
}

/**
 * Bottom navigation. Roles see different destinations, and anything that does
 * not fit in five slots moves into the "المزيد" sheet rather than being
 * unreachable.
 */
const PRIMARY: Record<Role, NavItem[]> = {
    student: [
        { to: '/', label: 'الرئيسية', icon: Home },
        { to: '/grades', label: 'الدرجات', icon: CheckCircle },
        { to: '/finance', label: 'المالية', icon: Wallet },
        { to: '/schedule', label: 'الجدول', icon: Calendar },
    ],
    teacher: [
        { to: '/', label: 'الرئيسية', icon: Home },
        { to: '/grades', label: 'رصد الدرجات', icon: CheckCircle },
        { to: '/behavior', label: 'السلوك', icon: Smile },
        { to: '/reports', label: 'التقارير', icon: FileBarChart },
    ],
    admin: [
        { to: '/', label: 'الرئيسية', icon: Home },
        { to: '/registrations', label: 'الطلبات', icon: UserCheck },
        { to: '/finance', label: 'المالية', icon: Wallet },
        { to: '/reports', label: 'التقارير', icon: FileBarChart },
    ],
    assistant_admin: [
        { to: '/', label: 'الرئيسية', icon: Home },
        { to: '/registrations', label: 'الطلبات', icon: UserCheck },
        { to: '/finance', label: 'المالية', icon: Wallet },
        { to: '/reports', label: 'التقارير', icon: FileBarChart },
    ],
};

const SECONDARY: Record<Role, NavItem[]> = {
    student: [
        { to: '/behavior', label: 'السلوك والملاحظات', icon: Smile },
        { to: '/subjects', label: 'المواد الدراسية', icon: BookOpen },
        { to: '/reports', label: 'كشف درجاتي', icon: FileBarChart },
        { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ],
    teacher: [
        { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ],
    admin: [
        { to: '/grades', label: 'رصد الدرجات', icon: CheckCircle },
        { to: '/behavior', label: 'السلوك والملاحظات', icon: Smile },
        { to: '/subjects', label: 'المواد الدراسية', icon: BookOpen },
        { to: '/schedule', label: 'الجدول الأسبوعي', icon: Calendar },
        { to: '/settings', label: 'الإعدادات وسجل العمليات', icon: SettingsIcon },
    ],
    assistant_admin: [
        // No /grades entry: recording grades is admin-only.
        { to: '/behavior', label: 'السلوك والملاحظات', icon: Smile },
        { to: '/subjects', label: 'المواد الدراسية', icon: BookOpen },
        { to: '/schedule', label: 'الجدول الأسبوعي', icon: Calendar },
        { to: '/settings', label: 'الإعدادات', icon: SettingsIcon },
    ],
};

export const Navbar: React.FC<{ role: Role }> = ({ role }) => {
    const [showMore, setShowMore] = useState(false);
    const navigate = useNavigate();

    const primary = PRIMARY[role] || PRIMARY.student;
    const secondary = SECONDARY[role] || [];

    const go = (to: string) => {
        setShowMore(false);
        navigate(to);
    };

    return (
        <>
            <AnimatePresence>
                {showMore && (
                    <div className="fixed inset-0 z-[150] flex items-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => setShowMore(false)}
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="relative w-full bg-white rounded-t-3xl p-5 pb-8 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="font-black text-slate-800 text-sm">{t('المزيد')}</h4>
                                <button
                                    onClick={() => setShowMore(false)}
                                    className="p-2 text-slate-400 hover:bg-slate-50 rounded-xl"
                                    aria-label={t('إغلاق')}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="space-y-1">
                                {secondary.map(({ to, label, icon: Icon }) => (
                                    <button
                                        key={to}
                                        onClick={() => go(to)}
                                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl hover:bg-slate-50 transition-colors text-right"
                                    >
                                        <div className="w-10 h-10 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center shrink-0">
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">{t(label)}</span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <nav
                className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-3 py-2.5 flex justify-around items-center z-50 rounded-t-3xl shadow-2xl print:hidden"
               
            >
                {primary.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-0.5 transition-colors px-2 ${
                                isActive ? 'text-indigo-600' : 'text-slate-400'
                            }`
                        }
                    >
                        <Icon className="w-5 h-5" />
                        <span className="text-[9px] font-black">{t(label)}</span>
                    </NavLink>
                ))}

                {secondary.length > 0 && (
                    <button
                        onClick={() => setShowMore(true)}
                        className="flex flex-col items-center gap-0.5 text-slate-400 px-2"
                    >
                        <MoreHorizontal className="w-5 h-5" />
                        <span className="text-[9px] font-black">{t('المزيد')}</span>
                    </button>
                )}
            </nav>
        </>
    );
};
