import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications'>('profile');
  const [saved, setSaved] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg('Profile preferences updated successfully!');
    setSaved(true);
    setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
  }

  function handleSaveNotifications() {
    setSaveMsg('Notification preferences updated!');
    setSaved(true);
    setTimeout(() => { setSaved(false); setSaveMsg(''); }, 3000);
  }

  const tabs: Array<{ id: 'profile' | 'notifications'; label: string }> = [
    { id: 'profile', label: 'Profile' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Manage your account profile and notifications</p>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="settings-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'settings-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="settings-content">
          {activeTab === 'profile' && (
            <div className="card">
              <div className="card-header">
                <h3>Profile Settings</h3>
              </div>
              <div className="card-body">
                <form onSubmit={handleSaveProfile} className="form">
                  <div className="form-group">
                    <label>Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={user?.email || ''} disabled style={{ background: '#f3f4f6', cursor: 'not-allowed' }} />
                    <small className="text-muted">Email is managed by your administrator.</small>
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="form-group">
                    <label>Assigned Role</label>
                    <input type="text" value={user?.role || 'SUPER_ADMIN'} disabled style={{ background: '#f3f4f6', cursor: 'not-allowed', fontWeight: 600 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button type="submit" className="btn btn-primary">Save Changes</button>
                    {saved && <span className="success-msg">{saveMsg}</span>}
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card">
              <div className="card-header">
                <h3>Notification Preferences</h3>
              </div>
              <div className="card-body">
                <div className="notification-preferences">
                  <label className="toggle-row">
                    <span>Email notifications for new orders</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label className="toggle-row">
                    <span>Critical defect alerts (damages flagged by partners)</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label className="toggle-row">
                    <span>QC inspection alerts (when dry-cleaner submits QC)</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                  <label className="toggle-row">
                    <span>Ready for delivery dispatches</span>
                    <input type="checkbox" defaultChecked />
                  </label>
                </div>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-primary" onClick={handleSaveNotifications}>Save Preferences</button>
                  {saved && <span className="success-msg">{saveMsg}</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
