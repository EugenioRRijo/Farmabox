import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Professor,
  Semester,
  PensumSubject,
  PENSUM_DATA
} from '../../../shared/src/index';
import { AcademicLoad, ScheduleBlock } from '@/types/schedule';
import * as Backend from '../services/BackendService';

interface AppDataContextType {
  professors: Professor[];
  pensum: Semester[];
  academicLoad: AcademicLoad;
  scheduleBlocks: ScheduleBlock[];
  loading: boolean;
  error: string | null;
  isSaving: boolean;
  lastSaved: Date | null;
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
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  // Profesores: SIN seed hardcodeado. Arranca vacío y se llena con los datos
  // reales del backend (Supabase). Antes mostraba 45 profesores ficticios.
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [pensum, setPensum] = useState<Semester[]>(PENSUM_DATA || []);
  const [academicLoad, setAcademicLoad] = useState<AcademicLoad>({});
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);
  const [selectedSemester, setSelectedSemester] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Carga desde el backend. Reutilizable: al montar y al recibir cambios de otra PC.
  const reload = useCallback(async (silent = false) => {
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
        if (load) {
          const finalLoad = { ...(load as AcademicLoad) };
          Object.keys(finalLoad).forEach(code => {
            // Guard: si la entrada no es un objeto válido, descartarla (evita crash).
            const entry = finalLoad[code] as unknown;
            if (!entry || typeof entry !== 'object') {
              delete finalLoad[code];
              return;
            }
            // Cleanup corrupted string-spread elements (like "p", "r", "o", "f")
            if (Array.isArray(finalLoad[code].theory)) {
              finalLoad[code].theory = finalLoad[code].theory.filter(id => id.length > 3);
            } else if (typeof finalLoad[code].theory === 'string') {
              finalLoad[code].theory = [finalLoad[code].theory as unknown as string];
            } else {
              finalLoad[code].theory = [];
            }
            
            if (Array.isArray(finalLoad[code].lab)) {
              finalLoad[code].lab = finalLoad[code].lab.filter(id => id.length > 3);
            } else if (typeof finalLoad[code].lab === 'string') {
              finalLoad[code].lab = [finalLoad[code].lab as unknown as string];
            } else {
              finalLoad[code].lab = [];
            }
          });
          setAcademicLoad(finalLoad);
        }
        if (blocks) setScheduleBlocks(blocks as unknown as ScheduleBlock[]);
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

  // Pull periódico multi-PC: cuando otra PC cambió algo, recargar en silencio.
  useEffect(() => {
    const unsub = Backend.onRemoteDataChanged(() => reload(true));
    return unsub;
  }, [reload]);

  // En la WEB no hay pull periódico nativo (la .exe sí lo tiene cada ~60s),
  // así que acá refrescamos solos cada 30s para ver cambios de otras PCs.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) return;
    const id = setInterval(() => reload(true), 30000);
    return () => clearInterval(id);
  }, [reload]);

  const handleAddProfessor = useCallback(async (prof: Professor) => {
    setProfessors(prev => [...prev, prof]);
    try {
      await Backend.createProfessor(prof as unknown as Omit<Backend.Professor, 'id'>);
      await Backend.createLog('Crear Profesor', `Se agregó al profesor ${prof.title} ${prof.fullName}`);
    } catch (e) {
      console.error('Failed to save professor:', e);
    }
  }, []);

  const handleUpdateProfessor = useCallback(async (prof: Professor) => {
    setProfessors(prev => prev.map(p => p.id === prof.id ? prof : p));
    try {
      await Backend.updateProfessor(prof.id, prof as unknown as Partial<Backend.Professor>);
      await Backend.createLog('Actualizar Profesor', `Se actualizó al profesor ${prof.title} ${prof.fullName}`);
    } catch (e) {
      console.error('Failed to update professor:', e);
    }
  }, []);

  const handleDeleteProfessor = useCallback(async (id: string) => {
    const prof = professors.find(p => p.id === id);
    setProfessors(prev => prev.filter(p => p.id !== id));
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
    setAcademicLoad(load);
    try {
      await Backend.saveAcademicLoad(load as Backend.AcademicLoad);
    } catch (e) {
      console.error('Failed to save academic load:', e);
    }
  }, []);

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

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await Backend.saveScheduleBlocks(blocks as unknown as Backend.ScheduleBlockData[]);
        await Backend.createLog('Guardar Horario Estado', `Se actualizó el estado a ${blocks.length} bloques totales`);
        setLastSaved(new Date());
      } catch (e) {
        console.error('Failed to save schedule blocks:', e);
      } finally {
        setIsSaving(false);
      }
    }, 1500); // debounce 1.5s
  }, []);

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
