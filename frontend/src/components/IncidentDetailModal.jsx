import React, { useEffect } from 'react';

export default function IncidentDetailModal({ incident, onClose, onLocateOnMap }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!incident) return null;

  const hasGps = incident.hasGps || (
    incident.lat !== null &&
    incident.lat !== undefined &&
    incident.lat !== '' &&
    !isNaN(Number(incident.lat)) &&
    incident.lng !== null &&
    incident.lng !== undefined &&
    incident.lng !== '' &&
    !isNaN(Number(incident.lng))
  );

  const latNum = hasGps ? Number(incident.lat) : null;
  const lngNum = hasGps ? Number(incident.lng) : null;

  const hasPhoto = Boolean(incident.photoDataUrl && typeof incident.photoDataUrl === 'string' && incident.photoDataUrl.trim().length > 0);

  const isCritical = incident.severity === 'critical' || incident.severity === 'major' || incident.severity === 'high';
  const isResolved = incident.status === 'resolved';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(2px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 10,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          maxWidth: 520,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            background: isResolved ? '#f0fdf4' : isCritical ? '#fef2f2' : '#fffbeb',
            borderBottom: `1px solid ${isResolved ? '#bbf7d0' : isCritical ? '#fecaca' : '#fde68a'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: isResolved ? '#dcfce7' : isCritical ? '#fee2e2' : '#fef3c7',
                  color: isResolved ? '#15803d' : isCritical ? '#b91c1c' : '#b45309',
                }}
              >
                {incident.severity || 'MODERATE'}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: '#f1f5f9',
                  color: '#475569',
                }}
              >
                {incident.status ? incident.status.replace('_', ' ') : 'ACTIVE'}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: '#e0f2fe',
                  color: '#0369a1',
                }}
              >
                👤 {incident.reporterRole === 'driver' ? 'Driver Report' : 'Field Officer Report'}
              </span>
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
              {incident.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 20,
              fontWeight: 700,
              color: '#64748b',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', display: 'grid', gap: 14, fontSize: 12 }}>
          {/* Metadata Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
              background: '#f8fafc',
              padding: '10px 12px',
              borderRadius: 7,
              border: '1px solid #e2e8f0',
            }}
          >
            <div>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Corridor</div>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>{incident.road || 'Regional Corridor'}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Category</div>
              <div style={{ fontWeight: 700, color: '#1e293b', textTransform: 'capitalize' }}>
                {incident.category ? incident.category.replace('_', ' ') : 'General'}
              </div>
            </div>
            {incident.fromNode && incident.toNode && (
              <div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Segment</div>
                <div style={{ fontWeight: 700, color: '#1e293b' }}>{incident.fromNode} ↔ {incident.toNode}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Reported At</div>
              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                {incident.createdAt ? new Date(incident.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently'}
              </div>
            </div>
          </div>

          {/* Section 1: GPS Evidence */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 12px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5 }}>
                🌐 GPS Telemetry Fix
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: hasGps ? '#dcfce7' : '#f1f5f9',
                  color: hasGps ? '#15803d' : '#64748b',
                }}
              >
                {hasGps ? '✓ VERIFIED ON-SITE FIX' : 'GPS: UNAVAILABLE'}
              </span>
            </div>

            {hasGps ? (
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: 'monospace', color: '#0f766e', fontWeight: 700 }}>
                  <span>Latitude: {latNum.toFixed(5)}° N</span>
                  <span>Longitude: {lngNum.toFixed(5)}° E</span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  Acquired directly from field officer's mobile hardware GPS sensor upon incident broadcast.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                GPS coordinates were not attached to this report. Location is referenced by corridor name (<b>{incident.road || 'highway corridor'}</b>).
              </div>
            )}
          </div>

          {/* Section 2: Attached Photo Evidence */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 12px', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 5 }}>
                📷 Field Photo Evidence
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: hasPhoto ? '#e0f2fe' : '#f1f5f9',
                  color: hasPhoto ? '#0369a1' : '#64748b',
                }}
              >
                {hasPhoto ? 'PHOTO ATTACHED' : 'NO PHOTO ATTACHED'}
              </span>
            </div>

            {hasPhoto ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div
                  style={{
                    position: 'relative',
                    borderRadius: 6,
                    overflow: 'hidden',
                    background: '#0f172a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    maxHeight: 240,
                  }}
                >
                  <img
                    src={incident.photoDataUrl}
                    alt={incident.title || 'Field Incident Evidence Photo'}
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: 240,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      const parent = e.target.parentElement;
                      if (parent) {
                        const fallbackDiv = document.createElement('div');
                        fallbackDiv.style.padding = '20px';
                        fallbackDiv.style.color = '#ef4444';
                        fallbackDiv.style.fontSize = '11px';
                        fallbackDiv.innerText = 'Unable to render attached image data.';
                        parent.appendChild(fallbackDiv);
                      }
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Verified ground truth photo submitted by {incident.reporterRole === 'driver' ? 'Driver' : 'Field Unit'}.</span>
                  <a
                    href={incident.photoDataUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0f766e', fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open Full Size ↗
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                No on-site photo was attached to this field report.
              </div>
            )}
          </div>

          {/* Section 3: Operational Notes */}
          {incident.description && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 12px', background: '#f8fafc' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                Operational Notes & Observations
              </div>
              <div style={{ color: '#1e293b', lineHeight: 1.4, fontSize: 11 }}>
                {incident.description}
              </div>
            </div>
          )}

          {/* Section 4: Resolution info if resolved */}
          {isResolved && incident.resolutionNotes && (
            <div style={{ border: '1px solid #bbf7d0', borderRadius: 7, padding: '10px 12px', background: '#f0fdf4' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#15803d', textTransform: 'uppercase', marginBottom: 2 }}>
                ✓ Resolution Notes ({new Date(incident.resolvedAt || incident.updatedAt || Date.now()).toLocaleDateString()})
              </div>
              <div style={{ color: '#166534', fontSize: 11 }}>
                {incident.resolutionNotes}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '10px 18px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 10, color: '#64748b' }}>
            ID: <span style={{ fontFamily: 'monospace' }}>{incident.id?.slice(0, 8)}</span> (Canonical Network Record)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onLocateOnMap && hasGps && (
              <button
                type="button"
                onClick={() => {
                  onLocateOnMap(incident);
                  onClose();
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #0f766e',
                  background: '#0f766e',
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📍 Locate on Map
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
