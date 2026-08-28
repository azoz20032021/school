import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, isStaff } from './context/AuthContext';
import { Login } from './pages/Login';
import { Layout } from './components/layout/Layout';
import { UserData } from './types';

/**
 * Everything past the login screen is loaded on demand. A student's phone no
 * longer downloads the admin dashboard, the finance ledger and the report
 * builder just to see their own grades.
 */
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));
const RegistrationStatus = lazy(() => import('./pages/RegistrationStatus').then((m) => ({ default: m.RegistrationStatus })));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const Registrations = lazy(() => import('./pages/admin/Registrations').then((m) => ({ default: m.Registrations })));
const Finance = lazy(() => import('./pages/admin/Finance').then((m) => ({ default: m.Finance })));
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard })));
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard })));
const StudentFinance = lazy(() => import('./pages/student/StudentFinance').then((m) => ({ default: m.StudentFinance })));
const StudentGrades = lazy(() => import('./pages/student/StudentGrades').then((m) => ({ default: m.StudentGrades })));
const Subjects = lazy(() => import('./pages/Subjects').then((m) => ({ default: m.Subjects })));
const Schedule = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.Schedule })));
const GradesManagement = lazy(() => import('./pages/GradesManagement').then((m) => ({ default: m.GradesManagement })));
const Behavior = lazy(() => import('./pages/Behavior').then((m) => ({ default: m.Behavior })));
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

const FullPageSpinner = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

/** Landing page depends on who is signed in. */
const RootRedirect = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isStaff(user.role)) return <AdminDashboard />;
  if (user.role === 'teacher') return <TeacherDashboard user={user} />;
  return <StudentDashboard user={user} />;
};

/** Students read their grades; everyone else records them. */
const GradesRoute = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'student' ? <StudentGrades user={user} /> : <GradesManagement user={user} />;
};

/** Students see their own dues; staff see the whole ledger. */
const FinanceRoute = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'student') return <StudentFinance user={user} />;
  if (isStaff(user.role)) return <Finance />;
  return <Navigate to="/" replace />;
};

/**
 * Blocks a route for roles that must not reach it. The API enforces the same
 * rules — this only keeps the UI from offering a screen that would fail.
 */
const RequireRole: React.FC<{ allow: UserData['role'][]; children: React.ReactNode }> = ({ allow, children }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/** Passes the signed-in user down to a page that requires one. */
const WithUser: React.FC<{ render: (user: UserData) => React.ReactElement }> = ({ render }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return render(user);
};

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpinner />;

  return (
    <Suspense fallback={<FullPageSpinner />}>
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />
      <Route path="/register/status" element={<RegistrationStatus />} />

      <Route element={<Layout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/grades" element={<GradesRoute />} />
        <Route path="/finance" element={<FinanceRoute />} />
        <Route path="/subjects" element={<WithUser render={(u) => <Subjects user={u} />} />} />
        <Route path="/schedule" element={<WithUser render={(u) => <Schedule user={u} />} />} />
        <Route path="/behavior" element={<WithUser render={(u) => <Behavior user={u} />} />} />
        <Route path="/reports" element={<WithUser render={(u) => <Reports user={u} />} />} />
        <Route path="/settings" element={<WithUser render={(u) => <Settings user={u} />} />} />
        <Route
          path="/registrations"
          element={
            <RequireRole allow={['admin', 'assistant_admin']}>
              <Registrations />
            </RequireRole>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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
