// GPS Geolocation Utility with Automatic Trial Mock Fallback
// Ensures trial testing and demo environments never fail due to missing hardware GPS permissions or HTTP restrictions.

// Base trial coordinates for North East India (Guwahati NH27 logistics corridor)
const MOCK_BASE = { lat: 26.1445, lng: 91.7362 };
let mockStep = 0;

export function getMockCoordinates() {
  mockStep += 1;
  // Simulate small vehicle motion along the NH27 corridor
  const latOffset = (mockStep * 0.0012) % 0.05;
  const lngOffset = (mockStep * 0.0018) % 0.05;
  return {
    lat: Number((MOCK_BASE.lat + latOffset).toFixed(6)),
    lng: Number((MOCK_BASE.lng + lngOffset).toFixed(6)),
    isMock: true,
    note: 'Trial Mock GPS Fix (Guwahati NH27 Corridor)',
  };
}

export function acquireGpsPosition(onSuccess, onError) {
  if (!navigator.geolocation) {
    const mock = getMockCoordinates();
    onSuccess(mock);
    return;
  }

  let resolved = false;

  const timer = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      const mock = getMockCoordinates();
      onSuccess(mock);
    }
  }, 3000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        onSuccess({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          isMock: false,
        });
      }
    },
    (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        console.warn('Browser GPS unavailable, switching to Trial Mock GPS:', err.message);
        const mock = getMockCoordinates();
        onSuccess(mock);
      }
    },
    { enableHighAccuracy: true, timeout: 3000, maximumAge: 10000 }
  );
}

export function watchGpsPosition(onPosition, onError) {
  if (!navigator.geolocation) {
    const interval = setInterval(() => {
      onPosition(getMockCoordinates());
    }, 4000);
    onPosition(getMockCoordinates());
    return () => clearInterval(interval);
  }

  let realWatchId = null;
  let fallbackInterval = null;

  try {
    realWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        onPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          isMock: false,
        });
      },
      (err) => {
        console.warn('Browser GPS watch failed, falling back to Mock GPS simulation:', err.message);
        if (!fallbackInterval) {
          fallbackInterval = setInterval(() => {
            onPosition(getMockCoordinates());
          }, 4000);
          onPosition(getMockCoordinates());
        }
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  } catch (_) {
    fallbackInterval = setInterval(() => {
      onPosition(getMockCoordinates());
    }, 4000);
    onPosition(getMockCoordinates());
  }

  return () => {
    if (realWatchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(realWatchId);
    }
    if (fallbackInterval) {
      clearInterval(fallbackInterval);
    }
  };
}
