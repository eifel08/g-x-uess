import { useCallback, useEffect, useState } from 'react';
import type { AngleMode } from '../math';

export interface Settings {
  angleMode: AngleMode;
  /** Show intercepts and intersections on the graph. */
  showPointsOfInterest: boolean;
  keypadOpen: boolean;
}

const DEFAULTS: Settings = { angleMode: 'rad', showPointsOfInterest: true, keypadOpen: false };
const STORAGE_KEY = 'gxuess.settings.v1';

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      angleMode: raw.angleMode === 'deg' ? 'deg' : 'rad',
      showPointsOfInterest: typeof raw.showPointsOfInterest === 'boolean' ? raw.showPointsOfInterest : DEFAULTS.showPointsOfInterest,
      keypadOpen: typeof raw.keypadOpen === 'boolean' ? raw.keypadOpen : DEFAULTS.keypadOpen,
    };
  } catch {
    return DEFAULTS;
  }
}

/** Calculator settings, persisted per browser. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // best-effort persistence
    }
  }, [settings]);
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update] as const;
}
