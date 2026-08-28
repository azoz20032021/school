import React from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '../../i18n';

/**
 * Switches the interface language. Always shows the language you would switch
 * *to*, written in that language, so it is readable to someone who cannot read
 * the current one.
 */
export const LanguageToggle: React.FC<{ variant?: 'icon' | 'full' }> = ({ variant = 'icon' }) => {
    const { lang, toggleLang } = useI18n();
    const target = lang === 'ar' ? 'English' : 'العربية';

    if (variant === 'full') {
        return (
            <button
                type="button"
                onClick={toggleLang}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors"
            >
                <Languages className="w-4 h-4" />
                {target}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={toggleLang}
            title={target}
            aria-label={target}
            className="px-2.5 py-2 rounded-xl text-[11px] font-black text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-all flex items-center gap-1"
        >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'EN' : 'ع'}</span>
        </button>
    );
};
