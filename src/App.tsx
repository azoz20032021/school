import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Layout } from './components/layout/Layout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { TeacherDashboard } from './pages/teacher/TeacherDashboard';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { Subjects } from './pages/Subjects';
import { Schedule } from './pages/Schedule';
import { StudentGrades } from './pages/student/StudentGrades';
import { GradesManagement } from './pages/GradesManagement';

const RootRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'admin' || user?.role === 'assistant_admin') return <AdminDashboard />;
  if (user?.role === 'teacher') return <TeacherDashboard user={user} />;
  if (user?.role === 'student') return <StudentDashboard user={user} />;
  return <Navigate to="/login" />;
};

const GradesRedirect = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentGrades user={user} />;
  if (user) return <GradesManagement user={user} />;
  return <Navigate to="/login" />;
};

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />

      <Route element={<Layout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/subjects" element={<Subjects user={user!} />} />
        <Route path="/schedule" element={<Schedule user={user!} />} />
        <Route path="/grades" element={<GradesRedirect />} />
      </Route>

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
