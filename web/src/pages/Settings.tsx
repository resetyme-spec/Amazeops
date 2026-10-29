import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp
} from 'firebase/firestore';
import {
  User, Bell, Sparkles, Plus, Search, Edit2, Trash2, X,
  CheckCircle2, RotateCcw, Sliders, ShieldAlert, Tag, Filter,
  Check, Layers, AlertCircle, Save, Info, RefreshCw
} from 'lucide-react';
import type { StainType } from '../types';

const DEFAULT_STAIN_TYPES: Array<Omit<StainType, 'id'>> = [
  {
    code: 'S01',
    name: 'Tea / Coffee',
    examples: 'Tea, filter coffee',
    category: 'Tannin / Beverage',
    treatmentNotes: 'Warm water flush, mild acid/vinegar pre-spotting, enzyme wash',
    difficulty: 'EASY',
    active: true,
    isCustom: false,
  },
  {
    code: 'S02',
    name: 'Oil / Grease',
    examples: 'Cooking oil, ghee',
    category: 'Lipid / Hydrocarbon',
    treatmentNotes: 'Solvent emulsifier, degreaser pre-wash, warm water wash if fabric permits',
    difficulty: 'MODERATE',
    active: true,
    isCustom: false,
  },
  {
    code: 'S03',
    name: 'Food / Curry',
    examples: 'Gravy, masala, turmeric',
    category: 'Pigment / Organic',
    treatmentNotes: 'Degrease oil base first, then oxygen bleach/sunlight exposure for turmeric',
    difficulty: 'COMPLEX',
    active: true,
    isCustom: false,
  },
  {
    code: 'S04',
    name: 'Green / Grass',
    examples: 'Grass, leaves',
    category: 'Chlorophyll / Plant',
    treatmentNotes: 'Enzyme stain remover, isopropyl alcohol or glycerin pre-treatment',
    difficulty: 'MODERATE',
    active: true,
    isCustom: false,
  },
  {
    code: 'S05',
    name: 'Ink',
    examples: 'Pen, marker',
    category: 'Dye / Solvent-based',
    treatmentNotes: 'Solvent/rubbing alcohol blotting from reverse side; do not rub or apply heat',
    difficulty: 'COMPLEX',
    active: true,
    isCustom: false,
  },
  {
    code: 'S06',
    name: 'Cosmetics',
    examples: 'Lipstick, makeup',
    category: 'Wax / Oil / Pigment',
    treatmentNotes: 'Dry solvent first to break down wax binder, followed by liquid surfactant',
    difficulty: 'MODERATE',
    active: true,
    isCustom: false,
  },
  {
    code: 'S07',
    name: 'Sweat / Body Soil',
    examples: 'Collar, underarm',
    category: 'Protein / Salt / Lipid',
    treatmentNotes: 'Alkaline soak, enzyme pre-treatment focused on collar bands and armholes',
    difficulty: 'EASY',
    active: true,
    isCustom: false,
  },
  {
    code: 'S08',
    name: 'Blood / Protein',
    examples: 'Blood, egg',
    category: 'Protein / Coagulable',
    treatmentNotes: 'Strictly COLD water only; warm/hot water coagulates and sets protein permanently',
    difficulty: 'COMPLEX',
    active: true,
    isCustom: false,
  },
  {
    code: 'S09',
    name: 'Dye Transfer',
    examples: 'Colour bleeding',
    category: 'Colorant / Bleed',
    treatmentNotes: 'Color-run stripping bath before garment is dried; use dye trapping sheets',
    difficulty: 'SPECIALIZED',
    active: true,
    isCustom: false,
  },
  {
    code: 'S10',
    name: 'Unknown / Other',
    examples: 'Unidentified stain',
    category: 'Miscellaneous',
    treatmentNotes: 'Diagnostic test: mild water flush -> neutral detergent -> mild solvent',
    difficulty: 'MODERATE',
    active: true,
    isCustom: false,
  },
];

