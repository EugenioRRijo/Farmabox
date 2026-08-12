/**
 * NotificationsPanel — panel para redactar y administrar las notificaciones que ven todas las PCs.
 * Redactar (título + cuerpo + vencimiento opcional) y un historial con editar/eliminar.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  newNotification,
  listNotifications,
  saveNotification,
  deleteNotification,
} from './maestroClient';
import type { AppNotification } from '../../shared/src/logic/notifications';

export function NotificationsPanel() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [expires, setExpires] = useState(''); // yyyy-mm-ddThh:mm o ''
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    try {
      setItems(await listNotifications());
    } catch (e) {
      setStatus('Error al cargar: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setExpires('');
    setEditingId(null);
  };

  const submit = async () => {
    if (!title.trim() && !body.trim()) return;
    const nowIso = new Date().toISOString();
    const expiresAt = expires ? new Date(expires).toISOString() : null;
    try {
      if (editingId) {
        const existing = items.find((i) => i.id === editingId);
        if (existing) {
          await saveNotification({ ...existing, title: title.trim(), body: body.trim(), expiresAt, updatedAt: nowIso });
        }
      } else {
        await saveNotification(newNotification(title, body, expiresAt, nowIso));
      }
      setStatus(editingId ? 'Mensaje actualizado.' : 'Mensaje enviado.');
      resetForm();
      await refresh();
    } catch (e) {
      setStatus('Error al guardar: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const startEdit = (n: AppNotification) => {
    setEditingId(n.id);
    setTitle(n.title);
    setBody(n.body);
    setExpires(n.expiresAt ? n.expiresAt.slice(0, 16) : '');
  };

  const remove = async (id: string) => {
    try {
      await deleteNotification(id, new Date().toISOString());
      setStatus('Mensaje eliminado.');
      if (editingId === id) resetForm();
      await refresh();
    } catch (e) {
      setStatus('Error al eliminar: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div>
      <p style={{ color: '#6b7280', marginTop: 0 }}>Envía avisos a todas las PCs con Farmabox.</p>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>Título</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="Ej. Reunión de coordinación" />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Mensaje</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} placeholder="Escribe el aviso…" />
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginTop: 10 }}>Vence (opcional)</label>
        <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} style={inp} />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={submit} style={btnPrimary}>{editingId ? 'Guardar cambios' : 'Enviar'}</button>
          {editingId && <button onClick={resetForm} style={btnGhost}>Cancelar</button>}
        </div>
        {status && <p style={{ fontSize: 12, color: '#2563eb', marginBottom: 0 }}>{status}</p>}
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 24 }}>Enviados</h2>
      {items.length === 0 && <p style={{ color: '#9ca3af' }}>Aún no hay mensajes.</p>}
      {items.map((n) => (
        <div key={n.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>{n.title || '(sin título)'}</div>
          <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap' }}>{n.body}</div>
          {n.expiresAt && <div style={{ fontSize: 11, color: '#9ca3af' }}>Vence: {new Date(n.expiresAt).toLocaleString()}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => startEdit(n)} style={btnGhost}>Editar</button>
            <button onClick={() => remove(n.id)} style={btnDanger}>Eliminar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, marginTop: 4 };
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: '#f3f4f6', color: '#374151', border: 0, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: '#fee2e2', color: '#b91c1c', border: 0, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' };
