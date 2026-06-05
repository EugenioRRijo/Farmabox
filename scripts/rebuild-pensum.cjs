/* Reconstruye pensumData.ts EXACTO desde el PENSUM 2023-01 (PDF) y remapea
 * professorsData.ts (sus códigos de materia viejos → nuevos, por nombre). */
const fs = require('fs');
const path = require('path');

const SHARED = path.join(__dirname, '..', 'src', 'shared', 'src', 'data');

// ── Pensum oficial (PENSUM 2023-01). [code, name, HT, HL, UC, prereq?] ──────
// HP (horas práctica, solo Procesos Unitarios/Primeros Auxilios) no tiene campo
// en el modelo → se omite; hasLab = HL > 0.
const RAW = {
  1: [
    ['3307011103', 'Física Aplicada I', 2, 3, 3],
    ['3307011105', 'Matemática Aplicada I', 3, 0, 3],
    ['3307011108', 'Biología I', 2, 3, 3],
    ['3307011101', 'Orientación Farmacéutica I', 2, 0, 2],
    ['3307012101', 'Química Básica I', 4, 3, 6],
    ['3307014213', 'Botánica Aplicada I', 2, 0, 2],
  ],
  2: [
    ['3307021104', 'Física Aplicada II', 2, 3, 3, '3307011103'],
    ['3307021106', 'Matemática Aplicada II', 3, 0, 3, '3307011105'],
    ['3307021109', 'Biología II', 2, 3, 3, '3307011108'],
    ['3307021102', 'Orientación Farmacéutica II', 2, 0, 2, '3307011101'],
    ['3307022102', 'Química Básica II', 4, 3, 6, '3307012101'],
    ['3307024214', 'Botánica Aplicada II', 2, 0, 2, '3307014213'],
  ],
  3: [
    ['3307032211', 'Análisis Químico I', 4, 3, 5, '3307022102'],
    ['3307037101', 'Estadística I', 2, 0, 2, '3307021106'],
    ['3307038107', 'Atención Farmacéutica I', 2, 0, 2, '3307021102'],
    ['3307032213', 'Fisicoquímica I', 2, 3, 3, '3307021104'],
    ['3307033101', 'Fisiología y Anatomía I', 2, 3, 3, '3307021109'],
    ['3307033211', 'Parasitología', 2, 0, 2, '3307021109'],
    ['3307032103', 'Química Inorgánica I', 2, 3, 3, '3307022102'],
    ['3307032107', 'Química Orgánica I', 3, 3, 4, '3307022102'],
    ['3307031107', 'Estudio y Comprensión del Hombre', 2, 0, 2],
  ],
  4: [
    ['3307042212', 'Análisis Químico II', 4, 4, 6, '3307032211'],
    ['3307047102', 'Estadística II', 2, 0, 2, '3307037101'],
    ['3307048108', 'Atención Farmacéutica II', 2, 0, 2, '3307038107'],
    ['3307042214', 'Fisicoquímica II', 2, 3, 3, '3307032213'],
    ['3307043102', 'Fisiología y Anatomía II', 2, 3, 3, '3307033101'],
    ['3307047105', 'Metodología de la Investigación', 2, 0, 2, '3307037101'],
    ['3307042104', 'Química Inorgánica II', 2, 3, 3, '3307032103'],
    ['3307042108', 'Química Orgánica II', 4, 3, 5, '3307032107'],
  ],
  5: [
    ['3307052209', 'Análisis Instrumental I', 2, 3, 3, '3307042212'],
    ['3307054101', 'Bioquímica I', 2, 3, 3, '3307042214'],
    ['3307055105', 'Farmacotecnia I', 2, 3, 3, '3307048108'],
    ['3307053103', 'Fisiopatología I', 2, 0, 3, '3307043102'],
    ['3307056107', 'Legislación Farmacéutica I', 2, 0, 2],
    ['3307057103', 'Diseño de Proyectos I', 2, 0, 2, '3307047102'],
    ['3307052105', 'Química Medicinal I', 2, 3, 3, '3307042108'],
    ['3307053205', 'Salud Pública I', 2, 0, 2, '3307033211'],
  ],
  6: [
    ['3307062210', 'Análisis Instrumental II', 2, 3, 3, '3307052209'],
    ['3307064102', 'Bioquímica II', 2, 3, 3, '3307054101'],
    ['3307065106', 'Farmacotecnia II', 2, 3, 3, '3307055105'],
    ['3307063104', 'Fisiopatología II', 2, 0, 3, '3307053103'],
    ['3307066108', 'Legislación Farmacéutica II', 2, 0, 2, '3307056107'],
    ['3307067104', 'Diseño de Proyectos II', 2, 0, 2, '3307057103'],
    ['3307062106', 'Química Medicinal II', 2, 3, 3, '3307052105'],
    ['3307063206', 'Salud Pública II', 2, 0, 2, '3307053205'],
  ],
  7: [
    ['3307074209', 'Biofarmacia I', 2, 3, 3, '3307062210'],
    ['3307076101', 'Economía Aplicada', 2, 0, 2],
    ['3307074107', 'Farmacognosia I', 2, 3, 3, '3307062106'],
    ['3307074103', 'Farmacología I', 2, 3, 3, '3307063104'],
    ['3307073207', 'Microbiología I', 2, 3, 3, '3307063206'],
    ['3307075103', 'Procesos Unitarios I', 2, 0, 3, '3307062210'],
    ['3307075109', 'Higiene y Seguridad Industrial I', 2, 0, 2],
    ['3307074105', 'Toxicología I', 2, 3, 3, '3307064102'],
    ['3307078101', 'Orientación Pasantías Oficina de Farmacia', 2, 0, 2, '3307065106'],
  ],
  8: [
    ['3307084210', 'Biofarmacia II', 2, 3, 3, '3307074209'],
    ['3307086102', 'Administración Aplicada', 2, 0, 2, '3307076101'],
    ['3307084108', 'Farmacognosia II', 2, 3, 3, '3307074107'],
    ['3307084104', 'Farmacología II', 2, 3, 3, '3307074103'],
    ['3307083208', 'Microbiología II', 2, 3, 3, '3307073207'],
    ['3307085104', 'Procesos Unitarios II', 2, 0, 3, '3307075103'],
    ['3307085110', 'Higiene y Seguridad Industrial II', 2, 0, 2, '3307075109'],
    ['3307084106', 'Toxicología II', 2, 3, 3, '3307074105'],
    ['3307088102', 'Pasantías I Oficina de Farmacia', 2, 0, 2, '3307078101'],
  ],
  9: [
    ['3307095101', 'Bromatología I', 2, 3, 3, '3307083208'],
    ['3307095107', 'Farmacotecnia III', 2, 3, 3, '3307085104'],
    ['3307094211', 'Farmacoterapéutica I', 2, 0, 2, '3307084104'],
    ['3307096103', 'Mercadotecnia I', 2, 0, 2],
    ['3307098103', 'Orientación Pasantías Industriales-Empresas', 2, 0, 2, '3307088102'],
    ['3307093209', 'Primeros Auxilios I', 2, 0, 3, '3307084106'],
    ['3307096105', 'Técnicas Gerenciales I', 2, 0, 2, '3307086102'],
    ['3307098105', 'Farmacia Hospitalaria I', 2, 0, 2, '3307084104'],
    ['3307095111', 'Dermocosmética I', 2, 3, 3, '3307084108'],
    ['3307097106', 'Seminario Trabajo Especial de Grado I', 2, 0, 2, '3307067104'],
  ],
  10: [
    ['3307105102', 'Bromatología II', 2, 3, 3, '3307095101'],
    ['3307105108', 'Farmacotecnia IV', 2, 3, 3, '3307095107'],
    ['3307104212', 'Farmacoterapéutica II', 2, 0, 2, '3307094211'],
    ['3307106104', 'Mercadotecnia II', 2, 0, 2, '3307096103'],
    ['3307108104', 'Pasantías II Industriales-Empresas', 2, 0, 2, '3307098103'],
    ['3307103210', 'Primeros Auxilios II', 2, 0, 3, '3307093209'],
    ['3307106106', 'Técnicas Gerenciales II', 2, 0, 2, '3307096105'],
    ['3307108106', 'Farmacia Hospitalaria II', 2, 0, 2, '3307098105'],
    ['3307105112', 'Dermocosmética II', 2, 3, 3, '3307095111'],
    ['3307107107', 'Seminario Trabajo Especial de Grado II', 2, 0, 2, '3307097106'],
    ['3307107108', 'Trabajo Especial de Grado', 0, 0, 2, '3307107107'],
  ],
};

