/**
 * Web Push Notification Service for NER-Sahayak
 * Manages browser push notification permissions, Service Worker registration,
 * and persona-targeted notification broadcasts.
 */

let swRegistration = null;

export const isPushSupported = () => {
  try {
    return typeof window !== 'undefined' && 'Notification' in window;
  } catch (_) {
    return false;
  }
};

export const getNotificationPermission = () => {
  try {
    if (!isPushSupported()) return 'unsupported';
    return Notification.permission || 'default';
  } catch (_) {
    return 'unsupported';
  }
};

export const registerServiceWorker = async () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    swRegistration = reg;
    return reg;
  } catch (err) {
    console.warn('[WebPush] Service worker registration failed:', err);
    return null;
  }
};

export const requestNotificationPermission = async () => {
  if (!isPushSupported()) {
    return 'unsupported';
  }

  try {
    let permission;
    if (typeof Notification.requestPermission === 'function') {
      try {
        const promiseResult = Notification.requestPermission();
        if (promiseResult && typeof promiseResult.then === 'function') {
          permission = await promiseResult;
        } else {
          permission = await new Promise((resolve) => {
            Notification.requestPermission(resolve);
          });
        }
      } catch (_) {
        permission = await new Promise((resolve) => {
          Notification.requestPermission(resolve);
        });
      }
    } else {
      permission = 'denied';
    }

    if (permission === 'granted') {
      await registerServiceWorker();
    }
    return permission || 'default';
  } catch (err) {
    console.warn('[WebPush] Permission request failed:', err);
    return getNotificationPermission();
  }
};

export const showWebPushNotification = async ({
  title,
  body,
  icon = '/favicon.ico',
  tag = 'ner-alert',
  data = {},
  requireInteraction = false,
}) => {
  if (!isPushSupported()) return false;

  try {
    const currentPerm = getNotificationPermission();
    if (currentPerm !== 'granted') {
      const perm = await requestNotificationPermission();
      if (perm !== 'granted') return false;
    }

    // Attempt using Service Worker showNotification if active
    if (swRegistration && 'showNotification' in swRegistration) {
      try {
        await swRegistration.showNotification(title, {
          body,
          icon,
          badge: icon,
          tag,
          data,
          requireInteraction,
          vibrate: [200, 100, 200],
        });
        return true;
      } catch (_) {
        // Fall through to desktop Notification constructor
      }
    }

    // Fallback: Standard in-browser Notification constructor
    try {
      const notification = new Notification(title, {
        body,
        icon,
        tag,
        data,
      });
      notification.onclick = () => {
        try {
          window.focus();
          notification.close();
        } catch (_) {}
      };
      return true;
    } catch (err) {
      console.warn('[WebPush] Notification display fallback failed:', err);
      return false;
    }
  } catch (err) {
    console.warn('[WebPush] showWebPushNotification failed:', err);
    return false;
  }
};

/**
 * Sends a role-tailored Web Push notification to the current persona
 */
export const sendRoleNotification = async (role, { type, title, detail, corridor, severity }) => {
  const roleHeaders = {
    driver: '🚚 Driver Road Alert',
    field: '📋 Field Unit Update',
    logistics: '📦 Logistics Dispatch Alert',
    official: '🏛️ Regional Intelligence Advisory',
  };

  const formattedTitle = `${roleHeaders[role] || '📢 NER-Sahayak'}: ${title}`;
  const formattedBody = corridor
    ? `${detail} [Corridor: ${corridor}] (Severity: ${severity || 'moderate'})`
    : `${detail} (Severity: ${severity || 'moderate'})`;

  return showWebPushNotification({
    title: formattedTitle,
    body: formattedBody,
    tag: `ner-${role}-${Date.now()}`,
    data: { role, type, timestamp: new Date().toISOString() },
    requireInteraction: severity === 'critical' || severity === 'severe',
  });
};

const webPushService = {
  isPushSupported,
  getNotificationPermission,
  requestNotificationPermission,
  registerServiceWorker,
  showWebPushNotification,
  sendRoleNotification,
};

export default webPushService;
