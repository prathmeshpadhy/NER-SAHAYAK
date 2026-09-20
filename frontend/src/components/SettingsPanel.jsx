import { useState, useEffect } from 'react';
import { useAuth, LANGUAGES } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import api from '../services/api';
import { offlineQueue, isOnline } from '../services/offlineQueue';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendRoleNotification,
} from '../services/webPushService';

export default function SettingsPanel({ notify }) {
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();
  const [language, setLanguage] = useState(user.language || 'en');
  const [busy, setBusy] = useState(false);
  const [queued] = useState(offlineQueue.count());
  const [pushPermission, setPushPermission] = useState(getNotificationPermission());

  useEffect(() => {
    setPushPermission(getNotificationPermission());
  }, []);

  const handleEnablePush = async () => {
    const res = await requestNotificationPermission();
    setPushPermission(res);
    if (res === 'granted') {
      notify && notify('Web Push notifications enabled for your workspace.');
      sendRoleNotification(user.role, {
        type: 'System',
        title: 'Web Push Notifications Enabled',
        detail: `You will now receive instant push updates for ${user.name} (${user.role}).`,
      });
    } else {
      notify && notify('Permission was not granted.');
    }
  };

  const handleTestPush = async () => {
    const sent = await sendRoleNotification(user.role, {
      type: 'Test Alert',
      title: 'Active Corridor Status Test',
      detail: `Real-time push delivery verified for ${user.name} on ${user.district || 'Assam corridor'}.`,
      corridor: 'NH27 / NH37',
      severity: 'moderate',
    });
    if (sent) {
      notify && notify('Test Web Push notification sent!');
    } else {
      notify && notify('Could not trigger notification. Check browser settings.');
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ language });
      notify && notify(t('settings.langSuccess') || 'Alert language updated.');
    } catch (err) {
      notify && notify(`Could not save: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const res = await offlineQueue.flush(api);
      notify && notify(`Synced ${res.synced} offline item(s).`);
    } catch (err) {
      notify && notify(`Sync failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 480 }}>
      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>{t('settings.alertLanguage') || 'Alert language'}</h4>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <button onClick={save} disabled={busy} style={btnStyle}>{t('settings.save') || 'Save'}</button>
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>{t('settings.networkStatus') || 'Network status'}</h4>
        <p style={{ fontSize: 12, color: '#7c8f87' }}>
          {t('settings.onlineStatusPrefix') || 'You are currently '} <b style={{ color: isOnline() ? '#1e745b' : '#b5493a' }}>{isOnline() ? (t('settings.online') || 'online') : (t('settings.offline') || 'offline')}</b>.
          {queued > 0 && ` ${queued} ${t('settings.queuedReports') || 'field report(s) are queued locally.'}`}
        </p>
        {queued > 0 && <button onClick={syncNow} disabled={busy} style={btnStyle}>{t('report.syncNow') || 'Sync now'}</button>}
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>🔔 Web Push Notifications</h4>
        <div style={{ padding: '12px 14px', background: '#f5faf7', border: '1px solid #dce8e2', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#25483d', fontWeight: 700 }}>
              Browser Notifications for <b style={{ textTransform: 'capitalize' }}>{user.role}</b>
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 12,
              textTransform: 'uppercase',
              color: pushPermission === 'granted' ? '#176d55' : pushPermission === 'denied' ? '#b5493a' : '#bd7e22',
              background: pushPermission === 'granted' ? '#e6f4ea' : pushPermission === 'denied' ? '#fbe9e6' : '#fff5da',
            }}>
              {pushPermission}
            </span>
          </div>
          <p style={{ fontSize: 11, color: '#61776d', margin: '0 0 10px', lineHeight: 1.4 }}>
            Receive real-time alerts on your device for road blocks, severe landslides, and cargo shipment updates even when working across tabs.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pushPermission !== 'granted' ? (
              <button
                type="button"
                onClick={handleEnablePush}
                style={{ ...btnStyle, background: '#1e745b', height: 36, fontSize: 11 }}
              >
                🔔 Enable Web Push Notifications
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTestPush}
                style={{ ...btnStyle, background: '#2b765e', height: 36, fontSize: 11 }}
              >
                🚀 Send Test Web Push Notification
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 12, color: '#39735f', marginBottom: 8 }}>{t('settings.account') || 'Account'}</h4>
        <p style={{ fontSize: 12, color: '#7c8f87' }}>{t('settings.signedInAs') || 'Signed in as'} <b>{user.email}</b> · {t('settings.role') || 'role'}: <b style={{ textTransform: 'capitalize' }}>{t(`enum.${user.role}`) || user.role}</b></p>
      </div>
    </div>
  );
}

const inputStyle = { height: 42, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 13, flex: 1 };
const btnStyle = { height: 42, padding: '0 16px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 12, fontWeight: 800, cursor: 'pointer' };
