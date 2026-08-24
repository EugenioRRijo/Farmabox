import { describe, it, expect } from 'vitest';
import {
  type AdminHourSync,
  type AdminHourRow,
  rowToAdminHour,
  adminHourToRow,
  mergeAdminHours,
  itemsToPush,
  liveAdminHours,
} from './adminHours';

const base = (over: Partial<AdminHourSync> = {}): AdminHourSync => ({
  id: 'admin-1',
  professorId: 'prof-1',
  role: 'Servicio Comunitario',
  day: 0,
  startHour: 3,
  duration: 2,
  ...over,
});

describe('rowToAdminHour / adminHourToRow', () => {
  it('convierte ida y vuelta sin perder campos (incluye updated_by)', () => {
    const row: AdminHourRow = {
      id: 'admin-x',
      professor_id: 'prof-9',
      role: 'Jefe de Departamento',
      day: 2,
      start_hour: 5,
      duration: 3,
      updated_at: '2026-08-12T10:00:00.000Z',
      deleted_at: null,
      updated_by: 'PC Laboratorio',
    };
    const item = rowToAdminHour(row);
    expect(item).toEqual({
      id: 'admin-x',
      professorId: 'prof-9',
      role: 'Jefe de Departamento',
      day: 2,
      startHour: 5,
      duration: 3,
      updatedAt: '2026-08-12T10:00:00.000Z',
      deletedAt: null,
      updatedBy: 'PC Laboratorio',
    });
    expect(adminHourToRow(item)).toEqual(row);
  });

  it('una fila SIN columna updated_by (base sin migración 2.8) mapea updatedBy null', () => {
    const row: AdminHourRow = {
      id: 'admin-y',
      professor_id: 'prof-1',
      role: 'Servicio Comunitario',
      day: 0,
      start_hour: 3,
      duration: 2,
      updated_at: null,
      deleted_at: null,
      // sin updated_by: la columna no existe en la base vieja
    };
    expect(rowToAdminHour(row).updatedBy).toBeNull();
  });

  it('un item local legado (sin sellos) produce una fila con nulls', () => {
    const row = adminHourToRow(base());
    expect(row.updated_at).toBeNull();
    expect(row.deleted_at).toBeNull();
    expect(row.updated_by).toBeNull();
  });
});

describe('mergeAdminHours (por id, newest-wins)', () => {
  it('une locales y remotos sin duplicar por id', () => {
    const local = [base({ id: 'a' }), base({ id: 'b' })];
    const remote = [base({ id: 'b' }), base({ id: 'c' })];
    const out = mergeAdminHours(local, remote);
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('gana el sello más nuevo (remoto más nuevo pisa al local)', () => {
    const local = [base({ role: 'Vieja', updatedAt: '2026-08-01T00:00:00Z' })];
    const remote = [base({ role: 'Nueva', updatedAt: '2026-08-10T00:00:00Z' })];
    expect(mergeAdminHours(local, remote)[0].role).toBe('Nueva');
  });

  it('gana el sello más nuevo (local más nuevo sobrevive al remoto)', () => {
    const local = [base({ role: 'Local', updatedAt: '2026-08-10T00:00:00Z' })];
    const remote = [base({ role: 'Remota', updatedAt: '2026-08-01T00:00:00Z' })];
    expect(mergeAdminHours(local, remote)[0].role).toBe('Local');
  });

  it('un local legado SIN updatedAt pierde contra el remoto sellado', () => {
    const local = [base({ role: 'Legado' })];
    const remote = [base({ role: 'Sellada', updatedAt: '2026-08-01T00:00:00Z' })];
    expect(mergeAdminHours(local, remote)[0].role).toBe('Sellada');
  });

  it('un tombstone más nuevo borra al vivo más viejo (y no resucita)', () => {
    const local = [base({ updatedAt: '2026-08-01T00:00:00Z' })];
    const remote = [
      base({ updatedAt: '2026-08-10T00:00:00Z', deletedAt: '2026-08-10T00:00:00Z' }),
    ];
    const out = mergeAdminHours(local, remote);
    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBeTruthy();
  });

  it('empate de sellos: gana el tombstone (no resucitar)', () => {
    const t = '2026-08-10T00:00:00Z';
    const local = [base({ updatedAt: t })];
    const remote = [base({ updatedAt: t, deletedAt: t })];
    expect(mergeAdminHours(local, remote)[0].deletedAt).toBeTruthy();
  });
});

describe('itemsToPush (qué subir a la nube tras un merge)', () => {
  it('sube lo local que la nube no tiene, sellando lo legado con nowIso', () => {
    const now = '2026-08-12T12:00:00.000Z';
    const local = [base({ id: 'solo-local' })];
    const out = itemsToPush(local, [], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('solo-local');
    expect(out[0].updatedAt).toBe(now);
  });

  it('sube lo local con sello más nuevo que el remoto', () => {
    const local = [base({ updatedAt: '2026-08-10T00:00:00Z' })];
    const remote = [base({ updatedAt: '2026-08-01T00:00:00Z' })];
    expect(itemsToPush(local, remote, '2026-08-12T00:00:00Z')).toHaveLength(1);
  });

  it('NO sube lo que la nube ya tiene igual o más nuevo (ni lo legado ya remoto)', () => {
    const local = [
      base({ id: 'a', updatedAt: '2026-08-01T00:00:00Z' }),
      base({ id: 'b' }), // legado sin sello, pero ya existe remoto
    ];
    const remote = [
      base({ id: 'a', updatedAt: '2026-08-10T00:00:00Z' }),
      base({ id: 'b', updatedAt: '2026-08-05T00:00:00Z' }),
    ];
    expect(itemsToPush(local, remote, '2026-08-12T00:00:00Z')).toHaveLength(0);
  });

  it('sube tombstones locales nuevos (borrados offline)', () => {
    const local = [
      base({ updatedAt: '2026-08-11T00:00:00Z', deletedAt: '2026-08-11T00:00:00Z' }),
    ];
    const remote = [base({ updatedAt: '2026-08-01T00:00:00Z' })];
    const out = itemsToPush(local, remote, '2026-08-12T00:00:00Z');
    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBeTruthy();
  });
});

describe('liveAdminHours', () => {
  it('filtra tombstones', () => {
    const list = [base({ id: 'vivo' }), base({ id: 'muerto', deletedAt: '2026-08-10T00:00:00Z' })];
    expect(liveAdminHours(list).map((x) => x.id)).toEqual(['vivo']);
  });
});
