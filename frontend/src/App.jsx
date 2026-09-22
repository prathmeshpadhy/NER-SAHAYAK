import React, { useEffect, useState, Component } from 'react';
import './App.css';
import { AuthProvider, LANGUAGES, NER_REGION_STATES, USER_ROLES, useAuth } from './context/AuthContext';
import { useTranslation } from './hooks/useTranslation';
import api from './services/api';
import LiveMap from './components/LiveMap';
import RoutePlanner from './components/RoutePlanner';
import FieldReportForm from './components/FieldReportForm';
import VehicleTracker from './components/VehicleTracker';
import DistrictDashboard from './components/DistrictDashboard';
import AlertsList from './components/AlertsList';
import SettingsPanel from './components/SettingsPanel';
import UsersDirectory from './components/UsersDirectory';
import AskSahayakModal from './components/AskSahayakModal';
import CommandPaletteModal from './components/CommandPaletteModal';
import DriverOverview from './components/DriverOverview';
import FieldOfficerOverview from './components/FieldOfficerOverview';
import LogisticsOverview from './components/LogisticsOverview';
import { useWebPushNotifications } from './hooks/useWebPushNotifications';
import { offlineReportQueue, offlineResponseQueue, isOnline } from './services/offlineQueue';

const Icon = ({ n, s = 20 }) => {
  const icons = {
    logo: <><path d="M5 17 11.5 4l2.3 7.1L19 13.3l-7 6.7-2.6-6.3L5 17Z"/><path d="m13.7 11.1-4.2 2.6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/></>,
    route: <><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18c7 0 1-10 8-10"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    report: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.9 2.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-3.84v-.08A1.7 1.7 0 0 0 9.04 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.9-2.9.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3v-3.84h.08A1.7 1.7 0 0 0 4.6 9.04a1.7 1.7 0 0 0-.34-1.88L4.2 7.1l2.9-2.9.06.06A1.7 1.7 0 0 0 9.04 4.6a1.7 1.7 0 0 0 1.04-1.56V3h3.84v.08A1.7 1.7 0 0 0 14.96 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.9 2.9-.06.06A1.7 1.7 0 0 0 19.4 9.04a1.7 1.7 0 0 0 1.56 1.04H21v3.84h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, plus: <path d="M12 5v14M5 12h14"/>, arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    check: <path d="m5 12 4 4L19 6"/>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></>,
    phone: <><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M10 18h4"/></>, cloud: <path d="M17 18H7a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.4 12 3 3 0 0 1 17 18Z"/>,
    user: <><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></>,
  };
  return <svg className="icon" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[n]}</svg>;
};

const roles = USER_ROLES;

const roleCopy = {
  driver: { title: 'Your journey, made safer.', sub: 'Stay ahead of road closures and weather changes on your route.', action: 'Plan a journey' },
  field: { title: 'The field is counting on you.', sub: 'See what needs attention and keep your team in sync.', action: 'Create field report' },
  logistics: { title: 'Move what matters, with confidence.', sub: 'Live routing intelligence for every critical shipment.', action: 'Plan a shipment' },
  official: { title: 'A clearer view of the region.', sub: 'Turn live intelligence into timely, confident decisions.', action: 'View regional briefing' },
};

const navForRole = (role) => {
  if (role === 'driver') {
    return [
      ['Overview', 'grid'],
      ['Route planner', 'route'],
      ['Live map', 'map'],
      ['Vehicle telemetry', 'phone'],
      ['Alerts', 'bell'],
      ['Profile', 'user'],
    ];
  }
  if (role === 'field') {
    return [
      ['Overview', 'grid'],
      ['Field reports', 'report'],
      ['Live map', 'map'],
      ['Alerts', 'bell'],
      ['Route planner', 'route'],
      ['Profile', 'user'],
    ];
  }
  if (role === 'logistics') {
    return [
      ['Overview', 'grid'],
      ['Cargo shipments', 'route'],
      ['Fleet tracking', 'phone'],
      ['Route planner', 'route'],
      ['Live map', 'map'],
      ['Alerts', 'bell'],
      ['Profile', 'user'],
    ];
  }
  return [
    ['Overview', 'grid'],
    ['Logistics Overview', 'grid'],
    ['Team directory', 'grid'],
    ['Live map', 'map'],
    ['Route planner', 'route'],
    ['Alerts', 'bell'],
    ['Field reports', 'report'],
    ['Profile', 'user'],
  ];
};

