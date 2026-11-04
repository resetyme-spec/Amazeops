import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToPartnerOrders } from '../lib/api';
import {
  playOrderNotificationSound,
  unlockAudio,
  isSoundEnabled,
  setSoundEnabled,
} from '../lib/sound';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showOrderPushNotification,
} from '../lib/notifications';
import { Bell, Volume2, VolumeX, X, ArrowRight, Sparkles } from 'lucide-react';

export default function NotificationManager() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeAlert, setActiveAlert] = useState(null);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [showPermPrompt, setShowPermPrompt] = useState(false);

  // Global unlock audio on user's first click or touch
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Show permission prompt if not yet granted
  useEffect(() => {
    if (isNotificationSupported() && notifPermission === 'default') {
      const timer = setTimeout(() => setShowPermPrompt(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setShowPermPrompt(false);
    }
  }, [notifPermission]);

  // Subscribe to real-time partner order updates
  useEffect(() => {
    if (!user?.id) return;

    const unsubscribe = subscribeToPartnerOrders(user.id, {
      onNewOrder: (newOrder) => {
        console.log('[NotificationManager] NEW incoming order detected:', newOrder);

        const subOrderId = newOrder.id;
        const parentOrderId = newOrder.orderId || subOrderId;
        const garmentCount = newOrder.garmentIds?.length || newOrder.garments?.length || 1;
        const hubName = newOrder.hubName || newOrder.sourceHub || '';

        // 1. Play sound
        playOrderNotificationSound();

        // 2. Browser Push Notification
        showOrderPushNotification({
          orderId: parentOrderId,
          subOrderId,
          garmentCount,
          hubName,
          onClick: () => {
            navigate(`/orders/${subOrderId}`);
            setActiveAlert(null);
          },
        });

        // 3. In-App Banner/Modal Alert
        setActiveAlert({
          subOrderId,
          parentOrderId,
          garmentCount,
          hubName,
          createdAt: new Date(),
        });
      },
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.id, navigate]);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      unlockAudio();
      playOrderNotificationSound();
    }
  };

  const handleEnablePush = async () => {
    unlockAudio();
    playOrderNotificationSound();
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    setShowPermPrompt(false);
  };

  const handleViewOrder = (subOrderId) => {
    setActiveAlert(null);
    navigate(`/orders/${subOrderId}`);
  };

  return (
    <>
      {/* 1. Global Floating Permission Prompt Pill */}
      {showPermPrompt && (
        <div style={styles.permBanner}>
          <div style={styles.permContent}>
            <Bell size={18} color="#4f46e5" className="bell-shake" />
            <span style={styles.permText}>
              Enable sound & push alerts for incoming orders
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={handleEnablePush} style={styles.permBtn}>
              Enable Alerts
            </button>
            <button
              onClick={() => setShowPermPrompt(false)}
              style={styles.permCloseBtn}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 2. Floating Sound Toggle Button (Bottom-Right) */}
      {user && (
        <button
          onClick={handleToggleSound}
          style={{
            ...styles.soundToggleBtn,
            background: soundOn ? '#4f46e5' : '#6b7280',
          }}
          title={soundOn ? 'Order sounds are ON (click to mute)' : 'Order sounds are MUTED (click to enable)'}
        >
          {soundOn ? <Volume2 size={18} color="#fff" /> : <VolumeX size={18} color="#fff" />}
        </button>
      )}

      {/* 3. High-Priority In-App Order Alert Modal / Banner */}
      {activeAlert && (
        <div style={styles.alertOverlay}>
          <div style={styles.alertCard}>
            <div style={styles.alertHeader}>
              <div style={styles.alertIconWrap}>
                <Bell size={24} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.alertBadge}>
                  <Sparkles size={12} style={{ marginRight: 4 }} /> NEW ORDER ASSIGNED
                </div>
                <h3 style={styles.alertTitle}>New Order Received!</h3>
                <p style={styles.alertSubtitle}>
                  Order <b>{activeAlert.subOrderId}</b>
                </p>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                style={styles.closeAlertBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.alertBody}>
              <div style={styles.alertDetailRow}>
                <span style={styles.detailLabel}>Garments</span>
                <span style={styles.detailVal}>
                  <b>{activeAlert.garmentCount}</b> item(s) to process
                </span>
              </div>
              {activeAlert.hubName && (
                <div style={styles.alertDetailRow}>
                  <span style={styles.detailLabel}>Source Hub</span>
                  <span style={styles.detailVal}>{activeAlert.hubName}</span>
                </div>
              )}
            </div>

            <div style={styles.alertActions}>
              <button
                onClick={() => playOrderNotificationSound()}
                style={styles.replaySoundBtn}
                title="Replay sound"
              >
                <Volume2 size={16} /> Sound
              </button>
              <button
                onClick={() => handleViewOrder(activeAlert.subOrderId)}
                style={styles.acceptOrderBtn}
              >
                View & Accept Order <ArrowRight size={16} style={{ marginLeft: 6 }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  permBanner: {
    position: 'fixed',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    background: '#ffffff',
    border: '1px solid #c7d2fe',
    boxShadow: '0 8px 24px rgba(79, 70, 229, 0.18)',
    borderRadius: 30,
    padding: '8px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: '92vw',
  },
  permContent: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  permText: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1f2937',
    whiteSpace: 'nowrap',
  },
  permBtn: {
    background: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: 20,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  permCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  soundToggleBtn: {
    position: 'fixed',
    bottom: 80,
    right: 16,
    zIndex: 9998,
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '2px solid #ffffff',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  alertOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.65)',
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    animation: 'fadeIn 0.2s ease-out',
  },
  alertCard: {
    background: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    overflow: 'hidden',
    border: '2px solid #6366f1',
    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  alertHeader: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    color: '#ffffff',
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  alertIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'pulse 1.5s infinite',
  },
  alertBadge: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.8,
    background: '#22c55e',
    color: '#ffffff',
    padding: '2px 8px',
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: 0,
    color: '#ffffff',
  },
  alertSubtitle: {
    fontSize: 12,
    opacity: 0.9,
    margin: '2px 0 0 0',
    color: '#e0e7ff',
  },
  closeAlertBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    opacity: 0.8,
    cursor: 'pointer',
    padding: 4,
  },
  alertBody: {
    padding: '18px 20px',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  alertDetailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#334155',
  },
  detailLabel: {
    color: '#64748b',
    fontWeight: 500,
  },
  detailVal: {
    color: '#0f172a',
    fontWeight: 600,
  },
  alertActions: {
    padding: '14px 20px 18px',
    background: '#ffffff',
    display: 'flex',
    gap: 10,
    borderTop: '1px solid #e2e8f0',
  },
  replaySoundBtn: {
    flex: '0 0 auto',
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  acceptOrderBtn: {
    flex: 1,
    background: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
  },
};
