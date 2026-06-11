import { describe, it, expect } from 'vitest';
import { deriveSyncStatus } from './saveState';

describe('deriveSyncStatus', () => {
  it('offline tiene prioridad sobre todo', () => {
    expect(deriveSyncStatus({ online: false, isSaving: true, saveError: 'x' }).kind).toBe('offline');
  });
  it('guardando cuando isSaving y online', () => {
    expect(deriveSyncStatus({ online: true, isSaving: true, saveError: null }).kind).toBe('saving');
  });
  it('error cuando hay saveError, online y no guardando', () => {
    expect(deriveSyncStatus({ online: true, isSaving: false, saveError: 'boom' }).kind).toBe('error');
  });
  it('guardado en estado normal', () => {
    expect(deriveSyncStatus({ online: true, isSaving: false, saveError: null }).kind).toBe('saved');
  });
});
