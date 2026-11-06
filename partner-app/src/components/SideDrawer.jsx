import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  X,
  LayoutDashboard,
  Package,
  QrCode,
  FileText,
  Lock,
  LogOut,
  ChevronRight,
  Shield,
  Volume2,
  VolumeX,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isSoundEnabled, setSoundEnabled, playOrderNotificationSound } from '../lib/sound';

export default function SideDrawer({ isOpen, onClose, onOpenScanner }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, [isOpen]);

  if (!user) return null;

  const isHome = location.pathname === '/';
  const isOrders = location.pathname.startsWith('/orders');
  const isInvoices = location.pathname.startsWith('/invoices');
  const isChangePwd = location.pathname === '/change-password';

  const canViewInvoices = !user.isStaff || user.canViewInvoices || user.isAdmin;

  const handleNav = (path) => {
    onClose();
    navigate(path);
  };

  const handleScanClick = () => {
    onClose();
    if (onOpenScanner) {
      onOpenScanner();
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      playOrderNotificationSound();
    }
  };

  const handleLogoutClick = () => {
    onClose();
    logout();
    navigate('/login');
  };

  const initials = (user.name || 'P')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease-out',
        }}
      />

      {/* Slide-out Drawer Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '82vw',
          maxWidth: 340,
          backgroundColor: '#ffffff',
          boxShadow: '-8px 0 28px rgba(0, 0, 0, 0.22)',
          zIndex: 10001,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
          boxSizing: 'border-box',
        }}
      >
        {/* Drawer Header & Profile Card */}
        <div style={styles.header}>
          <div style={styles.profileRow}>
            <div style={styles.avatar}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={styles.userName}>{user.name}</h3>
              <div style={styles.badgeRow}>
                <span style={styles.roleBadge}>
                  {user.isStaff ? (
                    <>
                      <UserCheck size={11} style={{ marginRight: 4 }} />
                      STAFF {user.canApproveQc ? '· QC' : ''} {user.canViewInvoices ? '· INVOICES' : ''}
                    </>
                  ) : (
                    <>
                      <Shield size={11} style={{ marginRight: 4 }} />
                      {user.role || 'PARTNER'}
                    </>
                  )}
                </span>
              </div>
              <div style={styles.userIdText}>ID: {user.partnerId || user.id}</div>
            </div>
            <button onClick={onClose} style={styles.closeBtn} title="Close menu">
              <X size={20} color="#64748b" />
            </button>
          </div>
        </div>

        {/* Navigation Menu Items (Mirroring bottom menu + settings) */}
        <div style={styles.menuBody}>
          <div style={styles.sectionHeader}>NAVIGATION</div>

          {/* 1. Home / Dashboard */}
          <button
            onClick={() => handleNav('/')}
            style={{
              ...styles.menuItem,
              backgroundColor: isHome ? '#eef2ff' : 'transparent',
              color: isHome ? '#4f46e5' : '#1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  ...styles.menuIconWrap,
                  backgroundColor: isHome ? '#c7d2fe' : '#f1f5f9',
                  color: isHome ? '#4f46e5' : '#64748b',
                }}
              >
                <LayoutDashboard size={18} />
              </div>
              <span style={{ fontWeight: isHome ? 700 : 600, fontSize: 14 }}>Home Dashboard</span>
            </div>
            <ChevronRight size={16} color={isHome ? '#4f46e5' : '#94a3b8'} />
          </button>

          {/* 2. Orders */}
          <button
            onClick={() => handleNav('/orders')}
            style={{
              ...styles.menuItem,
              backgroundColor: isOrders ? '#eef2ff' : 'transparent',
              color: isOrders ? '#4f46e5' : '#1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  ...styles.menuIconWrap,
                  backgroundColor: isOrders ? '#c7d2fe' : '#f1f5f9',
                  color: isOrders ? '#4f46e5' : '#64748b',
                }}
              >
                <Package size={18} />
              </div>
              <span style={{ fontWeight: isOrders ? 700 : 600, fontSize: 14 }}>Orders & Processing</span>
            </div>
            <ChevronRight size={16} color={isOrders ? '#4f46e5' : '#94a3b8'} />
          </button>

          {/* 3. Scan Garment Tag & History */}
          <button onClick={handleScanClick} style={styles.menuItem}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  ...styles.menuIconWrap,
                  backgroundColor: '#e0e7ff',
                  color: '#4338ca',
                }}
              >
                <QrCode size={18} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                Scan Garment Tag
              </span>
            </div>
            <span style={styles.tagBadge}>QR CAM</span>
          </button>

          {/* 4. Invoices & Settlements (if authorized) */}
          {canViewInvoices && (
            <button
              onClick={() => handleNav('/invoices')}
              style={{
                ...styles.menuItem,
                backgroundColor: isInvoices ? '#eef2ff' : 'transparent',
                color: isInvoices ? '#4f46e5' : '#1e293b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    ...styles.menuIconWrap,
                    backgroundColor: isInvoices ? '#c7d2fe' : '#f1f5f9',
                    color: isInvoices ? '#4f46e5' : '#64748b',
                  }}
                >
                  <FileText size={18} />
                </div>
                <span style={{ fontWeight: isInvoices ? 700 : 600, fontSize: 14 }}>
                  Invoices & Settlements
                </span>
              </div>
              <ChevronRight size={16} color={isInvoices ? '#4f46e5' : '#94a3b8'} />
            </button>
          )}

          <div style={styles.divider} />
          <div style={styles.sectionHeader}>PREFERENCES & SECURITY</div>

          {/* 5. Sound Chime Toggle */}
          <div style={styles.settingRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  ...styles.menuIconWrap,
                  backgroundColor: soundOn ? '#dbeafe' : '#f1f5f9',
                  color: soundOn ? '#2563eb' : '#64748b',
                }}
              >
                {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Order Chime</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {soundOn ? 'Sound enabled on new order' : 'Sound alerts are muted'}
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleSound}
              style={{
                ...styles.toggleBtn,
                backgroundColor: soundOn ? '#4f46e5' : '#cbd5e1',
              }}
            >
              <div
                style={{
                  ...styles.toggleThumb,
                  transform: soundOn ? 'translateX(18px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {/* 6. Change Password */}
          <button
            onClick={() => handleNav('/change-password')}
            style={{
              ...styles.menuItem,
              backgroundColor: isChangePwd ? '#eef2ff' : 'transparent',
              color: isChangePwd ? '#4f46e5' : '#1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  ...styles.menuIconWrap,
                  backgroundColor: isChangePwd ? '#c7d2fe' : '#f1f5f9',
                  color: isChangePwd ? '#4f46e5' : '#64748b',
                }}
              >
                <Lock size={18} />
              </div>
              <span style={{ fontWeight: isChangePwd ? 700 : 600, fontSize: 14 }}>
                Change Password
              </span>
            </div>
            <ChevronRight size={16} color={isChangePwd ? '#4f46e5' : '#94a3b8'} />
          </button>
        </div>

        {/* Drawer Footer with Logout Button */}
        <div style={styles.footer}>
          <button onClick={handleLogoutClick} style={styles.logoutBtn}>
            <LogOut size={18} color="#dc2626" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>Sign Out</span>
          </button>
          <div style={styles.versionText}>Amaze Partner App • v1.0.0</div>
        </div>
      </aside>
    </>,
    document.body
  );
}

