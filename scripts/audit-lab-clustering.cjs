/* Auditoría de la fusión de labs del armador (replica EXACTA del algoritmo de
 * tableData en ScheduleBuilder.tsx). Verifica clusters, rowspans y enmascarado. */
const SLOTS = 16;

function buildDay(blocks) {
  const data = Array.from({ length: SLOTS }, () => ({ blocks: [], rowspan: 1 }));
  const masked = new Set();

  const labs = blocks.filter((b) => b.type === 'LAB').sort((a, b) => a.startHour - b.startHour);
  let i = 0;
  while (i < labs.length) {
    const start = labs[i].startHour;
    let end = labs[i].startHour + labs[i].duration;
    const cluster = [labs[i]];
    let j = i + 1;
    while (j < labs.length && labs[j].startHour <= end) {
      cluster.push(labs[j]);
      end = Math.max(end, labs[j].startHour + labs[j].duration);
      j++;
    }
    const clampedEnd = Math.min(end, SLOTS);
    data[start].blocks.push(...cluster);
    data[start].rowspan = clampedEnd - start;
    for (let r = start + 1; r < clampedEnd; r++) {
      masked.add(r);
      data[r] = { blocks: [], rowspan: 0 };
    }
    i = j;
  }

  const theories = blocks.filter((b) => b.type !== 'LAB');
  for (const t of theories) {
    const start = t.startHour;
    const end = Math.min(start + t.duration, SLOTS);
    let owner = start;
    if (data[start].blocks.length === 0 && masked.has(start)) {
      for (let r = start - 1; r >= 0; r--) {
        if (data[r].blocks.length > 0 && r + data[r].rowspan > start) { owner = r; break; }
      }
      if (owner === start) continue;
    }
    if (data[owner].blocks.length === 0) { data[owner].rowspan = 1; }
    data[owner].blocks.push(t);
    const clampedEnd = Math.min(Math.max(owner + data[owner].rowspan, end), SLOTS);
    for (let r = owner + 1; r < clampedEnd; r++) {
      if (data[r].blocks.length === 0) { masked.add(r); data[r] = { blocks: [], rowspan: 0 }; }
    }
    data[owner].rowspan = clampedEnd - owner;
  }
  return data;
}

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (extra ? '  → ' + extra : ''))); };
const L = (id, startHour, duration, subjectCode = 'S1') => ({ id, startHour, duration, type: 'LAB', subjectCode });
const T = (id, startHour, duration, subjectCode = 'S1') => ({ id, startHour, duration, type: 'THEORY', subjectCode });
// celdas que realmente se renderizan (rowspan>0 con bloques)
const rendered = (d) => d.map((c, r) => ({ r, n: c.blocks.length, rs: c.rowspan })).filter((c) => c.n > 0);
// invariante: ninguna fila renderizada cae dentro del rowspan de otra
function noOverlap(d) {
  const occupied = new Set();
  for (let r = 0; r < SLOTS; r++) {
    if (d[r].blocks.length === 0) continue;
    for (let k = 0; k < d[r].rowspan; k++) {
      if (occupied.has(r + k)) return false;
      occupied.add(r + k);
    }
  }
  return true;
}

console.log('FUSIÓN DE LABS (clusters)');
{
  // 1) 3 labs consecutivos mismo subject → 1 cluster rowspan 6
  const d = buildDay([L('a', 0, 2), L('b', 2, 2), L('c', 4, 2)]);
  ok('3 labs pegados → 1 cluster', rendered(d).length === 1, JSON.stringify(rendered(d)));
  ok('   cluster tiene 3 bloques', d[0].blocks.length === 3);
  ok('   rowspan = 6 (cubre 7:00-11:30)', d[0].rowspan === 6, 'rs=' + d[0].rowspan);
  ok('   sin solapes de render', noOverlap(d));
}
{
  // 2) 2 labs en paralelo (mismo start) → 1 cluster rowspan 2, 2 bloques
  const d = buildDay([L('a', 0, 2), L('b', 0, 2)]);
  ok('2 labs en paralelo → 1 celda con 2 bloques', rendered(d).length === 1 && d[0].blocks.length === 2 && d[0].rowspan === 2);
}
{
  // 3) labs con hueco → 2 clusters separados
  const d = buildDay([L('a', 0, 2), L('b', 4, 2)]);
  ok('labs con hueco → 2 clusters', rendered(d).length === 2, JSON.stringify(rendered(d)));
  ok('   ambos rowspan 2', d[0].rowspan === 2 && d[4].rowspan === 2);
}
{
  // 4) teoría + lab consecutivos → separados
  const d = buildDay([T('t', 0, 2), L('a', 2, 2)]);
  ok('teoría 0-1 + lab 2-3 → 2 celdas separadas', rendered(d).length === 2 && d[0].blocks.length === 1 && d[2].blocks.length === 1);
  ok('   sin solapes', noOverlap(d));
}
{
  // 5) teoría + lab mismo start → agrupados en la misma celda
  const d = buildDay([T('t', 0, 2), L('a', 0, 2)]);
  ok('teoría + lab mismo start → 1 celda con 2 bloques', rendered(d).length === 1 && d[0].blocks.length === 2);
}
{
  // 6) labs de distinta materia pegados → 1 cluster (se fusionan)
  const d = buildDay([L('a', 0, 2, 'S1'), L('b', 2, 2, 'S2')]);
  ok('labs distinta materia pegados → 1 cluster de 2', rendered(d).length === 1 && d[0].blocks.length === 2);
}
{
  // 7) lab al final con duración que excede → clamp sin romper
  const d = buildDay([L('a', 15, 2)]);
  ok('lab en la última fila → rowspan clamp a 1', d[15].rowspan === 1 && d[15].blocks.length === 1);
  ok('   sin solapes', noOverlap(d));
}
{
  // 8) cluster grande de 4 labs solapados/pegados mezclados
  const d = buildDay([L('a', 0, 2), L('b', 1, 2), L('c', 3, 1), L('d', 4, 2)]);
  ok('4 labs encadenados (solape+pegado) → 1 cluster', rendered(d).length === 1 && d[0].blocks.length === 4);
  ok('   rowspan = 6', d[0].rowspan === 6, 'rs=' + d[0].rowspan);
  ok('   sin solapes', noOverlap(d));
}
{
  // 9) día vacío
  const d = buildDay([]);
  ok('día vacío → nada renderizado', rendered(d).length === 0);
}
{
  // 10) [bug arreglado] teoría MÁS LARGA que el lab, mismo start → 1 celda, rowspan teoría, sin solapes
  const d = buildDay([L('a', 0, 2), T('t', 0, 4)]);
  ok('teoría larga + lab corto (mismo start) → 1 celda de 2', rendered(d).length === 1 && d[0].blocks.length === 2);
  ok('   rowspan = 4 y SIN solapes (no corre la grilla)', d[0].rowspan === 4 && noOverlap(d), 'rs=' + d[0].rowspan);
}
{
  // 11) [bug arreglado] teoría que arranca DENTRO de un cluster de labs → no se pierde
  const d = buildDay([L('a', 0, 4), T('t', 2, 1)]);
  ok('teoría dentro del cluster → NO se pierde (se agrupa)', d[0].blocks.length === 2 && rendered(d).length === 1, JSON.stringify(rendered(d)));
  ok('   sin solapes', noOverlap(d));
}

console.log(`\n${'═'.repeat(40)}\nRESULTADO LABS: ${pass} OK · ${fail} fallos`);
process.exit(fail ? 1 : 0);