// Construir el pensum nuevo + mapas auxiliares
const newPensum = [];
const newByName = new Map(); // nombre normalizado → nuevo código
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
for (const semStr of Object.keys(RAW)) {
  const number = Number(semStr);
  const subjects = RAW[semStr].map(([code, name, ht, hl, uc, prereq]) => {
    newByName.set(norm(name), code);
    return {
      code,
      name,
      credits: uc,
      hasLab: hl > 0,
      hoursTheory: ht,
      hoursLab: hl,
      prerequisites: prereq ? [prereq] : [],
    };
  });
  newPensum.push({ number, subjects });
}

// ── Remapear profesores (códigos viejos → nuevos por nombre de materia) ─────
const oldDist = require(path.join(__dirname, '..', 'src', 'shared', 'dist', 'index.js'));
const OLD_PENSUM = oldDist.PENSUM_DATA;
const PROFESSORS = oldDist.PROFESSORS_DATA;
const oldNameByCode = new Map();
for (const sem of OLD_PENSUM) for (const sub of sem.subjects) oldNameByCode.set(sub.code, sub.name);

let remapped = 0;
let dropped = 0;
const newProfessors = PROFESSORS.map((p) => {
  const newSubs = [];
  for (const oldCode of p.subjects || []) {
    // 1) si el código ya existe igual en el pensum nuevo, se conserva
    if (newPensum.some((s) => s.subjects.some((x) => x.code === oldCode))) {
      newSubs.push(oldCode);
      remapped++;
      continue;
    }
    // 2) si no, buscar por nombre del código viejo
    const oldName = oldNameByCode.get(oldCode);
    const mapped = oldName ? newByName.get(norm(oldName)) : undefined;
    if (mapped) {
      newSubs.push(mapped);
      remapped++;
    } else {
      dropped++;
    }
  }
  return { ...p, subjects: [...new Set(newSubs)] };
});

