import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, ShoppingCart, Shirt, Tag, Users, UserCog, FileText, ShieldAlert, Settings, LogOut, ScrollText, Workflow } from 'lucide-react';
import type { Role } from '../types';

const NAV_ITEMS = [
 { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'PARTNER'] },
 { path: '/orders', label: 'Orders', icon: ShoppingCart, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'PARTNER'] },
 { path: '/garments', label: 'Garments', icon: Shirt, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'PARTNER'] },
 { path: '/flow', label: 'Flow & Diagnostics', icon: Workflow, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] },
 { path: '/partners', label: 'Partners', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] },
 { path: '/services', label: 'Services', icon: Tag, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] },
 { path: '/invoices', label: 'Invoices', icon: FileText, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'PARTNER'] },
 { path: '/qc', label: 'QC Check', icon: ShieldAlert, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] },
 { path: '/critical', label: 'Critical Cases', icon: ShieldAlert, roles: ['ADMIN', 'SUPER_ADMIN', 'STAFF'] },
 { path: '/users', label: 'Users', icon: UserCog, roles: ['ADMIN', 'SUPER_ADMIN'] },
 { path: '/activity-logs', label: 'Activity Logs', icon: ScrollText, roles: ['ADMIN', 'SUPER_ADMIN'] },
 { path: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN', 'SUPER_ADMIN'] },
];

export function Sidebar() {
 const { user, signOut, hasRole } = useAuth();
 const location = useLocation();
 const navigate = useNavigate();
 const filteredItems = NAV_ITEMS.filter(item => item.roles.some(r => hasRole(r as Role)));

 const handleLogout = async () => { await signOut(); navigate('/login'); };

 return (
 <aside className="sidebar">
 <div className="sidebar-header">
 <h1 className="sidebar-title">Amaze Fab</h1>
 <span className="sidebar-subtitle">Operations</span>
 </div>
 <nav className="sidebar-nav">
 {filteredItems.map(item => {
 const Icon = item.icon;
 const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
 return (
 <Link key={item.path} to={item.path} className={`sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}>
 <Icon size={18} />
 <span>{item.label}</span>
 </Link>
 );
 })}
 </nav>
 <div className="sidebar-footer">
 {user && (
 <div className="sidebar-user">
 <div className="sidebar-avatar">{user.name.charAt(0).toUpperCase()}</div>
 <div className="sidebar-user-info">
 <span className="sidebar-user-name">{user.name}</span>
 <span className="sidebar-user-role">{user.role}</span>
 </div>
 <button className="sidebar-logout" onClick={handleLogout} title="Logout"><LogOut size={16} /></button>
 </div>
 )}
 </div>
 </aside>
 );
}
