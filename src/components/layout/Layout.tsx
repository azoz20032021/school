import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardHeader } from './DashboardHeader';
import { Navbar } from './Navbar';
import { PaymentLock } from './PaymentLock';

export const Layout: React.FC = () => {
    const { user, logout, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    /**
     * A student whose fees have lapsed sees one screen and nothing else. The
     * flag is computed by the server and arrives with the account, so it cannot
     * be cleared by editing anything in the browser.
     */
    if (user.role === 'student' && user.dues?.blocked) {
        return <PaymentLock dues={user.dues} name={user.name} onLogout={logout} />;
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-24 print:min-h-0 print:bg-white print:pb-0">
            <DashboardHeader user={user} onLogout={logout} />
            <main>
                <Outlet />
            </main>
            <Navbar role={user.role} />
        </div>
    );
};
