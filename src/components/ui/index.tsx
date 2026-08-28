import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';

/**
 * Small shared building blocks. The dashboards were repeating the same card,
 * modal and empty-state markup a dozen times each; collecting them here keeps
 * the screens consistent and much shorter.
 */

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
    className = '',
    children,
}) => (
    <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
);

export const SectionTitle: React.FC<{
    title: string;
    subtitle?: string;
    action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
    <div className="flex items-start justify-between gap-3 mb-3">
        <div>
            <h3 className="font-black text-slate-800 text-sm">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
        {action}
    </div>
);

export const StatCard: React.FC<{
    label: string;
    value: React.ReactNode;
    hint?: string;
    tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
    icon?: React.ReactNode;
    onClick?: () => void;
}> = ({ label, value, hint, tone = 'slate', icon, onClick }) => {
    const tones = {
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-100',
        rose: 'bg-rose-50 text-rose-700 border-rose-100',
        slate: 'bg-white text-slate-800 border-slate-100',
    } as const;

    const Element = onClick ? 'button' : 'div';
    return (
        <Element
            onClick={onClick}
            className={`${tones[tone]} border rounded-2xl p-4 text-right w-full ${
                onClick ? 'hover:brightness-97 transition-all active:scale-[0.98]' : ''
            }`}
        >
            <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
                {icon}
            </div>
            <p className="text-xl font-black leading-tight">{value}</p>
            {hint && <p className="text-[10px] opacity-60 font-medium mt-1">{hint}</p>}
        </Element>
    );
};

export const Badge: React.FC<{
    tone?: 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';
    children: React.ReactNode;
}> = ({ tone = 'slate', children }) => {
    const tones = {
        emerald: 'bg-emerald-100 text-emerald-700',
        amber: 'bg-amber-100 text-amber-700',
        rose: 'bg-rose-100 text-rose-700',
        indigo: 'bg-indigo-100 text-indigo-700',
        slate: 'bg-slate-100 text-slate-600',
    } as const;
    return (
        <span className={`${tones[tone]} text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap`}>
            {children}
        </span>
    );
};

export const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    wide?: boolean;
}> = ({ open, onClose, title, subtitle, children, wide }) => (
    <AnimatePresence>
        {open && (
            <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center p-0 md:p-6" dir="rtl">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    className={`relative bg-white w-full ${
                        wide ? 'md:max-w-3xl' : 'md:max-w-md'
                    } rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] flex flex-col`}
                >
                    <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100 shrink-0">
                        <div>
                            <h3 className="font-black text-slate-800">{title}</h3>
                            {subtitle && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
                            aria-label="إغلاق"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-5 overflow-y-auto">{children}</div>
                </motion.div>
            </div>
        )}
    </AnimatePresence>
);

export const EmptyState: React.FC<{ message: string; hint?: string }> = ({ message, hint }) => (
    <div className="py-12 text-center">
        <Inbox className="w-8 h-8 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-400">{message}</p>
        {hint && <p className="text-[11px] text-slate-300 mt-1">{hint}</p>}
    </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
    <div className="py-12 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        {label && <p className="text-xs text-slate-400 font-bold">{label}</p>}
    </div>
);

export const ErrorBanner: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
    <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p className="flex-1 font-bold leading-relaxed">{message}</p>
        {onDismiss && (
            <button onClick={onDismiss} className="opacity-60 hover:opacity-100" aria-label="إخفاء">
                <X className="w-3.5 h-3.5" />
            </button>
        )}
    </div>
);

export const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white';

export const labelClass = 'block text-[11px] font-bold text-slate-600 mb-1.5';
