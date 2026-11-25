/**
 * Registers the offline service worker (public build only).
 *
 * Skipped in dev, in the single-file build (it can run from file://, where
 * service workers aren't allowed) and inside the Android app, which already
 * serves every file from the APK.
 */
export const ANDROID_HOST = 'appassets.androidplatform.net';

export function shouldRegisterServiceWorker(loc: Pick<Location, 'protocol' | 'hostname'>, mode: string): boolean {
  if (mode !== 'production') return false;
  if (loc.hostname === ANDROID_HOST) return false;
  return loc.protocol === 'https:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !shouldRegisterServiceWorker(location, import.meta.env.MODE)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is best-effort; the app works without it.
    });
  });
}
