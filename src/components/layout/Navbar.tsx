import React from 'react';
import { NavLink } from 'react-router-dom';
import { User, BookOpen, Calendar, CheckCircle } from 'lucide-react';
import { Role } from '../../types';

interface NavbarProps {
    role: Role;
}

export const Navbar: React.FC<NavbarProps> = ({ role }) => {
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 px-6 py-3 flex justify-around items-center z-50 rounded-t-3xl shadow-2xl">
            <NavLink
                to="/"
                className={({ isActive }) =>
                    `flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`
                }
            >
                {({ isActive }) => (
                    <>
                        {isActive && <div className="w-1 h-1 bg-blue-600 rounded-full mb-1"></div>}
                        <User className="w-6 h-6" />
                        <span className="text-[10px] font-bold">الرئيسية</span>
                    </>
                )}
            </NavLink>

            {role !== 'teacher' && (
                <>
                    <NavLink
                        to="/subjects"
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <div className="w-1 h-1 bg-blue-600 rounded-full mb-1"></div>}
                                <BookOpen className="w-6 h-6" />
                                <span className="text-[10px] font-bold">المواد</span>
                            </>
                        )}
                    </NavLink>
                    <NavLink
                        to="/schedule"
                        className={({ isActive }) =>
                            `flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <div className="w-1 h-1 bg-blue-600 rounded-full mb-1"></div>}
                                <Calendar className="w-6 h-6" />
                                <span className="text-[10px] font-bold">الجدول</span>
                            </>
                        )}
                    </NavLink>
                </>
            )}

            <NavLink
                to="/grades"
                className={({ isActive }) =>
                    `flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`
                }
            >
                {({ isActive }) => (
                    <>
                        {isActive && <div className="w-1 h-1 bg-blue-600 rounded-full mb-1"></div>}
                        <CheckCircle className="w-6 h-6" />
                        <span className="text-[10px] font-bold">
                            {role === 'student' ? 'الدرجات' : 'رصد الدرجات'}
                        </span>
                    </>
                )}
            </NavLink>
        </nav>
    );
};
