/**
 * Tests del sellado con atribución (updatedBy) y del resumen de entrantes que
 * devuelve syncNow(). Usa un IStorageService en memoria y un backend de prueba
 * cuyo "remoto" es un RawDatasets controlado por el test.
 */
import os from 'os';
import { describe, it, expect } from 'vitest';
import { SyncStorageBase } from './SyncStorageBase';
import type { RawDatasets, SProfessor, SSubject, SLoadVal } from './SyncStorageBase';
import type { IStorageService } from './IStorageService';
import type { Professor, Semester } from '@scheduler/shared';
import type { AcademicLoad, ScheduleBlockData, LogEntry } from '../types';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-01T00:00:00.000Z';
const T3 = '2026-03-01T00:00:00.000Z';

/** Persistencia local en memoria (lo que guardaría el JSON en disco). */
class MemStorage implements IStorageService {
  professors: Professor[] = [];
  pensum: Semester[] = [];
  load: AcademicLoad = {};
  blocks: ScheduleBlockData[] = [];
  logs: LogEntry[] = [];
  getDataDir(): string {
    return '/mem';
  }
  loadProfessors(): Professor[] {
    return this.professors;
  }
  saveProfessors(professors: Professor[]): void {
    this.professors = professors;
  }
  loadPensum(): Semester[] {
    return this.pensum;
  }
  savePensum(pensum: Semester[]): void {
    this.pensum = pensum;
  }
  loadAcademicLoad(): AcademicLoad {
    return this.load;
  }
  saveAcademicLoad(load: AcademicLoad): void {
    this.load = load;
  }
  loadScheduleBlocks(): ScheduleBlockData[] {
    return this.blocks;
  }
  saveScheduleBlocks(blocks: ScheduleBlockData[]): void {
    this.blocks = blocks;
  }
  loadLogs(): LogEntry[] {
    return this.logs;
  }
  saveLogs(logs: LogEntry[]): void {
    this.logs = logs;
  }
}

function remotoVacio(): RawDatasets {
  return { professors: [], pensum: [], scheduleBlocks: [], academicLoad: {}, logs: [] };
}

/** Backend de prueba: el "remoto" es un objeto en memoria del propio test. */
class StoreDePrueba extends SyncStorageBase {
  remote: RawDatasets = remotoVacio();
  habilitado = false; // apagado por defecto: los tests de sellado no agendan push
  isRemoteEnabled(): boolean {
    return this.habilitado;
  }
  protected async pullRemote(): Promise<RawDatasets> {
    return this.remote;
  }
  protected async pushRemote(): Promise<void> {
    /* no-op */
  }
}

function profesor(over: Partial<Professor> = {}): Professor {
  return {
    id: 'p1',
    fullName: 'Ana Pérez',
    title: 'Dra.',
    subjects: [],
    type: 'theory',
    ...over,
  } as Professor;
}

function armar(): { mem: MemStorage; store: StoreDePrueba } {
  const mem = new MemStorage();
  const store = new StoreDePrueba(mem);
  return { mem, store };
}

describe('stampArray — sellado con atribución (updatedBy)', () => {
  it('firma los ítems NUEVOS con el nombre del equipo', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor()]);
    const guardado = mem.professors[0] as SProfessor;
    expect(guardado.updatedBy).toBe('PC-A');
    expect(guardado.updatedAt).toBeDefined();
  });

  it('por defecto firma con os.hostname()', () => {
    const { mem, store } = armar();
    store.saveProfessors([profesor()]);
    expect((mem.professors[0] as SProfessor).updatedBy).toBe(os.hostname());
  });

  it('los ítems SIN cambio conservan sello y autor anteriores (no re-firmar)', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor()]);
    const selloOriginal = (mem.professors[0] as SProfessor).updatedAt;

    store.setDeviceName('PC-B');
    store.saveProfessors([profesor()]); // mismo contenido
    const guardado = mem.professors[0] as SProfessor;
    expect(guardado.updatedBy).toBe('PC-A');
    expect(guardado.updatedAt).toBe(selloOriginal);
  });

  it('los ítems CAMBIADOS se re-firman con el equipo actual', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor()]);

    store.setDeviceName('PC-B');
    store.saveProfessors([profesor({ fullName: 'Ana P. de Gómez' })]);
    expect((mem.professors[0] as SProfessor).updatedBy).toBe('PC-B');
  });

  it('los tombstones (borrados) llevan la firma de quien borró', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor()]);

    store.setDeviceName('PC-B');
    store.saveProfessors([]); // remueve p1 → tombstone
    const tumba = mem.professors[0] as SProfessor;
    expect(tumba.deletedAt).toBeDefined();
    expect(tumba.updatedBy).toBe('PC-B');
  });
});

