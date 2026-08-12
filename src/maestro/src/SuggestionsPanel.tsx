/** Pestaña de sugerencias recibidas: lista error/mejora con marcar-resuelta y eliminar. */
import { useCallback, useEffect, useState } from 'react';
import { listSuggestions, resolveSuggestion, deleteSuggestion } from './maestroClient';
import type { AppSuggestion } from '../../shared/src/logic/suggestions';

export function SuggestionsPanel() {
  const [items, setItems] = useState<AppSuggestion[]>([]);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      setItems(await listSuggestions());
    } catch (e) {
      setStatus('Error al cargar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolve = async (id: string) => {
    try {
      await resolveSuggestion(id, new Date().toISOString());
      await refresh();
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteSuggestion(id, new Date().toISOString());
      await refresh();
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div>
      {status && <p style={{ fontSize: 12, color: '#b91c1c' }}>{status}</p>}
      {items.length === 0 && <p style={{ color: '#9ca3af' }}>No hay sugerencias todavía.</p>}
      {items.map((s) => (
        <div
          key={s.id}
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            opacity: s.resolvedAt ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: s.kind === 'error' ? '#fee2e2' : '#d1fae5',
                color: s.kind === 'error' ? '#b91c1c' : '#047857',
              }}
            >
              {s.kind === 'error' ? 'ERROR' : 'MEJORA'}
            </span>
            {s.author && <span style={{ fontSize: 12, color: '#6b7280' }}>de {s.author}</span>}
            {s.resolvedAt && <span style={{ fontSize: 12, color: '#059669' }}>✓ resuelta</span>}
          </div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', marginTop: 6 }}>{s.body}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{new Date(s.createdAt).toLocaleString()}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {!s.resolvedAt && (
              <button onClick={() => resolve(s.id)} style={{ background: '#d1fae5', color: '#047857', border: 0, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                Marcar resuelta
              </button>
            )}
            <button onClick={() => remove(s.id)} style={{ background: '#fee2e2', color: '#b91c1c', border: 0, borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
              Eliminar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
