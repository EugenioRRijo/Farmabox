import { describe, it, expect } from 'vitest';
import {
  rowToNotification,
  notificationToRow,
  isVisible,
  shouldPop,
  pendingPops,
  markSeen,
  type AppNotification,
} from './notifications';

const base: AppNotification = {
  id: 'notif-1',
  title: 'Aviso',
  body: 'Reunión mañana',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
};
const NOW = '2026-08-04T12:00:00.000Z';

describe('notifications logic', () => {
  it('mapea fila↔objeto en ambos sentidos', () => {
    const row = notificationToRow(base);
    expect(row.created_at).toBe(base.createdAt);
    expect(rowToNotification(row)).toEqual(base);
  });

  it('isVisible: oculta borradas y vencidas', () => {
    expect(isVisible(base, NOW)).toBe(true);
    expect(isVisible({ ...base, deletedAt: NOW }, NOW)).toBe(false);
    expect(isVisible({ ...base, expiresAt: '2026-08-04T11:00:00.000Z' }, NOW)).toBe(false);
    expect(isVisible({ ...base, expiresAt: '2026-08-04T13:00:00.000Z' }, NOW)).toBe(true);
  });

  it('shouldPop: salta si es visible y no vista; no salta si el updatedAt coincide', () => {
    expect(shouldPop(base, {}, NOW)).toBe(true);
    expect(shouldPop(base, { 'notif-1': base.updatedAt }, NOW)).toBe(false);
    // editada (updatedAt cambió) → vuelve a saltar
    const edited = { ...base, updatedAt: '2026-08-04T11:30:00.000Z' };
    expect(shouldPop(edited, { 'notif-1': base.updatedAt }, NOW)).toBe(true);
  });

  it('pendingPops: solo visibles no vistas, más nuevas primero', () => {
    const a = { ...base, id: 'notif-a', createdAt: '2026-08-04T09:00:00.000Z', updatedAt: '2026-08-04T09:00:00.000Z' };
    const b = { ...base, id: 'notif-b', createdAt: '2026-08-04T11:00:00.000Z', updatedAt: '2026-08-04T11:00:00.000Z' };
    const deleted = { ...base, id: 'notif-c', deletedAt: NOW };
    const out = pendingPops([a, b, deleted], {}, NOW);
    expect(out.map((n) => n.id)).toEqual(['notif-b', 'notif-a']);
  });

  it('markSeen: registra el updatedAt visto', () => {
    const seen = markSeen({}, base);
    expect(seen['notif-1']).toBe(base.updatedAt);
  });
});