// ── Generar archivos .ts ────────────────────────────────────────────────────
function genPensum() {
  const body = newPensum
    .map((sem) => {
      const subs = sem.subjects
        .map(
          (s) =>
            `      {\n` +
            `        code: '${s.code}',\n` +
            `        name: ${JSON.stringify(s.name)},\n` +
            `        credits: ${s.credits},\n` +
            `        hasLab: ${s.hasLab},\n` +
            `        hoursTheory: ${s.hoursTheory},\n` +
            `        hoursLab: ${s.hoursLab},\n` +
            `        prerequisites: ${JSON.stringify(s.prerequisites)},\n` +
            `      },`,
        )
        .join('\n');
      return `  // SEMESTRE ${sem.number}\n  {\n    number: ${sem.number},\n    subjects: [\n${subs}\n    ],\n  },`;
    })
    .join('\n');
  return `/**
 * Pensum de la Facultad de Farmacia USM — PENSUM 2023-01 (Código 3307).
 * Fuente: docs/referencias/PENSUM 2023-01 (1).pdf  (84 materias, 10 semestres).
 * Generado por scripts/rebuild-pensum.cjs.
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

function genProfessors() {
  const body = newProfessors
    .map((p) => {
      const fields = [
        `    id: '${p.id}',`,
        `    fullName: ${JSON.stringify(p.fullName)},`,
        `    title: '${p.title}',`,
        p.email ? `    email: ${JSON.stringify(p.email)},` : null,
        p.cedula ? `    cedula: ${JSON.stringify(p.cedula)},` : null,
        `    subjects: ${JSON.stringify(p.subjects)},`,
        `    type: '${p.type}',`,
      ]
        .filter(Boolean)
        .join('\n');
      return `  {\n${fields}\n  },`;
    })
    .join('\n');
  return `/**
 * Profesores de la Facultad de Farmacia USM. Sus materias (subjects) usan los
 * códigos del PENSUM 2023-01 (remapeadas desde la versión anterior por nombre).
 * Generado por scripts/rebuild-pensum.cjs.
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

const totalSubjects = newPensum.reduce((a, s) => a + s.subjects.length, 0);
console.log(`Pensum: ${totalSubjects} materias en ${newPensum.length} semestres`);
console.log(`Profesores: ${newProfessors.length} | asignaciones remapeadas: ${remapped} | descartadas: ${dropped}`);
