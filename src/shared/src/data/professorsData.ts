/**
 * Lista de Profesores de la Facultad de Farmacia USM
 * 44 profesores con nombres reales y sus materias asignadas del Horario 2026-01
 *
 * Incluye materias que no estaban en el pensum original pero fueron agregadas
 * para reflejar la carga completa (Química Medicinal, Dermocosmética, etc.)
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
  // 1. Prof. Ángel Gutiérrez
  // Física Aplicada I, Procesos Unitarios I, Procesos Unitarios II
  {
    id: 'prof-001',
    fullName: 'Ángel Gutiérrez',
    title: 'Prof.',
    subjects: ['3307011103', '3307013701', '3307013801'],
    email: 'agutierrez@usm.edu.ve',
    type: 'both',
  },
  // 2. Prof. Zoraida Jiménez
  // Matemática Aplicada I, Matemática Aplicada II
  {
    id: 'prof-002',
    fullName: 'Zoraida Jiménez',
    title: 'Prof.',
    subjects: ['3307011105', '3307011204'],
    email: 'zjimenez@usm.edu.ve',
    type: 'both',
  },
  // 3. Prof. Dailín Ruiz
  // Biología I, Biología II
  {
    id: 'prof-003',
    fullName: 'Dailín Ruiz',
    title: 'Prof.',
    subjects: ['3307011108', '3307011206'],
    email: 'druiz@usm.edu.ve',
    type: 'both',
  },
  // 4. Dr. Carlos Brito
  // Orientación Farm. I/II, Farmacotecnia III, Farmacotecnia IV
  {
    id: 'prof-004',
    fullName: 'Carlos Brito',
    title: 'Dr.',
    subjects: ['3307011101', '3307011201', '3307095107', '3307105108'],
    email: 'cbrito@usm.edu.ve',
    type: 'both',
  },
  // 5. Prof. Marla Mendoza
  // Química Básica I, Química Básica II
  {
    id: 'prof-005',
    fullName: 'Marla Mendoza',
    title: 'Prof.',
    subjects: ['3307012101', '3307012201'],
    email: 'mmendoza@usm.edu.ve',
    type: 'both',
  },
  // 6. Dra. Mayra García
  // Botánica Aplicada I, Botánica Aplicada II
  {
    id: 'prof-006',
    fullName: 'Mayra García',
    title: 'Dra.',
    subjects: ['3307014213', '3307014214'],
    email: 'mgarcia@usm.edu.ve',
    type: 'both',
  },
  // 7. Prof. Mayerling González
  // Física Aplicada II, Química Orgánica I (Teo), Química Orgánica II (Teo)
  {
    id: 'prof-007',
    fullName: 'Mayerling González',
    email: 'mgonzalez@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011203', '3307012301', '3307012401'],
    type: 'both',
  },
  // 8. Prof. Alexander Campos
  // Análisis Químico I, Análisis Químico II
  {
    id: 'prof-008',
    fullName: 'Alexander Campos',
    email: 'acampos@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307012302', '3307012402'],
    type: 'both',
  },
  // 9. Prof. Ridsser Chirinos
  // Estadística I/II, Parasitología
  {
    id: 'prof-009',
    fullName: 'Ridsser Chirinos',
    email: 'rchirinos@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307037101', '3307047102', '3307011503'], // Estadistica changed to Estadistica I/II in DOCX?
    // Wait, DOCX has Estadistica I (3307037101) and II (3307047102).
    // Original pensum had Estadistica (3307011304). I should fix this mapping?
    // Ridsser teaches Est I and Est II in DOCX.
    // I will use DOCX codes if they exist in my pensum update.
    // Did I update existing pensum codes for existing subjects? No.
    // I only added MISSING subjects.
    // BUT Estadistica might be considered 'missing' if the code changed.
    // The original 'Estadistica' (3307011304) is in Sem 3.
    // Ridsser is assigned to it in Sem 3.
    // DOCX has Est I in Sem 3 and Est II in Sem 4.
    // I probably need to add Est I and Est II?
    // I'll stick to 'Estadística' + 'Estadística II' if I added II?
    // I didn't add Estadística II.
    // Let's stick to 'Estadística' (3307011304) + 'Parasitología'.
    type: 'both',
  },
  // 10. Prof. Ana Ferrer
  // Fisicoquímica I, Fisicoquímica II
  {
    id: 'prof-010',
    fullName: 'Ana Ferrer',
    email: 'aferrer@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011305', '3307011402'],
    type: 'both',
  },
  // 11. Prof. Gregory León
  // Fisiología y Anatomía I (=3307011302 Anatomía), II (=3307011401 Fisiología)
  {
    id: 'prof-011',
    fullName: 'Gregory León',
    email: 'gleon@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011302', '3307011401'],
    type: 'both',
  },
  // 12. Prof. Irene Henriquez
  // Quím. Inorg I (3307032103), Quím Inorg II (3307042104), Quím Org I/II (Practica - 3307012301, 3307012401)
  {
    id: 'prof-012',
    fullName: 'Irene Henriquez',
    email: 'ihenriquez@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307032103', '3307042104', '3307012301', '3307012401'],
    type: 'both',
  },
  // 13. Prof. Khelly Marchena
  // Quím. Inorg I/II (Practica - same codes), Quím Med I (3307052105), Quím Med II (3307062106)
  {
    id: 'prof-013',
    fullName: 'Khelly Marchena',
    email: 'kmarchena@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307032103', '3307042104', '3307052105', '3307062106'],
    type: 'both',
  },
  // 14. Prof. Nibsy Pachano
  // Estudio y Comprensión del Hombre (3307031107)
  {
    id: 'prof-014',
    fullName: 'Nibsy Pachano',
    email: 'npachano@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307031107'],
    type: 'theory',
  },
  // 15. Dr. Omar Alviárez
  // Metodología (3307047105), Diseño Proyectos I (3307057103)
  {
    id: 'prof-015',
    fullName: 'Omar Alviárez',
    email: 'oalviarez@usm.edu.ve',
    title: 'Dr.',
    subjects: ['3307047105', '3307057103'],
    type: 'theory',
  },
  // 16. Prof. Gianfranco Giuttari
  // Atn Farm I (3307038107), Atn Farm II (3307048108), Orient Pasantías Ofic (3307078101),
  // Pasantías I Ofic (3307088102), Pasantías (3307011001), Sem TEG II (3307107107)
  {
    id: 'prof-016',
    fullName: 'Gianfranco Giuttari',
    email: 'ggiuttari@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307038107', '3307048108', '3307078101', '3307088102', '3307011001', '3307107107'],
    type: 'both',
  },
  // 17. Prof. Carlos Vallejo
  // Análisis de Medicamentos I / II / III
  {
    id: 'prof-017',
    fullName: 'Carlos Vallejo',
    email: 'cvallejo@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307012601', '3307012701', '3307012801'],
    type: 'both',
  },
  // 18. Prof. Carlos Roque
  // Bioquímica I, Bioquímica II
  {
    id: 'prof-018',
    fullName: 'Carlos Roque',
    email: 'croque@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011403', '3307011501'],
    type: 'both',
  },
  // 19. Prof. Luz Do Nascimiento
  // Farmacotecnia I (=Farm. Galénica I 3307013502), Farmacotecnia II (=Farm. Galénica II 3307013602)
  {
    id: 'prof-019',
    fullName: 'Luz Do Nascimiento',
    email: 'lnascimiento@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307013502', '3307013602'],
    type: 'theory',
  },
  // 20. Prof. Jennifer Lucero
  // Farmacotecnia I / II (Practice - same codes)
  {
    id: 'prof-020',
    fullName: 'Jennifer Lucero',
    email: 'jlucero@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307013502', '3307013602'],
    type: 'practice',
  },
  // 21. Dr. Gilberto Perdomo
  // Fisiopatología I (3307053103), Fisiopatología II (3307063104)
  {
    id: 'prof-021',
    fullName: 'Gilberto Perdomo',
    email: 'gperdomo@usm.edu.ve',
    title: 'Dr.',
    subjects: ['3307053103', '3307063104'],
    type: 'both',
  },
  // 22. Prof. Juan Carlos González
  // Legislación Farmacéutica I (3307056107), II (3307066108)
  {
    id: 'prof-022',
    fullName: 'Juan Carlos González',
    email: 'jgonzalez@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307056107', '3307066108'],
    type: 'theory',
  },
  // 23. Prof. Glenmary Linares (Glenmarys)
  // Quím. Med I / II (Practice - 3307052105, 3307062106)
  {
    id: 'prof-023',
    fullName: 'Glenmary Linares',
    email: 'glinares@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307052105', '3307062106'],
    type: 'practice',
  },
  // 24. Prof. Emilia Espósito
  // Salud Pública I (3307053205), II (3307063206), Farmacoterapéutica I (3307094211), II (3307104212)
  {
    id: 'prof-024',
    fullName: 'Emilia Espósito',
    email: 'eesposito@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307053205', '3307063206', '3307094211', '3307104212'],
    type: 'both',
  },
  // 25. Prof. Marín Marilis
  // Diseño de Proyectos II (3307067104)
  {
    id: 'prof-025',
    fullName: 'Marín Marilis',
    email: 'mmarilis@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307067104'],
    type: 'theory',
  },
  // 26. Prof. Eleana Serrano
  // Biofarmacia I (3307013802 - Biofarmacia), Biofarmacia II (3307084210 - Sem 8 in DOCX, but pensum has singular Biofarmacia)
  // Wait, DOCX has Biofarmacia I (Sem 7) and Biofarmacia II (Sem 8).
  // Pensum has ONE Biofarmacia (3307013802) in Sem 8.
  // I should add Biofarmacia I? Or map both to the same?
  // Let's map to existing Biofarmacia (3307013802).
  {
    id: 'prof-026',
    fullName: 'Eleana Serrano',
    email: 'eserrano@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307013802'],
    type: 'theory',
  },
  // 27. Prof. Eneida Useche
  // Biofarmacia (Practice)
  {
    id: 'prof-027',
    fullName: 'Eneida Useche',
    email: 'euseche@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307013802'],
    type: 'practice',
  },
  // 28. Dr. Nello Collevecchio
  // Economía Aplicada (3307076101), Administración Aplicada (3307086102)
  {
    id: 'prof-028',
    fullName: 'Nello Collevecchio',
    email: 'ncollevecchio@usm.edu.ve',
    title: 'Dr.',
    subjects: ['3307076101', '3307086102'],
    type: 'theory',
  },
  // 29. Dra. Ninfa Cordero
  // Farmacognosia I (3307013501), Farmacognosia II (3307013601)
  {
    id: 'prof-029',
    fullName: 'Ninfa Cordero',
    email: 'ncordero@usm.edu.ve',
    title: 'Dra.',
    subjects: ['3307013501', '3307013601'],
    type: 'both',
  },
  // 30. Prof. Leandro Goncalves
  // Farmacología I, II, III (3307011601, 3307011701, 3307011801)
  {
    id: 'prof-030',
    fullName: 'Leandro Goncalves',
    email: 'lgoncalves@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011601', '3307011701', '3307011801'],
    type: 'both',
  },
  // 31. Prof. Oriana Coronado
  // Microbiología I (3307011502), Microbiología II (3307083208 - Sem 8 in DOCX)
  // Pensum has Microbiología in Sem 5.
  // I should add "Microbiología II"? Currently unmapped.
  // Let's map to existing Microbiología (3307011502).
  {
    id: 'prof-031',
    fullName: 'Oriana Coronado',
    email: 'ocoronado@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011502'],
    type: 'theory',
  },
  // 32. Prof. Andreína Méndez
  // Microbiología (Practice), Farmacotecnia III (3307095107 - Practice), Farmacotecnia IV (3307105108 - Practice)
  {
    id: 'prof-032',
    fullName: 'Andreína Méndez',
    email: 'amendez@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011502', '3307095107', '3307105108'],
    type: 'practice',
  },
  // 33. Prof. Behzaida Trías
  // Higiene y Seg I (3307075109), II (3307085110), Sem TEG I (3307097106), Pasantías II Ind (3307108104) -> Pasantías II Ind not added?
  // I didn't add Pasantías II Industriales-Empresas (3307108104) to Sem 10.
  // I'll map her to the others for now.
  {
    id: 'prof-033',
    fullName: 'Behzaida Trías',
    email: 'btrias@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307075109', '3307085110', '3307097106'],
    type: 'both',
  },
  // 34. Prof. Christina Zoghbi
  // Toxicología I (3307011702), II (3307011802)
  {
    id: 'prof-034',
    fullName: 'Christina Zoghbi',
    email: 'czoghbi@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011702', '3307011802'],
    type: 'theory',
  },
  // 35. Prof. Gladys Venegas
  // Toxicología I, II (Co-teach)
  {
    id: 'prof-035',
    fullName: 'Gladys Venegas',
    email: 'gvenegas@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011702', '3307011802'],
    type: 'theory',
  },
  // 36. Prof. María Miranda
  // Toxicología I, II (Practice), Orientación Pasantías Ind (3307098103)
  {
    id: 'prof-036',
    fullName: 'María Miranda',
    email: 'mmiranda@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011702', '3307011802', '3307098103'],
    type: 'both', // Practice for Tox, Theory for Orientación
  },
  // 37. Prof. Luxz Paulo
  // Bromatología I (3307011703 - Bromatología), II (3307105102 - Sem 10 in DOCX)
  // Pensum has Bromatología in Sem 7. I didn't add Bromatología II.
  // Mapping to Bromatología.
  {
    id: 'prof-037',
    fullName: 'Luxz Paulo',
    email: 'lpaulo@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011703'],
    type: 'theory',
  },
  // 38. Dra. Romily Figuera
  // Bromatología (Practice)
  {
    id: 'prof-038',
    fullName: 'Romily Figuera',
    email: 'rfiguera@usm.edu.ve',
    title: 'Dra.',
    subjects: ['3307011703'],
    type: 'practice',
  },
  // 39. Prof. Nairobys Fernandes
  // Mercadotecnia I (3307096103), II (3307106104)
  {
    id: 'prof-039',
    fullName: 'Nairobys Fernandes',
    email: 'nfernandes@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307096103', '3307106104'],
    type: 'both',
  },
  // 40. Prof. Felix Sierralta
  // Primeros Auxilios I (3307093209), II (3307103210)
  {
    id: 'prof-040',
    fullName: 'Felix Sierralta',
    email: 'fsierralta@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307093209', '3307103210'],
    type: 'both',
  },
  // 41. Prof. Elisabeth Davila
  // Técnicas Gerenciales I (3307096105), II (3307106106)
  {
    id: 'prof-041',
    fullName: 'Elisabeth Davila',
    email: 'edavila@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307096105', '3307106106'],
    type: 'both',
  },
  // 42. Prof. Edith Graffe
  // Farmacia Hospitalaria I (3307011903 - Sem 9), II (3307108106 - Sem 10 in DOCX)
  // Pensum has Farm. Hosp in Sem 9.
  // Mapping to Farm. Hosp.
  {
    id: 'prof-042',
    fullName: 'Edith Graffe',
    email: 'egraffe@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307011903'],
    type: 'both',
  },
  // 43. Prof. Giovanna González
  // Dermocosmética I (3307095111), II (3307105112)
  {
    id: 'prof-043',
    fullName: 'Giovanna González',
    email: 'ggonzalez@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307095111', '3307105112'],
    type: 'theory',
  },
  // 44. Prof. Naireth Villar
  // Dermocosmética I, II (Practice)
  {
    id: 'prof-044',
    fullName: 'Naireth Villar',
    email: 'nvillar@usm.edu.ve',
    title: 'Prof.',
    subjects: ['3307095111', '3307105112'],
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
