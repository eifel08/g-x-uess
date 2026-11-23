import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../settings';

/** Panel / keypad / selection state shared by the 2D and 3D workspaces. */
export function useWorkspaceChrome(settings: Settings, updateSettings: (patch: Partial<Settings>) => void) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const keypadOpen = settings.keypadOpen && panelOpen;

  const toggleKeypad = useCallback(() => {
    const open = !keypadOpen;
    updateSettings({ keypadOpen: open });
    if (open) setPanelOpen(true);
  }, [keypadOpen, updateSettings]);

  // Alt+K toggles the keypad from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyK') {
        e.preventDefault();
        toggleKeypad();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleKeypad]);

  return { panelOpen, setPanelOpen, selectedId, setSelectedId, keypadOpen, toggleKeypad };
}

export type WorkspaceChrome = ReturnType<typeof useWorkspaceChrome>;
