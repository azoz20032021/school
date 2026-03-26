import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardHeader } from './DashboardHeader';
import { Navbar } from './Navbar';

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

    return (
        <div className="min-h-screen bg-slate-50 font-sans pb-24">
            <DashboardHeader user={user} onLogout={logout} />
            <main>
                <Outlet />
            </main>
            <Navbar role={user.role} />
        </div>
    );
};
