import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrdersPage = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const PartnersPage = lazy(() => import('./pages/Partners'));
const InvoicesPage = lazy(() => import('./pages/Invoices'));
const QCPage = lazy(() => import('./pages/QC'));
const CriticalCasesPage = lazy(() => import('./pages/CriticalCases'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ServicesPage = lazy(() => import('./pages/Services'));
const UsersPage = lazy(() => import('./pages/Users'));
const ActivityLogsPage = lazy(() => import('./pages/ActivityLogs'));
const FlowDiagnostics = lazy(() => import('./pages/FlowDiagnostics'));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();
 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
 if (!user) return <Navigate to="/login" replace />;
 return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
 const { user, loading } = useAuth();
 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
 if (user) return <Navigate to="/" replace />;
 return <>{children}</>;
}

function AppRoutes() {
 return (
 <Routes>
 <Route path="/login" element={<PublicRoute><Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /></div>}><Login /></Suspense></PublicRoute>} />
 <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
 <Route index element={<Dashboard />} />
 <Route path="orders" element={<OrdersPage />} />
 <Route path="orders/:orderId" element={<OrderDetail />} />
 <Route path="partners" element={<PartnersPage />} />
 <Route path="invoices" element={<InvoicesPage />} />
 <Route path="qc" element={<QCPage />} />
 <Route path="critical" element={<CriticalCasesPage />} />
 <Route path="settings" element={<SettingsPage />} />
 <Route path="services" element={<ServicesPage />} />
 <Route path="users" element={<UsersPage />} />
 <Route path="activity-logs" element={<ActivityLogsPage />} />
 <Route path="flow" element={<FlowDiagnostics />} />
 </Route>
 </Routes>
 );
}

export default function App() {
 return (
 <QueryClientProvider client={queryClient}>
 <AuthProvider>
 <BrowserRouter>
 <AppRoutes />
 </BrowserRouter>
 </AuthProvider>
 </QueryClientProvider>
 );
}
