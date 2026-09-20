import { useEffect, useRef, useState, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { NODES as LOCAL_NODES } from '../services/routeCalculator';

export default function CommandPaletteModal({ isOpen, onClose, navigate }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [nodes, setNodes] = useState(LOCAL_NODES);
  const [users, setUsers] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      api.nodes().then((res) => setNodes(res.nodes || LOCAL_NODES)).catch(() => {});
      if (user?.role === 'official') {
        api.users().then((res) => setUsers(res.users || [])).catch(() => {});
      }
    }
  }, [isOpen, user?.role]);

  // Handle building the master items list
  const allItems = useMemo(() => {
    const items = [];
    
    const navs = [
      { id: 'nav-overview', type: 'navigation', title: 'Overview Dashboard', category: 'Navigation', icon: '⚡', action: () => { navigate('Overview'); onClose(); } },
      { id: 'nav-route', type: 'navigation', title: 'Plan Safest Route', category: 'Navigation', icon: '🗺️', action: () => { navigate('Route planner'); onClose(); }, keywords: ['route', 'plan', 'safest'] },
      { id: 'nav-map', type: 'navigation', title: 'Live Network Map', category: 'Navigation', icon: '📍', action: () => { navigate('Live map'); onClose(); }, keywords: ['map', 'live', 'network'] },
      { id: 'nav-alerts', type: 'navigation', title: 'Regional Alerts', category: 'Navigation', icon: '🔔', action: () => { navigate('Alerts'); onClose(); }, keywords: ['alert', 'regional', 'notifications'] },
      { id: 'nav-reports', type: 'navigation', title: 'Field Hazard Reports', category: 'Navigation', icon: '⚠️', action: () => { navigate('Field reports'); onClose(); }, keywords: ['report', 'hazard', 'field'] },
      { id: 'nav-profile', type: 'account', title: 'User Profile & Settings', category: 'Account', icon: '👤', action: () => { navigate('Profile'); onClose(); }, keywords: ['profile', 'settings', 'user'] },
    ];
    items.push(...navs);

    nodes.forEach(n => {
      items.push({
        id: `loc-${n.id}`,
        type: 'location',
        title: t(`enum.${n.id}`) || n.name,
        category: `${t(`enum.${n.state}`) || n.state} · ${n.type === 'airport' ? t('map.airport') || 'Airport' : t('map.networkLocation') || 'Network location'}`,
        icon: n.type === 'airport' ? '✈️' : '📍',
        keywords: [n.id, n.name, n.state, n.type],
        action: () => {
          navigate('Live map');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('map-focus', { detail: { center: [n.lat, n.lng], zoom: 10, id: n.id } }));
          }, 300);
          onClose();
        }
      });
    });

    if (user?.role === 'official') {
      users.forEach(u => {
        items.push({
          id: `usr-${u.id || u.email}`,
          type: 'personnel',
          title: u.name,
          category: `${(u.role || '').toUpperCase()} · ${u.email} · ${u.district || u.state}`,
          icon: '👤',
          keywords: [u.name, u.email, u.role, u.district, u.state],
          action: () => { navigate('Team directory'); onClose(); }
        });
      });
    }

    return items;
  }, [nodes, users, user?.role, navigate, onClose, t]);

  const q = query.toLowerCase().trim();

  const filteredItems = useMemo(() => {
    if (!q) return allItems.filter(i => i.type !== 'location' && i.type !== 'personnel');

    return allItems.filter(item => {
      const matchLabel = (item.title || '').toLowerCase().includes(q);
      const matchCategory = (item.category || '').toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some(k => (k||'').toLowerCase().includes(q));
      return matchLabel || matchCategory || matchKeywords;
    });
  }, [q, allItems]);

  const locations = filteredItems.filter(i => i.type === 'location').slice(0, 5);
  const navigations = filteredItems.filter(i => i.type !== 'location' && i.type !== 'personnel').slice(0, 5);
  const personnel = filteredItems.filter(i => i.type === 'personnel').slice(0, 5);

  const flatList = useMemo(() => {
    return [...navigations, ...locations, ...personnel];
  }, [locations, navigations, personnel]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [q]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % flatList.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + flatList.length) % flatList.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[selectedIndex]) {
           flatList[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatList, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cmd-modal-overlay" onClick={onClose}>
      <div className="cmd-modal-container" onClick={(e) => e.stopPropagation()}>
        <header className="cmd-modal-header">
          <span className="cmd-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            placeholder={t('search.placeholder') || "Search towns (Guwahati, Shillong...), personnel, or jump to view... (Esc to close)"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </header>

        <div className="cmd-modal-body">
          {navigations.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">{t('search.platformActions') || 'PLATFORM ACTIONS'}</div>
              {navigations.map((item) => {
                const isSelected = flatList[selectedIndex]?.id === item.id;
                return (
                  <div key={item.id} className={`cmd-item ${isSelected ? 'selected' : ''}`} onClick={item.action} onMouseEnter={() => setSelectedIndex(flatList.indexOf(item))}>
                    <span className="cmd-item-icon">{item.icon}</span>
                    <div className="cmd-item-info">
                      <b>{item.title}</b>
                      <small>{item.category}</small>
                    </div>
                    <span className="cmd-item-arrow">➔</span>
                  </div>
                );
              })}
            </div>
          )}

          {locations.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">{t('search.networkTowns') || 'NETWORK TOWNS & NODES'}</div>
              {locations.map((item) => {
                const isSelected = flatList[selectedIndex]?.id === item.id;
                return (
                  <div key={item.id} className={`cmd-item ${isSelected ? 'selected' : ''}`} onClick={item.action} onMouseEnter={() => setSelectedIndex(flatList.indexOf(item))}>
                    <span className="cmd-item-icon">{item.icon}</span>
                    <div className="cmd-item-info">
                      <b>{item.title}</b>
                      <small>{item.category}</small>
                    </div>
                    <span className="cmd-item-arrow">{t('search.viewOnMap') || 'View on Map'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {personnel.length > 0 && (
            <div className="cmd-section">
              <div className="cmd-section-title">{t('search.registeredPersonnel') || 'REGISTERED PERSONNEL (DIRECTORY)'}</div>
              {personnel.map((item) => {
                const isSelected = flatList[selectedIndex]?.id === item.id;
                return (
                  <div key={item.id} className={`cmd-item ${isSelected ? 'selected' : ''}`} onClick={item.action} onMouseEnter={() => setSelectedIndex(flatList.indexOf(item))}>
                    <span className="cmd-item-icon">{item.icon}</span>
                    <div className="cmd-item-info">
                      <b>{item.title}</b>
                      <small>{item.category}</small>
                    </div>
                    <span className="cmd-item-arrow">{t('search.viewUser') || 'View User'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!q && navigations.length === 0 && (
            <div className="cmd-empty">{t('search.noResults') || 'Type to search across the NER network...'}</div>
          )}
          {q && flatList.length === 0 && (
            <div className="cmd-empty">{t('search.noResults') || 'No results found'} for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
}