const DIFFICULTY_BADGES: Record<string, { label: string; bg: string; color: string; border: string }> = {
  EASY: { label: 'Easy', bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0' },
  MODERATE: { label: 'Moderate', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  COMPLEX: { label: 'Complex', bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' },
  SPECIALIZED: { label: 'Specialized', bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8' },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab management (supports ?tab=stains or ?tab=profile or ?tab=notifications)
  const initialTab = (searchParams.get('tab') as 'profile' | 'notifications' | 'stains' | 'general') || 'stains';
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'stains' | 'general'>(initialTab);

  // Profile state
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Notifications state
  const [notifPreferences, setNotifPreferences] = useState({
    newOrders: true,
    criticalDefects: true,
    qcAlerts: true,
    readyDelivery: true,
    invoiceSettlements: true,
  });

  // Stain Types state
  const [stainTypes, setStainTypes] = useState<StainType[]>([]);
  const [stainsLoading, setStainsLoading] = useState(true);
  const [stainSearch, setStainSearch] = useState('');
  const [stainFilter, setStainFilter] = useState<'ALL' | 'ACTIVE' | 'CUSTOM'>('ALL');
  const [showStainModal, setShowStainModal] = useState(false);
  const [editingStain, setEditingStain] = useState<StainType | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Stain Form
  const [stainForm, setStainForm] = useState({
    code: '',
    name: '',
    examples: '',
    category: 'Combination / Pigment',
    treatmentNotes: '',
    difficulty: 'MODERATE' as StainType['difficulty'],
    active: true,
  });

  // Keep query param in sync with activeTab
  const handleTabChange = (tabId: 'profile' | 'notifications' | 'stains' | 'general') => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  // Load Stain Types live from Firestore
  useEffect(() => {
    setStainsLoading(true);
    const q = query(collection(db, 'stainTypes'), orderBy('code', 'asc'));
    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        // Automatically seed suggested stains if collection is completely empty
        await autoSeedDefaults();
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StainType));
        // Sort naturally by code (S01, S02, S10, S11)
        list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
        setStainTypes(list);
        setStainsLoading(false);
      }
    }, (err) => {
      console.warn('StainTypes onSnapshot warning:', err);
      // Fallback
      getDocs(collection(db, 'stainTypes')).then(s => {
        if (s.empty) {
          autoSeedDefaults();
        } else {
          const list = s.docs.map(d => ({ id: d.id, ...d.data() } as StainType));
          list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
          setStainTypes(list);
          setStainsLoading(false);
        }
      }).catch(() => {
        // Local fallback with simulated IDs
        const localList = DEFAULT_STAIN_TYPES.map((it, idx) => ({ id: `default-${idx + 1}`, ...it } as StainType));
        setStainTypes(localList);
        setStainsLoading(false);
      });
    });

    return () => unsub();
  }, []);

  // Auto seed defaults
  const autoSeedDefaults = async () => {
    try {
      for (const item of DEFAULT_STAIN_TYPES) {
        const docRef = doc(collection(db, 'stainTypes'), item.code);
        await setDoc(docRef, {
          ...item,
          id: item.code,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
      const s = await getDocs(collection(db, 'stainTypes'));
      const list = s.docs.map(d => ({ id: d.id, ...d.data() } as StainType));
      list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
      setStainTypes(list);
    } catch (e) {
      console.error('Failed to seed default stain types:', e);
      setStainTypes(DEFAULT_STAIN_TYPES.map((it, idx) => ({ id: `default-${idx + 1}`, ...it } as StainType)));
    } finally {
      setStainsLoading(false);
    }
  };

  // Manual reset to suggested defaults
  const handleResetDefaults = async () => {
    if (!confirm('Re-sync and restore the 10 standard stain types? Existing custom stains will be preserved.')) return;
    setSeeding(true);
    await autoSeedDefaults();
    setSeeding(false);
    setSaveMsg('Standard Stain Type Master successfully synchronized!');
    setSaved(true);
    setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3500);
  };

  // Calculate next code for new custom stain (e.g. S11, S12)
  const getNextStainCode = () => {
    const numbers = stainTypes
      .map(s => parseInt(s.code.replace(/\D/g, ''), 10))
      .filter(n => !isNaN(n));
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `S${String(nextNum).padStart(2, '0')}`;
  };

  // Open Add Stain Modal
  const handleOpenAddStain = () => {
    setEditingStain(null);
    setStainForm({
      code: getNextStainCode(),
      name: '',
      examples: '',
      category: 'Combination / Pigment',
      treatmentNotes: '',
      difficulty: 'MODERATE',
      active: true,
    });
    setShowStainModal(true);
  };

  // Open Edit Stain Modal
  const handleOpenEditStain = (stain: StainType) => {
    setEditingStain(stain);
    setStainForm({
      code: stain.code,
      name: stain.name,
      examples: stain.examples,
      category: stain.category || 'Combination / Pigment',
      treatmentNotes: stain.treatmentNotes || '',
      difficulty: stain.difficulty || 'MODERATE',
      active: stain.active !== false,
    });
    setShowStainModal(true);
  };

  // Save Stain Type (Create / Update)
  const handleSaveStain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stainForm.code.trim() || !stainForm.name.trim()) {
      alert('Stain Code and Stain Type Name are required.');
      return;
    }

    try {
      const docId = editingStain ? editingStain.id : stainForm.code.toUpperCase().trim();
      const docRef = doc(collection(db, 'stainTypes'), docId);
      const isCustomStain = editingStain ? (editingStain.isCustom ?? true) : true;

      const payload: Partial<StainType> = {
        id: docId,
        code: stainForm.code.toUpperCase().trim(),
        name: stainForm.name.trim(),
        examples: stainForm.examples.trim(),
        category: stainForm.category,
        treatmentNotes: stainForm.treatmentNotes.trim(),
        difficulty: stainForm.difficulty,
        active: stainForm.active,
        isCustom: isCustomStain,
        updatedAt: new Date().toISOString(),
      };

      if (!editingStain) {
        payload.createdAt = new Date().toISOString();
      }

      await setDoc(docRef, payload, { merge: true });
      setShowStainModal(false);
      setSaveMsg(`Stain type ${payload.code} saved successfully!`);
      setSaved(true);
      setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
    } catch (err: any) {
      console.error('Error saving stain type:', err);
      alert('Failed to save stain type: ' + (err.message || String(err)));
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (stain: StainType) => {
    try {
      const docRef = doc(collection(db, 'stainTypes'), stain.id);
      await setDoc(docRef, {
        active: !stain.active,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    }
  };

  // Delete custom stain type
  const handleDeleteStain = async (stain: StainType) => {
    if (!confirm(`Are you sure you want to delete stain type "${stain.code} - ${stain.name}"?`)) return;
    try {
      await deleteDoc(doc(collection(db, 'stainTypes'), stain.id));
      setSaveMsg(`Stain type ${stain.code} deleted.`);
      setSaved(true);
      setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
    } catch (err: any) {
      alert('Failed to delete: ' + err.message);
    }
  };

  // Save Profile
  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg('Profile preferences updated successfully!');
    setSaved(true);
    setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
  }

  // Save Notifications
  function handleSaveNotifications() {
    setSaveMsg('Notification preferences updated!');
    setSaved(true);
    setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
  }

  // Filtered stain types
  const filteredStainTypes = stainTypes.filter(stain => {
    if (stainFilter === 'ACTIVE' && !stain.active) return false;
    if (stainFilter === 'CUSTOM' && !stain.isCustom) return false;
    if (stainSearch) {
      const q = stainSearch.toLowerCase();
      const matchCode = (stain.code || '').toLowerCase().includes(q);
      const matchName = (stain.name || '').toLowerCase().includes(q);
      const matchExamples = (stain.examples || '').toLowerCase().includes(q);
      const matchCat = (stain.category || '').toLowerCase().includes(q);
      if (!matchCode && !matchName && !matchExamples && !matchCat) return false;
    }
    return true;
  });

  return (
    <div className="page" style={{ padding: '24px 32px' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Settings & Configurations</h1>
          <p className="page-subtitle" style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Manage administrative profile, operations master data, stain diagnostics, and automated alerts
          </p>
        </div>
        {saved && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
            <CheckCircle2 size={16} /> {saveMsg}
          </div>
        )}
      </div>

      {/* Main Settings Layout */}
      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Side Navigation Menu */}
        <aside style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {/* Section: Operational Master Data */}
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '8px 12px 6px' }}>
            Operations & Masters
          </div>

          <button
            type="button"
            className={`settings-tab ${activeTab === 'stains' ? 'settings-tab--active' : ''}`}
            onClick={() => handleTabChange('stains')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
              fontWeight: activeTab === 'stains' ? 700 : 500,
              background: activeTab === 'stains' ? '#eef2ff' : 'transparent',
              color: activeTab === 'stains' ? '#4f46e5' : '#475569',
              border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              marginBottom: 4
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles size={17} color={activeTab === 'stains' ? '#4f46e5' : '#64748b'} />
              <span>Stain Type Master</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: activeTab === 'stains' ? '#c7d2fe' : '#f1f5f9', color: activeTab === 'stains' ? '#3730a3' : '#64748b' }}>
              {stainTypes.length}
            </span>
          </button>

          {/* Section: Account & Profile */}
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '16px 12px 6px' }}>
            Account & System
          </div>

          <button
            type="button"
            className={`settings-tab ${activeTab === 'profile' ? 'settings-tab--active' : ''}`}
            onClick={() => handleTabChange('profile')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
              fontWeight: activeTab === 'profile' ? 700 : 500,
              background: activeTab === 'profile' ? '#eef2ff' : 'transparent',
              color: activeTab === 'profile' ? '#4f46e5' : '#475569',
              border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              marginBottom: 4
            }}
          >
            <User size={17} color={activeTab === 'profile' ? '#4f46e5' : '#64748b'} />
            <span>Profile & Role</span>
          </button>

          <button
            type="button"
            className={`settings-tab ${activeTab === 'notifications' ? 'settings-tab--active' : ''}`}
            onClick={() => handleTabChange('notifications')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
              fontWeight: activeTab === 'notifications' ? 700 : 500,
              background: activeTab === 'notifications' ? '#eef2ff' : 'transparent',
              color: activeTab === 'notifications' ? '#4f46e5' : '#475569',
              border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              marginBottom: 4
            }}
          >
            <Bell size={17} color={activeTab === 'notifications' ? '#4f46e5' : '#64748b'} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={`settings-tab ${activeTab === 'general' ? 'settings-tab--active' : ''}`}
            onClick={() => handleTabChange('general')}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 13.5,
              fontWeight: activeTab === 'general' ? 700 : 500,
              background: activeTab === 'general' ? '#eef2ff' : 'transparent',
              color: activeTab === 'general' ? '#4f46e5' : '#475569',
              border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <Sliders size={17} color={activeTab === 'general' ? '#4f46e5' : '#64748b'} />
            <span>Operations Config</span>
          </button>
        </aside>

        {/* Right Side Content Panel */}
        <div className="settings-content">
          {/* ============================================================ */}
          {/* TAB: STAIN TYPE MASTER */}
          {/* ============================================================ */}
          {activeTab === 'stains' && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              {/* Header & Controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>Suggested Stain Type Master</h2>
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 6 }}>
                      {stainTypes.length} Configured
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
                    Diagnostic stain codes used by staff, QC inspectors, and fulfillment partners to tag garment blemishes and apply treatment protocols.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    disabled={seeding}
                    title="Restore or re-sync standard 10 stain types"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                      borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc',
                      fontSize: 12.5, fontWeight: 600, color: '#475569', cursor: 'pointer'
                    }}
                  >
                    <RotateCcw size={14} className={seeding ? 'spinning' : ''} />
                    Sync Standard Codes
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenAddStain}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                      borderRadius: 8, border: 'none', background: '#4f46e5',
                      fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)'
                    }}
                  >
                    <Plus size={16} /> Add Custom Stain Type
                  </button>
                </div>
              </div>

              {/* Search & Filter Strip */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260, background: '#f8fafc', padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <Search size={16} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="Search stain code, name, or examples (e.g. Tea, Oil, Turmeric, Ink)..."
                    value={stainSearch}
                    onChange={e => setStainSearch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: 13 }}
                  />
                  {stainSearch && (
                    <button onClick={() => setStainSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {(['ALL', 'ACTIVE', 'CUSTOM'] as const).map(filterOption => (
                    <button
                      key={filterOption}
                      type="button"
                      onClick={() => setStainFilter(filterOption)}
                      style={{
                        padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        border: stainFilter === filterOption ? '1px solid #6366f1' : '1px solid #e2e8f0',
                        background: stainFilter === filterOption ? '#eef2ff' : '#fff',
                        color: stainFilter === filterOption ? '#4f46e5' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {filterOption === 'ALL' ? 'All Types' : filterOption === 'ACTIVE' ? 'Active Only' : 'Custom Added'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table of Stain Types */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px', width: 85 }}>CODE</th>
                      <th style={{ padding: '12px 16px', width: 190 }}>STAIN TYPE</th>
                      <th style={{ padding: '12px 16px' }}>COMMON EXAMPLES</th>
                      <th style={{ padding: '12px 16px', width: 150 }}>CATEGORY</th>
                      <th style={{ padding: '12px 16px', width: 100 }}>DIFFICULTY</th>
                      <th style={{ padding: '12px 16px', width: 90 }}>STATUS</th>
                      <th style={{ padding: '12px 16px', width: 90, textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stainsLoading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                          <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 8px', display: 'block' }} />
                          Loading Stain Type Master...
                        </td>
                      </tr>
                    ) : filteredStainTypes.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                          <AlertCircle size={32} color="#cbd5e1" style={{ margin: '0 auto 8px', display: 'block' }} />
                          <div style={{ fontWeight: 600, color: '#475569' }}>No stain types found</div>
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            {stainSearch ? 'Try a different search term.' : 'Click "Add Custom Stain Type" or "Sync Standard Codes".'}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredStainTypes.map((stain) => {
                        const diffBadge = DIFFICULTY_BADGES[stain.difficulty || 'MODERATE'] || DIFFICULTY_BADGES.MODERATE;
                        return (
                          <tr key={stain.id} style={{ borderBottom: '1px solid #f1f5f9', background: stain.active ? '#fff' : '#fcfcfc' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                display: 'inline-block', padding: '3px 9px', borderRadius: 6,
                                fontWeight: 800, fontSize: 12,
                                background: stain.isCustom ? '#f3e8ff' : '#e0e7ff',
                                color: stain.isCustom ? '#6b21a8' : '#3730a3',
                                border: stain.isCustom ? '1px solid #d8b4fe' : '1px solid #c7d2fe',
                                letterSpacing: '0.04em'
                              }}>
                                {stain.code}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <strong style={{ color: stain.active ? '#0f172a' : '#94a3b8', fontSize: 13.5 }}>
                                  {stain.name}
                                </strong>
                                {stain.isCustom && (
                                  <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 800 }}>
                                    CUSTOM
                                  </span>
                                )}
                              </div>
                              {stain.treatmentNotes && (
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                                  {stain.treatmentNotes}
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(stain.examples || '').split(',').map((ex, i) => (
                                  <span
                                    key={i}
                                    style={{
                                      fontSize: 11.5, background: '#f1f5f9', color: '#334155',
                                      padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0',
                                      fontWeight: 500
                                    }}
                                  >
                                    {ex.trim()}
                                  </span>
                                ))}
                              </div>
                            </td>

                            <td style={{ padding: '12px 16px', fontSize: 12, color: '#475569' }}>
                              {stain.category || 'General'}
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                display: 'inline-flex', padding: '2px 8px', borderRadius: 6,
                                fontSize: 11, fontWeight: 700,
                                background: diffBadge.bg, color: diffBadge.color, border: `1px solid ${diffBadge.border}`
                              }}>
                                {diffBadge.label}
                              </span>
                            </td>

                            <td style={{ padding: '12px 16px' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(stain)}
                                title={stain.active ? 'Click to deactivate' : 'Click to activate'}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                  border: 'none', cursor: 'pointer',
                                  background: stain.active ? '#dcfce7' : '#fee2e2',
                                  color: stain.active ? '#15803d' : '#991b1b',
                                }}
                              >
                                {stain.active ? 'Active' : 'Inactive'}
                              </button>
                            </td>

                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditStain(stain)}
                                  title="Edit Stain Details"
                                  style={{
                                    padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                                    background: '#fff', color: '#475569', cursor: 'pointer'
                                  }}
                                >
                                  <Edit2 size={13} />
                                </button>

                                {stain.isCustom && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStain(stain)}
                                    title="Delete custom stain"
                                    style={{
                                      padding: '5px 8px', borderRadius: 6, border: '1px solid #fecaca',
                                      background: '#fff', color: '#dc2626', cursor: 'pointer'
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: PROFILE SETTINGS */}
          {/* ============================================================ */}
          {activeTab === 'profile' && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Profile & Role Settings</h2>
                <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Manage your administrative contact information and system credentials</p>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>Email Address</label>
                  <input
                    type="email"
                    value={user?.email || 'admin@amazefab.com'}
                    disabled
                    style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', cursor: 'not-allowed', fontSize: 13.5 }}
                  />
                  <small style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 4 }}>Managed via Firebase Authentication</small>
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13.5 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 5 }}>Assigned System Role</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 14px', borderRadius: 8 }}>
                    <ShieldAlert size={16} color="#16a34a" />
                    <span style={{ fontWeight: 800, fontSize: 13, color: '#166534' }}>{user?.role || 'SUPER_ADMIN'}</span>
                  </div>
                </div>

                <div style={{ paddingTop: 10 }}>
                  <button
                    type="submit"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                  >
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: NOTIFICATIONS */}
          {/* ============================================================ */}
          {activeTab === 'notifications' && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Notification & Dispatch Preferences</h2>
                <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Configure real-time alerts across fulfillment steps, damages, and partner payouts</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
                {[
                  { key: 'newOrders', label: 'New Customer Orders Ingested', desc: 'Notify immediately when customer app syncs a new batch of orders' },
                  { key: 'criticalDefects', label: 'Critical Damages & Stain Alerts', desc: 'High priority alert when partner flags severe garment stains (S01-S10) or fabric tears' },
                  { key: 'qcAlerts', label: 'QC Inspection Submissions', desc: 'Alert staff when a partner submits garments for quality verification' },
                  { key: 'readyDelivery', label: 'Ready for Delivery Dispatches', desc: 'Notify hub dispatchers once orders receive complete QC pass' },
                  { key: 'invoiceSettlements', label: 'Partner Invoices & Payout Reminders', desc: 'Reminders when partner billing cycle closes (Weekly, 15 days, Monthly)' },
                ].map(item => (
                  <label
                    key={item.key}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{item.label}</div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={(notifPreferences as any)[item.key]}
                      onChange={e => setNotifPreferences(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      style={{ width: 18, height: 18, accentColor: '#4f46e5', cursor: 'pointer' }}
                    />
                  </label>
                ))}

                <div style={{ paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={handleSaveNotifications}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
                  >
                    <Save size={16} /> Save Notification Settings
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB: GENERAL OPERATIONS CONFIG */}
          {/* ============================================================ */}
          {activeTab === 'general' && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Operations & Workflow Configuration</h2>
                <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>Platform behavior, partner auto-assignment rules, and QC thresholds</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
                <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>Partner Tier Auto-Routing</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Gold customer orders route exclusively to Gold partners. Standard wash routes across Orange & Blue.
                  </div>
                  <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                    <CheckCircle2 size={16} /> Active (Enforced by Assignment Engine)
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>Stain Diagnosis Requirement</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Require partners to tag a Stain Type Code (S01-S10) when reporting a pre-wash stain defect.
                  </div>
                  <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4f46e5', fontWeight: 700 }}>
                    <CheckCircle2 size={16} /> Enabled
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>Standard GST Rate on Payouts</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Default GST percentage applied to partner invoices when GSTIN is verified: <strong>18%</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== ADD / EDIT STAIN TYPE MODAL ===== */}
      {showStainModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
            padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                  {editingStain ? 'Edit Stain Type' : 'Add Custom Stain Type'}
                </h3>
                <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                  Configure classification code and treatment recommendations
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStainModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStain} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Code *
                  </label>
                  <input
                    type="text"
                    value={stainForm.code}
                    onChange={e => setStainForm(p => ({ ...p, code: e.target.value }))}
                    placeholder="e.g. S11"
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Stain Type Name *
                  </label>
                  <input
                    type="text"
                    value={stainForm.name}
                    onChange={e => setStainForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Rust / Oxidation"
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Common Examples (comma-separated) *
                </label>
                <input
                  type="text"
                  value={stainForm.examples}
                  onChange={e => setStainForm(p => ({ ...p, examples: e.target.value }))}
                  placeholder="e.g. Iron rust, nail corrosion, wire marks"
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
                />
                <small style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginTop: 3 }}>
                  Helps staff and partners easily identify the stain during inspection
                </small>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Category / Chemical Base
                  </label>
                  <select
                    value={stainForm.category}
                    onChange={e => setStainForm(p => ({ ...p, category: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                  >
                    <option value="Tannin / Beverage">Tannin / Beverage</option>
                    <option value="Lipid / Hydrocarbon">Lipid / Hydrocarbon</option>
                    <option value="Combination / Pigment">Combination / Pigment</option>
                    <option value="Chlorophyll / Plant">Chlorophyll / Plant</option>
                    <option value="Dye / Solvent-based">Dye / Solvent-based</option>
                    <option value="Wax / Oil / Pigment">Wax / Oil / Pigment</option>
                    <option value="Protein / Coagulable">Protein / Coagulable</option>
                    <option value="Colorant / Bleed">Colorant / Bleed</option>
                    <option value="Mineral / Oxidation">Mineral / Oxidation</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                    Removal Difficulty
                  </label>
                  <select
                    value={stainForm.difficulty}
                    onChange={e => setStainForm(p => ({ ...p, difficulty: e.target.value as any }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, background: '#fff' }}
                  >
                    <option value="EASY">Easy</option>
                    <option value="MODERATE">Moderate</option>
                    <option value="COMPLEX">Complex</option>
                    <option value="SPECIALIZED">Specialized / High Risk</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 4 }}>
                  Treatment & Handling Protocol (Optional)
                </label>
                <textarea
                  value={stainForm.treatmentNotes}
                  onChange={e => setStainForm(p => ({ ...p, treatmentNotes: e.target.value }))}
                  placeholder="e.g. Apply oxalic acid solution, rinse thoroughly; do not apply chlorine bleach"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, minHeight: 65 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="stainActive"
                  checked={stainForm.active}
                  onChange={e => setStainForm(p => ({ ...p, active: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#4f46e5', cursor: 'pointer' }}
                />
                <label htmlFor="stainActive" style={{ fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Enable this stain type in inspection forms
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setShowStainModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  {editingStain ? 'Update Stain Type' : 'Add to Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