const emptySignup = {
  name: '', email: '', phone: '', password: '', confirm: '', role: 'driver',
  organisation: '', vehicleNumber: '', state: 'Assam', district: '', language: 'en', hub: '', department: '',
};

const DEMO_PROFILES = [
  { role: 'driver',    name: 'Arjun Bora',   email: 'arjun@ner-sahayak.in',  organisation: 'Independent Operator',   detail: 'AS 01 K 4309 · Kamrup Metro' },
  { role: 'field',     name: 'Priya Deka',   email: 'priya@ner-sahayak.in',  organisation: 'PWD Field Unit, Nagaon', detail: 'Nagaon, Assam' },
  { role: 'logistics', name: 'Rohan Sharma', email: 'rohan@ner-sahayak.in',  organisation: 'NER Freight Movers',     detail: 'Khanapara Hub · Kamrup' },
  { role: 'official',  name: 'Ananya Gogoi', email: 'ananya@ner-sahayak.in', organisation: 'DoNER Regional Office',  detail: 'Disaster Management, Assam' },
];
const ROLE_LABEL = { driver: 'Driver', field: 'Field officer', logistics: 'Logistics', official: 'Official' };

function Brand({ light = false }) {
  const { t } = useTranslation();
  return <div className={`brand ${light ? 'light' : ''}`}><div className="brand-mark"><Icon n="logo" s={20}/></div><div><strong>ner-sahayak</strong><span>{t('auth.intelligenceNetwork') || 'intelligence network'}</span></div></div>;
}

function AuthShell({ children, intro }) {
  const { t } = useTranslation();
  return (
    <main className="login-page">
      <section className="login-aside">
        <Brand light/>
        <div className="login-hero">
          <div className="live-label"><i/>{t('auth.liveIntelligence')}</div>
          <h1>{t('auth.heroTitle1')}<br/><em>{t('auth.heroTitle2')}</em></h1>
          <p>{t('auth.heroDesc')}</p>
        </div>
        <div className="route-art">
          <span className="road a"/><span className="road b"/><span className="road c"/>
          <i className="dot da"/><i className="dot db"/><i className="dot dc"/>
          <div className="art-tag ta"><b/>{t('auth.roadAccess')}<br/><strong>{t('auth.monitoredLive')}</strong></div>
          <div className="art-tag tb"><b/>{t('auth.riskIntelligence')}<br/><strong>{t('auth.alwaysLearning')}</strong></div>
        </div>
        <div className="aside-foot"><i/>{t('auth.systemStatus')} <span>•</span> v1.0.0</div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="mobile-brand"><Brand/></div>
          {intro}
          {children}
        </div>
        <footer>{t('auth.footerRights')} <span>•</span> {t('auth.footerMadeFor')}</footer>
      </section>
    </main>
  );
}

