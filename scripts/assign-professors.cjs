/* Asigna a cada materia su(s) profesor(es) reales según Horarios 2026-01.docx.
 * Regenera professorsData.ts (nombres reales + materias que dicta) y agrega
 * professors[] a cada materia en pensumData.ts. */
const fs = require('fs');
const path = require('path');

const SHARED = path.join(__dirname, '..', 'src', 'shared', 'src', 'data');
const PENSUM = require(path.join(__dirname, '..', 'src', 'shared', 'dist', 'index.js')).PENSUM_DATA;

// ── [código, Prof. Teoría, Prof. Práctica] del .docx (tabla bajo cada horario) ──
const ASSIGN = [
  ['3307011103', 'Prof. Ángel Gutiérrez', 'Prof. Ángel Gutiérrez'],
  ['3307011105', 'Prof. Zoraida Jiménez', ''],
  ['3307011108', 'Prof. Dailín Ruiz', 'Prof. Dailín Ruiz'],
  ['3307011101', 'Dr. Carlos Brito', ''],
  ['3307012101', 'Prof. Marla Mendoza', 'Prof. Marla Mendoza'],
  ['3307014213', 'Dra. Mayra García', ''],
  ['3307021104', 'Prof. Mayerling González', 'Prof. Mayerling González'],
  ['3307021106', 'Prof. Zoraida Jiménez', ''],
  ['3307021109', 'Prof. Dailín Ruiz', 'Prof. Dailín Ruiz'],
  ['3307021102', 'Dr. Carlos Brito', ''],
  ['3307022102', 'Prof. Marla Mendoza', 'Prof. Marla Mendoza'],
  ['3307024214', 'Dra. Mayra García', ''],
  ['3307032211', 'Prof. Alexander Campos', 'Prof. Alexander Campos'],
  ['3307037101', 'Prof. Ridsser Chirinos', ''],
  ['3307038107', 'Prof. Gianfranco Giuttari', ''],
  ['3307032213', 'Prof. Ana Ferrer', 'Prof. Ana Ferrer'],
  ['3307033101', 'Prof. Gregory León', 'Prof. Gregory León'],
  ['3307033211', 'Prof. Ridsser Chirinos', ''],
  ['3307032103', 'Prof. Irene Henriquez', 'Prof. Khelly Marchena'],
  ['3307032107', 'Prof. Mayerling González', 'Prof. Irene Henriquez'],
  ['3307031107', 'Prof. Nibsy Pachano', ''],
  ['3307042212', 'Prof. Alexander Campos', 'Prof. Alexander Campos'],
  ['3307047102', 'Prof. Ridsser Chirinos', ''],
  ['3307048108', 'Prof. Gianfranco Giuttari', ''],
  ['3307042214', 'Prof. Ana Ferrer', 'Prof. Ana Ferrer'],
  ['3307043102', 'Prof. Gregory León', 'Prof. Gregory León'],
  ['3307047105', 'Dr. Omar Alviárez', ''],
  ['3307042104', 'Prof. Irene Henriquez', 'Prof. Khelly Marchena'],
  ['3307042108', 'Prof. Mayerling González', 'Prof. Irene Henriquez'],
  ['3307052209', 'Prof. Carlos Vallejo', 'Prof. Carlos Vallejo'],
  ['3307054101', 'Prof. Carlos Roque', 'Prof. Carlos Roque'],
  ['3307055105', 'Prof. Luz Do Nascimiento', 'Prof. Jennifer Lucero'],
  ['3307053103', 'Dr. Gilberto Perdomo', ''],
  ['3307056107', 'Prof. Juan Carlos González', ''],
  ['3307057103', 'Dr. Omar Alviárez', ''],
  ['3307052105', 'Prof. Khelly Marchena', 'Prof. Glenmary Linares'],
  ['3307053205', 'Prof. Emilia Espósito', ''],
  ['3307062210', 'Prof. Carlos Vallejo', 'Prof. Carlos Vallejo'],
  ['3307064102', 'Prof. Carlos Roque', 'Prof. Carlos Roque'],
  ['3307065106', 'Prof. Luz Do Nascimiento', 'Prof. Jennifer Lucero'],
  ['3307063104', 'Dr. Gilberto Perdomo', ''],
  ['3307066108', 'Prof. Juan Carlos González', ''],
  ['3307067104', 'Prof. Marilis Marín', ''],
  ['3307062106', 'Prof. Khelly Marchena', 'Prof. Glenmary Linares'],
  ['3307063206', 'Prof. Emilia Espósito', ''],
  ['3307074209', 'Prof. Eleana Serrano', 'Prof. Eneida Useche'],
  ['3307076101', 'Dr. Nello Collevecchio', ''],
  ['3307074107', 'Prof. Ninfa Cordero', 'Prof. Ninfa Cordero'],
  ['3307074103', 'Prof. Leandro Goncalves', 'Prof. Leandro Goncalves'],
  ['3307073207', 'Prof. Oriana Coronado', 'Prof. Andreína Méndez'],
  ['3307075103', 'Prof. Ángel Gutiérrez', ''],
  ['3307075109', 'Prof. Behzaida Trías', ''],
  ['3307074105', 'Prof. Christina Zoghbi- Prof. Gladys Venegas', 'Prof. María Miranda'],
  ['3307078101', 'Prof. Gianfranco Giuttari', ''],
  ['3307084210', 'Prof. Eleana Serrano', 'Prof. Eneida Useche'],
  ['3307086102', 'Dr. Nello Collevecchio', ''],
  ['3307084108', 'Dra. Ninfa Cordero', 'Prof. Ninfa Cordero'],
  ['3307084104', 'Prof. Leandro Goncalves', 'Prof. Leandro Goncalves'],
  ['3307083208', 'Prof. Oriana Coronado', 'Prof. Andreína Méndez'],
  ['3307085104', 'Prof. Ángel Gutiérrez', ''],
  ['3307085110', 'Prof. Behzaida Trías', ''],
  ['3307084106', 'Prof. Christina Zoghbi- Prof. Gladys Venegas', 'Prof. María Miranda'],
  ['3307088102', 'Prof. Gianfranco Giuttari', ''],
  ['3307095101', 'Prof. Luxz Paulo', 'Dra. Romily Figuera'],
  ['3307095107', 'Dr. Carlos Brito', 'Prof. Andreína Méndez'],
  ['3307094211', 'Prof. Emilia Espósito', ''],
  ['3307096103', 'Prof. Nairobys Fernandes', ''],
  ['3307098103', 'Prof. María Miranda', ''],
  ['3307093209', 'Prof. Felix Sierralta', 'Prof. Felix Sierralta'],
  ['3307096105', 'Prof. Elisabeth Davila', ''],
  ['3307098105', 'Prof. Edith Graffe', ''],
  ['3307095111', 'Prof. Giovanna González', 'Prof. Naireth Villar'],
  ['3307097106', 'Prof. Behzaida Trías', ''],
  ['3307105102', 'Prof. Luxz Paulo', 'Dra. Romily Figuera'],
  ['3307105108', 'Dr. Carlos Brito', 'Prof. Andreína Méndez'],
  ['3307104212', 'Prof. Emilia Espósito', ''],
  ['3307106104', 'Prof. Nairobys Fernandes', ''],
  ['3307108104', 'Prof. Behzaida Trías', ''],
  ['3307103210', 'Prof. Felix Sierralta', 'Prof. Felix Sierralta'],
  ['3307106106', 'Prof. Elisabeth Davila', ''],
  ['3307108106', 'Prof. Edith Graffe', ''],
  ['3307105112', 'Prof. Giovanna González', 'Prof. Naireth Villar'],
  ['3307107107', 'Prof. Gianfranco Giuttari', ''],
  ['3307107108', '', ''],
];

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
const ALIAS = { 'glenmarys linares': 'glenmary linares' };
const TITLE_RANK = ['Dra.', 'Dr.', 'MSc.', 'Lic.', 'Prof.'];

