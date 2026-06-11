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
    section = 'A'
  } = config;

  // ── Rango de filas: ventana del turno + lo que usen los bloques (sin sobra) ──
  const win = defaultWindowForTurno(turnoForSemester(semesterNumber));
  let rowLo = win.start;
  let rowHi = win.end;
  for (const b of blocks) {
    if (b.startHour < rowLo) rowLo = b.startHour;
    const end = b.startHour + b.duration - 1;
    if (end > rowHi) rowHi = end;
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
      { text: slotLabel(rowIndex), alignment: 'center', fontSize: 7 }
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
        const cellText = subject ? `${subject.name}\n(Aula-F3)` : block.subjectCode;

        if (block.duration > 1) {
          for (let d = 1; d < block.duration; d++) {
            coveredCells[`${dayIndex}-${rowIndex + d}`] = true;
          }
          row.push({
            text: cellText,
            alignment: 'center',
            fontSize: 7,
            rowSpan: block.duration
          });
        } else {
          row.push({ text: cellText, alignment: 'center', fontSize: 7 });
        }
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
       // Omite ids colgantes (profesor borrado) en vez de imprimir el id crudo.
       return safeIds.map(id => professors.find(p => p.id === id)?.fullName).filter(Boolean).join(', ');
    };

    summaryBody.push([
      { text: subject.code, alignment: 'center', fontSize: 7 },
      { text: subject.name, alignment: 'center', fontSize: 7 },
      { text: getProfNames(load.theory), alignment: 'center', fontSize: 7 },
      // Materias teóricas (sin laboratorio) dejan la columna de práctica vacía.
      { text: subject.hoursLab > 0 ? getProfNames(load.lab) : '', alignment: 'center', fontSize: 7 },
      { text: subject.labNumber || '', alignment: 'center', fontSize: 7 },
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
    { text: `HORARIOS`, style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 8] },
    {
      columns: [
        { text: `SEMESTRE ${semesterNumber}° SECCIÓN "${section}"`, bold: true, fontSize: 9 },
        { text: 'UBICACIÓN NIVEL FERIA PISO 2', bold: true, fontSize: 9, alignment: 'right' }
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
  section: string = 'A'
) => {
  const logoDataUrl = await loadLogo();
  const pageContent = buildSchedulePage(
    { semesterNumber, subjects, blocks, academicLoad, professors, section },
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
  logoDataUrl: string | null
): Content[] => {
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const myBlocks = blocks.filter((b) => b.professorId === professor.id);

  // Rango de filas según las clases del profesor (puede incluir noche). Fallback 7am-7pm.
  let rowLo = Infinity, rowHi = -Infinity;
  for (const b of myBlocks) {
    if (b.startHour < rowLo) rowLo = b.startHour;
    const end = b.startHour + b.duration - 1;
    if (end > rowHi) rowHi = end;
  }
  if (!myBlocks.length) { rowLo = 0; rowHi = 15; }

  const covered: Record<string, boolean> = {};
  const body: TableCell[][] = [];
  body.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map((d) => ({ text: d, style: 'tableHeader', alignment: 'center' as const })),
  ]);

  for (let row = rowLo; row <= rowHi; row++) {
    const r: TableCell[] = [{ text: slotLabel(row), alignment: 'center', fontSize: 7 }];
    for (let d = 0; d < 5; d++) {
      const key = `${d}-${row}`;
      if (covered[key]) {
        r.push({ text: '', fontSize: 7 });
        continue;
      }
      const block = myBlocks.find((b) => b.day === d && b.startHour === row);
      if (block) {
        const subj = subjects.find((s) => s.code === block.subjectCode);
        const tipo = block.type === 'LAB' ? 'Lab' : 'Teoría';
        const sec = block.section ? ` · Sec ${block.section}` : '';
        const txt = `${subj?.name ?? block.subjectCode}\n${tipo}${sec}`;
        if (block.duration > 1) {
          for (let k = 1; k < block.duration; k++) covered[`${d}-${row + k}`] = true;
          r.push({ text: txt, alignment: 'center', fontSize: 6, rowSpan: block.duration });
        } else {
          r.push({ text: txt, alignment: 'center', fontSize: 6 });
        }
      } else {
        r.push({ text: '', fontSize: 7 });
      }
    }
    body.push(r);
  }

  // Total de horas semanales = suma de las duraciones de sus bloques.
  const totalHoras = myBlocks.reduce((sum, b) => sum + (b.duration || 0), 0);

  const content: Content[] = [];
  if (logoDataUrl) content.push({ image: logoDataUrl, width: 50, alignment: 'center', margin: [0, 0, 0, 5] });
  content.push(
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIO DEL PROFESOR', style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 8] },
  );
  // Identificación alineada a la izquierda: nombre arriba, cédula debajo.
  content.push({ text: `${professor.title} ${professor.fullName}`, bold: true, fontSize: 12, alignment: 'left' });
  if (professor.cedula) {
    content.push({ text: `C.I. ${professor.cedula}`, fontSize: 9, color: '#555555', alignment: 'left', margin: [0, 1, 0, 0] });
  }
  content.push({
    table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], body },
    margin: [0, 8, 0, 0],
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
  });
  // Total de horas, debajo del horario.
  content.push({
    text: `Total de horas semanales: ${totalHoras}`,
    bold: true,
    fontSize: 10,
    alignment: 'right',
    margin: [0, 8, 0, 0],
  });

  return content;
};

/** Horario semanal de UN profesor (todos sus bloques, todas las secciones/semestres). */
export const generateProfessorSchedulePdf = async (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
) => {
  const logoDataUrl = await loadLogo();
  const docDefinition = getBaseDocDefinition();
  docDefinition.content = buildProfessorPage(professor, blocks, subjects, logoDataUrl);
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
  filename: string = 'Horarios_Profesores'
) => {
  const logoDataUrl = await loadLogo();
  // Solo profesores que tienen al menos un bloque asignado.
  const withBlocks = professors.filter((p) => blocks.some((b) => b.professorId === p.id));
  if (withBlocks.length === 0) {
    throw new Error('Ningún profesor tiene clases asignadas.');
  }

  const allContent: Content[] = [];
  withBlocks.forEach((prof, index) => {
    allContent.push(...buildProfessorPage(prof, blocks, subjects, logoDataUrl));
    if (index < withBlocks.length - 1) {
      allContent.push({ text: '', pageBreak: 'before' });
    }
  });

  const docDefinition = getBaseDocDefinition();
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
