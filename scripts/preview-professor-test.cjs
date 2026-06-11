/* Render de PRUEBA: HORARIO DE CLASES DOCENTES (vista por profesor) con el formato de
 * referencia (fondo claro). Inyecta un profe de prueba en varias materias de la semana. */
const { readFileSync, writeFileSync, mkdirSync, createWriteStream } = require('fs');
const os = require('os');
const path = require('path');
const PdfPrinter = require('pdfmake/js/Printer.js').default;

const env = Object.fromEntries(
  readFileSync(path.join(__dirname, '..', 'src', 'frontend', '.env'), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const H = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` };
const get = async (p) => (await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${p}`, { headers: H })).json();
const fmt = (t) => { const h24 = Math.floor(t / 60) % 24, m = t % 60, h12 = ((h24 + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, '0')}`; };
const slotLabel = (i) => { const s = 7 * 60 + i * 45; return `${fmt(s)}-${fmt(s + 45)}`; };
const vCenter = (text, rowSpan, rowH) => { const lines = String(text).split('\n').length; return Math.max(0, (rowSpan * rowH - lines * 9) / 2 - 2); };
const AULAS = { '3307011103': '209', '3307012101': '201' }; // aulas de prueba (la base aún no tiene la columna)

(async () => {
  const PERIOD = '2026-01';
  const prof = { id: 'test-1', fullName: 'Juan Pérez', cedula: '12.345.678' };
  // El profe de prueba dará estas materias (teoría + lab):
  const MY_SUBJECTS = ['3307011103', '3307012101']; // Física Aplicada I, Química Básica I

  const subjRows = await get('subjects?select=code,name,lab_number');
  const subjName = new Map(subjRows.map((s) => [s.code, s.name]));
  const raw = await get('schedule_blocks?select=*&deleted_at=is.null');
  const blocks = raw
    .filter((b) => MY_SUBJECTS.includes(b.subject_code))
    .map((b) => ({ subjectCode: b.subject_code, day: b.day, startHour: b.start_hour, duration: b.duration, type: b.type, section: b.section, semester: b.semester }));

  // ── Asignaturas que imparte: "Nombre (T-L) (sem°sec)" ──
  const sm = {};
  for (const b of blocks) {
    const k = b.subjectCode;
    if (!sm[k]) sm[k] = { name: subjName.get(k) ?? k, t: false, l: false, sem: b.semester, sec: b.section };
    if (b.type === 'LAB') sm[k].l = true; else sm[k].t = true;
  }
  const asignaturas = Object.values(sm).map((s) => `${s.name} (${s.t && s.l ? 'T-L' : s.l ? 'L' : 'T'}) (${s.sem ?? '?'}°${s.sec ?? 'A'})`);

  // ── Grilla DÍA COMPLETO (16 bloques, 7:00 → 7:00pm) ──
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const covered = {};
  const body = [[{ text: 'HORA', style: 'th' }, ...days.map((d) => ({ text: d, style: 'th' }))]];
  for (let row = 0; row <= 15; row++) {
    const r = [{ text: slotLabel(row), alignment: 'center', fontSize: 7, bold: true, margin: [0, vCenter(slotLabel(row), 1, 26), 0, 0] }];
    for (let d = 0; d < 5; d++) {
      if (covered[`${d}-${row}`]) { r.push({ text: '', fontSize: 7 }); continue; }
      const blk = blocks.find((b) => b.day === d && b.startHour === row);
      if (blk) {
        const nm = subjName.get(blk.subjectCode) ?? blk.subjectCode;
        const aula = AULAS[blk.subjectCode];
        const txt = blk.type === 'LAB' ? `Laboratorio\n${nm}` : `${nm}\nAula${aula ? ' ' + aula : ''}`;
        const span = blk.duration > 1 ? blk.duration : 1;
        if (span > 1) { for (let k = 1; k < span; k++) covered[`${d}-${row + k}`] = true; }
        r.push({ text: txt, alignment: 'center', fontSize: 7, ...(span > 1 ? { rowSpan: span } : {}), margin: [0, vCenter(txt, span, 26), 0, 0] });
      } else r.push({ text: '', fontSize: 7 });
    }
    body.push(r);
  }
  const totalHoras = blocks.reduce((s, b) => s + (b.duration || 0), 0);

  const L = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#444', vLineColor: () => '#444' };
  const logo = readFileSync(path.join(__dirname, '..', 'src', 'frontend', 'public', 'logo_usm.png')).toString('base64');
  const dd = {
    pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [30, 20, 30, 20],
    content: [
      { image: 'data:image/png;base64,' + logo, width: 70, alignment: 'center', margin: [0, 0, 0, 4] },
      { text: 'FACULTAD DE FARMACIA', bold: true, fontSize: 11, alignment: 'center' },
      { text: 'HORARIO DE CLASES DOCENTES', bold: true, fontSize: 11, alignment: 'center' },
      { text: `PERIODO ${PERIOD}`, bold: true, fontSize: 11, alignment: 'center', margin: [0, 0, 0, 12] },
      { columns: [
        { text: `Docente: ${prof.fullName.toUpperCase()}`, bold: true, fontSize: 11 },
        { text: `C.I. ${prof.cedula}`, bold: true, fontSize: 11, alignment: 'right' },
      ] },
      { text: [{ text: 'Asignaturas: ', bold: true }, asignaturas.join('\n                    ')], fontSize: 11, bold: true, margin: [0, 2, 0, 12] },
      { table: { headerRows: 1, widths: [55, '*', '*', '*', '*', '*'], heights: (r) => (r === 0 ? 16 : 26), body }, layout: L },
      { text: `TOTAL: ${totalHoras} HORAS`, bold: true, fontSize: 11, margin: [0, 8, 0, 0] },
    ],
    styles: { th: { fontSize: 8, bold: true, fillColor: '#e8e8e8', alignment: 'center' } },
    defaultStyle: { font: 'Roboto' },
  };
  const vfs = require('pdfmake/build/vfs_fonts.js');
  const fdir = path.join(os.tmpdir(), 'pdffonts'); mkdirSync(fdir, { recursive: true });
  for (const f of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf']) writeFileSync(path.join(fdir, f), Buffer.from(vfs[f], 'base64'));
  const printer = new PdfPrinter({ Roboto: { normal: path.join(fdir, 'Roboto-Regular.ttf'), bold: path.join(fdir, 'Roboto-Medium.ttf'), italics: path.join(fdir, 'Roboto-Italic.ttf'), bolditalics: path.join(fdir, 'Roboto-MediumItalic.ttf') } });
  const out = path.join('C:', 'Users', 'euger', 'OneDrive', 'Escritorio', 'Horario-profesor-prueba.pdf');
  const doc = await printer.createPdfKitDocument(dd);
  const stream = createWriteStream(out);
  doc.pipe(stream); doc.end();
  await new Promise((res) => stream.on('finish', res));
  console.log('PDF escrito en:', out, '| clases:', blocks.length, '| horas:', totalHoras, '| asignaturas:', asignaturas.length);
})();
