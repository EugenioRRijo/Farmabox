import { describe, it, expect } from 'vitest';
import { buildSyncPreview, summarizeIncoming } from './preview';
import type { SyncPreview, SyncPreviewSection } from './preview';
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
    expect(items(p)).toEqual([{ kind: 'nuevo', label: 'Dra. Ana Pérez', at: T1 }]);
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
    expect(items(p)).toEqual([{ kind: 'subes', label: 'Dra. Ana Pérez', at: T1 }]);
    expect(p.totals.subes).toBe(1);
  });

  it('4. ambos, remoto más nuevo y tombstone, local vivo → eliminado', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ updatedAt: T1 })] }),
      datasets({ professors: [prof({ updatedAt: T1, deletedAt: T2 })] }),
      NOW,
    );
    expect(items(p)).toEqual([{ kind: 'eliminado', label: 'Dra. Ana Pérez', at: T2 }]);
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
        at: T2,
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
    expect(items(p)).toEqual([{ kind: 'nuevo', label: 'Dra. Ana Pérez', at: T3 }]);
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
    expect(items(p1)).toEqual([{ kind: 'subes', label: 'Dra. Ana Local', at: T2 }]);
    // Empate exacto → también gana local (mismo criterio que mergeRaw).
    const p2 = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Local', updatedAt: T1 })] }),
      datasets({ professors: [prof({ fullName: 'Ana Remota', updatedAt: T1 })] }),
      NOW,
    );
    expect(items(p2)).toEqual([{ kind: 'subes', label: 'Dra. Ana Local', at: T1 }]);
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
    expect(items(p)).toEqual([{ kind: 'subes', label: 'Botánica (Sem 1)', at: T1 }]);
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
      {
        kind: 'nuevo',
        label: 'Carga de Farmacología I',
        detail: 'entra Dra. Ana Pérez (teoría)',
        at: T2,
      },
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

describe('buildSyncPreview — atribución by/at por kind', () => {
  it('nuevo: by/at de la versión REMOTA', () => {
    const p = buildSyncPreview(
      datasets(),
      datasets({ professors: [prof({ updatedAt: T2, updatedBy: 'PC Laboratorio' })] }),
      NOW,
    );
    expect(items(p)).toEqual([
      { kind: 'nuevo', label: 'Dra. Ana Pérez', by: 'PC Laboratorio', at: T2 },
    ]);
  });

  it('actualizado: by/at de la versión REMOTA (no la local)', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Vieja', updatedAt: T1, updatedBy: 'PC-A' })] }),
      datasets({ professors: [prof({ fullName: 'Ana Nueva', updatedAt: T2, updatedBy: 'PC-B' })] }),
      NOW,
    );
    expect(items(p)[0]).toMatchObject({ kind: 'actualizado', by: 'PC-B', at: T2 });
  });

  it('eliminado: by del tombstone remoto y at = deletedAt', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ updatedAt: T1, updatedBy: 'PC-A' })] }),
      datasets({ professors: [prof({ updatedAt: T1, deletedAt: T2, updatedBy: 'PC-B' })] }),
      NOW,
    );
    expect(items(p)[0]).toMatchObject({ kind: 'eliminado', by: 'PC-B', at: T2 });
  });

  it('subes: by/at de la versión LOCAL (aunque el remoto tenga otra firma)', () => {
    const p = buildSyncPreview(
      datasets({ professors: [prof({ fullName: 'Ana Local', updatedAt: T2, updatedBy: 'PC-A' })] }),
      datasets({ professors: [prof({ fullName: 'Ana Remota', updatedAt: T1, updatedBy: 'PC-B' })] }),
      NOW,
    );
    expect(items(p)[0]).toMatchObject({ kind: 'subes', by: 'PC-A', at: T2 });
  });

  it('ítem sin atribución (datos viejos, sin migración 2.8) → sin by, con at', () => {
    const p = buildSyncPreview(datasets(), datasets({ professors: [prof({ updatedAt: T1 })] }), NOW);
    expect(items(p)[0].by).toBeUndefined();
    expect(items(p)[0].at).toBe(T1);
  });
});