function Login({ onSignup }) {
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fillDemo = async (demoEmail) => {
    setEmail(demoEmail);
    setPassword('sahayak123');
    setError(''); setBusy(true);
    try {
      await login(demoEmail, 'sahayak123');
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };


  return (
    <AuthShell intro={<div className="login-intro"><div className="eyebrow">{t('auth.userAccess')}</div><h2>{t('auth.signInTitle')}</h2><p>{t('auth.signInDesc')}</p></div>}>
      <form onSubmit={submit} className="login-form">
        <label>{t('auth.workEmail')}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('auth.emailPlaceholder')} autoComplete="username" required/>
        </label>
        <label>{t('auth.password')}
          <div className="password">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type={seen ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" required/>
            <button type="button" onClick={() => setSeen(!seen)} aria-label="Toggle password visibility"><Icon n="eye" s={18}/></button>
          </div>
        </label>
        {error && <p className="form-error" role="alert" style={{ marginTop: '8px', marginBottom: '0' }}>{error}</p>}
        <button disabled={busy} className="sign-in" type="submit">
          {busy ? t('auth.openingWorkspace') : <>{t('auth.signInButton')} <Icon n="arrow" s={18}/></>}
        </button>
      </form>

      <div className="demo-fill-box">
        <div className="demo-fill-header"><Icon n="spark" s={14}/><span>{t('auth.testDemoAccounts')}</span></div>
        <div className="demo-fill-buttons">
          {DEMO_PROFILES.map((p) => (
            <button type="button" key={p.email} className="demo-chip" onClick={() => fillDemo(p.email)}>
              {t(`auth.role_${p.role}`) || ROLE_LABEL[p.role]}
            </button>
          ))}
        </div>
      </div>

      <p className="login-help">{t('auth.newToNetwork')} <button className="link" onClick={onSignup}>{t('auth.createProfileLink')}</button></p>
    </AuthShell>
  );
}

function Signup({ onLogin }) {
  const { signup } = useAuth();
  const { t } = useTranslation();
  const [form, setForm] = useState(emptySignup);
  const [seen, setSeen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await signup(form);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell intro={<div className="login-intro"><div className="eyebrow">{t('auth.joinNetwork')}</div><h2>{t('auth.createProfileTitle')}</h2><p>{t('auth.createProfileDesc')}</p></div>}>
      <div className="role-picker">
        {roles.map((item) => (
          <button type="button" key={item.id} onClick={() => setForm((prev) => ({ ...prev, role: item.id }))} className={item.id === form.role ? 'active' : ''}>
            <span><Icon n={item.icon} s={17}/></span>{t(`auth.role_${item.id}`) || item.label}{item.id === form.role && <i><Icon n="check" s={12}/></i>}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="login-form signup-form">
        <div className="field-row">
          <label>{t('auth.fullName')}<input value={form.name} onChange={set('name')} type="text" placeholder={t('auth.namePlaceholder')} required/></label>
          <label>{t('auth.phone')}<input value={form.phone} onChange={set('phone')} type="tel" placeholder="+91"/></label>
        </div>
        <label>{t('auth.workEmail')}<input value={form.email} onChange={set('email')} type="email" autoComplete="email" required/></label>
        <label>{t('auth.organisation')}<input value={form.organisation} onChange={set('organisation')} type="text" placeholder={t('auth.orgPlaceholder')} required/></label>
        <div className="field-row">
          <label>{t('auth.state')}
            <select value={form.state} onChange={set('state')}>
              {NER_REGION_STATES.map((state) => <option key={state} value={state}>{t(`enum.${state}`) || state}</option>)}
            </select>
          </label>
          <label>{t('auth.district')}<input value={form.district} onChange={set('district')} type="text" placeholder={t('auth.district')} required/></label>
        </div>
        {form.role === 'driver' && <label>{t('auth.vehicleNumber')}<input value={form.vehicleNumber} onChange={set('vehicleNumber')} type="text" placeholder="AS 01 K 4309" required/></label>}
        {form.role === 'logistics' && <label>{t('auth.hub')}<input value={form.hub} onChange={set('hub')} type="text" placeholder={t('auth.hubPlaceholder')} required/></label>}
        {form.role === 'official' && <label>{t('auth.department')}<input value={form.department} onChange={set('department')} type="text" placeholder={t('auth.deptPlaceholder')} required/></label>}
        <label>{t('auth.alertLanguage')}
          <select value={form.language} onChange={set('language')}>
            {LANGUAGES.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
          </select>
        </label>
        <div className="field-row">
          <label>{t('auth.password')}
            <div className="password">
              <input value={form.password} onChange={set('password')} type={seen ? 'text' : 'password'} autoComplete="new-password" required/>
              <button type="button" onClick={() => setSeen(!seen)} aria-label="Toggle password visibility"><Icon n="eye" s={18}/></button>
            </div>
          </label>
          <label>{t('auth.confirmPassword')}<input value={form.confirm} onChange={set('confirm')} type={seen ? 'text' : 'password'} autoComplete="new-password" required/></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button disabled={busy} className="sign-in">{busy ? t('auth.creatingProfile') : <>{t('auth.createProfileBtn')} <Icon n="arrow" s={18}/></>}</button>
      </form>
      <p className="login-help">{t('auth.alreadyRegistered')} <button className="link" onClick={onLogin}>{t('auth.signInLink')}</button></p>
    </AuthShell>
  );
}

function ProfileView({ roleMeta, initials, notify, navigate, exit }) {
  const { user, updateProfile } = useAuth();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: user.name, phone: user.phone || '', organisation: user.organisation || '',
    vehicleNumber: user.vehicleNumber || '', state: user.state || 'Assam', district: user.district || '',
    language: user.language || 'en', hub: user.hub || '', department: user.department || '',
  });
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    try {
      await updateProfile(form);
      notify(t('settings.savedSuccess') || 'Profile saved. Alerts will use your preferred language.');
    } catch (err) {
      notify(`Could not save profile: ${err.message}`);
    }
  };

  return (
    <section className="profile-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <button className="back-tab-btn" onClick={() => navigate('Overview')}>← {t('navigation.backToOverview')}</button>
        <button className="profile-signout-btn" onClick={exit}>{t('navigation.signOut')}</button>
      </div>
      <div className="profile-hero card">
        <span className="profile-avatar">{initials}</span>
        <div><small>{t('profile.signedInAccount')}</small><h2>{user.name}</h2><p>{user.email}</p></div>
        <div className="profile-role-badge"><Icon n={roleMeta.icon} s={16}/>{t(`auth.role_${roleMeta.id}`) || roleMeta.label}</div>
      </div>
      <div className="profile-grid">
        <form className="card profile-form login-form" onSubmit={save}>
          <header><div><small>{t('profile.account')}</small><h2>{t('profile.editProfile')}</h2></div></header>
          <label>{t('auth.fullName')}<input value={form.name} onChange={set('name')} type="text" required/></label>
          <label>{t('auth.workEmail')}<input value={user.email} type="email" disabled/></label>
          <div className="field-row">
            <label>{t('auth.phone')}<input value={form.phone} onChange={set('phone')} type="tel"/></label>
            <label>{t('auth.state')}
              <select value={form.state} onChange={set('state')}>
                {NER_REGION_STATES.map((state) => <option key={state} value={state}>{t(`enum.${state}`) || state}</option>)}
              </select>
            </label>
          </div>
          <label>{t('auth.district')}<input value={form.district} onChange={set('district')} type="text"/></label>
          <label>{t('auth.organisation')}<input value={form.organisation} onChange={set('organisation')} type="text"/></label>
          {user.role === 'driver' && <label>{t('auth.vehicleNumber')}<input value={form.vehicleNumber} onChange={set('vehicleNumber')} type="text"/></label>}
          {user.role === 'logistics' && <label>{t('auth.hub')}<input value={form.hub} onChange={set('hub')} type="text"/></label>}
          {user.role === 'official' && <label>{t('auth.department')}<input value={form.department} onChange={set('department')} type="text"/></label>}
          <label>{t('auth.alertLanguage')}
            <select value={form.language} onChange={set('language')}>
              {LANGUAGES.map((lang) => <option key={lang.id} value={lang.id}>{lang.label}</option>)}
            </select>
          </label>
          <button className="primary" type="submit">{t('profile.saveProfile')}</button>
        </form>
        <aside className="card profile-access">
          <small>{t('profile.roleAccess')}</small>
          <h2>{t('profile.workspaceCapabilities')}</h2>
          <ul>{roleMeta.permissions.map((item, idx) => <li key={idx}><Icon n="check" s={14}/>{t(`profile.perm_${roleMeta.id}_${idx}`) || item}</li>)}</ul>
          <p className="profile-note">{t('profile.note')}</p>
        </aside>
      </div>
    </section>
  );
}

// Full-page views for each nav item — all backed by the real API.
function PageView({ page, role, notify, navigate }) {
  const { t } = useTranslation();
  const details = {
    'Live map': [t('pageView.liveMap.title') || 'Live network map', t('pageView.liveMap.desc') || 'Explore road conditions, weather warnings and moving resources in one map.', 'map'],
    'Route planner': [t('pageView.routePlanner.title') || 'Plan the safest route', t('pageView.routePlanner.desc') || 'AI-optimized routing using live weather and disruption data.', 'route'],
    Alerts: [t('pageView.alerts.title') || 'Your alerts', t('pageView.alerts.desc') || 'Stay up to date with the signals that matter to you.', 'bell'],
    'Field reports': [t('pageView.fieldReports.title') || 'Field reports & hazards', t('pageView.fieldReports.desc') || 'Share a geo-tagged update that helps the wider network respond.', 'report'],
    Settings: [t('pageView.settings.title') || 'Workspace settings', t('pageView.settings.desc') || 'Manage notification preferences, language, and night driving mode.', 'settings'],
    'Team directory': [t('pageView.teamDir.title') || 'Team directory', t('pageView.teamDir.desc') || 'Every registered driver, field officer, logistics operator, and official across the network.', 'grid'],
    'Logistics Overview': [t('pageView.logistics.title') || 'Logistics Overview', t('pageView.logistics.desc') || 'Monitor active cargo routes, backlogs, and assign drivers.', 'grid'],
    'Cargo shipments': [t('pageView.cargo.title') || 'Cargo dispatch queue', t('pageView.cargo.desc') || 'Manage shipment routes, dispatch priorities, and delivery status.', 'route'],
    'Fleet tracking': [t('pageView.fleet.title') || 'Fleet GPS tracking', t('pageView.fleet.desc') || 'Live vehicle positions, telematics, and driver tracking.', 'phone'],
    'Vehicle telemetry': [t('pageView.vehicle.title') || 'Vehicle GPS telemetry', t('pageView.vehicle.desc') || 'Manage assigned vehicle, telemetry fixes, and journey position.', 'phone'],
  };
  const [title, description, icon] = details[page] || details['Live map'];
  return (
    <section className="card" style={{ padding: '22px 24px' }}>
      <header style={{ padding: 0, minHeight: 'auto', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <small><Icon n={icon} s={12}/> {t(`nav.${page.toLowerCase().replace(' ', '')}`) || page.toUpperCase()}</small>
          <h2 style={{ marginTop: 8 }}>{title}</h2>
          <p style={{ color: '#789087', fontSize: 12, marginTop: 4 }}>{description}</p>
        </div>
        <button className="back-tab-btn" onClick={() => navigate('Overview')}>← {t('navigation.backToOverview')}</button>
      </header>
      {page === 'Live map' && <LiveMap height={520} />}
      {page === 'Route planner' && <RoutePlanner notify={notify} />}
      {page === 'Alerts' && <AlertsList notify={notify} />}
      {page === 'Field reports' && <FieldReportForm notify={notify} />}
      {page === 'Settings' && <SettingsPanel notify={notify} />}
      {page === 'Team directory' && <UsersDirectory />}
      {page === 'Logistics Overview' && <LogisticsOverview notify={notify} navigate={navigate} />}
      {(page === 'Cargo shipments' || page === 'Fleet tracking' || page === 'Vehicle telemetry') && <VehicleTracker notify={notify} />}
    </section>
  );
}

function Overview({ role, navigate, action, notify }) {
  if (role === 'driver') {
    return <DriverOverview navigate={navigate} action={action} notify={notify} />;
  }
  if (role === 'field') {
    return <FieldOfficerOverview navigate={navigate} notify={notify} />;
  }
  if (role === 'logistics') {
    return <LogisticsOverview navigate={navigate} notify={notify} />;
  }
  return <DistrictDashboard notify={notify} navigate={navigate} />;
}

function Dashboard({ role, exit }) {
  const { user, initialsFrom } = useAuth();
  const { t } = useTranslation();
  const [page, setPage] = useState('Overview');
  const [menu, setMenu] = useState(false);
  const [read, setRead] = useState(false);
  const [toast, setToast] = useState('');
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const userCopy = roleCopy[role];
  const profile = roles.find(item => item.id === role) || roles[0];
  const initials = initialsFrom(user.name);
  const detail = [t(`auth.role_${role}`) || profile.label, user.district || user.organisation || user.vehicleNumber].filter(Boolean).join(' • ');
  const notify = message => { setToast(message); setTimeout(() => setToast(''), 2600); };
  const navigate = next => { setPage(next); setMenu(false); };
  const action = () => { if (role === 'field') navigate('Field reports'); else navigate('Route planner'); };
  const { permission: pushPerm, requestPermission: requestPushPerm } = useWebPushNotifications(user, notify);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getTranslatedNav = (name) => {
    const map = {
      'Overview': t('navigation.overview'),
      'Route planner': t('navigation.routePlanner'),
      'Live map': t('navigation.liveMap'),
      'Alerts': t('navigation.alerts'),
      'Profile': t('navigation.profile'),
      'Settings': t('navigation.settings'),
      'Logistics Overview': t('navigation.overview'),
      'Cargo shipments': t('navigation.cargoShipments'),
      'Fleet tracking': t('navigation.fleetTracking'),
    };
    return map[name] || name;
  };

  return <div className={`workspace ${darkMode ? 'dark-mode' : ''}`}>
    <aside className={`side ${menu ? 'open' : ''}`}>
      <div className="side-brand"><Brand/><button onClick={() => setMenu(false)} aria-label="Close navigation"><Icon n="close"/></button></div>
      <div className="role-chip static">
        <span><Icon n={profile.icon} s={16}/></span>
        <div><b>{t(`auth.role_${profile.id}`) || profile.label}</b><small>{t('navigation.workspace')}</small></div>
      </div>
      <nav>{navForRole(role).map(([name, icon]) => <button className={page === name ? 'active' : ''} onClick={() => navigate(name)} key={name}><Icon n={icon} s={19}/>{getTranslatedNav(name)}{name === 'Alerts' && !read && <i>•</i>}</button>)}</nav>
      <div className="side-bottom">
        <button onClick={() => navigate('Settings')}><Icon n="settings" s={18}/>{t('navigation.settings')}</button>
        <button className="profile" onClick={() => navigate('Profile')} aria-label="Open profile"><span>{initials}</span><div><b>{user.name}</b><small>{detail}</small></div></button>
        <button className="side-signout-btn" onClick={exit}><Icon n="close" s={15}/> {t('navigation.signOut')}</button>
      </div>
    </aside>

    <main className="dashboard">
      <header className="top">
        <button className="hamburger" onClick={() => setMenu(true)} aria-label="Open navigation"><Icon n="menu"/></button>
        <div className="crumb">
          <button className="crumb-link" onClick={() => navigate('Overview')}>{t('navigation.workspace')}</button>
          {page !== 'Overview' && <><Icon n="chevron" s={13}/><b className="crumb-current">{getTranslatedNav(page)}</b></>}
        </div>
        {page !== 'Overview' && (
          <button className="top-back-btn" onClick={() => navigate('Overview')}>
            ← {t('navigation.backToOverview')}
          </button>
        )}
        <div className="top-actions">
          <button className="top-search-btn" onClick={() => setCmdOpen(true)} title="Quick Search (Ctrl+K)">
            <span className="top-btn-icon">🔍</span> <span className="top-btn-label">{t('navigation.search') || 'Search'} <kbd style={{ fontSize: 9, opacity: 0.8, marginLeft: 4 }}>Ctrl+K</kbd></span>
          </button>
          <button className="top-theme-btn" onClick={() => setDarkMode(!darkMode)} title="Toggle Night Mode">
            <span className="top-btn-icon">{darkMode ? '☀️' : '🌙'}</span> <span className="top-btn-label">{darkMode ? 'Day Mode' : (t('navigation.nightMode') || 'Night Mode')}</span>
          </button>
          <button className="ask" onClick={() => setAskModalOpen(true)} title="Ask Sahayak AI"><Icon n="spark" s={16}/><span className="top-btn-label">{t('navigation.askSahayak') || 'Ask Sahayak'}</span></button>
          <button className="notifications" onClick={() => { setRead(true); if (pushPerm !== 'granted') requestPushPerm(); notify('All alerts marked as seen.'); }} aria-label="Mark alerts as seen" title={pushPerm === 'granted' ? 'Web Push Active' : 'Enable Web Push Alerts'}><Icon n="bell" s={18}/>{!read && <i/>}</button>
          <button className="top-avatar" onClick={() => navigate('Profile')} aria-label="Open profile">{initials}</button>
        </div>
      </header>
      <div className="content">
        <NetworkStatusBar notify={notify} />
        {page !== 'Profile' && <>
          <section className="welcome">
            <div><small>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase()} <i>•</i> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
              <h1>{t('dashboard.goodDay')} {user.name.split(' ')[0]} <b>✦</b></h1>
              <p>{t('dashboard.moveWhatMatters')}<span>{t('dashboard.liveRoutingIntelligence')}</span></p>
            </div>
            <button className="primary" onClick={action}><Icon n="plus" s={17}/>{t(`dashboard.${role}.action`) || userCopy.action}</button>
          </section>
          <RegionStrip navigate={navigate} />
        </>}
        {page === 'Overview' ? <Overview role={role} navigate={navigate} action={action} notify={notify}/>
          : page === 'Profile' ? <ProfileView roleMeta={profile} initials={initials} notify={notify} navigate={navigate} exit={exit}/>
          : <PageView page={page} role={role} notify={notify} navigate={navigate}/>}
      </div>
    </main>

    <AskSahayakModal isOpen={askModalOpen} onClose={() => setAskModalOpen(false)} />
    <CommandPaletteModal isOpen={cmdOpen} onClose={() => setCmdOpen(false)} navigate={navigate} />
    {menu && <button className="overlay" onClick={() => setMenu(false)} aria-label="Close navigation"/>}
    {toast && <div className="toast"><Icon n="check" s={17}/>{toast}</div>}
  </div>;
}

const DEFAULT_SUMMARY = { activeVehicles: 8, regionAccessCoveragePct: 88, openFieldReports: 3 };

function RegionStrip({ navigate }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  useEffect(() => { api.dashboardSummary().then(setSummary).catch(() => {}); }, []);
  return (
    <section className="region">
      <div><i/>{t('dashboard.regionalStatus') || 'Regional Status:'} <b>{summary ? (summary.regionAccessCoveragePct >= 85 ? (t('dashboard.stable') || 'Stable') : summary.regionAccessCoveragePct >= 60 ? (t('dashboard.watchful') || 'Watchful') : (t('dashboard.disrupted') || 'Disrupted')) : t('common.loading')}</b></div>
      <p>
        <span><b>{summary?.activeVehicles ?? '—'}</b> {t('dashboard.activeRoutes') || 'Active routes'}</span>
        <span><b>{summary ? `${summary.regionAccessCoveragePct}%` : '—'}</b> {t('dash.coverage') || 'Access coverage'}</span>
        <span><b>{summary?.openFieldReports ?? '—'}</b> {t('dash.open_reports') || 'Need attention'}</span>
      </p>
      <button onClick={() => navigate('Live map')}>{t('dashboard.viewLiveMap') || 'View Live Map'} <Icon n="arrow" s={15}/></button>
    </section>
  );
}

function NetworkStatusBar({ notify }) {
  const [online, setOnline] = useState(isOnline());
  const [pendingReports, setPendingReports] = useState(offlineReportQueue.count());
  const [pendingResponses, setPendingResponses] = useState(offlineResponseQueue.count());
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState('');

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      setPendingReports(offlineReportQueue.count());
      setPendingResponses(offlineResponseQueue.count());
    };
    const handleOffline = () => {
      setOnline(false);
      setPendingReports(offlineReportQueue.count());
      setPendingResponses(offlineResponseQueue.count());
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(() => {
      setPendingReports(offlineReportQueue.count());
      setPendingResponses(offlineResponseQueue.count());
    }, 4000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      let syncedCount = 0;
      if (offlineReportQueue.count() > 0) {
        const res = await offlineReportQueue.flush(api);
        syncedCount += res?.synced || 0;
      }
      if (offlineResponseQueue.count() > 0) {
        const res = await offlineResponseQueue.flush(api);
        syncedCount += res?.count || 0;
      }
      setPendingReports(offlineReportQueue.count());
      setPendingResponses(offlineResponseQueue.count());
      setSyncNotice(`Synced ${syncedCount} offline action(s) with canonical server.`);
      setTimeout(() => setSyncNotice(''), 4000);
      notify && notify('Offline items synchronized successfully.');
    } catch (_) {
      setSyncNotice('Sync encountered network issue. Retrying automatically.');
      setTimeout(() => setSyncNotice(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  const totalPending = pendingReports + pendingResponses;

  if (online && totalPending === 0 && !syncNotice) {
    return null;
  }

  return (
    <div
      style={{
        margin: '0 0 16px 0',
        padding: '10px 16px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        fontSize: 12,
        fontWeight: 600,
        background: !online ? '#fffbeb' : totalPending > 0 ? '#eff6ff' : '#ecfdf5',
        border: `1px solid ${!online ? '#fde68a' : totalPending > 0 ? '#bfdbfe' : '#a7f3d0'}`,
        color: !online ? '#92400e' : totalPending > 0 ? '#1e40af' : '#065f46',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{!online ? '⚡' : syncing ? '🔄' : '✓'}</span>
        <span>
          {!online
            ? `OFFLINE MODE — Network disconnected. New reports and alert responses are queued locally.`
            : syncNotice
            ? syncNotice
            : `RECONNECTED — ${totalPending} action(s) waiting to sync.`}
          {totalPending > 0 && (
            <strong style={{ marginLeft: 6, opacity: 0.9 }}>
              ({pendingReports} report{pendingReports === 1 ? '' : 's'}, {pendingResponses} response{pendingResponses === 1 ? '' : 's'})
            </strong>
          )}
        </span>
      </div>
      {online && totalPending > 0 && (
        <button
          onClick={handleManualSync}
          disabled={syncing}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            background: '#1d4ed8',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: syncing ? 'wait' : 'pointer',
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Pending Items ➔'}
        </button>
      )}
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('NER-Sahayak caught rendering error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0e2b22', color: '#ffffff', padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 8, color: '#ccf363' }}>NER-Sahayak Intelligence Network</h2>
          <p style={{ color: '#d2f2e5', maxWidth: 460, margin: '8px 0 24px', lineHeight: 1.5, fontSize: '0.95rem' }}>
            An unexpected error occurred while rendering this component. Click below to reload your session safely.
          </p>
          <button onClick={() => window.location.reload()} style={{ background: '#ccf363', color: '#0e2b22', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
            🔄 Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppShell() {
  const { user, logout, ready } = useAuth();
  const [authView, setAuthView] = useState('login');
  if (!ready) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0e2b22', color: '#ccf363', fontFamily: 'sans-serif', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #ccf363', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.5px' }}>Loading NER-Sahayak Platform…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }
  if (!user) {
    return authView === 'signup'
      ? <Signup onLogin={() => setAuthView('login')}/>
      : <Login onSignup={() => setAuthView('signup')}/>;
  }
  return <Dashboard role={user.role} exit={logout} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
