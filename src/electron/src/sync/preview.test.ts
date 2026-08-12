import { describe, it, expect } from 'vitest';
import { buildSyncPreview } from './preview';
import type { RawDatasets, SProfessor, SBlock, SSemester } from '../services/SyncStorageBase';

// Sellos de tiempo: T1 < T2 < T3.
const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-01T00:00:00.000Z';
const T3 = '2026-03-01T00:00:00.000Z';
const NOW = '2026-08-12T12:00:00.000Z';

function datasets(partial: Partial<RawDatasets> = {}): RawDatasets {
  return { professors: [], pensum: [], scheduleBlocks: [], academicLoad: {}, logs: [], ...partial };
}

function prof(over: Partial<SProfessor> = {}): SProfessor {
  return {
    id: 'p1',
    fullName: 'Ana Pérez',
    title: 'Dra.',
    subjects: [],
    type: 'theory',
    updatedAt: T1,
    ...over,
  };
}

function bloque(over: Partial<SBlock> = {}): SBlock {
  return {
    id: 'b1',
    subjectCode: 'FAR1',
    semester: 3,
    day: 1, // Martes
    startHour: 2, // slot 2 → 8:30-9:15
    duration: 1,
    color: '#ABC',
    type: 'THEORY',
    section: 'A',
    updatedAt: T1,
    ...over,
  };
}

function pensum(nombre = 'Farmacología I', sem = 3, code = 'FAR1'): SSemester[] {
  return [
    {
      number: sem,
      subjects: [
        {
          code,
          name: nombre,
          credits: 4,
          hasLab: false,
          hoursTheory: 3,
          hoursLab: 0,
          prerequisites: [],
          updatedAt: T1,
        },
      ],
    },
  ];
}

/** Todos los items de todas las secciones, aplanados (para asserts simples). */
function items(preview: ReturnType<typeof buildSyncPreview>) {
  return preview.sections.flatMap((s) => s.items);
}

/** Items de la sección de bloques de horario (el pensum genera items propios). */
function itemsBloques(preview: ReturnType<typeof buildSyncPreview>) {
  return preview.sections.find((s) => s.dataset === 'scheduleBlocks')?.items ?? [];
}

describe('buildSyncPreview — clasificador (8 casos de la tabla)', () => {
  it('1. solo remoto, vivo → nuevo', () => {
    const p = buildSyncPreview(datasets(), datasets({ professors: [prof()] }), NOW);
    expect(items(p)).toEqual([{ kind: 'nuevo', label: 'Dra. Ana Pérez' }]);
    expect(p.totals).toEqual({ nuevos: 1, actualizados: 0, eliminados: 0, subes: 0 });
  });

  it('2. solo remoto, tombstone → nada', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({ professors: [prof({ deletedAt: T2 })] }),
      NOW,
    );
    expect(p.sections).toEqual([]);
    expect(p.totals).toEqual({ nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 });
  });

  it('3. solo local, vivo → subes', () => {
    const p = buildSyncPreview(datasets({ professors: [prof()] }), datasets(), NOW);
    expect(items(p)).toEqual([{ kind: 'subes', label: 'Dra. Ana Pérez' }]);
    expect(p.totals.subes).toBe(1);
  });

  it('4. ambos, remoto más nuevo y tombstone, local vivo → eliminado', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ updatedAt: T1 })] }),
      datasets({ professors: [prof({ updatedAt: T1, deletedAt: T2 })] }),
      NOW,
    );
    expect(items(p)).toEqual([{ kind: 'eliminado', label: 'Dra. Ana Pérez' }]);
    expect(p.totals.eliminados).toBe(1);
  });

  it('5. ambos vivos, remoto más nuevo, contenido difiere → actualizado con detail', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Pérez', updatedAt: T1 })] }),
      datasets({ professors: [prof({ fullName: 'Ana P. de Gómez', updatedAt: T2 })] }),
      NOW,
    );
    expect(items(p)).toEqual([
      {
        kind: 'actualizado',
        label: 'Dra. Ana P. de Gómez',
        detail: 'tu versión se reemplaza por una más reciente de otra PC',
      },
    ]);
    expect(p.totals.actualizados).toBe(1);
  });

  it('6. local tombstone, remoto vivo más nuevo → nuevo (reaparece)', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ updatedAt: T1, deletedAt: T2 })] }),
      datasets({ professors: [prof({ updatedAt: T3 })] }),
      NOW,
    );
    expect(items(p)).toEqual([{ kind: 'nuevo', label: 'Dra. Ana Pérez' }]);
  });

  it('7. ambos, contenido igual (solo cambian sellos) → nada', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ updatedAt: T1 })] }),
      datasets({ professors: [prof({ updatedAt: T2 })] }),
      NOW,
    );
    expect(p.sections).toEqual([]);
  });

  it('8. ambos, local más nuevo (o empate) y contenido difiere → subes', () => {
    // Local más nuevo.
    const p1 = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Local', updatedAt: T2 })] }),
      datasets({ professors: [prof({ fullName: 'Ana Remota', updatedAt: T1 })] }),
      NOW,
    );
    expect(items(p1)).toEqual([{ kind: 'subes', label: 'Dra. Ana Local' }]);
    // Empate exacto → también gana local (mismo criterio que mergeRaw).
    const p2 = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Local', updatedAt: T1 })] }),
      datasets({ professors: [prof({ fullName: 'Ana Remota', updatedAt: T1 })] }),
      NOW,
    );
    expect(items(p2)).toEqual([{ kind: 'subes', label: 'Dra. Ana Local' }]);
  });
});

