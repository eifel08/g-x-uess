import { useSettings } from '../settings';
import { ModeSwitch } from './ModeSwitch';
import { Workspace2D } from './Workspace2D';
import { Workspace3D } from './Workspace3D';
import './App.css';

/** Chooses the 2D or 3D workspace; each keeps its own expressions and game round. */
export function App() {
  const [settings, updateSettings] = useSettings();
  const modeSwitch = <ModeSwitch mode={settings.mode} onChange={(mode) => updateSettings({ mode })} />;
  return settings.mode === '3d' ? (
    <Workspace3D key="3d" settings={settings} updateSettings={updateSettings} modeSwitch={modeSwitch} />
  ) : (
    <Workspace2D key="2d" settings={settings} updateSettings={updateSettings} modeSwitch={modeSwitch} />
  );
}
