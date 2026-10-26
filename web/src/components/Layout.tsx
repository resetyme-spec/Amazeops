import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/AuthContext';

export function Layout() {
 const { loading } = useAuth();
 if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;
 return (
 <div className="app-layout">
 <Sidebar />
 <main className="main-content">
 <Outlet />
 </main>
 </div>
 );
}
