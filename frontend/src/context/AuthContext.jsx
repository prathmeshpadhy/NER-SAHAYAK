import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { tokenStore } from '../services/api';
import { DRIVER_ROSTER } from '../services/driverService';

export const USER_ROLES = [
  { id: 'driver', label: 'Driver', icon: 'phone', name: 'Driver workspace', initials: 'DR' },
  { id: 'field', label: 'Field officer', icon: 'report', name: 'Field officer workspace', initials: 'FO' },
  { id: 'logistics', label: 'Logistics operator', icon: 'route', name: 'Logistics workspace', initials: 'LO' },
  { id: 'official', label: 'Government official', icon: 'grid', name: 'Official briefing room', initials: 'GO' },
].map((r) => ({
  ...r,
  permissions: {
    driver: ['View live road & weather conditions', 'Plan the safest route with live ETA', 'Receive multilingual alerts', 'Report hazards from the road'],
    field: ['Submit geo-tagged incident reports', 'Attach photos of road/bridge damage', 'Work offline and sync later', 'Raise alerts for their district'],
    logistics: ['Plan and track shipments', 'Optimize routes for cargo vehicles', 'Live GPS tracking of the fleet', 'View logistics bottlenecks'],
    official: ['Regional connectivity dashboard', 'District-wise accessibility scores', 'Emergency route readiness', 'Approve and broadcast alerts'],
  }[r.id],
}));



export const DEMO_USERS = [
  ...DRIVER_ROSTER.map((d) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    role: 'driver',
    organisation: 'Registered Logistics Driver',
    district: d.district,
    state: d.state,
    vehicleNumber: d.vehicleNumber,
    phone: d.phone,
  })),
  {
    id: 'u-priya',
    name: 'Priya Deka',
    email: 'priya@ner-sahayak.in',
    role: 'field',
    organisation: 'PWD Field Unit',
    district: 'Nagaon',
    state: 'Assam',
    phone: '+91 98765 43211',
  },
  {
    id: 'u-rohan',
    name: 'Rohan Sharma',
    email: 'rohan@ner-sahayak.in',
    role: 'logistics',
    organisation: 'NER Freight Movers',
    district: 'Kamrup Metropolitan',
    state: 'Assam',
    phone: '+91 98765 43212',
  },
  {
    id: 'u-ananya',
    name: 'Ananya Gogoi',
    email: 'ananya@ner-sahayak.in',
    role: 'official',
    organisation: 'DoNER Regional Office',
    district: 'Kamrup Metropolitan',
    state: 'Assam',
    department: 'Disaster Management',
    phone: '+91 98765 43213',
  },
];


export const NER_REGION_STATES = [
  'Assam', 'Meghalaya', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Arunachal Pradesh', 'Sikkim',
];

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'as', label: 'Assamese' },
  { id: 'bn', label: 'Bengali' },
  { id: 'hi', label: 'Hindi' },
  { id: 'mni', label: 'Manipuri (Meitei)' },
  { id: 'kha', label: 'Khasi' },
  { id: 'lus', label: 'Mizo' },
  { id: 'nag', label: 'Nagamese' },
];

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) { setReady(true); return; }
    api.me()
      .then((res) => {
        setUser(res.user);
        localStorage.setItem('ner_sahayak_user', JSON.stringify(res.user));
      })
      .catch(() => {
        const cached = localStorage.getItem('ner_sahayak_user');
        if (cached) {
          try { setUser(JSON.parse(cached)); } catch (_) { tokenStore.clear(); }
        } else {
          tokenStore.clear();
        }
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const cleanEmail = (email || '').toLowerCase().trim();
    const demoMatch = DEMO_USERS.find((u) => u.email.toLowerCase() === cleanEmail);

    try {
      const res = await api.login(email, password);
      tokenStore.set(res.token);
      localStorage.setItem('ner_sahayak_user', JSON.stringify(res.user));
      setUser(res.user);
      return res.user;
    } catch (err) {
      // If server explicitly returned 401/403 (invalid credentials on live backend)
      if (err.status === 401 || err.status === 403) {
        if (demoMatch && (password === 'sahayak123' || !password)) {
          const mockToken = `demo_token_${Date.now()}`;
          tokenStore.set(mockToken);
          localStorage.setItem('ner_sahayak_user', JSON.stringify(demoMatch));
          setUser(demoMatch);
          return demoMatch;
        }
        throw err;
      }

      // For ANY network error, fetch failure, 404, or GitHub Pages static deployment:
      const fallbackUser = demoMatch || {
        id: `demo-${Date.now()}`,
        name: cleanEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Demo User',
        email: cleanEmail || 'user@ner-sahayak.in',
        role: 'driver',
        organisation: 'NER Sahayak Member',
        district: 'Kamrup Metropolitan',
        state: 'Assam',
      };
      const mockToken = `demo_token_${Date.now()}`;
      tokenStore.set(mockToken);
      localStorage.setItem('ner_sahayak_user', JSON.stringify(fallbackUser));
      setUser(fallbackUser);
      return fallbackUser;
    }
  }, []);


  const signup = useCallback(async (form) => {
    try {
      const res = await api.signup(form);
      tokenStore.set(res.token);
      localStorage.setItem('ner_sahayak_user', JSON.stringify(res.user));
      setUser(res.user);
      return res.user;
    } catch (err) {
      if (err.message && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.status === undefined)) {
        const fallbackUser = {
          id: `user-${Date.now()}`,
          name: form.name || 'New Member',
          email: form.email,
          role: form.role || 'driver',
          organisation: form.organisation || 'NER Logistics',
          district: form.district || 'Kamrup Metropolitan',
          state: form.state || 'Assam',
        };
        const mockToken = `demo_token_${Date.now()}`;
        tokenStore.set(mockToken);
        localStorage.setItem('ner_sahayak_user', JSON.stringify(fallbackUser));
        setUser(fallbackUser);
        return fallbackUser;
      }
      throw err;
    }
  }, []);

  const updateProfile = useCallback(async (partial) => {
    try {
      const res = await api.updateProfile(partial);
      setUser(res.user);
      localStorage.setItem('ner_sahayak_user', JSON.stringify(res.user));
      return res.user;
    } catch (_) {
      setUser((prev) => {
        const updated = { ...prev, ...partial };
        localStorage.setItem('ner_sahayak_user', JSON.stringify(updated));
        return updated;
      });
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem('ner_sahayak_user');
    setUser(null);
  }, []);

  const initialsFrom = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'U';

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, updateProfile, initialsFrom }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
