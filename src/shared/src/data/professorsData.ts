/**
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
  {
    id: 'prof-001',
    fullName: "Ángel Gutiérrez",
    title: 'Prof.',
    subjects: ["3307011103","3307075103","3307085104"],
    type: 'both',
  },
  {
    id: 'prof-002',
    fullName: "Zoraida Jiménez",
    title: 'Prof.',
    subjects: ["3307011105","3307021106"],
    type: 'theory',
  },
  {
    id: 'prof-003',
    fullName: "Dailín Ruiz",
    title: 'Prof.',
    subjects: ["3307011108","3307021109"],
    type: 'both',
  },
  {
    id: 'prof-004',
    fullName: "Carlos Brito",
    title: 'Dr.',
    subjects: ["3307011101","3307021102","3307095107","3307105108"],
    type: 'theory',
  },
  {
    id: 'prof-005',
    fullName: "Marla Mendoza",
    title: 'Prof.',
    subjects: ["3307012101","3307022102"],
    type: 'both',
  },
  {
    id: 'prof-006',
    fullName: "Mayra García",
    title: 'Dra.',
    subjects: ["3307014213","3307024214"],
    type: 'theory',
  },
  {
    id: 'prof-007',
    fullName: "Mayerling González",
    title: 'Prof.',
    subjects: ["3307021104","3307032107","3307042108"],
    type: 'both',
  },
  {
    id: 'prof-008',
    fullName: "Alexander Campos",
    title: 'Prof.',
    subjects: ["3307032211","3307042212"],
    type: 'both',
  },
  {
    id: 'prof-009',
    fullName: "Ridsser Chirinos",
    title: 'Prof.',
    subjects: ["3307033211","3307037101","3307047102"],
    type: 'theory',
  },
  {
    id: 'prof-010',
    fullName: "Gianfranco Giuttari",
    title: 'Prof.',
    subjects: ["3307038107","3307048108","3307078101","3307088102","3307107107"],
    type: 'theory',
  },
  {
    id: 'prof-011',
    fullName: "Ana Ferrer",
    title: 'Prof.',
    subjects: ["3307032213","3307042214"],
    type: 'both',
  },
  {
    id: 'prof-012',
    fullName: "Gregory León",
    title: 'Prof.',
    subjects: ["3307033101","3307043102"],
    type: 'both',
  },
  {
    id: 'prof-013',
    fullName: "Irene Henriquez",
    title: 'Prof.',
    subjects: ["3307032103","3307032107","3307042104","3307042108"],
    type: 'both',
  },
  {
    id: 'prof-014',
    fullName: "Khelly Marchena",
    title: 'Prof.',
    subjects: ["3307032103","3307042104","3307052105","3307062106"],
    type: 'both',
  },
  {
    id: 'prof-015',
    fullName: "Nibsy Pachano",
    title: 'Prof.',
    subjects: ["3307031107"],
    type: 'theory',
  },
  {
    id: 'prof-016',
    fullName: "Omar Alviárez",
    title: 'Dr.',
    subjects: ["3307047105","3307057103"],
    type: 'theory',
  },
  {
    id: 'prof-017',
    fullName: "Carlos Vallejo",
    title: 'Prof.',
    subjects: ["3307052209","3307062210"],
    type: 'both',
  },
  {
    id: 'prof-018',
    fullName: "Carlos Roque",
    title: 'Prof.',
    subjects: ["3307054101","3307064102"],
    type: 'both',
  },
  {
    id: 'prof-019',
    fullName: "Luz Do Nascimiento",
    title: 'Prof.',
    subjects: ["3307055105","3307065106"],
    type: 'theory',
  },
  {
    id: 'prof-020',
    fullName: "Jennifer Lucero",
    title: 'Prof.',
    subjects: ["3307055105","3307065106"],
    type: 'practice',
  },
  {
    id: 'prof-021',
    fullName: "Gilberto Perdomo",
    title: 'Dr.',
    subjects: ["3307053103","3307063104"],
    type: 'theory',
  },
  {
    id: 'prof-022',
    fullName: "Juan Carlos González",
    title: 'Prof.',
    subjects: ["3307056107","3307066108"],
    type: 'theory',
  },
  {
    id: 'prof-023',
    fullName: "Glenmary Linares",
    title: 'Prof.',
    subjects: ["3307052105","3307062106"],
    type: 'practice',
  },
  {
    id: 'prof-024',
    fullName: "Emilia Espósito",
    title: 'Prof.',
    subjects: ["3307053205","3307063206","3307094211","3307104212"],
    type: 'theory',
  },
  {
    id: 'prof-025',
    fullName: "Marilis Marín",
    title: 'Prof.',
    subjects: ["3307067104"],
    type: 'theory',
  },
  {
    id: 'prof-026',
    fullName: "Eleana Serrano",
    title: 'Prof.',
    subjects: ["3307074209","3307084210"],
    type: 'theory',
  },
  {
    id: 'prof-027',
    fullName: "Eneida Useche",
    title: 'Prof.',
    subjects: ["3307074209","3307084210"],
    type: 'practice',
  },
  {
    id: 'prof-028',
    fullName: "Nello Collevecchio",
    title: 'Dr.',
    subjects: ["3307076101","3307086102"],
    type: 'theory',
  },
  {
    id: 'prof-029',
    fullName: "Ninfa Cordero",
    title: 'Dra.',
    subjects: ["3307074107","3307084108"],
    type: 'both',
  },
  {
    id: 'prof-030',
    fullName: "Leandro Goncalves",
    title: 'Prof.',
    subjects: ["3307074103","3307084104"],
    type: 'both',
  },
  {
    id: 'prof-031',
    fullName: "Oriana Coronado",
    title: 'Prof.',
    subjects: ["3307073207","3307083208"],
    type: 'theory',
  },
  {
    id: 'prof-032',
    fullName: "Andreína Méndez",
    title: 'Prof.',
    subjects: ["3307073207","3307083208","3307095107","3307105108"],
    type: 'practice',
  },
  {
    id: 'prof-033',
    fullName: "Behzaida Trías",
    title: 'Prof.',
    subjects: ["3307075109","3307085110","3307097106","3307108104"],
    type: 'theory',
  },
  {
    id: 'prof-034',
    fullName: "Christina Zoghbi",
    title: 'Prof.',
    subjects: ["3307074105","3307084106"],
    type: 'theory',
  },
  {
    id: 'prof-035',
    fullName: "Gladys Venegas",
    title: 'Prof.',
    subjects: ["3307074105","3307084106"],
    type: 'theory',
  },
  {
    id: 'prof-036',
    fullName: "María Miranda",
    title: 'Prof.',
    subjects: ["3307074105","3307084106","3307098103"],
    type: 'both',
  },
  {
    id: 'prof-037',
    fullName: "Luxz Paulo",
    title: 'Prof.',
    subjects: ["3307095101","3307105102"],
    type: 'theory',
  },
  {
    id: 'prof-038',
    fullName: "Romily Figuera",
    title: 'Dra.',
    subjects: ["3307095101","3307105102"],
    type: 'practice',
  },
  {
    id: 'prof-039',
    fullName: "Nairobys Fernandes",
    title: 'Prof.',
    subjects: ["3307096103","3307106104"],
    type: 'theory',
  },
  {
    id: 'prof-040',
    fullName: "Felix Sierralta",
    title: 'Prof.',
    subjects: ["3307093209","3307103210"],
    type: 'both',
  },
  {
    id: 'prof-041',
    fullName: "Elisabeth Davila",
    title: 'Prof.',
    subjects: ["3307096105","3307106106"],
    type: 'theory',
  },
  {
    id: 'prof-042',
    fullName: "Edith Graffe",
    title: 'Prof.',
    subjects: ["3307098105","3307108106"],
    type: 'theory',
  },
  {
    id: 'prof-043',
    fullName: "Giovanna González",
    title: 'Prof.',
    subjects: ["3307095111","3307105112"],
    type: 'theory',
  },
  {
    id: 'prof-044',
    fullName: "Naireth Villar",
    title: 'Prof.',
    subjects: ["3307095111","3307105112"],
    type: 'practice',
  },
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
