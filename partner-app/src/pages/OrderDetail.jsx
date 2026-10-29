import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Truck, QrCode, Tag, MessageSquare,
  User, AlertTriangle, ImagePlus, X as XIcon, Camera, Upload, RefreshCw, Eye,
  ChevronDown, ChevronUp, Star, Droplets, Sparkles, Building2, MapPin, Phone, Navigation
} from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { fetchOrderById, acceptOrder, rejectOrder, markGarmentCritical, submitQC, submitGarmentReQC, initiateDelivery } from '../lib/api';
import { uploadToS3 } from '../lib/s3';

// Care Categories: Signature (Gold), Pristine (Orange), Premium (Blue)
const TIER_COLORS = {
  SIGNATURE: '#d97706',
  GOLD: '#d97706',
  PRISTINE: '#ea580c',
  ORANGE: '#ea580c',
  YELLOW: '#ea580c',
  PREMIUM: '#2563eb',
  BLUE: '#2563eb',
};
const TIER_BG = {
  SIGNATURE: '#fef3c7',
  GOLD: '#fef3c7',
  PRISTINE: '#ffedd5',
  ORANGE: '#ffedd5',
  YELLOW: '#ffedd5',
  PREMIUM: '#eff6ff',
  BLUE: '#eff6ff',
};

function getCareDetails(cat) {
  const raw = String(cat || 'PREMIUM').toUpperCase();
  const c = raw.includes('SIGNATURE') || raw === 'GOLD' ? 'SIGNATURE' : raw.includes('PRISTINE') || raw === 'ORANGE' || raw === 'YELLOW' ? 'PRISTINE' : 'PREMIUM';
  const label = c === 'SIGNATURE' ? 'Signature' : c === 'PRISTINE' ? 'Pristine' : 'Premium';
  const icon = c === 'SIGNATURE' ? '👑' : c === 'PRISTINE' ? '✨' : '💎';
  const color = TIER_COLORS[c];
  const bg = TIER_BG[c];
  return { key: c, label, icon, color, bg };
}

const QUALITY_LABELS = {
  5: '5/5 — Excellent (Like New)',
  4: '4/5 — Good (Minimal Wear)',
  3: '3/5 — Fair (Normal Wear)',
  2: '2/5 — Average (Minor Fading / Pilling)',
  1: '1/5 — Heavy Wear / Aged Fabric'
};

const SUGGESTED_STAIN_TYPES = [
  { code: 'S01', name: 'Tea / Coffee', examples: 'Tea, filter coffee' },
  { code: 'S02', name: 'Oil / Grease', examples: 'Cooking oil, ghee' },
  { code: 'S03', name: 'Food / Curry', examples: 'Gravy, masala, turmeric' },
  { code: 'S04', name: 'Green / Grass', examples: 'Grass, leaves' },
  { code: 'S05', name: 'Ink', examples: 'Pen, marker' },
  { code: 'S06', name: 'Cosmetics', examples: 'Lipstick, makeup' },
  { code: 'S07', name: 'Sweat / Body Soil', examples: 'Collar, underarm' },
  { code: 'S08', name: 'Blood / Protein', examples: 'Blood, egg' },
  { code: 'S09', name: 'Dye Transfer', examples: 'Colour bleeding' },
  { code: 'S10', name: 'Unknown / Other', examples: 'Unidentified stain' },
];

function careBadge(cat) {
  const c = (cat || 'Normal').toLowerCase();
  const crown = c === 'premium' ? '👑' : c === 'pristine' ? '🥈' : '🖤';
  const color = c === 'premium' ? '#d97706' : '#9ca3af';
  const bg = c === 'premium' ? '#fef3c7' : '#f3f4f6';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>{crown} {cat || 'Normal'}</span>;
}