describe('saveAcademicLoad / savePensum — mismo sellado inline', () => {
  it('carga académica: cambia → firma; sin cambio → conserva; remueve → tombstone firmado', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveAcademicLoad({ FAR1: { theory: ['p1'] } });
    expect((mem.load.FAR1 as SLoadVal).updatedBy).toBe('PC-A');

    store.setDeviceName('PC-B');
    store.saveAcademicLoad({ FAR1: { theory: ['p1'] } }); // sin cambio
    expect((mem.load.FAR1 as SLoadVal).updatedBy).toBe('PC-A');

    store.saveAcademicLoad({ FAR1: { theory: ['p1', 'p2'] } }); // cambia
    expect((mem.load.FAR1 as SLoadVal).updatedBy).toBe('PC-B');

    store.setDeviceName('PC-C');
    store.saveAcademicLoad({}); // remueve → tombstone
    const tumba = mem.load.FAR1 as SLoadVal;
    expect(tumba.deletedAt).toBeDefined();
    expect(tumba.updatedBy).toBe('PC-C');
  });

  it('pensum: materia nueva firmada; removida → tombstone firmado', () => {
    const { mem, store } = armar();
    const sem: Semester[] = [
      {
        number: 1,
        subjects: [
          {
            code: 'BOT1',
            name: 'Botánica',
            credits: 3,
            hasLab: false,
            hoursTheory: 3,
            hoursLab: 0,
            prerequisites: [],
          },
        ],
      },
    ];
    store.setDeviceName('PC-A');
    store.savePensum(sem);
    expect((mem.pensum[0].subjects[0] as SSubject).updatedBy).toBe('PC-A');

    store.setDeviceName('PC-B');
    store.savePensum([]); // remueve BOT1 → tombstone
    const tumba = mem.pensum[0].subjects[0] as SSubject;
    expect(tumba.deletedAt).toBeDefined();
    expect(tumba.updatedBy).toBe('PC-B');
  });
});

/** Semestre 1 con una materia BOT1 (professors opcional, para los tests de vínculos). */
function pensumBOT1(professors?: string[]): Semester[] {
  return [
    {
      number: 1,
      subjects: [
        {
          code: 'BOT1',
          name: 'Botánica',
          credits: 3,
          hasLab: false,
          hoursTheory: 3,
          hoursLab: 0,
          prerequisites: [],
          ...(professors ? { professors } : {}),
        },
      ],
    },
  ];
}

describe('normalización de arrays de vínculo (orden sin semántica)', () => {
  it('reordenar professor.subjects NO re-sella (mismo set, distinto orden)', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor({ subjects: ['MAT2', 'MAT1'] })]);
    const sello = (mem.professors[0] as SProfessor).updatedAt;
    expect(mem.professors[0].subjects).toEqual(['MAT1', 'MAT2']); // persistido ordenado

    store.setDeviceName('PC-B');
    store.saveProfessors([profesor({ subjects: ['MAT1', 'MAT2'] })]); // mismo set
    const guardado = mem.professors[0] as SProfessor;
    expect(guardado.updatedAt).toBe(sello); // no se re-sella
    expect(guardado.updatedBy).toBe('PC-A');
  });

  it('reordenar subject.professors NO re-sella la materia', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.savePensum(pensumBOT1(['p2', 'p1']));
    const sello = (mem.pensum[0].subjects[0] as SSubject).updatedAt;
    expect(mem.pensum[0].subjects[0].professors).toEqual(['p1', 'p2']); // persistido ordenado

    store.setDeviceName('PC-B');
    store.savePensum(pensumBOT1(['p1', 'p2'])); // mismo set
    const guardada = mem.pensum[0].subjects[0] as SSubject;
    expect(guardada.updatedAt).toBe(sello);
    expect(guardada.updatedBy).toBe('PC-A');
  });
});

