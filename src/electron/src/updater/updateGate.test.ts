import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { esperarActualizacion } from './updateGate';

/** Updater falso con la misma superficie que usa el gate. */
function fakeUpdater(check: () => Promise<unknown> = async () => undefined) {
  const em = new EventEmitter();
  return Object.assign(em, { checkForUpdates: vi.fn(check) });
}

const gate = (u: ReturnType<typeof fakeUpdater>, timeoutMs = 200) =>
  esperarActualizacion(u as never, { timeoutMs });

describe('esperarActualizacion — el portón de actualización obligatoria', () => {
  it('sin actualización disponible deja pasar', async () => {
    const u = fakeUpdater();
    const p = gate(u);
    u.emit('update-not-available');
    expect(await p).toBe('sin-actualizacion');
  });

  it('con actualización descargada pide instalar', async () => {
    const u = fakeUpdater();
    const p = gate(u);
    u.emit('update-downloaded', { version: '2.3.23' });
    expect(await p).toBe('descargada');
  });

  it('un error del updater deja pasar (nunca dejar a nadie afuera)', async () => {
    const u = fakeUpdater();
    const p = gate(u);
    u.emit('error', new Error('sin red'));
    expect(await p).toBe('error');
  });

  it('si checkForUpdates falla (PC sin internet) deja pasar', async () => {
    const u = fakeUpdater(async () => {
      throw new Error('ENOTFOUND');
    });
    expect(await gate(u)).toBe('error');
  });

  it('si no pasa nada, el timeout deja pasar', async () => {
    const u = fakeUpdater();
    expect(await gate(u, 30)).toBe('timeout');
  });

  it('informa el progreso de la descarga', async () => {
    const u = fakeUpdater();
    const pasos: number[] = [];
    const p = esperarActualizacion(u as never, {
      timeoutMs: 200,
      onProgreso: (pct) => pasos.push(pct),
    });
    u.emit('download-progress', { percent: 12.4 });
    u.emit('download-progress', { percent: 87.9 });
    u.emit('update-downloaded', { version: '2.3.23' });
    await p;
    expect(pasos).toEqual([12, 88]);
  });

  it('informa la version encontrada', async () => {
    const u = fakeUpdater();
    let visto = '';
    const p = esperarActualizacion(u as never, {
      timeoutMs: 200,
      onVersion: (v) => {
        visto = v;
      },
    });
    u.emit('update-available', { version: '2.3.23' });
    u.emit('update-downloaded', { version: '2.3.23' });
    await p;
    expect(visto).toBe('2.3.23');
  });

  it('resuelve UNA sola vez: un error posterior no cambia el resultado', async () => {
    const u = fakeUpdater();
    const p = gate(u);
    u.emit('update-downloaded', { version: '2.3.23' });
    u.emit('error', new Error('tarde'));
    expect(await p).toBe('descargada');
  });

  it('el timeout no pisa un resultado que ya llego', async () => {
    const u = fakeUpdater();
    const p = gate(u, 30);
    u.emit('update-not-available');
    const r = await p;
    await new Promise((res) => setTimeout(res, 60)); // dejar vencer el timeout
    expect(r).toBe('sin-actualizacion');
  });

  it('mientras baja, el timeout se posterga (una descarga larga no lo cancela)', async () => {
    const u = fakeUpdater();
    const p = gate(u, 60);
    // progreso cada 30 ms: sin renovacion, el timeout de 60 ms cortaria
    for (let i = 1; i <= 4; i++) {
      await new Promise((res) => setTimeout(res, 30));
      u.emit('download-progress', { percent: i * 20 });
    }
    u.emit('update-downloaded', { version: '2.3.23' });
    expect(await p).toBe('descargada');
  });
});
