import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const QC = lazy(() => import('./pages/QC'));
const ActivityLogs = lazy(() => import('./pages/ActivityLogs'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));

function ProtectedRoute(props) {
 const { user, loading, mustChangePassword } = useAuth();
 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
 if (!user) return <Navigate to="/login" replace />;
 if (mustChangePassword) return <Navigate to="/change-password" replace />;
 return props.children;
}

function PasswordChangeRoute(props) {
 const { user, loading, mustChangePassword } = useAuth();
 if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
 if (!user) return <Navigate to="/login" replace />;
 if (!mustChangePassword) return <Navigate to="/" replace />;
 return props.children;
}

function AppRoutes() {
 return (
 <Routes>
 <Route path="/login" element={<Login />} />
 <Route path="/change-password" element={<PasswordChangeRoute><Suspense fallback={<div className="loading-screen"><div className="spinner-large" /></div>}><ChangePassword onComplete={() => window.location.href = '/'} /></Suspense></PasswordChangeRoute>} />
 <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
 <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
 <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
 <Route path="/qc" element={<ProtectedRoute><QC /></ProtectedRoute>} />
 <Route path="/activity-logs" element={<ProtectedRoute><ActivityLogs /></ProtectedRoute>} />
 </Routes>
 );
}

export default function App() {
 return (
 <AuthProvider>
 <BrowserRouter>
 <AppRoutes />
 </BrowserRouter>
 </AuthProvider>
 );
}