describe('buildSyncPreview — labels legibles', () => {
  it('bloque: día/hora por fórmula de slots (slot 2 martes → "Martes 8:30-9:15")', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({ pensum: pensum(), scheduleBlocks: [bloque()] }),
      NOW,
    );
    expect(itemsBloques(p)[0].label).toBe('Farmacología I — Martes 8:30-9:15 (Sem 3 A)');
  });

  it('bloque LAB agrega " · Lab" y resuelve la materia por code (remoto y si no, local)', () => {
    const p = buildSyncPreview(
      datasets({ pensum: pensum('Química Analítica', 2, 'QUI2') }),
      datasets({ scheduleBlocks: [bloque({ subjectCode: 'QUI2', semester: 2, type: 'LAB' })] }),
      NOW,
    );
    // La materia no está en el pensum remoto pero sí en el local.
    expect(itemsBloques(p)[0].label).toBe('Química Analítica — Martes 8:30-9:15 (Sem 2 A) · Lab');
  });

  it('bloque con code desconocido usa el código crudo', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({ scheduleBlocks: [bloque({ subjectCode: 'ZZZ9' })] }),
      NOW,
    );
    expect(items(p)[0].label).toContain('ZZZ9 —');
  });

  it('bloque actualizado que cambió de día/hora muestra "antes → ahora"', () => {
    const p = buildSyncPreview(
      datasets({ scheduleBlocks: [bloque({ day: 1, startHour: 2, updatedAt: T1 })] }),
      datasets({ scheduleBlocks: [bloque({ day: 2, startHour: 3, updatedAt: T2 })] }),
      NOW,
    );
    expect(items(p)[0]).toMatchObject({
      kind: 'actualizado',
      detail: 'antes: Martes 8:30-9:15 → ahora: Miércoles 9:15-10:00',
    });
  });

  it('materia: "{name} (Sem {n})" con el semestre del pensum aplanado', () => {
    const p = buildSyncPreview(datasets({ pensum: pensum('Botánica', 1, 'BOT1') }), datasets(), NOW);
    expect(items(p)).toEqual([{ kind: 'subes', label: 'Botánica (Sem 1)' }]);
  });

  it('carga académica: label "Carga de {materia}" y detail con entra/sale legible', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({
        pensum: pensum(),
        professors: [prof()],
        academicLoad: { FAR1: { theory: ['p1'], updatedAt: T2 } },
      }),
      NOW,
    );
    const carga = p.sections.find((s) => s.dataset === 'academicLoad');
    expect(carga?.items).toEqual([
      { kind: 'nuevo', label: 'Carga de Farmacología I', detail: 'entra Dra. Ana Pérez (teoría)' },
    ]);
  });

  it('carga académica: id sin resolver se muestra crudo', () => {
    const p = buildSyncPreview(
      datasets({ academicLoad: { FAR1: { lab: ['px'], updatedAt: T2 } } }),
      datasets({ academicLoad: { FAR1: { lab: [], updatedAt: T1 } } }),
      NOW,
    );
    expect(items(p)[0]).toMatchObject({ kind: 'subes', detail: 'entra px (lab)' });
  });
});

describe('buildSyncPreview — totals y secciones', () => {
  it('cuenta totals por kind y ordena secciones (professors, subjects, academicLoad, scheduleBlocks)', () => {
    const p = buildSyncPreview(
      datasets({
        pensum: pensum('Botánica', 1, 'BOT1'), // solo local → subes
        scheduleBlocks: [bloque({ updatedAt: T1, aula: '101' })],
      }),
      datasets({
        professors: [prof()], // solo remoto → nuevo
        scheduleBlocks: [bloque({ updatedAt: T2, aula: '209' })], // remoto más nuevo → actualizado
      }),
      NOW,
    );
    expect(p.totals).toEqual({ nuevos: 1, actualizados: 1, eliminados: 0, subes: 1 });
    expect(p.sections.map((s) => s.dataset)).toEqual(['professors', 'subjects', 'scheduleBlocks']);
    expect(p.sections.map((s) => s.title)).toEqual(['Profesores', 'Materias', 'Bloques de horario']);
  });

  it('sin cambios → sections vacías, totals en 0 y metadatos ok/online/at', () => {
    const iguales = () =>
      datasets({
        professors: [prof()],
        pensum: pensum(),
        scheduleBlocks: [bloque()],
        academicLoad: { FAR1: { theory: ['p1'], updatedAt: T1 } },
      });
    const p = buildSyncPreview(iguales(), iguales(), NOW);
    expect(p.sections).toEqual([]);
    expect(p.totals).toEqual({ nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 });
    expect(p).toMatchObject({ ok: true, online: true, at: NOW });
  });

  it('los logs no participan del preview', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({ logs: [{ id: 'l1', action: 'x', details: 'y', timestamp: T1, updatedAt: T1 }] }),
      NOW,
    );
    expect(p.sections).toEqual([]);
    expect(p.totals).toEqual({ nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 });
  });
});
