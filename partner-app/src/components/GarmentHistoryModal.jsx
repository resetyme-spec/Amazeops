import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Sparkles, Tag, Shirt, Calendar, CheckCircle2, Clock,
  Droplets, ShieldAlert, Image, ExternalLink, ArrowRight
} from 'lucide-react';

const TIER_COLORS = {
  SIGNATURE: { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: 'SIGNATURE CARE' },
  GOLD: { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: 'SIGNATURE CARE' },
  PRISTINE: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'PRISTINE CARE' },
  ORANGE: { bg: '#ffedd5', text: '#c2410c', border: '#fed7aa', label: 'PRISTINE CARE' },
  PREMIUM: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: 'PREMIUM CARE' },
  BLUE: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: 'PREMIUM CARE' },
};

export default function GarmentHistoryModal({ isOpen, onClose, data }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('wardrobe'); // 'wardrobe' | 'treatments' | 'qc' | 'visits'

  if (!isOpen || !data) return null;

  const tier = TIER_COLORS[String(data.category || 'GOLD').toUpperCase()] || TIER_COLORS.GOLD;
  const wardrobePhotoUrl = data.wardrobePhotos?.front || data.wardrobePhotos?.back || Object.values(data.wardrobePhotos || {})[0];

  const handleOpenOrder = (orderId) => {
    onClose();
    navigate(`/orders/${orderId}`);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  ...styles.tierBadge,
                  background: tier.bg,
                  color: tier.text,
                  border: `1px solid ${tier.border}`,
                }}
              >
                {tier.label}
              </span>
              <span style={styles.visitBadge}>
                {data.totalVisits} Total Service(s)
              </span>
            </div>
            <h2 style={styles.title}>{data.garmentType}</h2>
            <p style={styles.metaText}>
              ID: <b>{data.garmentId}</b> · QR: <b>{data.qrCode}</b> · Brand: <b>{data.brand || 'Standard'}</b>
            </p>
          </div>
          <button onClick={onClose} style={styles.closeBtn} title="Close">
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={styles.tabBar}>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'wardrobe' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('wardrobe')}
          >
            <Image size={15} style={{ marginRight: 6 }} /> Wardrobe Twin
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'treatments' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('treatments')}
          >
            <Droplets size={15} style={{ marginRight: 6 }} /> Treatments ({data.solvents?.length || 0})
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'qc' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('qc')}
          >
            <Sparkles size={15} style={{ marginRight: 6 }} /> QC Archive ({data.qcPhotos?.length || 0})
          </button>
          <button
            style={{ ...styles.tabBtn, ...(activeTab === 'visits' ? styles.tabActive : {}) }}
            onClick={() => setActiveTab('visits')}
          >
            <Calendar size={15} style={{ marginRight: 6 }} /> Visits ({data.history?.length || 0})
          </button>
        </div>

        {/* Content Body */}
        <div style={styles.body}>
          {/* TAB 1: Permanent Wardrobe Image */}
          {activeTab === 'wardrobe' && (
            <div style={styles.tabContent}>
              <div style={styles.wardrobeNotice}>
                <Sparkles size={16} color="#4f46e5" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#312e81' }}>Permanent Digital Wardrobe Twin</div>
                  <div style={{ fontSize: 11, color: '#4338ca' }}>
                    Archived directly in AWS S3 <code>Wardrobe/</code> folder during 1st intake QC.
                  </div>
                </div>
              </div>

              {wardrobePhotoUrl ? (
                <div style={styles.imageContainer}>
                  <img
                    src={wardrobePhotoUrl}
                    alt="Wardrobe digital twin"
                    style={styles.wardrobeImg}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div style={styles.imageCaption}>
                    Initial intake photo: Use this reference to verify original fabric shade, patterns, and trims.
                  </div>
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <Shirt size={40} color="#94a3b8" />
                  <p>No first-time wardrobe photo saved yet.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Treatments & Solvents */}
          {activeTab === 'treatments' && (
            <div style={styles.tabContent}>
              <h4 style={styles.sectionHeader}>Solvents & Chemicals Applied in Past Services</h4>
              {data.solvents && data.solvents.length > 0 ? (
                <div style={styles.chipGrid}>
                  {data.solvents.map((s, idx) => (
                    <span key={idx} style={styles.solventChip}>
                      <Droplets size={13} style={{ marginRight: 4 }} color="#0284c7" />
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={styles.subtext}>Standard gentle wash / dry-cleaning applied (no harsh stain removers recorded).</p>
              )}

              <h4 style={{ ...styles.sectionHeader, marginTop: 20 }}>Inspector Notes Across Visits</h4>
              {data.comments && data.comments.length > 0 ? (
                <div style={styles.commentsList}>
                  {data.comments.map((c, idx) => (
                    <div key={idx} style={styles.commentCard}>
                      <div style={styles.commentHeader}>
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>Order {c.orderId}</span>
                        {c.date && <span style={{ color: '#64748b', fontSize: 11 }}>{new Date(c.date).toLocaleDateString()}</span>}
                      </div>
                      <p style={styles.commentBody}>{c.comments}</p>
                      {c.quality && (
                        <div style={styles.qualityRating}>
                          Fabric Quality Rating: <b>{c.quality} / 5 ★</b>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.subtext}>No specific defect or rework comments logged.</p>
              )}
            </div>
          )}

          {/* TAB 3: QC Photo Archive */}
          {activeTab === 'qc' && (
            <div style={styles.tabContent}>
              <h4 style={styles.sectionHeader}>All Inspection Photos ({data.qcPhotos?.length || 0})</h4>
              {data.qcPhotos && data.qcPhotos.length > 0 ? (
                <div style={styles.qcGrid}>
                  {data.qcPhotos.map((p, idx) => (
                    <div key={idx} style={styles.qcCard}>
                      <a href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt={`QC ${p.slot}`} style={styles.qcThumb} />
                      </a>
                      <div style={styles.qcSlotLabel}>
                        <span style={{ textTransform: 'capitalize' }}>{p.slot || 'Photo'}</span>
                        <span style={{ color: '#94a3b8' }}>{p.date ? new Date(p.date).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyState}>
                  <p>No QC inspection photos logged yet.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Service Visits History */}
          {activeTab === 'visits' && (
            <div style={styles.tabContent}>
              <h4 style={styles.sectionHeader}>Service Orders History</h4>
              {data.history && data.history.length > 0 ? (
                <div style={styles.historyList}>
                  {data.history.map((v, idx) => (
                    <div key={idx} style={styles.historyCard}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{v.orderId}</span>
                          <span style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                            {v.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          {new Date(v.date).toLocaleDateString()} {v.hubName ? `· Hub: ${v.hubName}` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenOrder(v.orderId)}
                        style={styles.openOrderBtn}
                        title="View Order Details"
                      >
                        View <ArrowRight size={14} style={{ marginLeft: 4 }} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.subtext}>No previous service records found.</p>
              )}
            </div>
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
    zIndex: 10001,
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
    maxWidth: 520,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    border: '1.5px solid #e2e8f0',
  },
  header: {
    padding: '18px 20px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid #f1f5f9',
    background: '#ffffff',
  },
  tierBadge: {
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  visitBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: '#475569',
    background: '#f1f5f9',
    padding: '2px 8px',
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    margin: '4px 0 2px 0',
    color: '#0f172a',
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    margin: 0,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    overflowX: 'auto',
  },
  tabBtn: {
    flex: '1 0 auto',
    padding: '12px 14px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    color: '#4f46e5',
    borderBottomColor: '#4f46e5',
    background: '#ffffff',
    fontWeight: 700,
  },
  body: {
    padding: 20,
    overflowY: 'auto',
    flex: 1,
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  wardrobeNotice: {
    background: '#eef2ff',
    border: '1px solid #c7d2fe',
    borderRadius: 12,
    padding: '10px 14px',
    display: 'flex',
    gap: 10,
    alignItems: 'center',
  },
  imageContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    border: '1.5px solid #e2e8f0',
    background: '#f8fafc',
    textAlign: 'center',
  },
  wardrobeImg: {
    width: '100%',
    maxHeight: 280,
    objectFit: 'contain',
    background: '#ffffff',
  },
  imageCaption: {
    padding: '10px 14px',
    fontSize: 12,
    color: '#64748b',
    background: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: '#334155',
    margin: '0 0 8px 0',
  },
  subtext: {
    fontSize: 12,
    color: '#64748b',
    margin: 0,
  },
  chipGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  solventChip: {
    display: 'inline-flex',
    alignItems: 'center',
    background: '#f0f9ff',
    border: '1px solid #bae6fd',
    color: '#0369a1',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  commentCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '10px 14px',
  },
  commentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    marginBottom: 4,
  },
  commentBody: {
    fontSize: 13,
    color: '#334155',
    margin: 0,
  },
  qualityRating: {
    fontSize: 11,
    color: '#d97706',
    marginTop: 6,
  },
  qcGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 10,
  },
  qcCard: {
    borderRadius: 10,
    overflow: 'hidden',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  qcThumb: {
    width: '100%',
    height: 120,
    objectFit: 'cover',
    display: 'block',
  },
  qcSlotLabel: {
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: '#334155',
    display: 'flex',
    justifyContent: 'space-between',
    background: '#ffffff',
    borderTop: '1px solid #f1f5f9',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  historyCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderRadius: 10,
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
  },
  openOrderBtn: {
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 700,
    color: '#4f46e5',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  emptyState: {
    padding: 32,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 13,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
};