const styles = {
  header: {
    padding: '16px 18px',
    borderBottom: '1px solid #f1f5f9',
    background: 'linear-gradient(135deg, #f8fafc, #ffffff)',
  },
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 16,
    boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)',
    flexShrink: 0,
  },
  userName: {
    fontSize: 15,
    fontWeight: 800,
    color: '#0f172a',
    margin: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  badgeRow: {
    marginTop: 3,
  },
  roleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#4f46e5',
    backgroundColor: '#eef2ff',
    padding: '2px 8px',
    borderRadius: 6,
    border: '1px solid #c7d2fe',
  },
  userIdText: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  closeBtn: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    width: 34,
    height: 34,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  menuBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.05em',
    color: '#94a3b8',
    padding: '6px 8px 4px',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    transition: 'background 0.15s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  menuIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tagBadge: {
    fontSize: 10,
    fontWeight: 800,
    backgroundColor: '#4338ca',
    color: '#ffffff',
    padding: '2px 6px',
    borderRadius: 6,
    letterSpacing: '0.04em',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    margin: '10px 0',
  },
  settingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 10,
  },
  toggleBtn: {
    width: 44,
    height: 26,
    borderRadius: 13,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background-color 0.2s ease',
    padding: 2,
    outline: 'none',
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    transition: 'transform 0.2s ease',
  },
  footer: {
    padding: '14px 16px',
    borderTop: '1px solid #f1f5f9',
    backgroundColor: '#fafbfc',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '11px',
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  versionText: {
    textAlign: 'center',
    fontSize: 10.5,
    color: '#94a3b8',
    fontWeight: 500,
  },
};
