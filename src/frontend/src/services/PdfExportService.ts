import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { saveAs } from 'file-saver';
import { PensumSubject, Professor } from '../../../shared/src/index';
import { ScheduleBlock, AcademicLoad } from '@/types/schedule';

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

  // ── Time Slots ──────────────────────────────────────
  const timeSlots = [
    '7:00-7:45', '7:45-8:30', '8:30-9:15', '9:15-10:00',
    '10:00-10:45', '10:45-11:30', '11:30-12:15', '12:15-1:00',
    '1:00-1:45', '1:45-2:30', '2:30-3:15', '3:15-4:00',
    '4:00-4:45', '4:45-5:30'
  ];

  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

  // ── Build Schedule Grid ─────────────────────────────
  const coveredCells: Record<string, boolean> = {};
  const scheduleBody: TableCell[][] = [];

  scheduleBody.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map(d => ({ text: d, style: 'tableHeader', alignment: 'center' as const }))
  ]);

  timeSlots.forEach((timeLabel, rowIndex) => {
    const row: TableCell[] = [
      { text: timeLabel, alignment: 'center', fontSize: 7 }
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
  });

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
       if (!professors || professors.length === 0) return safeIds.join(', ');
       return safeIds.map(id => professors.find(p => p.id === id)?.fullName || id).join(', ');
    };

    summaryBody.push([
      { text: subject.code, alignment: 'center', fontSize: 7 },
      { text: subject.name, alignment: 'center', fontSize: 7 },
      { text: getProfNames(load.theory), alignment: 'center', fontSize: 7 },
      { text: getProfNames(load.lab), alignment: 'center', fontSize: 7 },
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

/** Horario semanal de UN profesor (todos sus bloques, todas las secciones/semestres). */
export const generateProfessorSchedulePdf = async (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
) => {
  const logoDataUrl = await loadLogo();

  const timeSlots = [
    '7:00-7:45', '7:45-8:30', '8:30-9:15', '9:15-10:00',
    '10:00-10:45', '10:45-11:30', '11:30-12:15', '12:15-1:00',
    '1:00-1:45', '1:45-2:30', '2:30-3:15', '3:15-4:00',
    '4:00-4:45', '4:45-5:30', '5:30-6:15', '6:15-7:00',
  ];
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const myBlocks = blocks.filter((b) => b.professorId === professor.id);

  const covered: Record<string, boolean> = {};
  const body: TableCell[][] = [];
  body.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map((d) => ({ text: d, style: 'tableHeader', alignment: 'center' as const })),
  ]);

  timeSlots.forEach((label, row) => {
    const r: TableCell[] = [{ text: label, alignment: 'center', fontSize: 7 }];
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
  });

  const content: Content[] = [];
  if (logoDataUrl) content.push({ image: logoDataUrl, width: 50, alignment: 'center', margin: [0, 0, 0, 5] });
  content.push(
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIO DEL PROFESOR', style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 4] },
    { text: `${professor.title} ${professor.fullName}`, bold: true, fontSize: 11, alignment: 'center', margin: [0, 0, 0, 8] },
    {
      table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], body },
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
  );

  const docDefinition = getBaseDocDefinition();
  docDefinition.content = content;
  const safe = professor.fullName.replace(/[^a-zA-Z0-9]+/g, '_');

  // getBlob + file-saver: descarga confiable en navegador/Electron y permite
  // await + manejo de errores (a diferencia de .download(), que es fire-and-forget).
  await new Promise<void>((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pdfMake.createPdf(docDefinition) as any).getBlob((blob: Blob) => {
        saveAs(blob, `Horario_${safe}.pdf`);
        resolve();
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
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
