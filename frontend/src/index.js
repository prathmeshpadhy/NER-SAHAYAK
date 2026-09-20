import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Filter out benign development runtime errors (such as ResizeObserver loop limits or cross-origin script errors)
// from crashing the Create React App developer error overlay
if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (event) => {
      const msg = event?.message || '';
      if (
        msg === 'Script error.' ||
        msg.includes('ResizeObserver') ||
        msg.includes('ResizeObserver loop')
      ) {
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reasonMsg = event?.reason?.message || '';
      if (
        reasonMsg === 'Script error.' ||
        reasonMsg.includes('ResizeObserver')
      ) {
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