function parseProfs(raw) {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/-\s*(?=Prof\.|Dra\.|Dr\.|MSc\.|Lic\.)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(Prof\.|Dra\.|Dr\.|MSc\.|Lic\.)\s*(.+)$/);
      const title = m ? m[1] : 'Prof.';
      const name = (m ? m[2] : s).replace(/\s+/g, ' ').trim();
      return { title, name };
    });
}

function emailFor(name) {
  const parts = norm(name).replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
  const first = parts[0] || 'x';
  const last = parts[parts.length - 1] || 'x';
  return `${first[0]}${last}@usm.edu.ve`;
}

// Construir profesores
const profs = new Map(); // key normalizada → { fullName, titles:Set, theory:Set, practice:Set }
function ensure(p) {
  let key = norm(p.name);
  if (ALIAS[key]) key = ALIAS[key];
  if (!profs.has(key)) profs.set(key, { fullName: p.name, titles: new Set(), theory: new Set(), practice: new Set() });
  const rec = profs.get(key);
  rec.titles.add(p.title);
  return rec;
}
for (const [code, t, p] of ASSIGN) {
  for (const prof of parseProfs(t)) ensure(prof).theory.add(code);
  for (const prof of parseProfs(p)) ensure(prof).practice.add(code);
}

// Asignar id + título + tipo + email
const ordered = [...profs.values()];
const idByKey = new Map();
const professors = ordered.map((rec, i) => {
  const id = `prof-${String(i + 1).padStart(3, '0')}`;
  idByKey.set(rec, id);
  const title = TITLE_RANK.find((t) => rec.titles.has(t)) || 'Prof.';
  const subjects = [...new Set([...rec.theory, ...rec.practice])].sort();
  const type = rec.theory.size && rec.practice.size ? 'both' : rec.practice.size ? 'practice' : 'theory';
  // Sin email: los correos no son reales; el usuario los carga si quiere.
  return { id, fullName: rec.fullName, title, subjects, type };
});

