import { describe, it, expect } from 'vitest';
import { debeCerrarSinVentanas } from './arranque';

describe('debeCerrarSinVentanas — por qué la app se cerraba sola al abrir', () => {
  it('NO cierra si todavía está arrancando (la ventana de update no cuenta)', () => {
    // El bug de la v2.3.23/2.3.24: la ventana de actualización era la ÚNICA
    // ventana. Al destruirla, 'window-all-closed' disparaba app.quit() y la app
    // se cerraba ANTES de llegar a createWindow(). Desde afuera se veía como
    // "se actualiza y se cierra".
    expect(debeCerrarSinVentanas({ arrancando: true, plataforma: 'win32' })).toBe(false);
  });

  it('cierra normalmente cuando el usuario cierra la ventana principal', () => {
    expect(debeCerrarSinVentanas({ arrancando: false, plataforma: 'win32' })).toBe(true);
  });

  it('en macOS nunca cierra al quedarse sin ventanas', () => {
    expect(debeCerrarSinVentanas({ arrancando: false, plataforma: 'darwin' })).toBe(false);
    expect(debeCerrarSinVentanas({ arrancando: true, plataforma: 'darwin' })).toBe(false);
  });

  it('en Linux se comporta como en Windows', () => {
    expect(debeCerrarSinVentanas({ arrancando: false, plataforma: 'linux' })).toBe(true);
    expect(debeCerrarSinVentanas({ arrancando: true, plataforma: 'linux' })).toBe(false);
  });
});
