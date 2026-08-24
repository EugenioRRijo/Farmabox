import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Professor,
  Semester,
  PensumSubject
} from '../../../shared/src/index';
import { AcademicLoad, ScheduleBlock, AdminHour } from '@/types/schedule';
import { sanitizeProfessorReferences } from '../../../shared/src/logic/sanitizeProfessorReferences';
import { reconcileProfessorLoad } from '../../../shared/src/logic/reconcileProfessorLoad';
import { restampBlocksFromLoad } from '../../../shared/src/logic/restampBlocksFromLoad';
import { seedAcademicLoadFromProfessors } from '../../../shared/src/logic/seedAcademicLoadFromProfessors';
import { mergeAdminHours, itemsToPush, liveAdminHours } from '../../../shared/src/logic/adminHours';
import * as Backend from '../services/BackendService';
import { fetchAdminHours, pushAdminHours, subscribeAdminHours } from '../services/adminHoursClient';
import { pushActivity } from './ActivityFeedContext';

interface AppDataContextType {
  professors: Professor[];
  pensum: Semester[];
  academicLoad: AcademicLoad;
  scheduleBlocks: ScheduleBlock[];
  loading: boolean;
  error: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
  saveError: string | null;
  selectedSemester: number;
  setSelectedSemester: (sem: number) => void;
  handleAddProfessor: (prof: Professor) => Promise<void>;
  handleUpdateProfessor: (prof: Professor) => Promise<void>;
  handleDeleteProfessor: (id: string) => Promise<void>;
  handleResetProfessors: () => Promise<void>;
  handleAddSubject: (subject: PensumSubject & { semester: number }) => Promise<void>;
  handleUpdateSubject: (code: string, updates: Partial<PensumSubject & { semester: number }>) => Promise<void>;
  handleUpdateLoad: (load: AcademicLoad) => Promise<void>;
  handleBlocksChange: (blocks: ScheduleBlock[]) => void;
  logScheduleChange: (action: string, details: string) => Promise<void>;
  availableSubjects: PensumSubject[];
  reload: (silent?: boolean) => Promise<void>;
  // Horas administrativas (aparte de las clases; solo en el horario individual del profesor).
  adminHours: AdminHour[];
  addAdminHour: (h: AdminHour) => void;
  removeAdminHour: (id: string) => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Profesores y pensum: SIN seed hardcodeado. Arrancan vacíos y se llenan con
  // los datos reales del backend (Supabase = única fuente de la verdad).
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [pensum, setPensum] = useState<Semester[]>([]);
  const [academicLoad, setAcademicLoad] = useState<AcademicLoad>({});
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  // Horas administrativas: localStorage como caché offline + sync con Supabase
  // (tabla admin_hours, migración 2.7). El estado guarda TODO (incluye tombstones,
  // necesarios para que un borrado no "resucite" al mergear con otra PC); la UI
  // solo ve lo vivo. Merge por id newest-wins en shared/logic/adminHours.
  const [adminHours, setAdminHours] = useState<AdminHour[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('farmabox.adminHours') || '[]') as AdminHour[];
    } catch {
      return [];
    }
  });
  const adminHoursRef = useRef(adminHours);
  useEffect(() => {
    adminHoursRef.current = adminHours;
  }, [adminHours]);
  // Nombre de este equipo (atribución): se consulta UNA vez al montar y las
  // escrituras de horas admin lo estampan en `updatedBy` (viaja con el sello).
  const deviceNameRef = useRef<string | null>(null);
  useEffect(() => {
    Backend.getDeviceName()
      .then((n) => {
        deviceNameRef.current = n;
      })
      .catch(() => {});
  }, []);
  const persistAdminHours = useCallback((list: AdminHour[]) => {
    // Actualizar el ref de forma SÍNCRONA (sin esperar al useEffect de arriba):
    // syncAdminHours lee adminHoursRef.current tras su await y una hora agregada
    // con addAdminHour durante el fetch debe estar ya visible ahí; si el ref
    // llegara tarde, el merge la dejaría fuera y este mismo persist la pisaría.
    adminHoursRef.current = list;
    setAdminHours(list);
    try {
      localStorage.setItem('farmabox.adminHours', JSON.stringify(list));
    } catch {
      /* almacenamiento lleno / no disponible: se mantiene en memoria */
    }
  }, []);
  const addAdminHour = useCallback(
    (h: AdminHour) => {
      // Sello + firma del equipo: updatedBy viaja junto con updatedAt (regla de oro).
      const stamped = {
        ...h,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        updatedBy: deviceNameRef.current,
      };
      persistAdminHours([...adminHoursRef.current, stamped]);
      void pushAdminHours([stamped]); // best-effort; si falla, el sync periódico lo re-sube
    },
    [persistAdminHours],
  );
  const removeAdminHour = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      let tombstoned: AdminHour | null = null;
      const list = adminHoursRef.current.map((x) => {
        if (x.id !== id) return x;
        // El tombstone también es una edición → re-firma con este equipo.
        tombstoned = { ...x, updatedAt: now, deletedAt: now, updatedBy: deviceNameRef.current };
        return tombstoned;
      });
      persistAdminHours(list);
      if (tombstoned) void pushAdminHours([tombstoned]);
    },
    [persistAdminHours],
  );
  // Pull + merge + push de pendientes (items legados de v2.3.15 o edits offline).
  const syncAdminHours = useCallback(async () => {
    const remote = await fetchAdminHours();
    if (!remote) return; // nube no disponible (tabla ausente / red) → seguir local
    // IMPORTANTE: leer lo local DESPUÉS del await, justo antes de persistir.
    // Ventana de carrera con addAdminHour: si se leyera antes del fetch, una hora
    // agregada durante la espera quedaría fuera del merge y persistAdminHours la
    // pisaría (y si su push best-effort falló por red, se perdería del todo).
    const local = adminHoursRef.current;
    const pending = itemsToPush(local, remote, new Date().toISOString());
    const merged = mergeAdminHours(mergeAdminHours(local, pending), remote);
    persistAdminHours(merged);
    if (pending.length) void pushAdminHours(pending);
  }, [persistAdminHours]);
  useEffect(() => {
    void syncAdminHours();
    const unsub = subscribeAdminHours(() => void syncAdminHours());
    const timer = setInterval(() => void syncAdminHours(), 30000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [syncAdminHours]);
  // La UI (visualizador, PDFs) solo ve las horas vivas.
  const visibleAdminHours = useMemo(() => liveAdminHours(adminHours), [adminHours]);
  const [selectedSemester, setSelectedSemester] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Concurrencia (#7): protección de ediciones en curso ──────────────────
  // Un reload en segundo plano (poll/realtime cuando OTRA PC cambia algo) NO debe
  // pisar lo que el usuario está editando localmente y todavía no se guardó.
  // Llevamos un contador de ediciones locales y hasta cuál se confirmó el guardado;
  // mientras `localEditSeq !== syncedEditSeq` hay trabajo sin confirmar y los reload
  // silenciosos se posponen para no borrarlo (convergen al terminar de guardar).
  const localEditSeq = useRef(0);
  const syncedEditSeq = useRef(0);
  // Marca del último tecleo en CUALQUIER campo de texto. Los reload en segundo plano
  // (poll/realtime) se posponen mientras se escribe, para que no interrumpan ni laggeen
  // la escritura (antes solo se protegían las mutaciones, no los search/form/inputs).
  const lastTypeRef = useRef(0);
  const TYPING_GUARD_MS = 1500;

  // Carga desde el backend. Reutilizable: al montar y al recibir cambios de otra PC.
  const reload = useCallback(async (silent = false) => {
    // No pisar ediciones locales en curso NI interrumpir la escritura: si el usuario
    // está editando (mutación sin confirmar) o tecleó hace muy poco, posponer el refresco.
    if (
      silent &&
      (localEditSeq.current !== syncedEditSeq.current ||
        Date.now() - lastTypeRef.current < TYPING_GUARD_MS)
    )
      return;
    try {
      {
        const [profs, subs, load, blocks] = await Promise.all([
          Backend.getProfessors(),
          Backend.getSubjects(),
          Backend.getAcademicLoad(),
          Backend.getScheduleBlocks()
        ]);

        if (profs) setProfessors(profs as unknown as Professor[]);
        if (subs) setPensum(subs as Semester[]);

        // Ids de profesores vivos: para sanear referencias "fantasma" (profesores
        // borrados) en la carga académica y en los bloques (raíz del falso choque).
        const liveIds = new Set(((profs as unknown as Professor[] | undefined) ?? []).map(p => p.id));

        let finalLoad: AcademicLoad | null = null;
        if (load) {
          const fl = { ...(load as AcademicLoad) };
          Object.keys(fl).forEach(code => {
            // Guard: si la entrada no es un objeto válido, descartarla (evita crash).
            const entry = fl[code] as unknown;
            if (!entry || typeof entry !== 'object') {
              delete fl[code];
              return;
            }
            // Cleanup corrupted string-spread elements (like "p", "r", "o", "f")
            if (Array.isArray(fl[code].theory)) {
              fl[code].theory = fl[code].theory.filter(id => id.length > 3);
            } else if (typeof fl[code].theory === 'string') {
              fl[code].theory = [fl[code].theory as unknown as string];
            } else {
              fl[code].theory = [];
            }

            if (Array.isArray(fl[code].lab)) {
              fl[code].lab = fl[code].lab.filter(id => id.length > 3);
            } else if (typeof fl[code].lab === 'string') {
              fl[code].lab = [fl[code].lab as unknown as string];
            } else {
              fl[code].lab = [];
            }
          });
          finalLoad = fl;
        }

        // Saneo de referencias a profesores inexistentes (raíz del falso choque de
        // profesor): los bloques de un profesor borrado quedan "liberados" (sin
        // profesor) y la carga académica deja de listar ids fantasma.
        // IMPORTANTE: solo sanear si tenemos una lista de profesores válida; si
        // `profs` no cargó, no asumir "cero profesores vivos" (borraría todo).
        const rawBlocks = (blocks as unknown as ScheduleBlock[] | undefined) ?? [];
        if (profs) {
          // Auto-completar roles: a los profesores que tienen materias pero NO rol en la
          // carga (importados o datos viejos) les sembramos el rol según su TIPO (y si la
          // materia tiene lab). Sin esto salían "sin rol" en Profesores y sus bloques no
          // se vinculaban. Es determinista (sale de professor.subjects+type), así que cada
          // PC obtiene lo mismo; se persiste solo cuando el usuario edita algo.
          const labSet = new Set(
            ((subs as unknown as Semester[] | undefined) ?? [])
              .flatMap((s) => s.subjects)
              .filter((x) => x.hasLab)
              .map((x) => x.code),
          );
          const seededLoad = seedAcademicLoadFromProfessors(
            (finalLoad ?? {}) as AcademicLoad,
            profs as unknown as { id: string; type: 'theory' | 'practice' | 'both' | 'unassigned'; subjects: string[] }[],
            labSet,
          ) as AcademicLoad;

          const sanitized = sanitizeProfessorReferences(liveIds, seededLoad, rawBlocks);
          setAcademicLoad(sanitized.academicLoad as AcademicLoad);
          if (blocks) {
            // Invariante: el profesor de un bloque sale SIEMPRE de la carga académica.
            const stamped = restampBlocksFromLoad(sanitized.blocks, sanitized.academicLoad) as ScheduleBlock[];
            setScheduleBlocks(stamped);
          }
        } else {
          if (finalLoad) setAcademicLoad(finalLoad);
          if (blocks) setScheduleBlocks(rawBlocks);
        }
        setError(null);
      }
    } catch (e) {
      console.warn('Backend not available, using defaults:', e);
      setError('Backend no disponible — usando datos locales');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Registrar el último tecleo (cualquier input/textarea/contenteditable) para posponer
  // los reload de fondo mientras el usuario escribe — evita el lag/corte al escribir.
  useEffect(() => {
    const onType = () => {
      lastTypeRef.current = Date.now();
    };
    document.addEventListener('input', onType, true);
    return () => document.removeEventListener('input', onType, true);
  }, []);

  // Pull periódico multi-PC: cuando otra PC cambió algo, recargar en silencio.
  // ÚNICO suscriptor a onRemoteDataChanged (el realtime web solo soporta uno):
  // desde acá también se alimenta el panel "Actividad reciente" (pushActivity).
  // SIN pop-ups: el único aviso es el badge del ActivityPanel (todo bajo demanda).
  useEffect(() => {
    const unsub = Backend.onRemoteDataChanged((summary) => {
      void reload(true); // EXACTAMENTE igual que antes: recarga silenciosa
      if (!summary) return; // web o pull sin resumen → sin entrada en el feed
      const { nuevos, actualizados, eliminados } = summary.counts;
      if (nuevos + actualizados + eliminados === 0) return; // nada entrante
      pushActivity(summary);
    });
    return unsub;
  }, [reload]);

  // En la WEB no hay pull periódico nativo (la .exe sí lo tiene cada ~60s),
  // así que acá refrescamos solos cada 30s para ver cambios de otras PCs.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) return;
    const id = setInterval(() => reload(true), 30000);
    return () => clearInterval(id);
  }, [reload]);

  // Materias que tienen laboratorio: define el rol por defecto al sincronizar el
  // vínculo profesor↔materia (professor_subjects) con la carga académica.
  const labSubjectCodes = useMemo(
    () => new Set(pensum.flatMap(s => s.subjects).filter(s => s.hasLab).map(s => s.code)),
    [pensum],
  );

  // Aplica una carga académica nueva manteniendo el invariante "el profesor del
  // bloque sale SIEMPRE de la carga": re-estampa los bloques desde la carga y
  // persiste carga + bloques que cambiaron. Así el horario, los PDF por profesor y
  // los reportes nunca muestran un profesor desfasado (raíz de la
  // "desincronización entre pantallas"). No hace seq-tracking: lo maneja el handler.
  const applyLoad = useCallback(async (nextLoad: AcademicLoad, currentBlocks: ScheduleBlock[]) => {
    setAcademicLoad(nextLoad);
    const stamped = restampBlocksFromLoad(currentBlocks, nextLoad) as ScheduleBlock[];
    const blocksChanged =
      stamped.length !== currentBlocks.length || stamped.some((b, i) => b !== currentBlocks[i]);
    if (blocksChanged) setScheduleBlocks(stamped);
    await Backend.saveAcademicLoad(nextLoad as Backend.AcademicLoad);
    if (blocksChanged) {
      await Backend.saveScheduleBlocks(stamped as unknown as Backend.ScheduleBlockData[]);
    }
  }, []);

  const handleAddProfessor = useCallback(async (prof: Professor) => {
    setProfessors(prev => [...prev, prof]);
    // Sincronizar la carga académica: sembrar el rol por defecto del profesor nuevo
    // en sus materias (según su tipo y si la materia tiene lab) y re-estampar bloques.
    const nextLoad = prof.subjects.length
      ? (reconcileProfessorLoad(academicLoad, prof, [], labSubjectCodes) as AcademicLoad)
      : null;
    const mySeq = (localEditSeq.current += 1); // edición local en curso (#7)
    try {
      await Backend.createProfessor(prof as unknown as Omit<Backend.Professor, 'id'>);
      if (nextLoad) await applyLoad(nextLoad, scheduleBlocks);
      await Backend.createLog('Crear Profesor', `Se agregó al profesor ${prof.title} ${prof.fullName}`);
    } catch (e) {
      console.error('Failed to save professor:', e);
    } finally {
      if (mySeq > syncedEditSeq.current) syncedEditSeq.current = mySeq;
    }
  }, [academicLoad, scheduleBlocks, labSubjectCodes, applyLoad]);

  const handleUpdateProfessor = useCallback(async (prof: Professor) => {
    const prevProf = professors.find(p => p.id === prof.id);
    setProfessors(prev => prev.map(p => p.id === prof.id ? prof : p));
    // Reconciliar la carga solo si cambiaron las materias del profesor.
    const prevSubs = prevProf?.subjects ?? [];
    const subjectsChanged =
      prevSubs.length !== prof.subjects.length ||
      prevSubs.some(c => !prof.subjects.includes(c)) ||
      prof.subjects.some(c => !prevSubs.includes(c));
    const nextLoad = subjectsChanged
      ? (reconcileProfessorLoad(academicLoad, prof, prevSubs, labSubjectCodes) as AcademicLoad)
      : null;
    const mySeq = (localEditSeq.current += 1); // edición local en curso (#7)
    try {
      await Backend.updateProfessor(prof.id, prof as unknown as Partial<Backend.Professor>);
      if (nextLoad) await applyLoad(nextLoad, scheduleBlocks);
      await Backend.createLog('Actualizar Profesor', `Se actualizó al profesor ${prof.title} ${prof.fullName}`);
    } catch (e) {
      console.error('Failed to update professor:', e);
    } finally {
      if (mySeq > syncedEditSeq.current) syncedEditSeq.current = mySeq;
    }
  }, [professors, academicLoad, scheduleBlocks, labSubjectCodes, applyLoad]);

  const handleDeleteProfessor = useCallback(async (id: string) => {
    const prof = professors.find(p => p.id === id);
    setProfessors(prev => prev.filter(p => p.id !== id));
    // Liberar de inmediato las clases del profesor borrado y quitarlo de la carga
    // académica, para que no quede una referencia "fantasma" que dispare un falso choque.
    setScheduleBlocks(prev => prev.map(b => b.professorId === id ? { ...b, professorId: undefined } : b));
    setAcademicLoad(prev => {
      const next: AcademicLoad = {};
      for (const [code, val] of Object.entries(prev)) {
        next[code] = {
          theory: (val.theory ?? []).filter(pid => pid !== id),
          lab: (val.lab ?? []).filter(pid => pid !== id),
        };
      }
      return next;
    });
    try {
      await Backend.deleteProfessor(id);
      if (prof) {
        await Backend.createLog('Eliminar Profesor', `Se eliminó al profesor ${prof.title} ${prof.fullName}`);
      }
    } catch (e) {
      console.error('Failed to delete professor:', e);
    }
  }, [professors]);

  const handleResetProfessors = useCallback(async () => {
    if (
      !window.confirm(
        '¿Vaciar la lista de profesores? Se borrarán todos (y en las demás PC al sincronizar). Esta acción no se puede deshacer.',
      )
    )
      return;
    try {
      const reset = await Backend.resetProfessors();
      setProfessors(reset as unknown as Professor[]);
    } catch (e) {
      console.error('Failed to reset professors:', e);
    }
  }, []);

  const handleUpdateLoad = useCallback(async (load: AcademicLoad) => {
    setSaveError(null);
    const mySeq = (localEditSeq.current += 1); // edición local en curso (#7)
    try {
      // applyLoad persiste la carga Y re-estampa/persiste los bloques afectados.
      await applyLoad(load, scheduleBlocks);
    } catch (e) {
      console.error('Failed to save academic load:', e);
      setSaveError(e instanceof Error ? e.message : 'Error al guardar la carga académica');
    } finally {
      // Confirmar hasta esta edición (en éxito o error) para no bloquear reloads
      // indefinidamente; un error deja saveError visible y el próximo reload mostrará
      // la verdad del remoto.
      if (mySeq > syncedEditSeq.current) syncedEditSeq.current = mySeq;
    }
  }, [scheduleBlocks, applyLoad]);

  const handleAddSubject = useCallback(async (subject: PensumSubject & { semester: number }) => {
    setPensum(prev => {
      const copy = prev.map(s => ({ ...s, subjects: [...s.subjects] }));
      let sem = copy.find(s => s.number === subject.semester);
      if (!sem) {
        sem = { number: subject.semester, subjects: [] };
        copy.push(sem);
        copy.sort((a, b) => a.number - b.number);
      }
      sem.subjects.push(subject);
      return copy;
    });
    try {
      await Backend.addSubject(subject as Backend.PensumSubject & { semester: number });
      await Backend.createLog('Agregar Materia', `Se agregó la materia ${subject.name}`);
    } catch (e) {
      console.error('Failed to add subject:', e);
    }
  }, []);

  const handleUpdateSubject = useCallback(async (code: string, updates: Partial<PensumSubject & { semester: number }>) => {
    setPensum(prev => {
      return prev.map(sem => {
        if (sem.subjects.some(s => s.code === code)) {
          return {
            ...sem,
            subjects: sem.subjects.map(s => s.code === code ? { ...s, ...updates } : s)
          };
        }
        return sem;
      });
    });

    try {
      await Backend.updateSubject(code, updates);
      await Backend.createLog('Editar Materia', `Se actualizaron datos de la materia ${code}`);
    } catch (e) {
      console.error('Failed to update subject:', e);
    }
  }, []);

  const handleBlocksChange = useCallback((blocks: ScheduleBlock[]) => {
    setScheduleBlocks(blocks);
    setIsSaving(true); // indicador REAL: guardando hasta que termine el guardado debounced
    const mySeq = (localEditSeq.current += 1); // edición local en curso (#7)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setSaveError(null);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await Backend.saveScheduleBlocks(blocks as unknown as Backend.ScheduleBlockData[]);
        await Backend.createLog('Guardar Horario Estado', `Se actualizó el estado a ${blocks.length} bloques totales`);
        setLastSaved(new Date());
        setSaveError(null);
      } catch (e) {
        console.error('Failed to save schedule blocks:', e);
        setSaveError(e instanceof Error ? e.message : 'Error al guardar el horario');
      } finally {
        setIsSaving(false);
        // Confirmar hasta esta edición; si ya no quedan ediciones locales sin guardar,
        // converger con el remoto (trae lo que otras PCs cambiaron mientras editábamos).
        if (mySeq > syncedEditSeq.current) syncedEditSeq.current = mySeq;
        if (localEditSeq.current === syncedEditSeq.current) void reload(true);
      }
    }, 1500); // debounce 1.5s
  }, [reload]);

  const logScheduleChange = useCallback(async (action: string, details: string) => {
    try {
      await Backend.createLog(action, details);
    } catch (e) {
      console.error('Failed to log schedule change:', e);
    }
  }, []);

  const availableSubjects = useMemo(
    () => pensum.find((s) => s.number === selectedSemester)?.subjects || [],
    [pensum, selectedSemester],
  );

  const value = {
    professors,
    pensum,
    academicLoad,
    scheduleBlocks,
    loading,
    error,
    isSaving,
    lastSaved,
    saveError,
    selectedSemester,
    setSelectedSemester,
    handleAddProfessor,
    handleUpdateProfessor,
    handleDeleteProfessor,
    handleResetProfessors,
    handleAddSubject,
    handleUpdateSubject,
    handleUpdateLoad,
    handleBlocksChange,
    logScheduleChange,
    availableSubjects,
    reload,
    adminHours: visibleAdminHours,
    addAdminHour,
    removeAdminHour,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
