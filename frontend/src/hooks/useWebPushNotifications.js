import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  registerServiceWorker,
  showWebPushNotification,
  sendRoleNotification,
} from '../services/webPushService';
import api from '../services/api';

/**
 * Custom React hook for Web Push notifications across personas (Driver, Field, Logistics, Official)
 */
export function useWebPushNotifications(user, notify) {
  const [permission, setPermission] = useState(getNotificationPermission());
  const [supported] = useState(isPushSupported());
  const [lastNotification, setLastNotification] = useState(null);
  const knownAlertIdsRef = useRef(new Set());
  const knownReportIdsRef = useRef(new Set());
  const isFirstRunRef = useRef(true);

  // Initialize service worker on mount
  useEffect(() => {
    if (supported) {
      registerServiceWorker().catch(() => {});
    }
  }, [supported]);

  const requestPermission = useCallback(async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      notify && notify('Web Push notifications enabled for your workspace.');
      showWebPushNotification({
        title: 'NER-Sahayak Notifications Active',
        body: `Live alerts will now be pushed directly to your device for ${user?.role || 'user'}.`,
        tag: 'welcome-notification',
      });
    } else if (res === 'denied') {
      notify && notify('Notifications blocked. Please enable them in browser site settings.');
    }
    return res;
  }, [notify, user?.role]);

  const sendTestNotification = useCallback(async () => {
    if (!supported) {
      notify && notify('Web notifications not supported in this browser.');
      return false;
    }

    if (permission !== 'granted') {
      const res = await requestPermission();
      if (res !== 'granted') return false;
    }

    const testPayloads = {
      driver: {
        type: 'Hazard Warning',
        title: 'NH27 Corridor Alert',
        detail: 'Landslide cleared near Nagaon bypass. Caution advised.',
        corridor: 'NH27',
        severity: 'moderate',
      },
      field: {
        type: 'Incident Update',
        title: 'Bridge Assessment Required',
        detail: 'Field unit requested to inspect culvert at Km 42.',
        corridor: 'NH37',
        severity: 'major',
      },
      logistics: {
        type: 'Shipment Route Alert',
        title: 'Cargo Disruption on NH27',
        detail: 'Shipment #SHP-4309 rerouted via Silchar corridor.',
        corridor: 'NH27 / NH6',
        severity: 'severe',
      },
      official: {
        type: 'Emergency Advisory',
        title: 'District Connectivity Update',
        detail: 'Cachar district accessibility reduced to 68% due to waterlogging.',
        corridor: 'Barak Valley',
        severity: 'critical',
      },
    };

    const payload = testPayloads[user?.role] || testPayloads.driver;
    const sent = await sendRoleNotification(user?.role || 'driver', payload);
    if (sent) {
      setLastNotification(payload);
      notify && notify('Test Web Push notification delivered to your browser!');
    }
    return sent;
  }, [permission, requestPermission, supported, user?.role, notify]);

  // Periodic polling to push live alerts and field reports to the active persona
  useEffect(() => {
    if (!user || permission !== 'granted') return;

    const checkLiveStream = async () => {
      try {
        const [alertsRes, reportsRes] = await Promise.all([
          api.alerts().catch(() => ({ alerts: [] })),
          api.reports().catch(() => ({ reports: [] })),
        ]);

        const alerts = alertsRes.alerts || [];
        const reports = reportsRes.reports || [];

        // On first run, seed known IDs so we don't spam notifications on initial load
        if (isFirstRunRef.current) {
          alerts.forEach((a) => knownAlertIdsRef.current.add(a.id));
          reports.forEach((r) => knownReportIdsRef.current.add(r.id));
          isFirstRunRef.current = false;
          return;
        }

        // Check for new alerts
        for (const a of alerts) {
          if (!knownAlertIdsRef.current.has(a.id)) {
            knownAlertIdsRef.current.add(a.id);
            // Push notification tailored to persona
            sendRoleNotification(user.role, {
              type: a.type || 'Alert',
              title: a.title,
              detail: a.text,
              corridor: a.road,
              severity: a.severity,
            });
            notify && notify(`New Alert: ${a.title}`);
          }
        }

        // Check for new field reports
        for (const r of reports) {
          if (!knownReportIdsRef.current.has(r.id)) {
            knownReportIdsRef.current.add(r.id);

            // Filter relevant persona notifications:
            // Driver: notification if road/corridor matches or if major/critical
            // Logistics: notification for any active disruption
            // Official: notification for major/critical
            const isRelevant =
              user.role === 'official' ||
              user.role === 'logistics' ||
              (user.role === 'driver' && (r.severity === 'critical' || r.severity === 'major' || r.road?.includes('NH27') || r.district === user.district));

            if (isRelevant) {
              sendRoleNotification(user.role, {
                type: 'Field Incident',
                title: `[${(r.category || 'hazard').toUpperCase().replace('_', ' ')}] ${r.title}`,
                detail: r.description || `Reported by field officer on ${r.road || r.nodeId || 'corridor'}.`,
                corridor: r.road,
                severity: r.severity,
              });
              notify && notify(`Hazard Alert: ${r.title}`);
            }
          }
        }
      } catch (_) {}
    };

    const timer = setInterval(checkLiveStream, 15000);
    return () => clearInterval(timer);
  }, [permission, user, notify]);

  return {
    supported,
    permission,
    requestPermission,
    sendTestNotification,
    lastNotification,
  };
}

export default useWebPushNotifications;
