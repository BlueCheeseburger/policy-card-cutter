import { useState } from 'react';
import CardCutter from './components/CardCutter';
import SettingsPanel from './components/Settings';
import { aiConfigured } from './platform/settings';

function App() {
  const [showSettings, setShowSettings] = useState(() => !aiConfigured());

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
        <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Policy Card Cutter</h1>
        <button className="btn" onClick={() => setShowSettings(true)} title="AI provider & API key">⚙ Settings</button>
      </header>

      <main style={{ flex: 1 }}>
        <CardCutter />
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