function customerLabel(name, category) {
  const c = (category || '').toLowerCase();
  if (c === "l'amaze prime") return <span style={{ color: '#d97706', fontWeight: 600 }}>* {name}</span>;
  if (c === 'signature') return <span style={{ color: '#d97706', fontWeight: 600 }}>{name}</span>;
  if (c === 'regular') return <span style={{ color: '#9ca3af' }}>{name}</span>;
  return <span>{name}</span>;
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [qcForm, setQcForm] = useState({});

  // Critical mark modal state
  const [criticalModal, setCriticalModal] = useState({ open: false, garment: null });
  const [criticalComments, setCriticalComments] = useState('');
  const [criticalPhotos, setCriticalPhotos] = useState(['', '', '']);

  // Reject modal state
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // QC form visibility
  const [showQcForm, setShowQcForm] = useState(false);
  const [qcSuccess, setQcSuccess] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');

  // Re-QC Modal state for garment-wise re-application
  const [reQcModal, setReQcModal] = useState({
    open: false,
    garment: null,
    rejection: null,
    brand: '',
    comments: '',
    photos: { front: '', back: '', other: '' },
    garmentQuality: 5,
    solvents: [],
    stainTypes: []
  });
  const [reQcSubmitting, setReQcSubmitting] = useState(false);

  // Suggested Stain Type Master
  const [availableStainTypes, setAvailableStainTypes] = useState(SUGGESTED_STAIN_TYPES);

  useEffect(() => {
    async function fetchStains() {
      try {
        const snap = await getDocs(collection(db, 'stainTypes'));
        if (!snap.empty) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false);
          list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
          if (list.length > 0) setAvailableStainTypes(list);
        }
      } catch (e) {
        // Fallback to SUGGESTED_STAIN_TYPES
      }
    }
    fetchStains();
  }, []);

  // Photo Preview Lightbox
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingSlots, setUploadingSlots] = useState({});

  // Expandable sections
  const [showTopDefectDetails, setShowTopDefectDetails] = useState(false);
  const [expandedGarments, setExpandedGarments] = useState({});
  const [qcModalGarment, setQcModalGarment] = useState(null);
  const [qcWarningModal, setQcWarningModal] = useState({ open: false, pendingGarments: [] });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const data = await fetchOrderById(id);
    setOrder(data);

    const isRejectedQC = data?.qcStatus === 'QC_REJECTED' || data?.status === 'QC_REJECTED' || !!data?.qcRejection;
    setShowQcForm(isRejectedQC);

    if (data?.garments) {
      const initial = {};
      const updates = data.garmentUpdates || data.qcRecord?.garmentUpdates || [];
      data.garments.forEach(g => {
        const prev = updates.find(u => u.garmentId === g.garmentId);
        const stains = prev?.stainTypes || prev?.solvents || g.stainTypes || g.solvents || [];
        initial[g.garmentId] = {
          brand: prev?.brand || g.brand || '',
          comments: prev?.comments || g.comments || '',
          photos: prev?.photos || g.photos || { front: '', back: '', other: '' },
          garmentQuality: prev?.garmentQuality || g.garmentQuality || 5,
          solvents: stains,
          stainTypes: stains,
        };
      });
      setQcForm(initial);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handlePhotoUpload = async (garmentId, slot, file) => {
    if (!file) return;
    const slotKey = `qc_${garmentId}_${slot}`;
    setUploadingSlots(prev => ({ ...prev, [slotKey]: true }));
    setError('');
    try {
      const s3Url = await uploadToS3(file, 'qc-photos', `${id}_${garmentId}_${slot}`);
      setQcForm(prev => {
        const current = prev[garmentId] || { brand: '', comments: '', photos: {} };
        return {
          ...prev,
          [garmentId]: {
            ...current,
            photos: {
              ...current.photos,
              [slot]: s3Url,
            },
          },
        };
      });
    } catch (err) {
      console.error('Failed to upload photo to S3:', err);
      setError(`Failed to upload photo to S3: ${err.message}`);
    } finally {
      setUploadingSlots(prev => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    }
  };

  const handleBatchPhotoUpload = async (garmentId, files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files).slice(0, 3);
    const slots = ['front', 'back', 'other'];
    const currentPhotos = { ...(qcForm[garmentId]?.photos || {}) };

    let targetSlots = [];
    if (fileList.length >= 3) {
      targetSlots = ['front', 'back', 'other'];
    } else {
      const emptySlots = slots.filter(s => !currentPhotos[s]);
      if (emptySlots.length >= fileList.length) {
        targetSlots = emptySlots.slice(0, fileList.length);
      } else {
        targetSlots = slots.slice(0, fileList.length);
      }
    }

    const batchKey = `qc_batch_${garmentId}`;
    setUploadingSlots(prev => ({ ...prev, [batchKey]: true }));
    setError('');

    try {
      const uploadPromises = fileList.map(async (file, idx) => {
        const slot = targetSlots[idx] || slots[idx];
        const s3Url = await uploadToS3(file, 'qc-photos', `${id}_${garmentId}_${slot}`);
        return { slot, s3Url };
      });

      const uploaded = await Promise.all(uploadPromises);
      setQcForm(prev => {
        const current = prev[garmentId] || { brand: '', comments: '', photos: {} };
        const updatedPhotos = { ...(current.photos || {}) };
        uploaded.forEach(({ slot, s3Url }) => {
          updatedPhotos[slot] = s3Url;
        });
        return {
          ...prev,
          [garmentId]: {
            ...current,
            photos: updatedPhotos,
            isUpdated: true
          }
        };
      });
    } catch (err) {
      console.error('Failed to upload QC photos:', err);
      setError(`Failed to upload photo: ${err.message}`);
    } finally {
      setUploadingSlots(prev => {
        const next = { ...prev };
        delete next[batchKey];
        return next;
      });
    }
  };

  const handleAccept = async () => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      await acceptOrder(id, user);
      await load();
    } catch (e) { setError(e.message || 'Failed to accept'); }
    setActionLoading(false);
  };

  const handleSubmitQC = async () => {
    if (!id || !user || !order) return;
    setError('');

    // Require QC details to be updated for ALL active garments
    const activeGarments = (order.garments || []).filter(g => {
      const isReassigned = g.isReassigned === true || g.criticalStatus === 'REASSIGNED' || !!g.adminCriticalComment;
      const isCritical = g.isCritical === true && !isReassigned;
      return !isCritical && !isReassigned;
    });

    const pendingGarments = activeGarments.filter(g => {
      const form = qcForm[g.garmentId] || {};
      const photosCount = Object.values(form.photos || {}).filter(Boolean).length;
      const isUpdated = !!(form.isUpdated || form.brand?.trim() || form.comments?.trim() || photosCount > 0);
      return !isUpdated;
    });

    if (pendingGarments.length > 0) {
      setQcWarningModal({ open: true, pendingGarments });
      return;
    }
    const careCategory = order.careCategory || 'Premium';
    const requiresQC = true;
    const triggerReason = `${careCategory} care requires QC photos, brand, and comments`;

    const updates = order.garments.map(g => {
      const form = qcForm[g.garmentId] || { brand: '', comments: '', photos: {} };
      if (requiresQC) {
        const missing = [];
        if (!form.brand?.trim()) missing.push('brand');
        if (!form.comments?.trim()) missing.push('comments');
        if (!form.photos?.front || !form.photos?.back || !form.photos?.other) missing.push('photos');
        if (missing.length > 0) {
          throw new Error(`${triggerReason}. Please complete all mandatory QC details before proceeding. Missing for ${g.garmentId}: ${missing.join(', ')}.`);
        }
      }
      return {
        garmentId: g.garmentId,
        brand: form.brand,
        comments: form.comments,
        photos: form.photos,
        garmentQuality: form.garmentQuality || 5,
        solvents: form.stainTypes || form.solvents || [],
        stainTypes: form.stainTypes || form.solvents || []
      };
    });

    setActionLoading(true);
    try {
      await submitQC(id, updates, user, false);
      setQcSuccess(true);
      setTimeout(() => { navigate('/orders', { replace: true }); window.location.reload(); }, 1200);
    } catch (e) { setError(e.message || 'Failed to submit QC'); }
    setActionLoading(false);
  };

  // Handle garment-wise Re-QC Modal
  const openReQcModal = (garment, rej) => {
    const existingForm = qcForm[garment.garmentId] || {};
    const stains = existingForm.stainTypes || existingForm.solvents || garment.stainTypes || garment.solvents || [];
    setReQcModal({
      open: true,
      garment,
      rejection: rej || {},
      brand: existingForm.brand || garment.brand || '',
      comments: existingForm.comments || '',
      photos: existingForm.photos || garment.photos || { front: '', back: '', other: '' },
      garmentQuality: existingForm.garmentQuality || garment.garmentQuality || 5,
      solvents: stains,
      stainTypes: stains
    });
  };

  const handleModalPhotoUpload = async (slot, file) => {
    if (!file) return;
    const slotKey = `modal_${slot}`;
    setUploadingSlots(prev => ({ ...prev, [slotKey]: true }));
    setError('');
    try {
      const garmentId = reQcModal.garment?.garmentId || 'garment';
      const s3Url = await uploadToS3(file, 'qc-photos', `${id}_reQC_${garmentId}_${slot}`);
      setReQcModal(prev => ({
        ...prev,
        photos: {
          ...prev.photos,
          [slot]: s3Url
        }
      }));
    } catch (err) {
      console.error('Failed to upload Re-QC photo to S3:', err);
      setError(`Failed to upload photo to S3: ${err.message}`);
    } finally {
      setUploadingSlots(prev => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    }
  };

  const handleBatchModalPhotoUpload = async (files) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files).slice(0, 3);
    const slots = ['front', 'back', 'other'];
    const currentPhotos = { ...(reQcModal.photos || {}) };

    let targetSlots = [];
    if (fileList.length >= 3) {
      targetSlots = ['front', 'back', 'other'];
    } else {
      const emptySlots = slots.filter(s => !currentPhotos[s]);
      if (emptySlots.length >= fileList.length) {
        targetSlots = emptySlots.slice(0, fileList.length);
      } else {
        targetSlots = slots.slice(0, fileList.length);
      }
    }

    const batchKey = 'modal_batch';
    setUploadingSlots(prev => ({ ...prev, [batchKey]: true }));
    setError('');

    try {
      const garmentId = reQcModal.garment?.garmentId || 'garment';
      const uploadPromises = fileList.map(async (file, idx) => {
        const slot = targetSlots[idx] || slots[idx];
        const s3Url = await uploadToS3(file, 'qc-photos', `${id}_reQC_${garmentId}_${slot}`);
        return { slot, s3Url };
      });

      const uploaded = await Promise.all(uploadPromises);
      setReQcModal(prev => {
        const updatedPhotos = { ...(prev.photos || {}) };
        uploaded.forEach(({ slot, s3Url }) => {
          updatedPhotos[slot] = s3Url;
        });
        return {
          ...prev,
          photos: updatedPhotos
        };
      });
    } catch (err) {
      console.error('Failed to upload Re-QC photos:', err);
      setError(`Failed to upload Re-QC photo: ${err.message}`);
    } finally {
      setUploadingSlots(prev => {
        const next = { ...prev };
        delete next[batchKey];
        return next;
      });
    }
  };

  const handleCriticalPhotoUpload = async (index, file) => {
    if (!file) return;
    const slotKey = `critical_${index}`;
    setUploadingSlots(prev => ({ ...prev, [slotKey]: true }));
    setError('');
    try {
      const garmentId = criticalModal.garment?.garmentId || 'garment';
      const s3Url = await uploadToS3(file, 'critical-photos', `${id}_critical_${garmentId}_${index + 1}`);
      setCriticalPhotos(prev => {
        const next = [...prev];
        next[index] = s3Url;
        return next;
      });
    } catch (err) {
      console.error('Failed to upload critical photo to S3:', err);
      setError(`Failed to upload photo to S3: ${err.message}`);
    } finally {
      setUploadingSlots(prev => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    }
  };

  const handleSubmitSingleGarmentReQC = async () => {
    if (!reQcModal.garment || !id || !user) return;
    if (!reQcModal.comments?.trim()) {
      setError('Please provide comments explaining the rework done.');
      return;
    }
    const { front, back, other } = reQcModal.photos || {};
    if (!front || !back || !other) {
      setError('Please upload all 3 photos (Front, Back, and Other) for Re-QC inspection.');
      return;
    }
    setReQcSubmitting(true);
    setError('');
    try {
      await submitGarmentReQC(
        id,
        reQcModal.garment.garmentId,
        {
          brand: reQcModal.brand || '',
          comments: reQcModal.comments || '',
          photos: reQcModal.photos || {},
          garmentQuality: reQcModal.garmentQuality || 5,
          solvents: reQcModal.stainTypes || reQcModal.solvents || [],
          stainTypes: reQcModal.stainTypes || reQcModal.solvents || [],
        },
        user
      );
      const garmentLabel = reQcModal.garment.category || reQcModal.garment.garmentId || 'Garment';
      setReQcModal({
        open: false,
        garment: null,
        rejection: null,
        brand: '',
        comments: '',
        photos: { front: '', back: '', other: '' },
        garmentQuality: 5,
        solvents: [],
        stainTypes: []
      });
      setSuccessBanner(`Re-QC submitted successfully for ${garmentLabel}!`);
      setTimeout(() => setSuccessBanner(''), 4000);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to submit Re-QC');
    } finally {
      setReQcSubmitting(false);
    }
  };

  const handleDelivery = async () => {
    if (!id || !user) return;
    setActionLoading(true);
    try {
      await initiateDelivery(id, user);
      await load();
    } catch (e) { setError(e.message || 'Failed'); }
    setActionLoading(false);
  };

  const handleMarkCritical = async () => {
    if (!criticalModal.garment || !id || !user) return;
    if (!criticalComments.trim()) { setError('Please provide comments for critical mark'); return; }
    const filledPhotos = criticalPhotos.filter(p => p.trim());
    if (filledPhotos.length === 0) { setError('Please add at least 1 photo'); return; }
    setActionLoading(true);
    try {
      await markGarmentCritical(id, criticalModal.garment.garmentId, user, {
        comments: criticalComments,
        photos: { urls: filledPhotos, count: filledPhotos.length },
      });
      setCriticalModal({ open: false, garment: null });
      setCriticalComments('');
      setCriticalPhotos(['', '', '']);
      await load();
    } catch (e) { setError(e.message || 'Failed to mark critical'); }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!id || !user) return;
    if (!rejectReason.trim()) { setError('Please provide a rejection reason'); return; }
    setActionLoading(true);
    try {
      await rejectOrder(id, user, rejectReason);
      setRejectModal(false);
      setRejectReason('');
      await load();
    } catch (e) { setError(e.message || 'Failed to reject'); }
    setActionLoading(false);
  };

  if (loading) return <div className="loading-screen"><div className="spinner-large" /></div>;
  if (!order) return <div className="empty-state"><p>Order not found</p><button className="btn btn-secondary" onClick={() => navigate('/orders')}>Back to Orders</button></div>;

  // Garment count breakdown
  const garments = order.garments || [];
  const reasonText = (order.qcRejection?.reason || order.rejectionReason || '').toLowerCase();

  const rejectedCount = garments.filter(g => {
    const rej = order?.rejectedGarments?.[g.garmentId] || (g.qcStatus === 'QC_REJECTED' ? g.qcRejection : null);
    const isMentioned = !!reasonText && (
      reasonText.includes(g.garmentId.toLowerCase()) ||
      (g.qrCode && reasonText.includes(g.qrCode.toLowerCase()))
    );
    return g.qcStatus === 'QC_REJECTED' || !!rej || isMentioned;
  }).length;

  const isReadyForDelivery = order.status === 'READY_FOR_DELIVERY' || order.deliveryStatus === 'READY_FOR_DELIVERY';
  const isQcRejected = !isReadyForDelivery && (
    order.status === 'QC_REJECTED' ||
    order.qcStatus === 'QC_REJECTED' ||
    !!order.qcRejection ||
    !!order.rejectionReason ||
    rejectedCount > 0
  );
  const actualRejectedCount = isQcRejected && rejectedCount === 0 && garments.length > 0 ? garments.length : rejectedCount;
  const actualPassedCount = Math.max(0, garments.length - actualRejectedCount);
  const passedCount = actualPassedCount;
  const allGarmentsPassed = garments.length > 0 && garments.every(g => g.qcStatus === 'QC_PASSED') && actualRejectedCount === 0;
  const isQcApproved = !isReadyForDelivery && !isQcRejected && (
    order.qcStatus === 'QC_APPROVED' ||
    order.status === 'QC_APPROVED' ||
    allGarmentsPassed
  );
  const isQcPending = !isReadyForDelivery && !isQcApproved && !isQcRejected && (
    order.qcStatus === 'QC_PENDING' ||
    order.status === 'QC_SENT'
  );
  const isAccepted = order.status === 'IN_PROCESS';
  const isNormalRejected = order.status === 'REJECTED' && !isQcRejected;
  const isRejected = isNormalRejected || isQcRejected;

  const canAccept = !isAccepted && !isRejected && !isQcApproved && !isQcPending && !isReadyForDelivery && (order.status === 'ASSIGNED' || order.status === 'RECEIVED');
  const canSubmitQC = isAccepted && !isQcPending && !isQcApproved && !isQcRejected && !isReadyForDelivery;
  const canInitiateDelivery = isQcApproved && !isReadyForDelivery && (!order.deliveryStatus || order.deliveryStatus === 'PENDING');
  const canReject = canAccept;

  return (
    <div className="detail-screen">
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate('/orders')}><ArrowLeft size={20} /></button>
        <h1>{order.orderId || order.id}</h1>
      </header>

      {error && <div className="error-banner" onClick={() => setError('')}>{error}</div>}
      {qcSuccess && <div className="success-banner">QC submitted successfully! Redirecting to orders...</div>}
      {successBanner && <div className="success-banner">{successBanner}</div>}

      {/* Status section */}
      <div className="detail-section">
        <div className="status-row">
          <span className="status-label">Status:</span>
          <span className={`status-badge-lg ${isReadyForDelivery ? 'status-approved' : isQcRejected ? 'status-rejected' : isQcApproved ? 'status-approved' : isQcPending ? 'status-pending' : isNormalRejected ? 'status-rejected' : 'status-active'}`}>
            {isReadyForDelivery ? 'READY TO DELIVER' : isQcRejected ? 'QC REJECTED' : isQcApproved ? 'QC APPROVED' : isQcPending ? 'QC SENT' : order.status}
          </span>
        </div>
      </div>

      {/* QC Rejection Summary - Minimal tag as requested: "2 rejected · 2 passed thats alll enough" */}
      {isQcRejected && (
        <div style={{
          background: '#fef2f2',
          border: '1.5px solid #fecaca',
          borderRadius: 10,
          padding: '10px 14px',
          margin: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          color: '#dc2626'
        }}>
          <AlertTriangle size={18} color="#dc2626" />
          <span>{actualRejectedCount} Rejected · {actualPassedCount} Passed</span>
        </div>
      )}

      {/* Normal partner rejection */}
      {isNormalRejected && (order.rejectionReason || order.qcRejection) && (
        <div className="rejection-card" style={{ margin: '14px 16px' }}>
          <p><strong>Reason:</strong> {order.rejectionReason || order.qcRejection?.reason || '—'}</p>
          <p><strong>Comments:</strong> {order.rejectionComments || order.qcRejection?.comments || '—'}</p>
          <p><strong>Rejected by:</strong> {order.rejectedBy || order.qcRejection?.rejectedBy || '—'} · {order.rejectedAt || order.qcRejection?.rejectedAt ? new Date(order.rejectedAt || order.qcRejection?.rejectedAt).toLocaleString('en-IN') : ''}</p>
        </div>
      )}

      {/* Ready for Delivery Banner */}
      {isReadyForDelivery && (
        <div style={{
          background: '#ecfdf5',
          border: '1.5px solid #6ee7b7',
          borderRadius: 12,
          padding: 16,
          margin: '14px 16px',
          boxShadow: '0 2px 8px rgba(5, 150, 105, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={20} color="#059669" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>Delivery Initiated — Ready to Deliver</div>
              <div style={{ fontSize: 13, color: '#047857', marginTop: 2 }}>
                Quality inspection is passed and delivery has been initiated. This order is now ready for customer delivery / pickup.
                {order.deliveryInitiatedAt && <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#065f46' }}>Initiated at: {new Date(order.deliveryInitiatedAt).toLocaleString('en-IN')}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QC Approved Banner */}
      {isQcApproved && (
        <div style={{
          background: '#f0fdf4',
          border: '1.5px solid #86efac',
          borderRadius: 12,
          padding: 16,
          margin: '14px 16px',
          boxShadow: '0 2px 8px rgba(22, 163, 74, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={20} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#16a34a' }}>QC Passed & Approved!</div>
              <div style={{ fontSize: 13, color: '#15803d', marginTop: 2 }}>
                All garments passed quality inspection. You can now initiate delivery to the customer.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hub / Facility Information */}
      {(order.hub?.name || order.hubName || order.hub?.code || order.hubCode) && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '14px 16px',
          margin: '12px 16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={16} color="#2563eb" />
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Source Hub</span>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  {order.hub?.name || order.hubName || 'Amaze Hub'}
                </h4>
              </div>
            </div>
            {(order.hub?.code || order.hubCode) && (
              <span style={{ fontSize: 11, fontWeight: 700, background: '#e0e7ff', color: '#4338ca', padding: '3px 8px', borderRadius: 6 }}>
                {order.hub?.code || order.hubCode}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#475569' }}>
            {(order.hub?.location || order.hubLocation) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <span>{order.hub?.location || order.hubLocation}</span>
              </div>
            )}
            {(order.hub?.address || order.hubAddress) && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ color: '#94a3b8', fontSize: 11, width: 14, textAlign: 'center' }}>•</span>
                <span style={{ color: '#64748b' }}>{order.hub?.address || order.hubAddress}</span>
              </div>
            )}
            {(order.hub?.phone || order.hubPhone) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={14} color="#64748b" style={{ flexShrink: 0 }} />
                <a href={`tel:${order.hub?.phone || order.hubPhone}`} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                  {order.hub?.phone || order.hubPhone}
                </a>
              </div>
            )}
            {((order.hub?.latitude != null && order.hub?.longitude != null) || (order.hubLatitude != null && order.hubLongitude != null)) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Navigation size={14} color="#059669" style={{ flexShrink: 0 }} />
                <a
                  href={`https://www.google.com/maps?q=${order.hub?.latitude ?? order.hubLatitude},${order.hub?.longitude ?? order.hubLongitude}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#059669', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  View on Google Maps ({order.hub?.latitude ?? order.hubLatitude}, {order.hub?.longitude ?? order.hubLongitude})
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Garments Section */}
      <div className="detail-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="section-title" style={{ margin: 0 }}><QrCode size={16} /> Garments ({garments.length})</h3>
        </div>
        {garments.map((g, idx) => {
          const form = qcForm[g.garmentId] || { brand: '', comments: '', photos: {} };
          const photosCount = Object.values(form.photos || {}).filter(Boolean).length;
          const hasQCData = !!(form.isUpdated || form.brand?.trim() || form.comments?.trim() || photosCount > 0);

          // Specific garment rejection check:
          const isMentionedInReason = !!reasonText && (
            reasonText.includes(g.garmentId.toLowerCase()) ||
            (g.qrCode && reasonText.includes(g.qrCode.toLowerCase()))
          );
          const gRej = order?.rejectedGarments?.[g.garmentId] ||
            (g.qcStatus === 'QC_REJECTED' ? (g.qcRejection || order?.qcRejection) : null) ||
            (isMentionedInReason ? (order?.qcRejection || { reason: order?.rejectionReason, comments: order?.qcRejection?.comments || order?.rejectionComments }) : null);

          const isGarmentRejected = g.qcStatus === 'QC_REJECTED' || !!gRej || isMentionedInReason || (isQcRejected && rejectedCount === 0);
          const isGarmentPassed = !isGarmentRejected && (
            g.qcStatus === 'QC_PASSED' ||
            isQcApproved ||
            (isQcRejected && !isGarmentRejected)
          );

          const isReassignedGarment = g.isReassigned === true || g.criticalStatus === 'REASSIGNED' || !!g.adminCriticalComment;
          const isCriticalGarment = g.isCritical === true && !isReassignedGarment;

          return (
            <div key={g.garmentId} className="garment-card">
              <div className="garment-header">
                <span className="garment-number">{idx + 1}</span>
                <div style={{ flex: 1 }}>
                  <p className="garment-id">{g.category || 'Garment'} · {g.garmentId}</p>
                  <p className="garment-detail">
                    {g.qrCode || '—'} · <span style={{ color: getCareDetails(g.garmentCategory || order.careCategory).color, fontWeight: 700 }}>{getCareDetails(g.garmentCategory || order.careCategory).label}</span> · {g.serviceType}
                  </p>
                  {hasQCData && (
                    <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: 8, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <CheckCircle2 size={10} /> QC Added ({photosCount} photo{photosCount !== 1 ? 's' : ''})
                      </span>
                      {form.brand && (
                        <span style={{ fontSize: 10, background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                          🏷️ {form.brand}
                        </span>
                      )}
                      {form.garmentQuality && (
                        <span style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>
                          {'⭐'.repeat(form.garmentQuality)} {form.garmentQuality}/5
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {canAccept && !isCriticalGarment && !isReassignedGarment && (
                  <button className="btn btn-critical btn-sm" onClick={() => { setCriticalModal({ open: true, garment: g }); setCriticalComments(''); setCriticalPhotos(['', '', '']); }}>
                    <AlertTriangle size={14} /> Mark Critical
                  </button>
                )}
                {canSubmitQC && !isCriticalGarment && !isReassignedGarment && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: hasQCData ? '#f0fdf4' : '#fff7ed',
                      border: hasQCData ? '1.5px solid #86efac' : '1.5px solid #ea580c',
                      color: hasQCData ? '#15803d' : '#c2410c',
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                    onClick={() => setQcModalGarment(g)}
                  >
                    {hasQCData ? <CheckCircle2 size={13} color="#15803d" /> : <Tag size={13} color="#ea580c" />}
                    {hasQCData ? 'Updated' : 'Update QC'}
                  </button>
                )}
                {isReassignedGarment && (
                  <span className="status-badge" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700, padding: '3px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    🔄 REASSIGNED
                  </span>
                )}
                {isCriticalGarment && <span className="critical-badge">⚠️ CRITICAL</span>}

                {/* Garment status badge */}
                {isGarmentRejected && <span className="status-badge" style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 700 }}>QC REJECTED</span>}
                {isGarmentPassed && <span className="status-badge" style={{ background: '#dcfce7', color: '#16a34a', fontWeight: 700 }}>QC PASSED</span>}
                {!isGarmentRejected && !isGarmentPassed && g.qcStatus && <span className="status-badge">{g.qcStatus}</span>}
              </div>

              {/* Critical/Reassigned Info if present */}
              {(isCriticalGarment || isReassignedGarment) && (
                <div className="critical-info" style={{ marginTop: 8, padding: '12px 14px', borderRadius: 8, background: isReassignedGarment ? '#eff6ff' : '#fef2f2', border: isReassignedGarment ? '1px solid #bfdbfe' : '1px solid #fecaca' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: isReassignedGarment ? '#1d4ed8' : '#dc2626', fontSize: 12 }}>
                      {isReassignedGarment ? '🔄 Reassigned by Admin' : '⚠️ Critical Defect Marked'}
                    </span>
                    {g.criticalMarkedAt && <span style={{ fontSize: 11, color: '#6b7280' }}>{new Date(g.criticalMarkedAt).toLocaleString('en-IN')}</span>}
                  </div>
                  {g.criticalComments && (
                    <p style={{ margin: '2px 0 6px', color: '#111827', fontSize: 13 }}>
                      <strong>Partner Note:</strong> {g.criticalComments}
                    </p>
                  )}
                  {g.criticalPhotos?.urls?.length > 0 && (
                    <div className="critical-photos" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {g.criticalPhotos.urls.map((url, i) => url && (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="photo-tag" style={{ textDecoration: 'none', fontSize: 11, background: '#fff', border: isReassignedGarment ? '1px solid #bfdbfe' : '1px solid #fca5a5', color: isReassignedGarment ? '#1d4ed8' : '#dc2626', padding: '2px 8px', borderRadius: 4 }}>
                          📷 Defect Photo {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                  {g.adminCriticalComment ? (
                    <div style={{ marginTop: 8, background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: '#15803d', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          🛡️ Admin Instructions & Action
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 10 }}>
                          PROCEED WITH WORK
                        </span>
                      </div>
                      <p style={{ margin: '4px 0', fontSize: 13, color: '#14532d', lineHeight: 1.4 }}>
                        <strong>Instructions:</strong> {g.adminCriticalComment}
                      </p>
                      <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                        Reviewed by: <strong>{g.adminCriticalCommentBy || 'Admin'}</strong>
                        {g.adminCriticalCommentAt && ` · ${new Date(g.adminCriticalCommentAt).toLocaleString('en-IN')}`}
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⏳</span>
                      <span>Garment marked critical. Waiting for Admin review and instructions...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Rejected Garment Card Body: Garment name, reason for rejection, and View & Re-QC button */}
              {isGarmentRejected && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 8 }}>
                    <strong>Reason:</strong> <span style={{ color: '#dc2626', fontWeight: 600 }}>{gRej?.reason || order?.qcRejection?.reason || order?.rejectionReason || 'Quality defect'}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ background: '#ea580c', borderColor: '#ea580c', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '6px 12px', borderRadius: 6 }}
                    onClick={() => openReQcModal(g, gRej)}
                  >
                    <Eye size={14} /> View & Re-QC
                  </button>
                </div>
              )}

              {/* Garment QC Passed Notice (For non-rejected garments in a rejected order) */}
              {isGarmentPassed && isQcRejected && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={15} />
                  <span><strong>QC Passed:</strong> No rework required.</span>
                </div>
              )}

                          </div>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        {canAccept && (
          <button className="btn btn-primary btn-full" onClick={handleAccept} disabled={actionLoading}>
            <CheckCircle2 size={18} /> Accept Order
          </button>
        )}

        {canSubmitQC && (
          <button className="btn btn-primary btn-full" onClick={handleSubmitQC} disabled={actionLoading}>
            <CheckCircle2 size={18} /> Submit for QC
          </button>
        )}

        {canInitiateDelivery && (
          <button className="btn btn-success btn-full" onClick={handleDelivery} disabled={actionLoading}>
            <Truck size={18} /> Initiate Delivery
          </button>
        )}

        {canReject && (
          <button className="btn btn-danger btn-full" onClick={() => setRejectModal(true)} disabled={actionLoading}>
            <XCircle size={18} /> Reject Order
          </button>
        )}
      </div>

      {/* Critical Mark Modal */}
      {criticalModal.open && (
        <div className="modal-overlay" onClick={() => setCriticalModal({ open: false, garment: null })}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><AlertTriangle size={18} color="#dc2626" /> Mark Critical — {criticalModal.garment?.garmentId}</h3>
              <button className="modal-close" onClick={() => setCriticalModal({ open: false, garment: null })}><XIcon size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label><MessageSquare size={14} /> Comments *</label>
                <textarea className="form-input textarea" value={criticalComments} onChange={e => setCriticalComments(e.target.value)} placeholder="Describe why this garment is critical..." rows={3} />
              </div>
              <div className="form-group">
                <label><ImagePlus size={14} /> Photos (max 3) *</label>
                {criticalPhotos.map((photo, i) => {
                  const isUp = uploadingSlots[`critical_${i}`];
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
                          value={photo}
                          onChange={e => {
                            const next = [...criticalPhotos];
                            next[i] = e.target.value;
                            setCriticalPhotos(next);
                          }}
                          placeholder={`Photo ${i + 1} URL or click Upload`}
                        />
                        <label
                          style={{
                            padding: '7px 10px',
                            background: isUp ? '#f1f5f9' : '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            color: isUp ? '#94a3b8' : '#2563eb',
                            cursor: isUp ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {isUp ? <RefreshCw size={13} className="spinning" /> : <Camera size={13} />}
                          {isUp ? 'Uploading...' : 'Upload'}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isUp}
                            style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) handleCriticalPhotoUpload(i, f);
                            }}
                          />
                        </label>
                        {photo && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...criticalPhotos];
                              next[i] = '';
                              setCriticalPhotos(next);
                            }}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      {photo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <img
                            src={photo}
                            alt={`Critical photo ${i + 1}`}
                            onClick={() => setPhotoPreview({ url: photo, title: `Critical Defect Photo ${i + 1}` })}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ Attached</span>
                          {photo.includes('amazonaws.com') && (
                            <span style={{ fontSize: 10, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>☁️ S3</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-critical btn-full" onClick={handleMarkCritical} disabled={actionLoading}>
                <AlertTriangle size={16} /> Mark as Critical
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><XCircle size={18} color="#dc2626" /> Reject Order</h3>
              <button className="modal-close" onClick={() => setRejectModal(false)}><XIcon size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label><MessageSquare size={14} /> Rejection Reason *</label>
                <textarea className="form-input textarea" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Why are you rejecting this order?" rows={4} />
              </div>
              <button className="btn btn-danger btn-full" onClick={handleReject} disabled={actionLoading}>
                <XCircle size={16} /> Reject Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Garment Re-QC Modal */}
      {reQcModal.open && reQcModal.garment && (
        <div className="modal-overlay" onClick={() => setReQcModal(prev => ({ ...prev, open: false }))}>
          <div className="modal-content" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <RefreshCw size={18} color="#ea580c" />
                Re-QC — {reQcModal.garment.category || 'Garment'} ({reQcModal.garment.garmentId})
              </h3>
              <button className="modal-close" onClick={() => setReQcModal(prev => ({ ...prev, open: false }))}><XIcon size={20} /></button>
            </div>
            <div className="modal-body">
              {/* Rejection Details */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
                  <strong style={{ color: '#dc2626' }}>Reason:</strong> {reQcModal.rejection?.reason || order?.qcRejection?.reason || order?.rejectionReason || 'Quality defect'}
                </div>
                {(reQcModal.rejection?.comments || order?.qcRejection?.comments) && (
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>
                    <strong>Admin Comment:</strong> {reQcModal.rejection?.comments || order?.qcRejection?.comments}
                  </div>
                )}

                {/* Defect photos from admin */}
                {(reQcModal.rejection?.photos?.length > 0 || order?.qcRejection?.photos?.length > 0) && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', display: 'block', marginBottom: 6 }}>
                      Defect Photos from Admin (Tap to view):
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(reQcModal.rejection?.photos || order?.qcRejection?.photos || []).map((pUrl, pIdx) => (
                        <div
                          key={pIdx}
                          style={{ position: 'relative', cursor: 'pointer' }}
                          onClick={() => setPhotoPreview({ url: pUrl, title: `Admin Defect Photo ${pIdx + 1}` })}
                        >
                          <img
                            src={pUrl}
                            alt={`Defect ${pIdx + 1}`}
                            style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1.5px solid #fca5a5' }}
                          />
                          <div style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 3, padding: '1px 3px', fontSize: 9 }}>
                            <Eye size={10} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Rework Form */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                  Re-apply QC
                </h4>

                {/* Brand */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label><Tag size={14} /> Brand</label>
                  <input
                    className="form-input"
                    value={reQcModal.brand}
                    onChange={e => setReQcModal(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="Enter brand name"
                  />
                </div>

                {/* Quality of Garment (Star Rating out of 5 stars) */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#334155', margin: 0 }}>
                      <Star size={14} color="#f59e0b" fill="#f59e0b" /> Quality of Garment
                    </label>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 10, border: '1px solid #fde68a' }}>
                      {QUALITY_LABELS[reQcModal.garmentQuality || 5]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (reQcModal.garmentQuality || 5) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReQcModal(prev => ({ ...prev, garmentQuality: star }))}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px',
                            transition: 'transform 0.15s ease',
                            transform: isFilled ? 'scale(1.15)' : 'scale(1)'
                          }}
                        >
                          <Star
                            size={22}
                            color={isFilled ? '#f59e0b' : '#cbd5e1'}
                            fill={isFilled ? '#f59e0b' : '#f8fafc'}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Suggested Stain Type Master (Dropdown) */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#334155', margin: 0 }}>
                      <Sparkles size={14} color="#d97706" /> Suggested Stain Type Master
                    </label>
                    <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                      {(reQcModal.stainTypes || reQcModal.solvents || []).length > 0
                        ? `${(reQcModal.stainTypes || reQcModal.solvents || []).length} selected`
                        : 'Select stains if any'}
                    </span>
                  </div>
                  <select
                    className="form-input"
                    value=""
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) return;
                      const current = reQcModal.stainTypes || reQcModal.solvents || [];
                      if (!current.includes(val)) {
                        const next = [...current, val];
                        setReQcModal(prev => ({ ...prev, stainTypes: next, solvents: next }));
                      }
                    }}
                    style={{
                      fontSize: 12,
                      padding: '7px 10px',
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      width: '100%'
                    }}
                  >
                    <option value="">-- Tap to Select Stain Type (S01 - S10) --</option>
                    {availableStainTypes.map(stain => {
                      const stainLabel = `${stain.code} ${stain.name}`;
                      const current = reQcModal.stainTypes || reQcModal.solvents || [];
                      const isSelected = current.includes(stainLabel) || current.includes(stain.code) || current.includes(stain.name);
                      return (
                        <option key={stain.code} value={stainLabel} disabled={isSelected}>
                          {stain.code} - {stain.name} {stain.examples ? `(${stain.examples})` : ''} {isSelected ? '✓ Added' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Selected Stains Chips */}
                  {(reQcModal.stainTypes || reQcModal.solvents || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {(reQcModal.stainTypes || reQcModal.solvents || []).map(stainItem => (
                        <span
                          key={stainItem}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            color: '#92400e',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          <span>{stainItem}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const current = reQcModal.stainTypes || reQcModal.solvents || [];
                              const next = current.filter(s => s !== stainItem);
                              setReQcModal(prev => ({ ...prev, stainTypes: next, solvents: next }));
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#b45309',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: 13,
                              fontWeight: 800,
                              lineHeight: 1
                            }}
                            title="Remove stain"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label><MessageSquare size={14} /> Comments / Rework Action *</label>
                  <textarea
                    className="form-input textarea"
                    rows={3}
                    value={reQcModal.comments}
                    onChange={e => setReQcModal(prev => ({ ...prev, comments: e.target.value }))}
                    placeholder="Describe rework done (e.g. stain re-treated and cleaned)..."
                  />
                </div>

                {/* 3 Photos: Front, Back, Other (Single Upload Button) */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  {(() => {
                    const isUploading = !!uploadingSlots['modal_batch'];
                    const photosCount = ['front', 'back', 'other'].filter(s => !!reQcModal.photos?.[s]).length;

                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#334155', margin: 0 }}>
                            <Camera size={14} color="#2563eb" /> 3 Photos (Front, Back, Other) *
                          </label>
                          <span style={{ fontSize: 11, fontWeight: 700, color: photosCount === 3 ? '#16a34a' : '#ea580c' }}>
                            {photosCount} / 3 Uploaded
                          </span>
                        </div>

                        {/* Single Upload Button */}
                        <div style={{ marginBottom: 8 }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '10px 14px',
                              background: isUploading ? '#f1f5f9' : '#eff6ff',
                              border: isUploading ? '1.5px dashed #94a3b8' : '1.5px dashed #3b82f6',
                              borderRadius: 8,
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: isUploading ? '#64748b' : '#1d4ed8',
                              cursor: isUploading ? 'wait' : 'pointer',
                              boxSizing: 'border-box'
                            }}
                          >
                            {isUploading ? (
                              <>
                                <RefreshCw size={15} className="spinning" />
                                <span>Uploading Photos to S3...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={15} />
                                <span>{photosCount === 0 ? 'Upload 3 Photos (Front, Back, Other)' : photosCount === 3 ? '✓ 3 Photos Attached (Click to Replace)' : `Upload Photos (${3 - photosCount} remaining)`}</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              disabled={isUploading}
                              style={{ display: 'none' }}
                              onChange={e => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleBatchModalPhotoUpload(e.target.files);
                                }
                              }}
                            />
                          </label>
                        </div>

                        {/* 3 Photos Preview Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {[
                            { slot: 'front', label: 'Front' },
                            { slot: 'back', label: 'Back' },
                            { slot: 'other', label: 'Other' }
                          ].map(({ slot, label }) => {
                            const photoUrl = reQcModal.photos?.[slot];
                            return (
                              <div
                                key={slot}
                                style={{
                                  background: '#f8fafc',
                                  border: photoUrl ? '1.5px solid #86efac' : '1px dashed #cbd5e1',
                                  borderRadius: 8,
                                  padding: 6,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  minHeight: 88,
                                  justifyContent: 'center',
                                  position: 'relative'
                                }}
                              >
                                {photoUrl ? (
                                  <>
                                    <div style={{ width: '100%', height: 60, borderRadius: 6, overflow: 'hidden', background: '#e2e8f0', position: 'relative', marginBottom: 4 }}>
                                      <img
                                        src={photoUrl}
                                        alt={label}
                                        onClick={() => setPhotoPreview({ url: photoUrl, title: label })}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReQcModal(prev => ({ ...prev, photos: { ...prev.photos, [slot]: '' } }));
                                        }}
                                        style={{
                                          position: 'absolute',
                                          top: 2,
                                          right: 2,
                                          background: 'rgba(239, 68, 68, 0.95)',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: '50%',
                                          width: 18,
                                          height: 18,
                                          fontSize: 10,
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          lineHeight: 1
                                        }}
                                        title="Remove photo"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d' }}>
                                      ✓ {label}
                                    </span>
                                  </>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
                                    <Camera size={16} style={{ opacity: 0.4, marginBottom: 2 }} />
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>{label}</span>
                                    <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Pending</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Submit Re-QC Button */}
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  style={{ background: '#ea580c', borderColor: '#ea580c', padding: 12, fontSize: 14, fontWeight: 700 }}
                  onClick={handleSubmitSingleGarmentReQC}
                  disabled={reQcSubmitting}
                >
                  <RefreshCw size={16} className={reQcSubmitting ? 'spinning' : ''} />
                  {reQcSubmitting ? 'Submitting Re-QC...' : 'Submit Re-QC for this Garment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {/* Garment QC Inspection Modal */}
      {qcModalGarment && (() => {
        const g = qcModalGarment;
        const form = qcForm[g.garmentId] || { brand: '', comments: '', photos: {}, garmentQuality: 5, solvents: [] };
        const setForm = (updater) => {
          setQcForm(prev => {
            const current = prev[g.garmentId] || { brand: '', comments: '', photos: {}, garmentQuality: 5, solvents: [] };
            const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
            return { ...prev, [g.garmentId]: next };
          });
        };

        return (
          <div className="modal-overlay" onClick={() => setQcModalGarment(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '88vh', overflowY: 'auto' }}>
              <div className="modal-header" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, borderBottom: '1px solid #e2e8f0' }}>
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 16 }}>
                    <Tag size={18} color="#ea580c" /> QC Inspection — {g.category || 'Garment'}
                  </h3>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    ID: <b>{g.garmentId}</b> · {g.qrCode || 'No QR'} · {g.serviceType || 'Standard'}
                  </div>
                </div>
                <button className="modal-close" onClick={() => setQcModalGarment(null)}><XIcon size={20} /></button>
              </div>

              <div className="modal-body" style={{ padding: '16px 16px 8px' }}>
                {/* Brand */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Tag size={14} color="#ea580c" /> Brand
                  </label>
                  <input
                    className="form-input"
                    value={form.brand || ''}
                    onChange={e => setForm({ brand: e.target.value })}
                    placeholder="Enter brand name (e.g. Zara, Raymond, Gucci)"
                    style={{ fontSize: 13 }}
                  />
                </div>

                {/* Quality of Garment (Star Rating out of 5 stars) */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#334155', margin: 0 }}>
                      <Star size={15} color="#f59e0b" fill="#f59e0b" /> Quality of Garment *
                    </label>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: 12, border: '1px solid #fde68a' }}>
                      {QUALITY_LABELS[form.garmentQuality || 5]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0' }}>
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (form.garmentQuality || 5) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setForm({ garmentQuality: star })}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'transform 0.1s'
                          }}
                          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.85)'}
                          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          <Star
                            size={26}
                            color={isFilled ? '#f59e0b' : '#cbd5e1'}
                            fill={isFilled ? '#f59e0b' : 'none'}
                          />
                        </button>
                      );
                    })}
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                      {form.garmentQuality || 5} / 5
                    </span>
                  </div>
                </div>

                {/* Suggested Stain Type Master (Dropdown) */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: '#0f172a', margin: 0 }}>
                      <Sparkles size={15} color="#d97706" /> Suggested Stain Type Master
                    </label>
                    <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                      {((form.stainTypes || form.solvents || []).length > 0)
                        ? `${(form.stainTypes || form.solvents || []).length} stain(s) selected`
                        : 'Select stains if any'}
                    </span>
                  </div>

                  <select
                    className="form-input"
                    value=""
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) return;
                      const currentStains = Array.isArray(form.stainTypes || form.solvents) ? [...(form.stainTypes || form.solvents)] : [];
                      if (!currentStains.includes(val)) {
                        const updated = [...currentStains, val];
                        setForm({ stainTypes: updated, solvents: updated });
                      }
                    }}
                    style={{
                      fontSize: 12.5,
                      padding: '7px 10px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      width: '100%'
                    }}
                  >
                    <option value="">-- Tap to Select Stain Type (S01 - S10) --</option>
                    {availableStainTypes.map(stain => {
                      const stainLabel = `${stain.code} ${stain.name}`;
                      const currentStains = Array.isArray(form.stainTypes || form.solvents) ? (form.stainTypes || form.solvents) : [];
                      const isSelected = currentStains.includes(stainLabel) || currentStains.includes(stain.code) || currentStains.includes(stain.name);
                      return (
                        <option key={stain.code} value={stainLabel} disabled={isSelected}>
                          {stain.code} - {stain.name} {stain.examples ? `(${stain.examples})` : ''} {isSelected ? '✓ Added' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Selected Stains Chips */}
                  {((form.stainTypes || form.solvents || []).length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {(form.stainTypes || form.solvents || []).map(stainItem => (
                        <span
                          key={stainItem}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#fef3c7',
                            border: '1px solid #fde68a',
                            color: '#92400e',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600
                          }}
                        >
                          <span>{stainItem}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const currentStains = form.stainTypes || form.solvents || [];
                              const updated = currentStains.filter(s => s !== stainItem);
                              setForm({ stainTypes: updated, solvents: updated });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#b45309',
                              cursor: 'pointer',
                              padding: 0,
                              fontSize: 13,
                              fontWeight: 800,
                              lineHeight: 1
                            }}
                            title="Remove stain"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MessageSquare size={14} color="#64748b" /> Inspection Comments
                  </label>
                  <textarea
                    className="form-input textarea"
                    value={form.comments || ''}
                    onChange={e => setForm({ comments: e.target.value })}
                    placeholder="Describe garment condition, stains treated, pre-existing damages, special care applied..."
                    rows={3}
                    style={{ fontSize: 13 }}
                  />
                </div>

                {/* Photos */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  {(() => {
                    const isUploading = !!uploadingSlots[`qc_batch_${g.garmentId}`];
                    const photosCount = ['front', 'back', 'other'].filter(s => !!form.photos?.[s]).length;

                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <label style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, color: '#0f172a', margin: 0 }}>
                            <Camera size={15} color="#2563eb" /> Inspection Photos (3 required)
                          </label>
                          <span style={{ fontSize: 11, fontWeight: 700, color: photosCount === 3 ? '#16a34a' : '#ea580c' }}>
                            {photosCount} / 3 Photos
                          </span>
                        </div>

                        {/* Single Upload Button */}
                        <div style={{ marginBottom: 8 }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              width: '100%',
                              padding: '10px 14px',
                              background: isUploading ? '#f1f5f9' : '#eff6ff',
                              border: isUploading ? '1.5px dashed #94a3b8' : '1.5px dashed #3b82f6',
                              borderRadius: 8,
                              fontSize: 12.5,
                              fontWeight: 700,
                              color: isUploading ? '#64748b' : '#1d4ed8',
                              cursor: isUploading ? 'wait' : 'pointer',
                              boxSizing: 'border-box'
                            }}
                          >
                            {isUploading ? (
                              <>
                                <RefreshCw size={15} className="spinning" />
                                <span>Uploading Photos to S3...</span>
                              </>
                            ) : (
                              <>
                                <Camera size={15} />
                                <span>{photosCount === 0 ? 'Upload 3 Photos (Front, Back, Other)' : photosCount === 3 ? '✓ 3 Photos Attached (Click to Replace)' : `Upload Photos (${3 - photosCount} remaining)`}</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              disabled={isUploading}
                              style={{ display: 'none' }}
                              onChange={e => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleBatchPhotoUpload(g.garmentId, e.target.files);
                                }
                              }}
                            />
                          </label>
                        </div>

                        {/* 3 Photos Preview Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {[
                            { slot: 'front', label: 'Front Photo' },
                            { slot: 'back', label: 'Back Photo' },
                            { slot: 'other', label: 'Other Photo' }
                          ].map(({ slot, label }) => {
                            const photoUrl = form.photos?.[slot];
                            return (
                              <div
                                key={slot}
                                style={{
                                  background: '#f8fafc',
                                  border: photoUrl ? '1.5px solid #86efac' : '1px dashed #cbd5e1',
                                  borderRadius: 8,
                                  padding: 6,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  minHeight: 88,
                                  justifyContent: 'center',
                                  position: 'relative'
                                }}
                              >
                                {photoUrl ? (
                                  <>
                                    <div style={{ width: '100%', height: 60, borderRadius: 6, overflow: 'hidden', background: '#e2e8f0', position: 'relative', marginBottom: 4 }}>
                                      <img
                                        src={photoUrl}
                                        alt={label}
                                        onClick={() => setPhotoPreview({ url: photoUrl, title: `${g.category || 'Garment'} — ${label}` })}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setForm(prev => {
                                            const updated = { ...(prev.photos || {}) };
                                            delete updated[slot];
                                            return { ...prev, photos: updated };
                                          });
                                        }}
                                        style={{
                                          position: 'absolute',
                                          top: 2,
                                          right: 2,
                                          background: 'rgba(239, 68, 68, 0.95)',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: '50%',
                                          width: 18,
                                          height: 18,
                                          fontSize: 10,
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          lineHeight: 1
                                        }}
                                        title="Remove photo"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d' }}>
                                      ✓ {label.replace(' Photo', '')}
                                    </span>
                                  </>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8' }}>
                                    <Camera size={16} style={{ opacity: 0.4, marginBottom: 2 }} />
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>{label.replace(' Photo', '')}</span>
                                    <span style={{ fontSize: 9.5, color: '#94a3b8' }}>Pending</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="modal-actions" style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={() => {
                    setForm({ isUpdated: true });
                    setQcModalGarment(null);
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <CheckCircle2 size={16} /> Save & Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      
      {/* QC Incomplete Warning Modal */}
      {qcWarningModal.open && (
        <div className="modal-overlay" onClick={() => setQcWarningModal({ open: false, pendingGarments: [] })}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <AlertTriangle size={20} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#991b1b', fontWeight: 800 }}>
                    QC Incomplete
                  </h3>
                  <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 1 }}>
                    All garments must be updated before submitting
                  </div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setQcWarningModal({ open: false, pendingGarments: [] })}><XIcon size={20} /></button>
            </div>

            <div className="modal-body" style={{ padding: '16px 20px' }}>
              <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 13, lineHeight: 1.4, marginBottom: 14 }}>
                ⚠️ Please update the QC details for <strong>all {order?.garments?.length} garments</strong> before submitting for QC.
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Pending Garments ({qcWarningModal.pendingGarments.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                {qcWarningModal.pendingGarments.map((g, i) => (
                  <div
                    key={g.garmentId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: '#fff7ed',
                      border: '1.5px solid #fed7aa',
                      borderRadius: 10
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#9a3412' }}>
                        {g.category || 'Garment'} · {g.garmentId}
                      </div>
                      <div style={{ fontSize: 11, color: '#c2410c', marginTop: 2 }}>
                        {g.qrCode || 'No QR'} · {g.serviceType || 'Standard'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{
                        background: '#ea580c',
                        color: '#fff',
                        border: 'none',
                        fontWeight: 700,
                        fontSize: 12,
                        padding: '6px 12px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      onClick={() => {
                        setQcWarningModal({ open: false, pendingGarments: [] });
                        setQcModalGarment(g);
                      }}
                    >
                      <Tag size={13} /> Update QC
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setQcWarningModal({ open: false, pendingGarments: [] })}
                style={{ minWidth: 100 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Preview Modal */}
      {photoPreview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPhotoPreview(null)}
        >
          <div
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, color: '#fff' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{photoPreview.title}</span>
              <button
                type="button"
                onClick={() => setPhotoPreview(null)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 30,
                  height: 30,
                  color: '#fff',
                  fontSize: 16,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &times;
              </button>
            </div>
            <img
              src={photoPreview.url}
              alt={photoPreview.title}
              style={{
                maxWidth: '85vw',
                maxHeight: '75vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                background: '#000',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
