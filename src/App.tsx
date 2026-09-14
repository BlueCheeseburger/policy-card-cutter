import { useState } from 'react';
import CardCutter from './components/CardCutter';
import SettingsPanel from './components/Settings';
import { aiConfigured } from './platform/settings';

function App() {
  const [showSettings, setShowSettings] = useState(() => !aiConfigured());

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 44, padding: '0 14px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
      }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, margin: 0 }}>Policy Card Cutter</h1>
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