describe('syncNow — caché derivada subject.professors', () => {
  it('en empate de sello, la caché local se sobreescribe con la vista remota (los links son la verdad)', async () => {
    const { mem, store } = armar();
    // Caché local fósil (el .exe no la mantiene al editar) con el MISMO sello
    // que el remoto: el merge newest-wins conservaría el fósil para siempre.
    mem.pensum = pensumBOT1(['p-fosil']).map((s) => ({
      number: s.number,
      subjects: s.subjects.map((sub) => ({ ...sub, updatedAt: T1 }) as SSubject),
    }));
    store.habilitado = true;
    store.remote.pensum = pensumBOT1(['p9']).map((s) => ({
      number: s.number,
      subjects: s.subjects.map((sub) => ({ ...sub, updatedAt: T1 }) as SSubject),
    }));

    const r = await store.syncNow();
    expect(r.ok).toBe(true);
    const sub = mem.pensum[0].subjects[0] as SSubject;
    expect(sub.professors).toEqual(['p9']); // caché = derivada de professor_subjects
    expect(sub.updatedAt).toBe(T1); // sin re-sellar: no es una edición del usuario
  });
});

describe('syncNow — sello efectivo en el merge de carga académica', () => {
  it('un tombstone local T3 (updatedAt viejo T1) gana a un remoto re-sellado T2', async () => {
    const { mem, store } = armar();
    // Borrado local en T3; el contenedor conserva su updatedAt viejo (T1).
    mem.load = { FAR1: { theory: ['p1'], updatedAt: T1, deletedAt: T3 } as SLoadVal };
    store.habilitado = true;
    store.remote.academicLoad = { FAR1: { theory: ['p2'], updatedAt: T2 } as SLoadVal };

    const r = await store.syncNow();
    expect(r.ok).toBe(true);
    // Con `updatedAt ?? deletedAt` el remoto (T2 > T1) revertía el borrado;
    // con el sello efectivo max(updatedAt, deletedAt) gana el tombstone (T3).
    expect((mem.load.FAR1 as SLoadVal).deletedAt).toBe(T3);
    expect(store.loadAcademicLoad().FAR1).toBeUndefined();
  });
});

