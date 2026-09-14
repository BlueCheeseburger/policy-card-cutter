import { useState } from 'react';
import CardCutter from './components/CardCutter';
import SettingsPanel from './components/Settings';
import Logo from './components/Logo';
import { aiConfigured } from './platform/settings';

function App() {
  const [showSettings, setShowSettings] = useState(() => !aiConfigured());

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-main)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={20} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: 0 }}>Policy Card Cutter</h1>
        </div>
        <button
          style={{ background: 'none', border: 'none', fontSize: 16, color: 'var(--ink-muted)', cursor: 'pointer', padding: 4 }}
          onClick={() => setShowSettings(true)}
          title="AI provider & API key"
        >
          ⚙
        </button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }} className="scroll-thin">
        {showSettings ? <SettingsPanel onClose={() => setShowSettings(false)} /> : <CardCutter />}
      </main>
    </div>
  );
}

export default App;
