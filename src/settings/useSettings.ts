import { useCallback, useEffect, useState } from 'react';
import type { AngleMode } from '../math';

export interface Settings {
  angleMode: AngleMode;
  /** Show intercepts and intersections on the graph. */
  showPointsOfInterest: boolean;
  keypadOpen: boolean;
  /** Phones: the expression list takes most of the screen. */
  panelExpanded: boolean;
  /** 2D calculator/game or 3D surfaces/game. */
  mode: '2d' | '3d';
}

const DEFAULTS: Settings = { angleMode: 'rad', showPointsOfInterest: true, keypadOpen: false, panelExpanded: false, mode: '2d' };
const STORAGE_KEY = 'gxuess.settings.v1';

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
    return {
      angleMode: raw.angleMode === 'deg' ? 'deg' : 'rad',
      showPointsOfInterest: typeof raw.showPointsOfInterest === 'boolean' ? raw.showPointsOfInterest : DEFAULTS.showPointsOfInterest,
      keypadOpen: typeof raw.keypadOpen === 'boolean' ? raw.keypadOpen : DEFAULTS.keypadOpen,
      panelExpanded: raw.panelExpanded === true,
      mode: raw.mode === '3d' ? '3d' : '2d',
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
