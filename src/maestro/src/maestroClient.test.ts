import { describe, it, expect } from 'vitest';
import { newNotification } from './maestroClient';

describe('newNotification', () => {
  it('genera id notif-*, sella created=updated y respeta expiresAt', () => {
    const n = newNotification('  Hola  ', ' cuerpo ', null, '2026-08-04T12:00:00.000Z');
    expect(n.id).toMatch(/^notif-/);
    expect(n.title).toBe('Hola');
    expect(n.body).toBe('cuerpo');
    expect(n.createdAt).toBe('2026-08-04T12:00:00.000Z');
    expect(n.updatedAt).toBe('2026-08-04T12:00:00.000Z');
    expect(n.expiresAt).toBeNull();
    expect(n.deletedAt).toBeNull();
  });
});
