/** MaestroApp — dos pestañas: enviar Notificaciones y leer Sugerencias recibidas. */
import { useState } from 'react';
import { NotificationsPanel } from './NotificationsPanel';
import { SuggestionsPanel } from './SuggestionsPanel';

export function MaestroApp() {
  const [tab, setTab] = useState<'notif' | 'sug'>('notif');
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Farmabox Maestro</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0 16px' }}>
        <button onClick={() => setTab('notif')} style={tabBtn(tab === 'notif')}>Notificaciones</button>
        <button onClick={() => setTab('sug')} style={tabBtn(tab === 'sug')}>Sugerencias recibidas</button>
      </div>
      {tab === 'notif' ? <NotificationsPanel /> : <SuggestionsPanel />}
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    border: 0,
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? '#2563eb' : '#e5e7eb',
    color: active ? '#fff' : '#374151',
  };
}
