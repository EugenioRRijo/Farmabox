/* Harness de verificación: renderiza un PDF de horario (Sem 1, Sec A) con datos
 * reales de Supabase, replicando la NUEVA buildSchedulePage, para comparar el
 * formato contra el .docx de referencia. NO es parte de la app. */
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
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

// ── helpers de bloque (copiados de lib/timeSlots) ───────────────────────────
const fmt = (t) => { const h24 = Math.floor(t / 60) % 24, m = t % 60, h12 = ((h24 + 11) % 12) + 1; return `${h12}:${String(m).padStart(2, '0')}`; };
const slotLabel = (i) => { const s = 7 * 60 + i * 45; return `${fmt(s)}-${fmt(s + 45)}`; };
const win = (n) => (n <= 4 ? { start: 0, end: 7 } : { start: 8, end: 17 });

(async () => {
  const SEM = 1, SEC = 'A', PERIOD = '2026-01';
  const [profs, subjRows, load, blocksAll] = await Promise.all([
    get('professors?select=id,full_name,title,type&deleted_at=is.null'),
    get('subjects?select=*&semester=eq.' + SEM + '&deleted_at=is.null'),
    get('academic_load?select=subject_code,professor_id,role'),
    get(`schedule_blocks?select=*&semester=eq.${SEM}&section=eq.${SEC}&deleted_at=is.null`),
  ]);
  const subjects = subjRows.map((r) => ({ code: r.code, name: r.name, hoursLab: r.hours_lab ?? 0, labNumber: r.lab_number ?? '', prerequisites: r.prerequisites ?? [] }));
  const academicLoad = {};
  for (const r of load) { (academicLoad[r.subject_code] ||= { theory: [], lab: [] })[r.role === 'lab' ? 'lab' : 'theory'].push(r.professor_id); }
  const blocks = blocksAll.map((b) => ({ subjectCode: b.subject_code, day: b.day, startHour: b.start_hour, duration: b.duration, type: b.type }));

  const getProfNames = (ids) => (ids || []).map((id) => profs.find((p) => p.id === id)).filter(Boolean).map((p) => `${p.title} ${p.full_name}`).join(', ');

  // ── grid ──
  const days = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
  const w = win(SEM); let lo = w.start, hi = w.end;
  for (const b of blocks) { if (b.startHour < lo) lo = b.startHour; const e = b.startHour + b.duration - 1; if (e > hi) hi = e; }
  const covered = {}; const body = [[{ text: 'HORA', style: 'th' }, ...days.map((d) => ({ text: d, style: 'th' }))]];
  for (let row = lo; row <= hi; row++) {
    const r = [{ text: slotLabel(row), alignment: 'center', fontSize: 7 }];
    for (let d = 0; d < 5; d++) {
      if (covered[`${d}-${row}`]) { r.push({ text: '', fontSize: 7 }); continue; }
      const blk = blocks.find((b) => b.day === d && b.startHour === row);
      if (blk) {
        const nm = subjects.find((s) => s.code === blk.subjectCode)?.name ?? blk.subjectCode;
        const txt = blk.type === 'LAB' ? `Laboratorio\n${nm}` : `${nm}\nAula`;
        if (blk.duration > 1) { for (let k = 1; k < blk.duration; k++) covered[`${d}-${row + k}`] = true; r.push({ text: txt, alignment: 'center', fontSize: 7, rowSpan: blk.duration }); }
        else r.push({ text: txt, alignment: 'center', fontSize: 7 });
      } else if (row === lo) r.push({ text: 'EVALUACIONES Y ACTIVIDADES EXTRACÁTEDRA', alignment: 'center', fontSize: 5, italics: true, color: '#555' });
      else r.push({ text: '', fontSize: 7 });
    }
    body.push(r);
  }
  // ── summary ──
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

  const tblLayout = { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#999', vLineColor: () => '#999' };
  const dd = {
    pageSize: 'LETTER', pageOrientation: 'landscape', pageMargins: [20, 20, 20, 20],
    content: [
      { text: 'FACULTAD DE FARMACIA', bold: true, fontSize: 10, alignment: 'center' },
      { text: `HORARIOS PERIODO ACADÉMICO ${PERIOD}`, bold: true, fontSize: 10, alignment: 'center', margin: [0, 0, 0, 8] },
      { columns: [{ text: `SEMESTRE ${SEM}° SECCIÓN "${SEC}"`, bold: true, fontSize: 9 }, { text: 'UBICACIÓN NIVEL FERIA PISO 2', bold: true, fontSize: 9, alignment: 'right' }], margin: [0, 0, 0, 6] },
      { table: { headerRows: 1, widths: [45, '*', '*', '*', '*', '*'], body }, layout: tblLayout },
      { text: '', margin: [0, 10, 0, 0] },
      { table: { headerRows: 1, widths: [55, '*', '*', '*', 40, '*'], body: sBody }, layout: tblLayout },
    ],
    styles: { th: { fontSize: 8, bold: true, fillColor: '#f0f0f0', alignment: 'center' } },
    defaultStyle: { font: 'Roboto' },
  };

  // Fuentes Roboto: decodificadas del vfs del propio pdfmake.
  const vfs = require('pdfmake/build/vfs_fonts.js');
  const fdir = path.join(os.tmpdir(), 'pdffonts'); mkdirSync(fdir, { recursive: true });
  for (const f of ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf', 'Roboto-MediumItalic.ttf']) writeFileSync(path.join(fdir, f), Buffer.from(vfs[f], 'base64'));
  const printer = new PdfPrinter({ Roboto: { normal: path.join(fdir, 'Roboto-Regular.ttf'), bold: path.join(fdir, 'Roboto-Medium.ttf'), italics: path.join(fdir, 'Roboto-Italic.ttf'), bolditalics: path.join(fdir, 'Roboto-MediumItalic.ttf') } });
  const out = path.join(__dirname, '..', 'preview-horario.pdf');
  const doc = await printer.createPdfKitDocument(dd); // 0.3.x: Promise<PDFKitDocument>
  const stream = require('fs').createWriteStream(out);
  doc.pipe(stream); doc.end();
  await new Promise((res) => stream.on('finish', res));
  console.log('PDF escrito en', out, '| blocks:', blocks.length, '| subjects:', subjects.length);
})();
