import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { RemoteChangeSummary } from '../services/BackendService';

/**
 * ActivityFeedContext — Historial EN MEMORIA de la sesión con los cambios que
 * entraron desde otras PCs (atribución por equipo, spec 2026-08-13).
 *
 * El estado vive en un store simple de módulo (no en el Provider) a propósito:
 * la suscripción a onRemoteDataChanged está centralizada en AppDataContext (el
 * realtime web solo soporta UN suscriptor), y desde ahí se hace `pushActivity(...)`
 * sin depender de este contexto (cero ciclos de providers). El Provider solo
 * expone la lista reactiva + contador de no-vistos a la UI (panel del header).
 */

/** Entrada del feed: espejo de RemoteChangeSummary (lo que entró y de qué equipo). */
export type ActivityEntry = RemoteChangeSummary;

const MAX_ENTRADAS = 50;

interface FeedState {
  entries: ActivityEntry[]; // más nuevo primero
  unseen: number; // entradas aún no vistas en el panel
}

// ── Store de módulo (sesión) ────────────────────────────────────────────────
let state: FeedState = { entries: [], unseen: 0 };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FeedState {
  return state;
}

/** Agrega una entrada al feed (más nuevo primero, máx. 50) y suma un no-visto. */
// eslint-disable-next-line react-refresh/only-export-components
export function pushActivity(entry: ActivityEntry): void {
  state = {
    entries: [entry, ...state.entries].slice(0, MAX_ENTRADAS),
    unseen: state.unseen + 1,
  };
  emit();
}

function markSeenStore(): void {
  if (state.unseen === 0) return;
  state = { ...state, unseen: 0 };
  emit();
}

// ── Formato humano del resumen (línea de conteos del panel, fallback sin
// detalle porEquipo) ────────────────────────────────────────────────────────
// Los títulos vienen en plural desde el main ("Bloques de horario"); acá se
// singularizan cuando n === 1 para leerse natural ("1 profesor", "2 materias").
const SINGULAR: Record<string, string> = {
  Profesores: 'profesor',
  Materias: 'materia',
  'Carga académica': 'asignación de carga',
  'Bloques de horario': 'bloque de horario',
};
const PLURAL: Record<string, string> = {
  Profesores: 'profesores',
  Materias: 'materias',
  'Carga académica': 'asignaciones de carga',
  'Bloques de horario': 'bloques de horario',
};

/** "2 bloques de horario, 1 profesor" a partir de porDataset (solo n>0). */
// eslint-disable-next-line react-refresh/only-export-components
export function formatPorDataset(porDataset: { title: string; n: number }[]): string {
  return porDataset
    .filter((d) => d.n > 0)
    .map((d) => {
      const nombre = (d.n === 1 ? SINGULAR[d.title] : PLURAL[d.title]) ?? d.title.toLowerCase();
      return `${d.n} ${nombre}`;
    })
    .join(', ');
}

// ── Contexto reactivo para la UI ────────────────────────────────────────────
interface ActivityFeedContextType {
  /** Entradas de la sesión, más nuevo primero (máx. 50). */
  entries: ActivityEntry[];
  /** Cuántas entradas entraron desde la última vez que se abrió el panel. */
  unseen: number;
  /** Marca todo como visto (al abrir el panel). */
  markSeen: () => void;
}

const ActivityFeedContext = createContext<ActivityFeedContextType | undefined>(undefined);

export function ActivityFeedProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const value = useMemo(
    () => ({ entries: snapshot.entries, unseen: snapshot.unseen, markSeen: markSeenStore }),
    [snapshot],
  );
  return <ActivityFeedContext.Provider value={value}>{children}</ActivityFeedContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActivityFeed() {
  const context = useContext(ActivityFeedContext);
  if (context === undefined) {
    throw new Error('useActivityFeed must be used within an ActivityFeedProvider');
  }
  return context;
}
