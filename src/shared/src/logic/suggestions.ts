/**
 * Lógica PURA de sugerencias (canal inverso: las PCs reportan error/mejora; el maestro lee).
 * Compartida entre el emisor (Farmabox) y el lector (Maestro).
 */
export type SuggestionKind = 'error' | 'improvement';

export interface AppSuggestion {
  id: string;
  kind: SuggestionKind;
  body: string;
  author?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  deletedAt?: string | null;
}

export interface SuggestionRow {
  id: string;
  kind: string;
  body: string;
  author: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  deleted_at: string | null;
}

export function rowToSuggestion(r: SuggestionRow): AppSuggestion {
  return {
    id: r.id,
    kind: r.kind === 'error' ? 'error' : 'improvement',
    body: r.body,
    author: r.author,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    resolvedAt: r.resolved_at,
    deletedAt: r.deleted_at,
  };
}

export function suggestionToRow(s: AppSuggestion): SuggestionRow {
  return {
    id: s.id,
    kind: s.kind,
    body: s.body,
    author: s.author ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    resolved_at: s.resolvedAt ?? null,
    deleted_at: s.deletedAt ?? null,
  };
}

/** Crea una sugerencia nueva (pura). author vacío → null. */
export function newSuggestion(
  kind: SuggestionKind,
  body: string,
  author: string,
  nowIso: string,
): AppSuggestion {
  return {
    id: `sug-${crypto.randomUUID()}`,
    kind,
    body: body.trim(),
    author: author.trim() || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    resolvedAt: null,
    deletedAt: null,
  };
}
