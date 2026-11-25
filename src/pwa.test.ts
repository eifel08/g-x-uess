import { describe, expect, it } from 'vitest';
import { ANDROID_HOST, shouldRegisterServiceWorker } from './pwa';

describe('shouldRegisterServiceWorker', () => {
  const at = (protocol: string, hostname: string) => ({ protocol, hostname });

  it('registers on https and local previews of the production build', () => {
    expect(shouldRegisterServiceWorker(at('https:', 'eifel08.github.io'), 'production')).toBe(true);
    expect(shouldRegisterServiceWorker(at('http:', 'localhost'), 'production')).toBe(true);
  });

  it('skips dev, the single-file build, plain http, file:// and the Android app', () => {
    expect(shouldRegisterServiceWorker(at('https:', 'example.com'), 'development')).toBe(false);
    expect(shouldRegisterServiceWorker(at('https:', 'example.com'), 'single')).toBe(false);
    expect(shouldRegisterServiceWorker(at('http:', 'example.com'), 'production')).toBe(false);
    expect(shouldRegisterServiceWorker(at('file:', ''), 'production')).toBe(false);
    expect(shouldRegisterServiceWorker(at('https:', ANDROID_HOST), 'production')).toBe(false);
  });
});
