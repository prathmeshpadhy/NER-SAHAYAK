import { useState } from 'react';
import { DRIVER_ROSTER } from '../services/driverService';
import { useTranslation } from '../hooks/useTranslation';

export default function DriverAssignModal({ isOpen, onClose, targetItem, onDriverAssigned, notify }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = DRIVER_ROSTER.filter((d) =>
    !search ||
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.district.toLowerCase().includes(search.toLowerCase()) ||
    d.vehicleNumber.toLowerCase().includes(search.toLowerCase()) ||
    d.state.toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = (driver) => {
    onDriverAssigned && onDriverAssigned(driver, targetItem);
    notify && notify(`Driver ${driver.name} (${driver.vehicleNumber}) assigned to ${targetItem?.title || 'Shipment'}`);
    onClose();
  };

  return (
    <div className="cmd-modal-overlay" onClick={onClose} style={{ zIndex: 10010 }}>
      <div className="cmd-modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <header style={{ padding: '16px 20px', background: '#175b4a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{t('dash.assignDriver') || 'Assign Driver to Logistics Shipment'}</h3>
            <small style={{ color: '#d2f2e5', fontSize: 10 }}>{t('dash.target') || 'Target'}: {targetItem?.title || 'Cargo Shipment'} ({targetItem?.origin || 'Origin'} → {targetItem?.dest || 'Destination'})</small>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </header>

        <div style={{ padding: '12px 18px', background: '#f4faf6', borderBottom: '1px solid #e1ebe4' }}>
          <input
            type="text"
            placeholder={t('dash.searchDriver') || "Search driver by name, district, vehicle number..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', height: 38, padding: '0 12px', border: '1px solid #d2e4d8', borderRadius: 7, fontSize: 12, outline: 'none' }}
          />
        </div>

        <div style={{ padding: '14px 18px', maxHeight: '55vh', overflowY: 'auto', display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#7a8d85', letterSpacing: 1.2 }}>{t('dash.registeredDrivers') || 'REGISTERED NORTH EAST DRIVERS (10 ROSTER)'}</div>
          {filtered.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: '1px solid #e1ebe4', borderRadius: 9, background: '#fff', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #175b4a, #23745c)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flex: '0 0 38px' }}>
                  {d.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 12, color: '#1e382f' }}>{d.name}</b>
                  <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, color: '#176d55', background: '#e4f4eb', padding: '2px 6px', borderRadius: 4 }}>
                    {d.vehicleNumber}
                  </span>
                  <div style={{ fontSize: 10, color: '#7c8f87', marginTop: 2 }}>
                    📍 {t(`enum.${d.district}`) || d.district}, {t(`enum.${d.state}`) || d.state} · 📞 {d.phone}
                  </div>
                  <div style={{ fontSize: 9, color: '#9bada3', marginTop: 1 }}>
                    {t('dash.specialization') || 'Specialization'}: {t(`enum.${d.cargoType}`) || d.cargoType} ({d.experienceYears} {t('dash.yrsExp') || 'yrs exp'})
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleAssign(d)}
                style={{ padding: '8px 14px', border: 0, borderRadius: 6, background: '#1e745b', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', marginLeft: 'auto' }}
              >
                {t('dash.assignDriverBtn') || 'Assign Driver'} ➔
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
