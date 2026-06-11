import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { PensumSubject, Professor } from '../../../shared/src/index';
import { ScheduleBlock, AcademicLoad } from '@/types/schedule';
import { slotLabel, turnoForSemester, defaultWindowForTurno } from '../lib/timeSlots';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? pdfFonts;

export interface SchedulePageConfig {
  semesterNumber: number;
  subjects: PensumSubject[];
  blocks: ScheduleBlock[];
  academicLoad?: AcademicLoad;
  professors?: Professor[];
  section?: string;
  /** Período académico para el encabezado (ej. "2026-01"). */
  academicPeriod?: string;
  /** Ubicación que aparece arriba a la derecha del encabezado. */
  locationLabel?: string;
}

const loadLogo = async (): Promise<string | null> => {
  let logoDataUrl: string | null = null;
  try {
    const response = await fetch('/logo_usm.png');
    if (response.ok) {
      const blob = await response.blob();
      logoDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn('Could not load logo for PDF', e);
  }
  return logoDataUrl;
};

/** Margen superior para centrar verticalmente el texto en celdas de alto fijo
 *  (pdfmake no soporta alineación vertical en tablas). rowSpan = filas que ocupa. */
const vCenter = (text: string, rowSpan: number, rowH: number): number => {
  const lines = String(text).split('\n').length;
  return Math.max(0, (rowSpan * rowH - lines * 9) / 2 - 2);
};

const buildSchedulePage = (
  config: SchedulePageConfig,
  logoDataUrl: string | null
): Content[] => {
  const {
    semesterNumber,
    subjects,
    blocks,
    academicLoad = {},
    professors = [],
    section = 'A',
    academicPeriod = '',
    locationLabel = 'UBICACIÓN NIVEL FERIA PISO 2'
  } = config;

  // ── Rango de filas: recorta hasta el ÚLTIMO bloque real (sin filas vacías al final).
  //    Arranca en el inicio del turno (o antes si hay un bloque más temprano). Si no hay
  //    bloques, usa la ventana del turno por defecto. ──
  const win = defaultWindowForTurno(turnoForSemester(semesterNumber));
  let rowLo = win.start;
  let rowHi = win.end;
  if (blocks.length > 0) {
    rowLo = Math.min(win.start, ...blocks.map((b) => b.startHour));
    rowHi = Math.max(...blocks.map((b) => b.startHour + b.duration - 1));
  }

  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

  // ── Build Schedule Grid ─────────────────────────────
  const coveredCells: Record<string, boolean> = {};
  const scheduleBody: TableCell[][] = [];

  scheduleBody.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map(d => ({ text: d, style: 'tableHeader', alignment: 'center' as const }))
  ]);

  for (let rowIndex = rowLo; rowIndex <= rowHi; rowIndex++) {
    const row: TableCell[] = [
      { text: slotLabel(rowIndex), alignment: 'center', fontSize: 7, margin: [0, vCenter(slotLabel(rowIndex), 1, 28), 0, 0] }
    ];

    for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
      const cellKey = `${dayIndex}-${rowIndex}`;

      if (coveredCells[cellKey]) {
        row.push({ text: '', fontSize: 7 });
        continue;
      }

      const block = blocks.find(b => b.day === dayIndex && b.startHour === rowIndex);

      if (block) {
        const subject = subjects.find(s => s.code === block.subjectCode);
        const subjName = subject?.name ?? block.subjectCode;
        // Teoría → "Nombre / Aula {n}"; Laboratorio → "Laboratorio / Nombre" (como el .docx).
        const cellText = block.type === 'LAB'
          ? `Laboratorio\n${subjName}`
          : `${subjName}\nAula${subject?.aula ? ' ' + subject.aula : ''}`;
        const span = block.duration > 1 ? block.duration : 1;
        if (span > 1) {
          for (let d = 1; d < span; d++) coveredCells[`${dayIndex}-${rowIndex + d}`] = true;
        }
        row.push({
          text: cellText,
          alignment: 'center',
          fontSize: 7,
          ...(span > 1 ? { rowSpan: span } : {}),
          margin: [0, vCenter(cellText, span, 28), 0, 0],
        });
      } else if (rowIndex === rowLo) {
        // Primera fila visible sin clase → franja fija reservada (como el .docx).
        const txt = 'EVALUACIONES Y ACTIVIDADES EXTRACÁTEDRA';
        row.push({ text: txt, alignment: 'center', fontSize: 5, italics: true, color: '#555555', margin: [0, vCenter(txt, 1, 28), 0, 0] });
      } else {
        row.push({ text: '', fontSize: 7 });
      }
    }

    scheduleBody.push(row);
  }

  // ── Build Summary Table ─────────────────────────────
  const summaryBody: TableCell[][] = [];

  summaryBody.push([
    { text: 'Código', style: 'tableHeader', alignment: 'center' },
    { text: 'Cátedra', style: 'tableHeader', alignment: 'center' },
    { text: 'Prof. Teoría', style: 'tableHeader', alignment: 'center' },
    { text: 'Prof. Práctica', style: 'tableHeader', alignment: 'center' },
    { text: 'N° Lab', style: 'tableHeader', alignment: 'center' },
    { text: 'Prelación', style: 'tableHeader', alignment: 'center' },
  ]);

  subjects.forEach(subject => {
    const load = academicLoad[subject.code] || {};
    
    const getProfNames = (ids?: string[] | string) => {
       const safeIds = Array.isArray(ids) ? ids : (typeof ids === 'string' ? [ids] : []);
       if (safeIds.length === 0) return '';
       if (!professors || professors.length === 0) return '';
       // Nombre con título (Prof./Dr./Dra.) como el .docx. Omite ids colgantes
       // (profesor borrado) en vez de imprimir el id crudo.
       return safeIds
         .map(id => professors.find(p => p.id === id))
         .filter((p): p is Professor => !!p)
         .map(p => `${p.title} ${p.fullName}`)
         .join(', ');
    };

    summaryBody.push([
      { text: subject.code, alignment: 'center', fontSize: 7 },
      { text: subject.name, alignment: 'center', fontSize: 7 },
      { text: getProfNames(load.theory), alignment: 'center', fontSize: 7 },
      // Materias teóricas (sin laboratorio) dejan la columna de práctica vacía.
      { text: subject.hoursLab > 0 ? getProfNames(load.lab) : '', alignment: 'center', fontSize: 7 },
      { text: subject.labNumber ? `# ${subject.labNumber}` : '', alignment: 'center', fontSize: 7 },
      { text: subject.prerequisites.join('\n') || '', alignment: 'center', fontSize: 7 },
    ]);
  });

  // ── Assemble Document ───────────────────────────────
  const headerContent: Content[] = [];

  if (logoDataUrl) {
    headerContent.push({
      image: logoDataUrl,
      width: 60,
      alignment: 'center',
      margin: [0, 0, 0, 5]
    });
  }

  headerContent.push(
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: academicPeriod ? `HORARIOS PERIODO ACADÉMICO ${academicPeriod}` : 'HORARIOS', style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 8] },
    {
      columns: [
        { text: `SEMESTRE ${semesterNumber}° SECCIÓN "${section}"`, bold: true, fontSize: 9 },
        { text: locationLabel, bold: true, fontSize: 9, alignment: 'right' }
      ],
      margin: [0, 0, 0, 6]
    }
  );

  return [
    ...headerContent,
    {
      table: {
        headerRows: 1,
        widths: [45, '*', '*', '*', '*', '*'],
        // Altura uniforme: todas las celdas del mismo tamaño (la cabecera un poco menor).
        heights: (row: number) => (row === 0 ? 16 : 28),
        body: scheduleBody,
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#999999',
        vLineColor: () => '#999999',
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    },
    { text: '', margin: [0, 10, 0, 0] }, // Spacer
    {
      table: {
        headerRows: 1,
        widths: [55, '*', '*', '*', 40, '*'],
        body: summaryBody,
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#999999',
        vLineColor: () => '#999999',
        paddingLeft: () => 3,
        paddingRight: () => 3,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
    },
  ];
};

const getBaseDocDefinition = (): TDocumentDefinitions => ({
  pageSize: 'LETTER',
  pageOrientation: 'landscape',
  pageMargins: [20, 20, 20, 20],
  styles: {
    docHeader: {
      fontSize: 10,
      bold: true,
    },
    tableHeader: {
      fontSize: 8,
      bold: true,
      fillColor: '#f0f0f0',
    },
  },
  content: [],
});

export const generateSchedulePdf = async (
  semesterNumber: number,
  subjects: PensumSubject[],
  blocks: ScheduleBlock[],
  academicLoad: AcademicLoad = {},
  professors: Professor[] = [],
  filename: string = 'Horario',
  section: string = 'A',
  academicPeriod: string = '',
  locationLabel: string = 'UBICACIÓN NIVEL FERIA PISO 2'
) => {
  const logoDataUrl = await loadLogo();
  const pageContent = buildSchedulePage(
    { semesterNumber, subjects, blocks, academicLoad, professors, section, academicPeriod, locationLabel },
    logoDataUrl
  );

  const docDefinition = getBaseDocDefinition();
  docDefinition.content = pageContent;

  const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdfMake.createPdf(docDefinition).download(finalName);
};

/** Contenido (una página) del horario semanal de UN profesor. Reutilizado por la
 *  exportación individual y la de todos los profesores. */
const buildProfessorPage = (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  logoDataUrl: string | null,
  academicPeriod = ''
): Content[] => {
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const myBlocks = blocks.filter((b) => b.professorId === professor.id);

  // Asignaturas que imparte: "Nombre (T-L) (sem°sec)" — T=teoría, L=lab.
  const subjMap: Record<string, { name: string; t: boolean; l: boolean; sem?: number; sec?: string }> = {};
  for (const b of myBlocks) {
    const m = subjMap[b.subjectCode] ?? (subjMap[b.subjectCode] = {
      name: subjects.find((s) => s.code === b.subjectCode)?.name ?? b.subjectCode,
      t: false, l: false, sem: b.semester, sec: b.section,
    });
    if (b.type === 'LAB') m.l = true; else m.t = true;
  }
  const asignaturas = Object.values(subjMap).map(
    (s) => `${s.name} (${s.t && s.l ? 'T-L' : s.l ? 'L' : 'T'}) (${s.sem ?? '?'}°${s.sec ?? 'A'})`,
  );

  const covered: Record<string, boolean> = {};
  const body: TableCell[][] = [];
  body.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map((d) => ({ text: d, style: 'tableHeader', alignment: 'center' as const })),
  ]);

  // Día COMPLETO (16 bloques, 7:00 → 7:00pm) como el formato de referencia.
  for (let row = 0; row <= 15; row++) {
    const r: TableCell[] = [{ text: slotLabel(row), alignment: 'center', fontSize: 7, bold: true, margin: [0, vCenter(slotLabel(row), 1, 26), 0, 0] }];
    for (let d = 0; d < 5; d++) {
      const key = `${d}-${row}`;
      if (covered[key]) {
        r.push({ text: '', fontSize: 7 });
        continue;
      }
      const block = myBlocks.find((b) => b.day === d && b.startHour === row);
      if (block) {
        const subj = subjects.find((s) => s.code === block.subjectCode);
        const nm = subj?.name ?? block.subjectCode;
        // Teoría → "Nombre / Aula {n}"; Laboratorio → "Laboratorio / Nombre".
        const txt = block.type === 'LAB'
          ? `Laboratorio\n${nm}`
          : `${nm}\nAula${subj?.aula ? ' ' + subj.aula : ''}`;
        const span = block.duration > 1 ? block.duration : 1;
        if (span > 1) {
          for (let k = 1; k < span; k++) covered[`${d}-${row + k}`] = true;
        }
        r.push({ text: txt, alignment: 'center', fontSize: 7, ...(span > 1 ? { rowSpan: span } : {}), margin: [0, vCenter(txt, span, 26), 0, 0] });
      } else {
        r.push({ text: '', fontSize: 7 });
      }
    }
    body.push(r);
  }

  // Total de horas semanales = suma de las duraciones de sus bloques.
  const totalHoras = myBlocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  const content: Content[] = [];
  if (logoDataUrl) content.push({ image: logoDataUrl, width: 70, alignment: 'center', margin: [0, 0, 0, 4] });
  content.push(
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIO DE CLASES DOCENTES', style: 'docHeader', alignment: 'center' },
    { text: academicPeriod ? `PERIODO ${academicPeriod}` : 'PERIODO', style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 12] },
    {
      columns: [
        { text: `Docente: ${professor.fullName.toUpperCase()}`, bold: true, fontSize: 11 },
        { text: professor.cedula ? `C.I. ${professor.cedula}` : '', bold: true, fontSize: 11, alignment: 'right' },
      ],
    },
    { text: [{ text: 'Asignaturas: ', bold: true }, asignaturas.join('\n                    ')], bold: true, fontSize: 11, margin: [0, 2, 0, 12] },
  );
  content.push({
    table: { headerRows: 1, widths: [55, '*', '*', '*', '*', '*'], heights: (row: number) => (row === 0 ? 16 : 26), body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#444444',
      vLineColor: () => '#444444',
      paddingLeft: () => 3,
      paddingRight: () => 3,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    },
  });
  // Total de horas, debajo del horario.
  content.push({ text: `TOTAL: ${totalHoras} HORAS`, bold: true, fontSize: 11, margin: [0, 8, 0, 0] });

  return content;
};