// professors[] por materia (ids de quien la dicta)
const profsByCode = new Map();
for (const rec of ordered) {
  const id = idByKey.get(rec);
  for (const code of new Set([...rec.theory, ...rec.practice])) {
    if (!profsByCode.has(code)) profsByCode.set(code, []);
    profsByCode.get(code).push(id);
  }
}

// ── Generar pensumData.ts (con professors[]) ────────────────────────────────
function genPensum() {
  const body = PENSUM.map((sem) => {
    const subs = sem.subjects
      .map((s) => {
        const profIds = profsByCode.get(s.code) || [];
        const lines = [
          `        code: '${s.code}',`,
          `        name: ${JSON.stringify(s.name)},`,
          `        credits: ${s.credits},`,
          `        hasLab: ${s.hasLab},`,
          `        hoursTheory: ${s.hoursTheory},`,
          `        hoursLab: ${s.hoursLab},`,
          `        prerequisites: ${JSON.stringify(s.prerequisites)},`,
          profIds.length ? `        professors: ${JSON.stringify(profIds)},` : null,
        ].filter(Boolean);
        return `      {\n${lines.join('\n')}\n      },`;
      })
      .join('\n');
    return `  // SEMESTRE ${sem.number}\n  {\n    number: ${sem.number},\n    subjects: [\n${subs}\n    ],\n  },`;
  }).join('\n');
  return `/**
 * Pensum de la Facultad de Farmacia USM — PENSUM 2023-01 (Código 3307).
 * Fuente: docs/referencias/PENSUM 2023-01 (1).pdf (materias) + Horarios 2026-01.docx
 * (professors[] = quién dicta cada materia). Generado por scripts/assign-professors.cjs.
 */

export interface PensumSubject {
  code: string;
  name: string;
  credits: number;
  hasLab: boolean;
  hoursTheory: number;
  hoursLab: number;
  prerequisites: string[];
  professors?: string[];
  labNumber?: string;
}

export interface Semester {
  number: number;
  subjects: PensumSubject[];
}

export const PENSUM_DATA: Semester[] = [
${body}
];

export function getSubjectsBySemester(semester: number): PensumSubject[] {
  const found = PENSUM_DATA.find((s) => s.number === semester);
  return found ? found.subjects : [];
}

export function getSubjectByCode(code: string): PensumSubject | undefined {
  for (const semester of PENSUM_DATA) {
    const subject = semester.subjects.find((s) => s.code === code);
    if (subject) return subject;
  }
  return undefined;
}

export function getAllSubjects(): PensumSubject[] {
  return PENSUM_DATA.flatMap((s) => s.subjects);
}
`;
}

// ── Generar professorsData.ts ───────────────────────────────────────────────
function genProfessors() {
  const body = professors
    .map(
      (p) =>
        `  {\n` +
        `    id: '${p.id}',\n` +
        `    fullName: ${JSON.stringify(p.fullName)},\n` +
        `    title: '${p.title}',\n` +
        `    subjects: ${JSON.stringify(p.subjects)},\n` +
        `    type: '${p.type}',\n` +
        `  },`,
    )
    .join('\n');
  return `/**
 * Profesores de la Facultad de Farmacia USM (nombres reales) y las materias que
 * dictan, según Horarios 2026-01.docx. Códigos del PENSUM 2023-01.
 * Generado por scripts/assign-professors.cjs.
 */

export interface Professor {
  id: string;
  fullName: string;
  title: 'Prof.' | 'Dr.' | 'Dra.' | 'MSc.' | 'Lic.';
  email?: string;
  cedula?: string;
  subjects: string[];
  type: 'theory' | 'practice' | 'both';
}

export const PROFESSORS_DATA: Professor[] = [
${body}
];

export function getProfessorsBySubject(
  subjectCode: string,
  professors: Professor[] = PROFESSORS_DATA,
): Professor[] {
  return professors.filter((p) => p.subjects.includes(subjectCode));
}

export function getSubjectsByProfessor(
  professorId: string,
  professors: Professor[] = PROFESSORS_DATA,
): string[] {
  const prof = professors.find((p) => p.id === professorId);
  return prof ? prof.subjects : [];
}
`;
}

fs.writeFileSync(path.join(SHARED, 'pensumData.ts'), genPensum(), 'utf-8');
fs.writeFileSync(path.join(SHARED, 'professorsData.ts'), genProfessors(), 'utf-8');
console.log(`Profesores: ${professors.length}`);
console.log(`Materias con profesor asignado: ${profsByCode.size} / ${PENSUM.reduce((a, s) => a + s.subjects.length, 0)}`);