describe('guardado full-set — solo tombstonea lo VISTO por la UI', () => {
  async function armarConMergeEnSegundoPlano(): Promise<{
    mem: MemStorage;
    store: StoreDePrueba;
  }> {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor()]); // la UI trabaja con p1
    store.habilitado = true;
    store.remote.professors = [
      { ...profesor({ id: 'p2', fullName: 'Luis Mora' }), updatedAt: T2, updatedBy: 'PC-B' } as SProfessor,
    ];
    await store.syncNow(); // p2 entra al archivo por merge en segundo plano
    return { mem, store };
  }

  it('(a) un ítem mergeado en 2º plano que la UI NO vio sobrevive al save', async () => {
    const { mem, store } = await armarConMergeEnSegundoPlano();
    // La UI aún no recargó (reload pospuesto): su snapshot no incluye a p2.
    store.saveProfessors([profesor()]);
    const p2 = mem.professors.find((p) => p.id === 'p2') as SProfessor;
    expect(p2).toBeDefined();
    expect(p2.deletedAt).toBeUndefined(); // se conserva VIVO: no lo borró el usuario
  });

  it('(b) un ítem VISTO y quitado por el usuario se tombstonea normal', async () => {
    const { mem, store } = await armarConMergeEnSegundoPlano();
    store.loadProfessors(); // la UI recargó: ahora sí vio a p2
    store.saveProfessors([profesor()]); // el usuario lo quitó
    const p2 = mem.professors.find((p) => p.id === 'p2') as SProfessor;
    expect(p2.deletedAt).toBeDefined();
  });

  it('(c) flujo load→save normal: sin cambios de comportamiento', () => {
    const { mem, store } = armar();
    store.setDeviceName('PC-A');
    store.saveProfessors([profesor(), profesor({ id: 'p2', fullName: 'Luis Mora' })]);
    const sello = (mem.professors[0] as SProfessor).updatedAt;

    const vistos = store.loadProfessors();
    expect(vistos).toHaveLength(2);
    store.setDeviceName('PC-B');
    store.saveProfessors(vistos); // guardar lo mismo: nada se re-sella
    expect((mem.professors[0] as SProfessor).updatedAt).toBe(sello);
    expect((mem.professors[0] as SProfessor).updatedBy).toBe('PC-A');

    store.saveProfessors([vistos[0]]); // quita p2 (visto) → tombstone normal
    const p2 = mem.professors.find((p) => p.id === 'p2') as SProfessor;
    expect(p2.deletedAt).toBeDefined();
    expect(p2.updatedBy).toBe('PC-B');
  });

  it('carga académica mergeada en 2º plano no vista también sobrevive', async () => {
    const { mem, store } = armar();
    store.saveAcademicLoad({ FAR1: { theory: ['p1'] } });
    store.habilitado = true;
    store.remote.academicLoad = { QUI1: { theory: ['p2'], updatedAt: T2 } as SLoadVal };
    await store.syncNow(); // QUI1 entra por merge; la UI no recargó
    store.saveAcademicLoad({ FAR1: { theory: ['p1'] } }); // snapshot sin QUI1
    expect(mem.load.QUI1).toBeDefined();
    expect((mem.load.QUI1 as SLoadVal).deletedAt).toBeUndefined();
  });

  it('materia mergeada en 2º plano no vista también sobrevive', async () => {
    const { mem, store } = armar();
    store.savePensum(pensumBOT1());
    store.habilitado = true;
    store.remote.pensum = [
      {
        number: 2,
        subjects: [
          {
            code: 'QUI1',
            name: 'Química',
            credits: 4,
            hasLab: true,
            hoursTheory: 3,
            hoursLab: 2,
            prerequisites: [],
            updatedAt: T2,
          } as SSubject,
        ],
      },
    ];
    await store.syncNow(); // QUI1 entra por merge; la UI no recargó
    store.savePensum(pensumBOT1()); // snapshot sin QUI1
    const qui = mem.pensum
      .find((s) => s.number === 2)
      ?.subjects.find((x) => x.code === 'QUI1') as SSubject;
    expect(qui).toBeDefined();
    expect(qui.deletedAt).toBeUndefined();
  });
});

describe('syncNow — resumen de cambios entrantes (summary)', () => {
  it('entrantes de otra PC → summary con devices, counts y porDataset', async () => {
    const { store } = armar();
    store.habilitado = true;
    store.remote.professors = [
      { ...profesor(), updatedAt: T2, updatedBy: 'PC Laboratorio' } as SProfessor,
    ];
    const r = await store.syncNow();
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(true);
    expect(r.summary).toEqual({
      at: expect.any(String),
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

  it('entrante sin atribución → "(equipo desconocido)"', async () => {
    const { store } = armar();
    store.habilitado = true;
    store.remote.professors = [{ ...profesor(), updatedAt: T2 } as SProfessor];
    const r = await store.syncNow();
    expect(r.summary?.devices).toEqual(['(equipo desconocido)']);
  });

  it('solo cambios salientes (subes) → summary undefined', async () => {
    const { store } = armar();
    store.saveProfessors([profesor()]); // local tiene algo que el remoto no
    store.habilitado = true;
    const r = await store.syncNow();
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.summary).toBeUndefined();
  });

  it('sin cambios en ningún lado → summary undefined', async () => {
    const { store } = armar();
    store.habilitado = true;
    const r = await store.syncNow();
    expect(r.summary).toBeUndefined();
  });

  it('pushDataOnly propaga el summary del sync previo al callback onMerged', async () => {
    const { store } = armar();
    store.habilitado = true;
    store.remote.professors = [
      { ...profesor(), updatedAt: T2, updatedBy: 'PC-B' } as SProfessor,
    ];
    const recibidos: unknown[] = [];
    store.setOnMerged((summary) => recibidos.push(summary));
    const r = await store.pushDataOnly();
    expect(r.ok).toBe(true);
    expect(recibidos).toHaveLength(1);
    expect(recibidos[0]).toMatchObject({ devices: ['PC-B'] });
  });
});
