'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker so the app installs as a PWA.
 * The worker caches static assets only — never data (see public/sw.js).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration must never break the app.
      });
    };
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
