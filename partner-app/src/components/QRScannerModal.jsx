import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Keyboard, AlertCircle, RefreshCw } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'manual'
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    if (activeTab === 'camera') {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, activeTab]);

  const startScanner = async () => {
    setError('');
    setIsScanning(true);

    try {
      // Small delay to ensure DOM container is rendered
      await new Promise(r => setTimeout(r, 150));

      const element = document.getElementById(containerId);
      if (!element) return;

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(containerId);
      }

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await scannerRef.current.start(
        { facingMode: 'environment' }, // Rear camera on mobile
        config,
        (decodedText) => {
          handleSuccess(decodedText);
        },
        () => {
          // Frame decode failure (normal while searching)
        }
      );
    } catch (err) {
      console.warn('[QR Scanner] Camera start error:', err);
      setError('Could not access camera. Please allow camera permissions or enter the code manually below.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        // Ignore stop error
      }
    }
    scannerRef.current = null;
    setIsScanning(false);
  };

  const handleSuccess = (code) => {
    if (!code) return;
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    stopScanner();
    onScanSuccess(code.trim());
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      setError('Please enter a valid garment ID or QR code.');
      return;
    }
    handleSuccess(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={() => { stopScanner(); onClose(); }}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={styles.headerIcon}>
              <Camera size={18} color="#4f46e5" />
            </div>
            <div>
              <h3 style={styles.title}>Scan Garment Tag</h3>
              <p style={styles.subtitle}>Hold camera over the garment QR tag</p>
            </div>
          </div>
          <button
            onClick={() => { stopScanner(); onClose(); }}
            style={styles.closeBtn}
            title="Close scanner"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab switch */}
        <div style={styles.tabBar}>
          <button
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'camera' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('camera')}
          >
            <Camera size={15} style={{ marginRight: 6 }} /> Camera Scan
          </button>
          <button
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'manual' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('manual')}
          >
            <Keyboard size={15} style={{ marginRight: 6 }} /> Manual Entry
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'camera' ? (
            <div style={styles.scannerWrapper}>
              <div id={containerId} style={styles.scannerContainer}></div>
              <p style={styles.scannerHint}>
                Align the physical garment tag inside the box
              </p>
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} style={styles.manualForm}>
              <label style={styles.manualLabel}>Garment ID or QR String</label>
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="e.g. GAR-1793394693229-331 or QR-123"
                style={styles.manualInput}
                autoFocus
              />
              <button type="submit" style={styles.submitBtn}>
                Look Up Garment History
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    animation: 'fadeIn 0.2s ease-out',
  },
  modal: {
    background: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    border: '1.5px solid #e2e8f0',
  },
  header: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #f1f5f9',
    background: '#f8fafc',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: '#eef2ff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 800,
    margin: 0,
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    margin: '2px 0 0 0',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 6,
    display: 'flex',
    alignItems: 'center',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    background: '#ffffff',
  },
  tabBtn: {
    flex: 1,
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: 13,
    fontWeight: 600,
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#4f46e5',
    borderBottomColor: '#4f46e5',
    background: '#f8fafc',
  },
  body: {
    padding: 20,
    minHeight: 280,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  errorBanner: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#991b1b',
    fontSize: 12,
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  scannerWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  scannerContainer: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 14,
    overflow: 'hidden',
    border: '2px solid #e2e8f0',
    background: '#000000',
  },
  scannerHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 12,
    textAlign: 'center',
  },
  manualForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  manualLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#334155',
  },
  manualInput: {
    padding: '12px 14px',
    borderRadius: 10,
    border: '1.5px solid #cbd5e1',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'monospace',
  },
  submitBtn: {
    padding: '12px',
    background: '#4f46e5',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 6,
  },
};