/** Horario semanal de UN profesor (todos sus bloques, todas las secciones/semestres). */
export const generateProfessorSchedulePdf = async (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  academicPeriod: string = '',
) => {
  const logoDataUrl = await loadLogo();
  const docDefinition = getBaseDocDefinition();
  docDefinition.pageOrientation = 'portrait'; // el horario docente va en vertical (como la referencia)
  docDefinition.content = buildProfessorPage(professor, blocks, subjects, logoDataUrl, academicPeriod);
  const safe = professor.fullName.replace(/[^a-zA-Z0-9]+/g, '_');

  // pdfmake 0.3.x: download() es async y usa file-saver internamente. Se mantiene
  // el await para propagar errores al llamador (a diferencia del antiguo
  // getBlob(callback), que en 0.3.x ya no recibe callback y no descargaba nada).
  await pdfMake.createPdf(docDefinition).download(`Horario_${safe}.pdf`);
};

/** Horario individual de CADA profesor (una página por profesor con bloques). */
export const generateAllProfessorsSchedulesPdf = async (
  professors: Professor[],
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  filename: string = 'Horarios_Profesores',
  academicPeriod: string = ''
) => {
  const logoDataUrl = await loadLogo();
  // Solo profesores que tienen al menos un bloque asignado.
  const withBlocks = professors.filter((p) => blocks.some((b) => b.professorId === p.id));
  if (withBlocks.length === 0) {
    throw new Error('Ningún profesor tiene clases asignadas.');
  }

  const allContent: Content[] = [];
  withBlocks.forEach((prof, index) => {
    allContent.push(...buildProfessorPage(prof, blocks, subjects, logoDataUrl, academicPeriod));
    if (index < withBlocks.length - 1) {
      allContent.push({ text: '', pageBreak: 'before' });
    }
  });

  const docDefinition = getBaseDocDefinition();
  docDefinition.pageOrientation = 'portrait'; // horario docente en vertical
  docDefinition.content = allContent;
  const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  await pdfMake.createPdf(docDefinition).download(finalName);
};

export const generateAllSchedulesPdf = async (
  configs: SchedulePageConfig[],
  filename: string = 'Todos_Los_Horarios'
) => {
  const logoDataUrl = await loadLogo();
  const docDefinition = getBaseDocDefinition();
  const allContent: Content[] = [];

  configs.forEach((config, index) => {
    const pageContent = buildSchedulePage(config, logoDataUrl);
    allContent.push(...pageContent);

    // Add page break after each schedule except the last one
    if (index < configs.length - 1) {
      allContent.push({ text: '', pageBreak: 'before' });
    }
  });

  docDefinition.content = allContent;

  const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdfMake.createPdf(docDefinition).download(finalName);
};
