/* Verifica que la EXPORTACIÓN A PDF genere un PDF válido de verdad, usando el
 * motor real (pdfmake) en modo servidor (PdfPrinter) con las mismas fuentes Roboto
 * y documentos equivalentes a PdfExportService (horario por profesor y general). */
const pdfFonts = require('pdfmake/build/vfs_fonts');
const vfs = (pdfFonts.pdfMake && pdfFonts.pdfMake.vfs) ? pdfFonts.pdfMake.vfs : pdfFonts;

const fonts = {
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
};
let PdfPrinter = require('pdfmake/js/printer');
PdfPrinter = PdfPrinter.default || PdfPrinter;
const printer = new PdfPrinter(fonts);

const TIME_SLOTS = ['7:00-7:45','7:45-8:30','8:30-9:15','9:15-10:00','10:00-10:45','10:45-11:30','11:30-12:15','12:15-1:00','1:00-1:45','1:45-2:30','2:30-3:15','3:15-4:00','4:00-4:45','4:45-5:30','5:30-6:15','6:15-7:00'];
const DAYS = ['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES'];

// Grilla semanal con un bloque rowSpan (igual estructura que el PDF real)
function gridBody(blocks) {
  const covered = {};
  const body = [[{ text: 'HORA', style: 'tableHeader' }, ...DAYS.map((d) => ({ text: d, style: 'tableHeader' }))]];
  TIME_SLOTS.forEach((label, row) => {
    const r = [{ text: label, fontSize: 7, alignment: 'center' }];
    for (let d = 0; d < 5; d++) {
      if (covered[`${d}-${row}`]) { r.push({ text: '', fontSize: 7 }); continue; }
      const b = blocks.find((x) => x.day === d && x.startHour === row);
      if (b) {
        if (b.duration > 1) { for (let k = 1; k < b.duration; k++) covered[`${d}-${row + k}`] = true; r.push({ text: b.text, fontSize: 6, alignment: 'center', rowSpan: b.duration }); }
        else r.push({ text: b.text, fontSize: 6, alignment: 'center' });
      } else r.push({ text: '', fontSize: 7 });
    }
    body.push(r);
  });
  return body;
}

const baseDef = (content) => ({
  pageSize: 'LETTER', pageOrientation: 'landscape', pageMargins: [20, 20, 20, 20],
  styles: { docHeader: { fontSize: 10, bold: true }, tableHeader: { fontSize: 8, bold: true, fillColor: '#f0f0f0' } },
  content,
});

function professorDoc() {
  return baseDef([
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIO DEL PROFESOR', style: 'docHeader', alignment: 'center' },
    { text: 'Dra. Test Profesor', bold: true, fontSize: 11, alignment: 'center', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], body: gridBody([{ day: 0, startHour: 2, duration: 2, text: 'Química\nTeoría · Sec A' }, { day: 2, startHour: 5, duration: 2, text: 'Física\nLab · Sec A' }]) } },
  ]);
}

function semesterDoc() {
  const summary = [[{ text: 'Código', style: 'tableHeader' }, { text: 'Cátedra', style: 'tableHeader' }, { text: 'Prof. Teoría', style: 'tableHeader' }, { text: 'Prof. Práctica', style: 'tableHeader' }, { text: 'N° Lab', style: 'tableHeader' }, { text: 'Prelación', style: 'tableHeader' }]];
  for (let i = 0; i < 5; i++) summary.push([{ text: '33070' + i, fontSize: 7 }, { text: 'Materia ' + i, fontSize: 7 }, { text: 'Prof. X', fontSize: 7 }, { text: 'Prof. Y', fontSize: 7 }, { text: '104', fontSize: 7 }, { text: '-', fontSize: 7 }]);
  return baseDef([
    { text: 'FACULTAD DE FARMACIA', style: 'docHeader', alignment: 'center' },
    { text: 'HORARIOS', style: 'docHeader', alignment: 'center', margin: [0, 0, 0, 8] },
    { table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], body: gridBody([{ day: 1, startHour: 0, duration: 3, text: 'Anatomía\nTeoría' }]) } },
    { text: '', margin: [0, 10, 0, 0] },
    { table: { headerRows: 1, widths: [55, '*', '*', '*', 40, '*'], body: summary } },
  ]);
}

async function render(name, def) {
  const doc = await printer.createPdfKitDocument(def);
  return new Promise((resolve) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      const okPdf = buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 1000;
      console.log(`  ${okPdf ? '✓' : '✗'} ${name}: ${okPdf ? 'PDF válido' : 'INVÁLIDO'} (${buf.length} bytes)`);
      resolve(okPdf);
    });
    doc.end();
  });
}

(async () => {
  console.log('EXPORTACIÓN A PDF (motor real pdfmake)');
  const a = await render('Horario por profesor (individual)', professorDoc());
  const b = await render('Horario del semestre (general)', semesterDoc());
  console.log(`\n${a && b ? '✅ Ambas exportaciones generan PDF válido' : '❌ Falló alguna'}`);
  process.exit(a && b ? 0 : 1);
})();
