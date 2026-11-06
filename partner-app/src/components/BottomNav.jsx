import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Package, QrCode, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchGarmentLifetimeHistory } from '../lib/api';
import QRScannerModal from './QRScannerModal';
import GarmentHistoryModal from './GarmentHistoryModal';

export default function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [scannerOpen, setScannerOpen] = useState(false);
  const [historyModal, setHistoryModal] = useState({ open: false, data: null, loading: false });

  // Hide bottom nav on login, change-password, or unauthenticated views
  if (!user || location.pathname === '/login' || location.pathname === '/change-password') {
    return null;
  }

  const isHome = location.pathname === '/';
  const isOrders = location.pathname.startsWith('/orders');
  const isInvoices = location.pathname.startsWith('/invoices');

  // Staff permission check for Invoices
  const canViewInvoices = !user.isStaff || user.canViewInvoices || user.isAdmin;

  const handleBack = () => {
    if (isHome) {
      if (window.history.length > 1 && window.history.state?.idx > 0) {
        navigate(-1);
      }
    } else {
      navigate(-1);
    }
  };

  const handleScanSuccess = async (scannedCode) => {
    setScannerOpen(false);
    setHistoryModal({ open: true, data: null, loading: true });
    try {
      const history = await fetchGarmentLifetimeHistory(scannedCode);
      setHistoryModal({ open: true, data: history, loading: false });
    } catch (err) {
      alert(`Could not load garment history: ${err.message || err}`);
      setHistoryModal({ open: false, data: null, loading: false });
    }
  };

  return (
    <>
      <nav style={styles.navBar} aria-label="Bottom Navigation">
        {/* 1. Back Button */}
        <button
          onClick={handleBack}
          style={{
            ...styles.navItem,
            opacity: isHome ? 0.45 : 1,
            cursor: isHome ? 'default' : 'pointer',
          }}
          title={isHome ? 'Already at Home' : 'Go back to previous screen'}
        >
          <div style={styles.iconContainer}>
            <ArrowLeft size={20} color={isHome ? '#94a3b8' : '#334155'} strokeWidth={isHome ? 2 : 2.5} />
          </div>
          <span
            style={{
              ...styles.navLabel,
              color: isHome ? '#94a3b8' : '#334155',
              fontWeight: isHome ? 500 : 700,
            }}
          >
            Back
          </span>
        </button>

        {/* 2. Home / Dashboard */}
        <button
          onClick={() => navigate('/')}
          style={styles.navItem}
          title="Dashboard"
        >
          <div style={styles.iconContainer}>
            <LayoutDashboard
              size={20}
              color={isHome ? '#4f46e5' : '#64748b'}
              strokeWidth={isHome ? 2.5 : 2}
            />
          </div>
          <span
            style={{
              ...styles.navLabel,
              color: isHome ? '#4f46e5' : '#64748b',
              fontWeight: isHome ? 700 : 500,
            }}
          >
            Home
          </span>
          {isHome && <div style={styles.activeDot} />}
        </button>

        {/* 3. QR Scan Tag (Center Quick Action) */}
        <button
          onClick={() => setScannerOpen(true)}
          style={styles.navItem}
          title="Scan Garment QR Tag"
        >
          <div style={styles.scanIconContainer}>
            <QrCode size={19} color="#4f46e5" strokeWidth={2.4} />
          </div>
          <span
            style={{
              ...styles.navLabel,
              color: '#4f46e5',
              fontWeight: 700,
            }}
          >
            Scan Tag
          </span>
        </button>

        {/* 4. Orders */}
        <button
          onClick={() => navigate('/orders')}
          style={styles.navItem}
          title="Orders"
        >
          <div style={styles.iconContainer}>
            <Package
              size={20}
              color={isOrders ? '#4f46e5' : '#64748b'}
              strokeWidth={isOrders ? 2.5 : 2}
            />
          </div>
          <span
            style={{
              ...styles.navLabel,
              color: isOrders ? '#4f46e5' : '#64748b',
              fontWeight: isOrders ? 700 : 500,
            }}
          >
            Orders
          </span>
          {isOrders && <div style={styles.activeDot} />}
        </button>

        {/* 5. Invoices (if allowed) */}
        {canViewInvoices && (
          <button
            onClick={() => navigate('/invoices')}
            style={styles.navItem}
            title="Invoices & Settlements"
          >
            <div style={styles.iconContainer}>
              <FileText
                size={20}
                color={isInvoices ? '#4f46e5' : '#64748b'}
                strokeWidth={isInvoices ? 2.5 : 2}
              />
            </div>
            <span
              style={{
                ...styles.navLabel,
                color: isInvoices ? '#4f46e5' : '#64748b',
                fontWeight: isInvoices ? 700 : 500,
              }}
            >
              Invoices
            </span>
            {isInvoices && <div style={styles.activeDot} />}
          </button>
        )}
      </nav>

      {/* Global QR Scanner Modal */}
      <QRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* Global Garment Passport & Lifetime History Modal */}
      <GarmentHistoryModal
        isOpen={historyModal.open}
        onClose={() => setHistoryModal({ open: false, data: null, loading: false })}
        data={historyModal.data}
        loading={historyModal.loading}
      />
    </>
  );
}

const styles = {
  navBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 58,
    backgroundColor: '#ffffff',
    borderTop: '1px solid #e2e8f0',
    boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.07)',
    zIndex: 9990,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    boxSizing: 'content-box',
  },
  navItem: {
    background: 'none',
    border: 'none',
    padding: '4px 0',
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    cursor: 'pointer',
    position: 'relative',
    transition: 'transform 0.1s ease',
    WebkitTapHighlightColor: 'transparent',
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  scanIconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 8,
    background: '#eef2ff',
    border: '1px solid #c7d2fe',
  },
  navLabel: {
    fontSize: 10.5,
    letterSpacing: '-0.01em',
    lineHeight: 1.1,
    transition: 'color 0.15s ease',
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: '50%',
    backgroundColor: '#4f46e5',
  },
};