describe('summarizeIncoming — resumen de entrantes (aviso en vivo)', () => {
  /** SyncPreview mínimo a partir de secciones ya armadas (totals no se usan). */
  function previewDe(sections: SyncPreviewSection[]): SyncPreview {
    return {
      ok: true,
      online: true,
      at: NOW,
      sections,
      totals: { nuevos: 0, actualizados: 0, eliminados: 0, subes: 0 },
    };
  }

  it('agrupa devices únicos y cuenta por kind; porDataset con títulos humanos', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'professors',
          title: 'Profesores',
          items: [
            { kind: 'nuevo', label: 'a', by: 'PC-B', at: T1 },
            { kind: 'actualizado', label: 'b', by: 'PC-B', at: T2 },
          ],
        },
        {
          dataset: 'scheduleBlocks',
          title: 'Bloques de horario',
          items: [{ kind: 'eliminado', label: 'c', by: 'PC-C', at: T2 }],
        },
      ]),
    );
    expect(s).toEqual({
      at: NOW,
      devices: ['PC-B', 'PC-C'],
      counts: { nuevos: 1, actualizados: 1, eliminados: 1 },
      porDataset: [
        { title: 'Profesores', n: 2 },
        { title: 'Bloques de horario', n: 1 },
      ],
      porEquipo: [
        {
          device: 'PC-B',
          items: [
            { kind: 'actualizado', label: 'b', at: T2 },
            { kind: 'nuevo', label: 'a', at: T1 },
          ],
        },
        { device: 'PC-C', items: [{ kind: 'eliminado', label: 'c', at: T2 }] },
      ],
    });
  });

  it('ítems sin by → "(equipo desconocido)" una sola vez, agrupados en porEquipo', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'professors',
          title: 'Profesores',
          items: [
            { kind: 'nuevo', label: 'a' },
            { kind: 'nuevo', label: 'b' },
            { kind: 'actualizado', label: 'c', by: 'PC-B' },
          ],
        },
      ]),
    );
    expect(s?.devices).toEqual(['(equipo desconocido)', 'PC-B']);
    expect(s?.porEquipo).toEqual([
      {
        device: '(equipo desconocido)',
        items: [
          { kind: 'nuevo', label: 'a' },
          { kind: 'nuevo', label: 'b' },
        ],
      },
      { device: 'PC-B', items: [{ kind: 'actualizado', label: 'c' }] },
    ]);
  });

  it('porEquipo ordena por actividad (más items primero) aunque el equipo aparezca después', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'professors',
          title: 'Profesores',
          items: [
            { kind: 'eliminado', label: 'primero', by: 'PC-C', at: T1 },
            { kind: 'nuevo', label: 'a', by: 'PC-B', at: T1 },
            { kind: 'nuevo', label: 'b', by: 'PC-B', at: T2 },
          ],
        },
      ]),
    );
    expect(s?.devices).toEqual(['PC-C', 'PC-B']); // orden de aparición
    expect(s?.porEquipo.map((e) => e.device)).toEqual(['PC-B', 'PC-C']); // por cantidad desc
  });

  it('dentro de cada equipo los items van por at desc (los sin sello al final) y el detail viaja', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'scheduleBlocks',
          title: 'Bloques de horario',
          items: [
            { kind: 'nuevo', label: 'viejo', by: 'PC-B', at: T1 },
            { kind: 'actualizado', label: 'nuevo', by: 'PC-B', at: T3, detail: 'antes: X → ahora: Y' },
            { kind: 'eliminado', label: 'sin sello', by: 'PC-B' },
            { kind: 'nuevo', label: 'medio', by: 'PC-B', at: T2 },
          ],
        },
      ]),
    );
    expect(s?.porEquipo).toEqual([
      {
        device: 'PC-B',
        items: [
          { kind: 'actualizado', label: 'nuevo', detail: 'antes: X → ahora: Y', at: T3 },
          { kind: 'nuevo', label: 'medio', at: T2 },
          { kind: 'nuevo', label: 'viejo', at: T1 },
          { kind: 'eliminado', label: 'sin sello' },
        ],
      },
    ]);
  });

  it('cap defensivo: más de 30 items por equipo → 30 más nuevos + truncados con el resto', () => {
    // 33 items del mismo equipo con sellos crecientes (i=32 es el más nuevo).
    const muchos = Array.from({ length: 33 }, (_, i) => ({
      kind: 'nuevo' as const,
      label: `item ${i}`,
      by: 'PC-B',
      at: `2026-05-01T00:00:${String(i).padStart(2, '0')}.000Z`,
    }));
    const s = summarizeIncoming(
      previewDe([{ dataset: 'professors', title: 'Profesores', items: muchos }]),
    );
    const equipo = s?.porEquipo[0];
    expect(equipo?.items).toHaveLength(30);
    expect(equipo?.truncados).toBe(3);
    expect(equipo?.items[0].label).toBe('item 32'); // el más nuevo primero
    expect(equipo?.items[29].label).toBe('item 3'); // se recortaron los 3 más viejos
    expect(s?.counts.nuevos).toBe(33); // counts NO se recortan, solo el detalle
  });

  it('sin cap no hay campo truncados', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'professors',
          title: 'Profesores',
          items: [{ kind: 'nuevo', label: 'a', by: 'PC-B', at: T1 }],
        },
      ]),
    );
    expect(s?.porEquipo[0].truncados).toBeUndefined();
  });

  it('los subes quedan fuera: no cuentan en counts ni en porDataset', () => {
    const s = summarizeIncoming(
      previewDe([
        {
          dataset: 'professors',
          title: 'Profesores',
          items: [
            { kind: 'subes', label: 'mío', by: 'PC-A' },
            { kind: 'nuevo', label: 'ajeno', by: 'PC-B' },
          ],
        },
        {
          dataset: 'subjects',
          title: 'Materias',
          items: [{ kind: 'subes', label: 'solo mío' }],
        },
      ]),
    );
    expect(s).toEqual({
      at: NOW,
      devices: ['PC-B'],
      counts: { nuevos: 1, actualizados: 0, eliminados: 0 },
      porDataset: [{ title: 'Profesores', n: 1 }],
      porEquipo: [{ device: 'PC-B', items: [{ kind: 'nuevo', label: 'ajeno' }] }],
    });
  });

  it('sin entrantes (solo subes o preview vacío) → undefined', () => {
    expect(summarizeIncoming(previewDe([]))).toBeUndefined();
    expect(
      summarizeIncoming(
        previewDe([
          {
            dataset: 'professors',
            title: 'Profesores',
            items: [{ kind: 'subes', label: 'mío' }],
          },
        ]),
      ),
    ).toBeUndefined();
  });

  it('de punta a punta: buildSyncPreview → summarizeIncoming', () => {
    const p = buildSyncPreview(
      datasets({ pensum: pensum('Botánica', 1, 'BOT1') }), // solo local → subes (fuera)
      datasets({ professors: [prof({ updatedAt: T2, updatedBy: 'PC Laboratorio' })] }),
      NOW,
    );
    expect(summarizeIncoming(p)).toEqual({
      at: NOW,
      devices: ['PC Laboratorio'],
      counts: { nuevos: 1, actualizados: 0, eliminados: 0 },
      porDataset: [{ title: 'Profesores', n: 1 }],
      porEquipo: [
        {
          device: 'PC Laboratorio',
          items: [{ kind: 'nuevo', label: 'Dra. Ana Pérez', at: T2 }],
        },
      ],
    });
  });
});
