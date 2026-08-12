import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { PensumSubject, Professor } from '../../../shared/src/index';
import { ScheduleBlock, AcademicLoad, AdminHour } from '@/types/schedule';
import { slotLabel, turnoForSemester, defaultWindowForTurno } from '../lib/timeSlots';
import { professorSubjectsList, professorWeeklyHours, blockCellText } from '../lib/professorSchedule';
import { LOGO_USM_DATA_URL } from '../assets/logoUsm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs ?? pdfFonts;

/**
 * Genera el PDF y lo guarda como archivo de forma CONFIABLE en navegador y en el
 * renderer de Electron.
 *
 * Antes se usaba `pdfMake.createPdf(dd).download(name)`. En pdfmake 0.3.x ese
 * `download()` a veces "resuelve" sin descargar nada (el usuario percibe que el
 * botón "no hace nada"). Aquí pedimos el Blob explícitamente y disparamos la
 * descarga con un <a download>, que funciona igual en ambos entornos.
 */
const savePdf = async (docDefinition: TDocumentDefinitions, filename: string): Promise<void> => {
  const finalName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  // pdfmake 0.3.x: getBlob() devuelve una Promise<Blob> (sin callback). Pedimos el
  // Blob y disparamos la descarga con un <a download> que controlamos nosotros.
  const blob = await pdfMake.createPdf(docDefinition).getBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberar el objeto URL tras un margen para que la descarga inicie.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

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

// Logo USM incrustado en el bundle (base64). Antes se cargaba con fetch('/logo_usm.png'),
// pero en el .exe la página corre bajo file:// y fetch() NO soporta file:// → el logo no
// aparecía en los PDF. Incrustado funciona igual en el .exe y en la web.
const loadLogo = async (): Promise<string | null> => LOGO_USM_DATA_URL;

/** Margen superior para centrar verticalmente el texto en celdas de alto fijo
 *  (pdfmake no soporta alineación vertical en tablas). rowSpan = filas que ocupa. */
const vCenter = (text: string, rowSpan: number, rowH: number): number => {
  const lines = String(text).split('\n').length;
  return Math.max(0, (rowSpan * rowH - lines * 9) / 2 - 2);
};

/** Normaliza un nombre (sin tildes, minúsculas) para deduplicar profesores repetidos. */
const norm = (s: string): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Cuenta las páginas de un doc pdfmake escaneando los marcadores /Type /Page del PDF. */
const countPages = async (dd: TDocumentDefinitions): Promise<number> => {
  const buf = await pdfMake.createPdf(dd).getBuffer();
  const s = new TextDecoder('latin1').decode(buf);
  return (s.match(/\/Type\s*\/Page(?![s])/g) || []).length;
};

/**
 * Devuelve el docDefinition con el rowH MÁS GRANDE (28→15) que hace caber el
 * horario en UNA sola página. Renderiza y cuenta páginas de forma incremental;
 * en la práctica corta a la 1ª o 2ª prueba (los semestres chicos entran a 28).
 */
const fitOnePageDoc = async (
  build: (rowH: number) => TDocumentDefinitions,
  startRowH = 28,
  minRowH = 15,
): Promise<TDocumentDefinitions> => {
  let last: TDocumentDefinitions | null = null;
  for (let rh = startRowH; rh >= minRowH; rh--) {
    const dd = build(rh);
    last = dd;
    if ((await countPages(dd)) === 1) return dd;
  }
  return last as TDocumentDefinitions;
};

const buildSchedulePage = (
  config: SchedulePageConfig,
  logoDataUrl: string | null,
  rowH: number = 28
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
  // Celdas ocupadas por algún bloque → para fusionar los "huecos" verticales en un solo
  // bloque "Actividad Extracátedra" (como se agrupan los laboratorios).
  const occupied: Record<string, boolean> = {};
  for (const b of blocks) {
    const sp = b.duration > 1 ? b.duration : 1;
    for (let k = 0; k < sp; k++) occupied[`${b.day}-${b.startHour + k}`] = true;
  }
  const scheduleBody: TableCell[][] = [];

  scheduleBody.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map(d => ({ text: d, style: 'tableHeader', alignment: 'center' as const }))
  ]);

  for (let rowIndex = rowLo; rowIndex <= rowHi; rowIndex++) {
    const row: TableCell[] = [
      { text: slotLabel(rowIndex), alignment: 'center', fontSize: 7, margin: [0, vCenter(slotLabel(rowIndex), 1, rowH), 0, 0] }
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
        // Salón por bloque (block.aula) tiene prioridad; si no, cae al lab/aula de la materia.
        // Así dos bloques de la misma materia pueden imprimir salones distintos (F1 y F2).
        const room = block.aula ?? (block.type === 'LAB' ? subject?.labNumber : subject?.aula);
        const cellText = block.type === 'LAB'
          ? `Laboratorio\n${subjName}${room ? '\n' + room : ''}`
          : `${subjName}\nAula${room ? ' ' + room : ''}`;
        const span = block.duration > 1 ? block.duration : 1;
        if (span > 1) {
          for (let d = 1; d < span; d++) coveredCells[`${dayIndex}-${rowIndex + d}`] = true;
        }
        row.push({
          text: cellText,
          alignment: 'center',
          fontSize: 7,
          ...(span > 1 ? { rowSpan: span } : {}),
          margin: [0, vCenter(cellText, span, rowH), 0, 0],
        });
      } else {
        // Hueco sin clase: fusionar el run VERTICAL de huecos en UNA sola celda (como los
        // laboratorios), en NEGRITA y más grande. Se corta al llegar a un bloque o al final.
        let runLen = 1;
        while (rowIndex + runLen <= rowHi && !occupied[`${dayIndex}-${rowIndex + runLen}`]) runLen++;
        for (let k = 1; k < runLen; k++) coveredCells[`${dayIndex}-${rowIndex + k}`] = true;
        const txt = 'Actividad Extracátedra';
        row.push({
          text: txt,
          alignment: 'center',
          bold: true,
          fontSize: 8,
          color: '#555555',
          ...(runLen > 1 ? { rowSpan: runLen } : {}),
          margin: [0, vCenter(txt, runLen, rowH), 0, 0],
        });
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
       // Nombre con título (Prof./Dr./Dra.). Omite ids colgantes (profesor borrado)
       // y DEDUPLICA por nombre normalizado: si quedaran registros repetidos del
       // mismo docente, no se imprime "Prof. X, Prof. X".
       const seen = new Set<string>();
       const out: string[] = [];
       for (const id of safeIds) {
         const p = professors.find(pp => pp.id === id);
         if (!p) continue;
         const key = norm(p.fullName);
         if (seen.has(key)) continue;
         seen.add(key);
         out.push(`${p.title} ${p.fullName}`);
       }
       return out.join(', ');
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
        // Altura uniforme; rowH lo ajusta fitOnePageDoc para que todo quepa en 1 hoja.
        heights: (row: number) => (row === 0 ? 16 : rowH),
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
  const config: SchedulePageConfig = {
    semesterNumber, subjects, blocks, academicLoad, professors, section, academicPeriod, locationLabel,
  };
  // Ajusta la altura de fila hasta que el horario + resumen quepan en UNA página.
  const docDefinition = await fitOnePageDoc((rowH) => {
    const dd = getBaseDocDefinition();
    dd.content = buildSchedulePage(config, logoDataUrl, rowH);
    return dd;
  });

  await savePdf(docDefinition, filename);
};

/** Contenido (una página) del horario semanal de UN profesor. Reutilizado por la
 *  exportación individual y la de todos los profesores. */
const buildProfessorPage = (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  logoDataUrl: string | null,
  academicPeriod = '',
  adminHours: AdminHour[] = [],
  rowH = 26
): Content[] => {
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const myBlocks = blocks.filter((b) => b.professorId === professor.id);
  // Horas administrativas de ESTE profesor (Jefe de Departamento, Servicio Comunitario…).
  // Van APARTE de las clases: se pintan distinguidas y suman al total.
  const myAdmin = adminHours.filter((a) => a.professorId === professor.id);
  // Asignaturas que imparte: del helper compartido con la vista en pantalla
  // (lib/professorSchedule) → PDF y pantalla coinciden siempre.
  const asignaturas = professorSubjectsList(professor.id, blocks, subjects);

  const covered: Record<string, boolean> = {};
  const body: TableCell[][] = [];
  body.push([
    { text: 'HORA', style: 'tableHeader', alignment: 'center' },
    ...days.map((d) => ({ text: d, style: 'tableHeader', alignment: 'center' as const })),
  ]);

  // Día 7:00→7:00pm por defecto, pero se EXTIENDE si el profesor tiene clases o admin más
  // tarde (antes se cortaba en la fila 15 = 7pm y se perdían). Tope: fila 19 (10pm, MAX_SLOT).
  const lastRow = Math.min(
    19,
    Math.max(15, ...myBlocks.map((b) => b.startHour + b.duration - 1), ...myAdmin.map((a) => a.startHour + a.duration - 1)),
  );
  for (let row = 0; row <= lastRow; row++) {
    const r: TableCell[] = [{ text: slotLabel(row), alignment: 'center', fontSize: 7, bold: true, margin: [0, vCenter(slotLabel(row), 1, rowH), 0, 0] }];
    for (let d = 0; d < 5; d++) {
      const key = `${d}-${row}`;
      if (covered[key]) {
        r.push({ text: '', fontSize: 7 });
        continue;
      }
      // TODAS las clases que arrancan en esta franja (no ocultar choques de la misma
      // hora: se apilan en la celda). Mismo texto que la pantalla vía blockCellText.
      const here = myBlocks.filter((b) => b.day === d && b.startHour === row);
      const adminHere = myAdmin.filter((a) => a.day === d && a.startHour === row);
      if (here.length > 0) {
        const txt = here.map((b) => blockCellText(b, subjects)).join('\n──\n');
        // Clamp del rowSpan a la última fila de la grilla: un bloque no debe extenderse
        // fuera de ella o pdfmake crashea ("Cannot set properties of undefined").
        const rawSpan = Math.max(...here.map((b) => (b.duration > 1 ? b.duration : 1)));
        const span = Math.min(rawSpan, lastRow + 1 - row);
        if (span > 1) {
          for (let k = 1; k < span; k++) covered[`${d}-${row + k}`] = true;
        }
        r.push({ text: txt, alignment: 'center', fontSize: 7, ...(span > 1 ? { rowSpan: span } : {}), margin: [0, vCenter(txt, span, rowH), 0, 0] });
      } else if (adminHere.length > 0) {
        // Hora administrativa: celda DISTINGUIDA (fondo gris + "ADMINISTRATIVO" en negrita).
        const txt = adminHere.map((a) => `ADMINISTRATIVO\n${a.role}`).join('\n──\n');
        const rawSpan = Math.max(...adminHere.map((a) => (a.duration > 1 ? a.duration : 1)));
        const span = Math.min(rawSpan, lastRow + 1 - row);
        if (span > 1) {
          for (let k = 1; k < span; k++) covered[`${d}-${row + k}`] = true;
        }
        r.push({ text: txt, alignment: 'center', fontSize: 7, bold: true, color: '#1e293b', fillColor: '#e2e8f0', ...(span > 1 ? { rowSpan: span } : {}), margin: [0, vCenter(txt, span, rowH), 0, 0] });
      } else {
        r.push({ text: '', fontSize: 7 });
      }
    }
    body.push(r);
  }

  // Total de horas semanales = clases + administrativas (ambas suman, helper compartido).
  const totalClase = professorWeeklyHours(professor.id, blocks);
  const totalAdmin = myAdmin.reduce((s, a) => s + (a.duration || 0), 0);
  const totalHoras = totalClase + totalAdmin;

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
    table: { headerRows: 1, widths: [55, '*', '*', '*', '*', '*'], heights: (row: number) => (row === 0 ? 16 : rowH), body },
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
  // Total de horas, debajo del horario. Con desglose si hay administrativas.
  const totalTxt =
    totalAdmin > 0
      ? `TOTAL: ${totalHoras} HORAS  (${totalClase} de clase + ${totalAdmin} administrativas)`
      : `TOTAL: ${totalHoras} HORAS`;
  content.push({ text: totalTxt, bold: true, fontSize: 11, margin: [0, 8, 0, 0] });

  return content;
};

/** Horario semanal de UN profesor (todos sus bloques, todas las secciones/semestres). */
export const generateProfessorSchedulePdf = async (
  professor: Professor,
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  academicPeriod: string = '',
  adminHours: AdminHour[] = [],
) => {
  const logoDataUrl = await loadLogo();
  // Ajusta la altura de fila hasta que TODO el horario docente quepa en UNA página.
  const docDefinition = await fitOnePageDoc((rowH) => {
    const dd = getBaseDocDefinition();
    dd.pageOrientation = 'portrait'; // el horario docente va en vertical (como la referencia)
    dd.content = buildProfessorPage(professor, blocks, subjects, logoDataUrl, academicPeriod, adminHours, rowH);
    return dd;
  }, 26, 12);
  const safe = professor.fullName.replace(/[^a-zA-Z0-9]+/g, '_');
  await savePdf(docDefinition, `Horario_${safe}`);
};

/** Horario individual de CADA profesor (una página por profesor con bloques). */
export const generateAllProfessorsSchedulesPdf = async (
  professors: Professor[],
  blocks: ScheduleBlock[],
  subjects: PensumSubject[],
  filename: string = 'Horarios_Profesores',
  academicPeriod: string = '',
  adminHours: AdminHour[] = []
) => {
  const logoDataUrl = await loadLogo();
  // Profesores que tienen al menos un bloque de clase O alguna hora administrativa.
  const withBlocks = professors.filter(
    (p) => blocks.some((b) => b.professorId === p.id) || adminHours.some((a) => a.professorId === p.id),
  );
  if (withBlocks.length === 0) {
    throw new Error('Ningún profesor tiene clases asignadas.');
  }

  const allContent: Content[] = [];
  for (let index = 0; index < withBlocks.length; index++) {
    const prof = withBlocks[index];
    // rowH que hace caber la página de ESTE profesor en 1 hoja (cada uno se ajusta solo).
    let rowH = 12;
    for (let rh = 26; rh >= 12; rh--) {
      const probe = getBaseDocDefinition();
      probe.pageOrientation = 'portrait';
      probe.content = buildProfessorPage(prof, blocks, subjects, logoDataUrl, academicPeriod, adminHours, rh);
      if ((await countPages(probe)) === 1) { rowH = rh; break; }
    }
    allContent.push(...buildProfessorPage(prof, blocks, subjects, logoDataUrl, academicPeriod, adminHours, rowH));
    if (index < withBlocks.length - 1) {
      allContent.push({ text: '', pageBreak: 'before' });
    }
  }

  const docDefinition = getBaseDocDefinition();
  docDefinition.pageOrientation = 'portrait'; // horario docente en vertical
  docDefinition.content = allContent;
  await savePdf(docDefinition, filename);
};

export const generateAllSchedulesPdf = async (
  configs: SchedulePageConfig[],
  filename: string = 'Todos_Los_Horarios'
) => {
  const logoDataUrl = await loadLogo();
  const docDefinition = getBaseDocDefinition();
  const allContent: Content[] = [];

  for (let index = 0; index < configs.length; index++) {
    const config = configs[index];
    // rowH que hace caber ESTE semestre en una sola hoja (cada página se ajusta sola).
    let rowH = 15;
    for (let rh = 28; rh >= 15; rh--) {
      const probe = getBaseDocDefinition();
      probe.content = buildSchedulePage(config, logoDataUrl, rh);
      if ((await countPages(probe)) === 1) { rowH = rh; break; }
    }
    allContent.push(...buildSchedulePage(config, logoDataUrl, rowH));

    // Salto de página tras cada horario excepto el último.
    if (index < configs.length - 1) {
      allContent.push({ text: '', pageBreak: 'before' });
    }
  }

  docDefinition.content = allContent;

  await savePdf(docDefinition, filename);
};
