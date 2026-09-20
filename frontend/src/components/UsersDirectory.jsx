import { useEffect, useState } from 'react';
import api from '../services/api';
import { NER_REGION_STATES } from '../context/AuthContext';
import { DRIVER_ROSTER } from '../services/driverService';
import { useTranslation } from '../hooks/useTranslation';

export default function UsersDirectory() {
  const { t } = useTranslation();
  const ROLE_LABEL = { driver: t('role.driver') || 'Driver', field: t('role.field') || 'Field officer', logistics: t('role.logistics') || 'Logistics operator', official: t('role.official') || 'Government Official' };

  const [users, setUsers] = useState([]);
  const [byRole, setByRole] = useState({});
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    api.users({ role, state, search })
      .then((res) => { setUsers(res.users); setByRole(res.byRole); setError(''); })
      .catch(() => {
        // Client/Offline fallback: Populate 10 drivers roster + demo personnel
        const driverUsers = DRIVER_ROSTER.map((d) => ({
          id: d.id,
          name: d.name,
          email: d.email,
          role: 'driver',
          phone: d.phone,
          organisation: 'Registered Logistics Driver',
          state: d.state,
          district: d.district,
          vehicleNumber: d.vehicleNumber,
          language: 'en',
          createdAt: '2026-09-10T10:00:00.000Z',
        }));
        const demoStaff = [
          { id: 'u-priya', name: 'Priya Deka', email: 'priya@ner-sahayak.in', role: 'field', phone: '+91 98765 43211', organisation: 'PWD Field Unit', state: 'Assam', district: 'Nagaon', language: 'as', createdAt: '2026-09-10T10:00:00.000Z' },
          { id: 'u-rohan', name: 'Rohan Sharma', email: 'rohan@ner-sahayak.in', role: 'logistics', phone: '+91 98765 43212', organisation: 'NER Freight Movers', state: 'Assam', district: 'Kamrup Metropolitan', language: 'hi', createdAt: '2026-09-10T10:00:00.000Z' },
          { id: 'u-ananya', name: 'Ananya Gogoi', email: 'ananya@ner-sahayak.in', role: 'official', phone: '+91 98765 43213', organisation: 'DoNER Regional Office', state: 'Assam', district: 'Kamrup Metropolitan', language: 'en', createdAt: '2026-09-10T10:00:00.000Z' },
        ];
        const combined = [...driverUsers, ...demoStaff];
        const q = (search || '').toLowerCase();
        const filtered = combined.filter((u) =>
          (!role || u.role === role) &&
          (!state || u.state === state) &&
          (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.district && u.district.toLowerCase().includes(q)))
        );
        setUsers(filtered);
        setByRole({ driver: 10, field: 1, logistics: 1, official: 1 });
      })
      .finally(() => setLoading(false));
  };


  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [role, state]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openDetail = (u) => {
    setSelected(u);
    setEditForm({ role: u.role, organisation: u.organisation || '', district: u.district || '', phone: u.phone || '', state: u.state || 'Assam' });
    setEditing(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.updateUser(selected.id, editForm);
      setSelected(res.user);
      setEditing(false);
      load();
    } catch (err) {
      alert(`Failed to update user: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selected) return;
    if (!window.confirm(t('users.confirmDelete') || `Are you sure you want to delete the account for ${selected.name} (${selected.email})?`)) return;
    setBusy(true);
    try {
      await api.deleteUser(selected.id);
      setSelected(null);
      load();
    } catch (err) {
      alert(`Could not delete user: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    if (users.length === 0) return;
    const headers = ['ID', 'Name', 'Email', 'Role', 'Phone', 'Organisation', 'State', 'District', 'Language', 'CreatedAt'];
    const rows = users.map((u) => [
      u.id, `"${u.name}"`, `"${u.email}"`, u.role, `"${u.phone || ''}"`, `"${u.organisation || ''}"`,
      `"${u.state || ''}"`, `"${u.district || ''}"`, u.language || 'en', `"${u.createdAt}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ner_sahayak_team_directory_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(ROLE_LABEL).map(([id, label]) => (
            <span key={id} style={countPill}>{label}: <b>{byRole[id] || 0}</b></span>
          ))}
        </div>
        <button onClick={exportCSV} style={exportBtnStyle}>
          📥 {t('users.export') || 'Export Directory (CSV)'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.searchPlaceholder') || "Search name, email, organisation, district…"} style={{ ...inputStyle, flex: 2, minWidth: 220 }}/>
        <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
          <option value="">{t('users.allRoles') || 'All roles'}</option>
          {Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} style={inputStyle}>
          <option value="">{t('users.allStates') || 'All states'}</option>
          {NER_REGION_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {error && <p style={{ color: '#b54a3c', fontSize: 12, fontWeight: 700 }}>{error}</p>}
      {loading && <p style={{ fontSize: 12, color: '#7c8f87' }}>{t('users.loading') || 'Loading directory…'}</p>}

      {!loading && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {[
                  t('users.name') || 'Name',
                  t('users.role') || 'Role',
                  t('users.email') || 'Email',
                  t('users.phone') || 'Phone',
                  t('users.org') || 'Organisation',
                  t('users.districtState') || 'District / State',
                  t('users.lang') || 'Language',
                  t('users.joined') || 'Joined',
                  t('users.actions') || 'Actions'
                ].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ cursor: 'pointer' }}>
                  <td style={tdStyle} onClick={() => openDetail(u)}><b>{u.name}</b></td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>
                    <span style={roleBadge(u.role)}>{ROLE_LABEL[u.role]}</span>
                  </td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{u.email}</td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{u.phone || '—'}</td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{u.organisation || '—'}</td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{[u.district, u.state].filter(Boolean).join(', ') || '—'}</td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{u.language}</td>
                  <td style={tdStyle} onClick={() => openDetail(u)}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    <button onClick={() => openDetail(u)} style={viewBtnStyle}>{t('users.viewAll') || 'View All Details'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <p style={{ fontSize: 12, color: '#7c8f87', padding: '14px 0' }}>{t('users.noMatch') || 'No accounts match this filter.'}</p>}
        </div>
      )}

      {selected && (
        <>
          <div style={overlayStyle} onClick={() => setSelected(null)} />
          <div style={detailPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <small style={{ color: '#8aa097', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>ADMIN ACCESS • USER DETAILS</small>
                <h3 style={{ margin: '6px 0 2px', fontSize: 18, color: '#25483d' }}>{selected.name}</h3>
                <span style={roleBadge(selected.role)}>{ROLE_LABEL[selected.role]}</span>
              </div>
              <button onClick={() => setSelected(null)} style={closeBtn}>✕</button>
            </div>

            {!editing ? (
              <>
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  <Detail label={t('users.userId') || 'User ID'} value={selected.id} mono />
                  <Detail label={t('users.email') || 'Email'} value={selected.email} />
                  <Detail label={t('users.phone') || 'Phone'} value={selected.phone || '—'} />
                  <Detail label={t('users.orgUnit') || 'Organisation / unit'} value={selected.organisation || '—'} />
                  <Detail label={t('users.state') || 'State'} value={selected.state || '—'} />
                  <Detail label={t('users.districtPosting') || 'District / posting'} value={selected.district || '—'} />
                  {selected.vehicleNumber && <Detail label={t('tracker.vehicleNumber') || 'Vehicle number'} value={selected.vehicleNumber} />}
                  {selected.hub && <Detail label={t('users.logisticsHub') || 'Logistics hub'} value={selected.hub} />}
                  {selected.department && <Detail label={t('users.department') || 'Department'} value={selected.department} />}
                  <Detail label={t('users.alertLang') || 'Alert language'} value={selected.language} />
                  <Detail label={t('users.accountCreated') || 'Account created'} value={new Date(selected.createdAt).toLocaleString()} />
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 24, paddingTop: 16, borderTop: '1px solid #edf1ee' }}>
                  <button onClick={() => setEditing(true)} style={editBtnStyle}>
                    ✏️ {t('users.editInfo') || 'Edit User Role & Info'}
                  </button>
                  <button onClick={handleDeleteUser} disabled={busy} style={deleteBtnStyle}>
                    🗑️ {t('users.deleteAcc') || 'Delete User Account'}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSaveEdit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <label style={editLabelStyle}>{t('users.role') || 'Role'}
                  <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} style={inputStyle}>
                    {Object.entries(ROLE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>
                <label style={editLabelStyle}>{t('users.orgUnit') || 'Organisation / Unit'}
                  <input value={editForm.organisation} onChange={(e) => setEditForm((p) => ({ ...p, organisation: e.target.value }))} style={inputStyle} />
                </label>
                <label style={editLabelStyle}>{t('users.districtPosting') || 'District / Posting'}
                  <input value={editForm.district} onChange={(e) => setEditForm((p) => ({ ...p, district: e.target.value }))} style={inputStyle} />
                </label>
                <label style={editLabelStyle}>{t('users.state') || 'State'}
                  <select value={editForm.state} onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))} style={inputStyle}>
                    {NER_REGION_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label style={editLabelStyle}>{t('users.phone') || 'Phone'}
                  <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} style={inputStyle} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="submit" disabled={busy} style={saveBtnStyle}>{busy ? (t('common.saving') || 'Saving…') : (t('common.saveChanges') || 'Save Changes')}</button>
                  <button type="button" onClick={() => setEditing(false)} style={cancelBtnStyle}>{t('common.cancel') || 'Cancel'}</button>
                </div>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '6px 0', borderBottom: '1px solid #edf1ee' }}>
      <span style={{ color: '#8aa097', fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#3c5c50', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right', wordBreak: 'break-all', maxWidth: 190 }}>{value}</span>
    </div>
  );
}

const inputStyle = { height: 38, padding: '0 12px', border: '1px solid #dce5df', borderRadius: 7, fontSize: 12 };
const countPill = { fontSize: 11, padding: '6px 12px', border: '1px solid #e1e9e3', borderRadius: 20, color: '#61776d', background: '#fbfdfb' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 11 };
const thStyle = { textAlign: 'left', padding: '8px 10px', color: '#8aa097', fontSize: 9, fontWeight: 800, letterSpacing: 0.6, borderBottom: '1px solid #e1e9e3', whiteSpace: 'nowrap' };
const tdStyle = { padding: '9px 10px', borderBottom: '1px solid #edf1ee', color: '#3c5c50', whiteSpace: 'nowrap' };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(16,51,41,.27)', zIndex: 900 };
const detailPanel = { position: 'fixed', top: 0, right: 0, bottom: 0, width: 360, background: '#fff', boxShadow: '-10px 0 25px rgba(17,58,45,.12)', padding: '24px 20px', zIndex: 901, overflowY: 'auto' };
const closeBtn = { border: 0, background: 'transparent', color: '#7c8f87', fontSize: 16, cursor: 'pointer' };
const viewBtnStyle = { padding: '4px 8px', border: '1px solid #d4e6db', borderRadius: 5, color: '#176d55', background: '#f2f9f5', fontSize: 10, fontWeight: 700, cursor: 'pointer' };
const exportBtnStyle = { padding: '7px 14px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const editBtnStyle = { padding: '9px', border: '1px solid #d4e6db', borderRadius: 7, color: '#1e745b', background: '#f0f9f3', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const deleteBtnStyle = { padding: '9px', border: 0, borderRadius: 7, color: '#fff', background: '#b5493a', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const saveBtnStyle = { flex: 1, padding: '9px', border: 0, borderRadius: 7, color: '#fff', background: '#1e745b', fontSize: 11, fontWeight: 800, cursor: 'pointer' };
const cancelBtnStyle = { padding: '9px 14px', border: '1px solid #dce5df', borderRadius: 7, color: '#61776d', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' };
const editLabelStyle = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#3f5951' };

const roleBadge = (role) => ({
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 12,
  fontSize: 10,
  fontWeight: 800,
  color: role === 'official' ? '#176d55' : role === 'driver' ? '#2e7898' : role === 'field' ? '#b5742a' : '#527c6b',
  background: role === 'official' ? '#e3f4ea' : role === 'driver' ? '#e6f3f8' : role === 'field' ? '#fcf3e6' : '#f0f5f2',
});
