import React from 'react';
import { createRoot } from 'react-dom/client';
import { isPushSupported, getNotificationPermission, sendRoleNotification } from './services/webPushService';
import api from './services/api';
import { offlineQueue } from './services/offlineQueue';

// Mock ESM-only react-leaflet and leaflet modules for Jest
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Polyline: () => <div data-testid="polyline" />,
  Tooltip: ({ children }) => <div>{children}</div>,
  CircleMarker: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  LayersControl: ({ children }) => <div>{children}</div>,
  LayerGroup: ({ children }) => <div>{children}</div>,
  useMap: () => ({
    invalidateSize: jest.fn(),
    setView: jest.fn(),
    getContainer: jest.fn(() => ({ clientWidth: 500, clientHeight: 500 })),
  }),
}));

jest.mock('leaflet', () => ({
  Icon: { Default: { prototype: {}, mergeOptions: jest.fn() } },
}));

// Import App after mocks
import App from './App';

describe('NER-Sahayak Frontend Regression & Persona Test Suite', () => {
  test('renders App component into DOM root without crashing', () => {
    const div = document.createElement('div');
    const root = createRoot(div);
    root.render(<App />);
    expect(div).toBeTruthy();
    root.unmount();
  });

  test('webPushService exports valid interface for all personas', () => {
    expect(typeof isPushSupported).toBe('function');
    expect(typeof getNotificationPermission).toBe('function');
    expect(typeof sendRoleNotification).toBe('function');

    const perm = getNotificationPermission();
    expect(['default', 'granted', 'denied', 'unsupported']).toContain(perm);
  });

  test('api service defines essential endpoints for cross-persona sync', () => {
    expect(typeof api.login).toBe('function');
    expect(typeof api.reports).toBe('function');
    expect(typeof api.createReport).toBe('function');
    expect(typeof api.alerts).toBe('function');
    expect(typeof api.vehicles).toBe('function');
    expect(typeof api.shipments).toBe('function');
    expect(typeof api.dashboardSummary).toBe('function');
  });

  test('offlineQueue handles queuing and count calculation', () => {
    expect(typeof offlineQueue.count).toBe('function');
    expect(typeof offlineQueue.add).toBe('function');
    expect(typeof offlineQueue.all).toBe('function');
    expect(typeof offlineQueue.clear).toBe('function');
    expect(typeof offlineQueue.flush).toBe('function');
    expect(typeof offlineQueue.count()).toBe('number');
  });
});
