/* Render de PRUEBA: horario Sem 1/Sec A con un PROFESOR DE PRUEBA inyectado (no toca
 * la base — la base está vacía). Muestra cómo se ve el PDF exportado con un profe
 * asignado. Sale en el Escritorio como "Horario-prueba.pdf". */
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
const win = (n) => (n <= 4 ? { start: 0, end: 7 } : { start: 8, end: 17 });
const vCenter = (text, rowSpan, rowH) => { const lines = String(text).split('\n').length; return Math.max(0, (rowSpan * rowH - lines * 9) / 2 - 2); };
const AULAS = { '3307011103': '209', '3307011105': '305', '3307011108': '203', '3307011101': '110', '3307012101': '201', '3307014213': '101' };

(async () => {
  const SEM = 1, SEC = 'A', PERIOD = '2026-01', LOCATION = 'UBICACIÓN NIVEL FERIA PISO 2';

  // Profesor de PRUEBA (inyectado, no está en la base):
  const profs = [{ id: 'test-1', full_name: 'Juan Pérez', title: 'Prof.', type: 'both' }];

  const [subjRows, blocksAll] = await Promise.all([
    get('subjects?select=*&semester=eq.' + SEM + '&deleted_at=is.null'),
    get(`schedule_blocks?select=*&semester=eq.${SEM}&section=eq.${SEC}&deleted_at=is.null`),
  ]);
  const subjects = subjRows.map((r) => ({ code: r.code, name: r.name, hoursLab: r.hours_lab ?? 0, labNumber: r.lab_number ?? '', prerequisites: r.prerequisites ?? [] }));
  const blocks = blocksAll.map((b) => ({ subjectCode: b.subject_code, day: b.day, startHour: b.start_hour, duration: b.duration, type: b.type }));

  // Asignamos el profe de prueba: teoría de TODAS, y lab de las que tienen laboratorio.
  const academicLoad = {};
  for (const s of subjects) academicLoad[s.code] = { theory: ['test-1'], lab: s.hoursLab > 0 ? ['test-1'] : [] };

  const getProfNames = (ids) => (ids || []).map((id) => profs.find((p) => p.id === id)).filter(Boolean).map((p) => `${p.title} ${p.full_name}`).join(', ');

  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const w = win(SEM); let lo = w.start, hi = w.end;
  if (blocks.length) { lo = Math.min(w.start, ...blocks.map((b) => b.startHour)); hi = Math.max(...blocks.map((b) => b.startHour + b.duration - 1)); }
  const covered = {}; const body = [[{ text: 'HORA', style: 'th' }, ...days.map((d) => ({ text: d, style: 'th' }))]];
  for (let row = lo; row <= hi; row++) {
    const r = [{ text: slotLabel(row), alignment: 'center', fontSize: 7, margin: [0, vCenter(slotLabel(row), 1, 28), 0, 0] }];
    for (let d = 0; d < 5; d++) {
      if (covered[`${d}-${row}`]) { r.push({ text: '', fontSize: 7 }); continue; }
      const blk = blocks.find((b) => b.day === d && b.startHour === row);
      if (blk) {
        const nm = subjects.find((s) => s.code === blk.subjectCode)?.name ?? blk.subjectCode;
        const aula = AULAS[blk.subjectCode];
        const txt = blk.type === 'LAB' ? `Laboratorio\n${nm}` : `${nm}\nAula${aula ? ' ' + aula : ''}`;
        const span = blk.duration > 1 ? blk.duration : 1;
        if (span > 1) { for (let k = 1; k < span; k++) covered[`${d}-${row + k}`] = true; }
        r.push({ text: txt, alignment: 'center', fontSize: 7, ...(span > 1 ? { rowSpan: span } : {}), margin: [0, vCenter(txt, span, 28), 0, 0] });
      } else if (row === lo) { const t = 'EVALUACIONES Y ACTIVIDADES EXTRACÁTEDRA'; r.push({ text: t, alignment: 'center', fontSize: 5, italics: true, color: '#555', margin: [0, vCenter(t, 1, 28), 0, 0] }); }
      else r.push({ text: '', fontSize: 7 });
    }
    body.push(r);
  }
  const sBody = [['Código', 'Cátedra', 'Prof. Teoría', 'Prof. Práctica', 'N° Lab', 'Prelación'].map((t) => ({ text: t, style: 'th' }))];
  for (const s of subjects) {
    const l = academicLoad[s.code] || {};
    sBody.push([
      { text: s.code, alignment: 'center', fontSize: 7 },
      { text: s.name, alignment: 'center', fontSize: 7 },
      { text: getProfNames(l.theory), alignment: 'center', fontSize: 7 },
      { text: s.hoursLab > 0 ? getProfNames(l.lab) : '', alignment: 'center', fontSize: 7 },
      { text: s.labNumber ? `# ${s.labNumber}` : '', alignment: 'center', fontSize: 7 },
      { text: (s.prerequisites || []).join('\n'), alignment: 'center', fontSize: 7 },
    ]);
  }
  const L = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#999', vLineColor: () => '#999' };
  const logo = readFileSync(path.join(__dirname, '..', 'src', 'frontend', 'public', 'logo_usm.png')).toString('base64');
  const dd = {
    pageSize: 'LETTER', pageOrientation: 'landscape', pageMargins: [20, 20, 20, 20],
    content: [
      { image: 'data:image/png;base64,' + logo, width: 60, alignment: 'center', margin: [0, 0, 0, 5] },
      { text: 'FACULTAD DE FARMACIA', bold: true, fontSize: 10, alignment: 'center' },
      { text: `HORARIOS PERIODO ACADÉMICO ${PERIOD}`, bold: true, fontSize: 10, alignment: 'center', margin: [0, 0, 0, 8] },
      { columns: [{ text: `SEMESTRE ${SEM}° SECCIÓN "${SEC}"`, bold: true, fontSize: 9 }, { text: LOCATION, bold: true, fontSize: 9, alignment: 'right' }], margin: [0, 0, 0, 6] },
      { table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], heights: (r) => (r === 0 ? 16 : 28), body }, layout: L },
      { text: '', margin: [0, 10, 0, 0] },
      { table: { headerRows: 1, widths: [55, '*', '*', '*', 40, '*'], body: sBody }, layout: L },
    ],
    styles: { th: { fontSize: 8, bold: true, fillColor: '#f0f0f0', alignment: 'center' } },
    defaultStyle: { font: 'Roboto' },
  };
  const vfs = require('pdfmake/build/vfs_fonts.js');
  const fdir = path.join(os.tmpdir(), 'pdffonts'); mkdirSync(fdir, { recursive: true });
  for (const f of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf']) writeFileSync(path.join(fdir, f), Buffer.from(vfs[f], 'base64'));
  const printer = new PdfPrinter({ Roboto: { normal: path.join(fdir, 'Roboto-Regular.ttf'), bold: path.join(fdir, 'Roboto-Medium.ttf'), italics: path.join(fdir, 'Roboto-Italic.ttf'), bolditalics: path.join(fdir, 'Roboto-MediumItalic.ttf') } });
  const out = path.join('C:', 'Users', 'euger', 'OneDrive', 'Escritorio', 'Horario-prueba.pdf');
  const doc = await printer.createPdfKitDocument(dd);
  const stream = createWriteStream(out);
  doc.pipe(stream); doc.end();
  await new Promise((res) => stream.on('finish', res));
  console.log('PDF de prueba escrito en:', out);
})();
