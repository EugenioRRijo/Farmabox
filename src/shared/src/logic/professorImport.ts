/**
 * professorImport — Lógica PURA para importar listas de profesores en su formato
 * "natural" (el que entregan las coordinaciones): una columna con el nombre del
 * profesor y otra con la unidad curricular, donde el nombre solo aparece en la
 * primera fila de cada profesor y sus demás materias van en filas siguientes con
 * el nombre vacío. Las materias de laboratorio vienen marcadas con "(Lab)".
 *
 * Esta capa NO toca archivos ni red: recibe filas ya parseadas (CSV/Excel) + el
 * catálogo de materias (code/name/hasLab) y devuelve registros listos para
 * bulkUpsertProfessors, mapeando NOMBRE de materia → CÓDIGO y deduciendo el tipo
 * (teoría / práctica / ambos) según las marcas "(Lab)" y si la materia tiene lab.
 * Lo que no se puede mapear se reporta en `unmatched` (no se inventa nada).
 */

export interface SubjectLite {
  code: string;
  name: string;
  hasLab: boolean;
}

/** Tipo de carga del profesor. `null` = "sin tipo": la fila no lo trae (o trae algo
 *  irreconocible) y NO se adivina — el profesor se importa sin teoría/lab. */
export type ProfessorType = 'theory' | 'practice' | 'both';

export interface ParsedProfessor {
  fullName: string;
  type: ProfessorType | null;
  subjects: string[]; // códigos resueltos
  unmatched: string[]; // nombres de materia que NO se encontraron en el catálogo
}

// Sinónimos aceptados por tipo (ya normalizados: minúsculas, sin acentos, sin
// espacios sobrantes). `tipo` manda sobre la marca "(Lab)"; lo no reconocido → null.
const TYPE_SYNONYMS: Record<string, ProfessorType> = {
  // teoría
  theory: 'theory',
  teoria: 'theory',
  te: 'theory',
  t: 'theory',
  // laboratorio / práctica
  practice: 'practice',
  laboratorio: 'practice',
  laboratorios: 'practice',
  lab: 'practice',
  practica: 'practice',
  p: 'practice',
  // ambos
  both: 'both',
  ambos: 'both',
  ambas: 'both',
  'teoria-laboratorio': 'both',
  'teoria-laboratorios': 'both',
  'teoria/lab': 'both',
};

/** Normaliza la columna "tipo" a un valor canónico (theory/practice/both),
 *  aceptando sinónimos sin acentos ni mayúsculas. Devuelve null si la celda está
 *  vacía o no se reconoce: NO se adivina el rol (fallback seguro, nunca inventa lab). */
export function normalizeType(raw: string): ProfessorType | null {
  const key = (raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/\s+/g, ' ')
    .trim();
  if (!key) return null;
  return TYPE_SYNONYMS[key] ?? null;
}

/** Normaliza un nombre de materia para comparar: minúsculas, sin acentos, sin la
 *  marca "(Lab)", espacios colapsados. */
export function normalizeSubjectName(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/\(\s*lab[^)]*\)/gi, '') // quita "(Lab)", "(LAB)", "(Lab.)"
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿El nombre crudo trae marca de laboratorio? Ej.: "Bromatología I (Lab)". */
export function isLabMarked(raw: string): boolean {
  return /\(\s*lab/i.test(raw ?? '');
}

/** Índice nombre-normalizado → materia. Si dos materias normalizan igual, gana la 1ª. */
export function buildSubjectIndex(catalog: SubjectLite[]): Map<string, SubjectLite> {
  const idx = new Map<string, SubjectLite>();
  for (const s of catalog) {
    const key = normalizeSubjectName(s.name);
    if (key && !idx.has(key)) idx.set(key, s);
  }
  return idx;
}

const NAME_HINTS = ['apellido', 'nombre', 'profesor', 'docente'];
const SUBJECT_HINTS = ['unidad', 'curricular', 'materia', 'asignatura', 'catedra', 'cátedra'];
const TYPE_HINTS = ['tipo', 'type', 'rol'];

/** Detecta, entre los encabezados, la columna de nombre y la de materia del formato
 *  natural (y, opcionalmente, la columna `tipo`). Devuelve null si no parece ese formato. */
export function detectNaturalColumns(
  fields: string[],
): { nameKey: string; subjectKey: string; typeKey?: string } | null {
  const norm = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const nameKey = fields.find((f) => NAME_HINTS.some((h) => norm(f).includes(h)));
  const subjectKey = fields.find((f) => SUBJECT_HINTS.some((h) => norm(f).includes(h)));
  if (nameKey && subjectKey && nameKey !== subjectKey) {
    const typeKey = fields.find(
      (f) => f !== nameKey && f !== subjectKey && TYPE_HINTS.includes(norm(f)),
    );
    return typeKey ? { nameKey, subjectKey, typeKey } : { nameKey, subjectKey };
  }
  return null;
}

/** Mapea la lista "natural" (agrupada por profesor con relleno hacia abajo) a
 *  registros de profesor con códigos de materia y tipo deducido. */
export function mapGroupedList(
  rows: Record<string, string>[],
  nameKey: string,
  subjectKey: string,
  catalog: SubjectLite[],
  typeKey?: string,
): ParsedProfessor[] {
  const index = buildSubjectIndex(catalog);

  // 1) agrupar: el nombre solo viene en la 1ª fila de cada profesor. El tipo
  //    explícito (si la lista trae columna) se toma de esa misma fila del profesor.
  const groups: { fullName: string; rawType: string; rawSubjects: string[] }[] = [];
  let cur: { fullName: string; rawType: string; rawSubjects: string[] } | null = null;
  for (const r of rows) {
    const name = (r[nameKey] ?? '').trim();
    const subject = (r[subjectKey] ?? '').trim();
    if (name) {
      cur = { fullName: name, rawType: typeKey ? (r[typeKey] ?? '').trim() : '', rawSubjects: [] };
      groups.push(cur);
    }
    if (subject && cur) cur.rawSubjects.push(subject);
  }

  // 2) resolver materias y decidir el tipo: manda la columna `tipo` (si la trae y se
  //    reconoce); si no, se deduce por las marcas "(Lab)" (respaldo).
  return groups.map(({ fullName, rawType, rawSubjects }) => {
    const subjects: string[] = [];
    const unmatched: string[] = [];
    let hasLab = false;
    let hasTheory = false;
    for (const raw of rawSubjects) {
      const lab = isLabMarked(raw);
      const entry = index.get(normalizeSubjectName(raw));
      if (entry) {
        if (!subjects.includes(entry.code)) subjects.push(entry.code);
        if (lab && entry.hasLab) hasLab = true;
        else hasTheory = true;
      } else {
        unmatched.push(raw);
        if (lab) hasLab = true;
        else hasTheory = true;
      }
    }
    const deduced: ProfessorType = hasLab && hasTheory ? 'both' : hasLab ? 'practice' : 'theory';
    const type: ParsedProfessor['type'] = normalizeType(rawType) ?? deduced;
    return { fullName, type, subjects, unmatched };
  });
}
