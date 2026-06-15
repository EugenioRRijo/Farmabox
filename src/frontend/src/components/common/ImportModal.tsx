import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { Upload, X, FileDown, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import * as Backend from '../../services/BackendService';
import {
  detectNaturalColumns,
  mapGroupedList,
  type SubjectLite,
} from '../../../../shared/src/logic/professorImport';

type Kind = 'professors' | 'subjects';
type Row = Record<string, string>;

const TEMPLATES: Record<Kind, { headers: string[]; sample: string }> = {
  professors: {
    headers: ['fullName', 'title', 'cedula', 'type', 'subjects'],
    sample:
      'fullName,title,cedula,type,subjects\n' +
      'Juan Pérez,Prof.,V-12345678,both,3307011103;3307021104\n' +
      'Ana Gómez,Dra.,,theory,3307011105\n',
  },
  subjects: {
    headers: ['code', 'semester', 'name', 'credits', 'hoursTheory', 'hoursLab', 'prerequisites', 'labNumber'],
    sample:
      'code,semester,name,credits,hoursTheory,hoursLab,prerequisites,labNumber\n' +
      '3307099999,1,Materia Ejemplo,3,2,3,,104\n',
  },
};

const TYPE_LABEL: Record<string, string> = { theory: 'Teoría', practice: 'Práctica/Lab', both: 'Ambos' };

const splitList = (s?: string): string[] =>
  (s ?? '')
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

// ── Parseo de archivo → filas (objetos por encabezado) + columnas ──────────────
interface ParsedFile {
  rows: Row[];
  fields: string[];
  delimiter?: string;
}

function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(), // PapaParse ya quita el BOM
      complete: (res) => {
        const fields = (res.meta.fields ?? []).map((f) => f.trim());
        const rows = (res.data as Row[]).filter((r) => Object.values(r).some((v) => (v ?? '').toString().trim()));
        resolve({ rows, fields, delimiter: res.meta.delimiter });
      },
      error: reject,
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  if (!aoa.length) return { rows: [], fields: [] };
  const fields = (aoa[0] as unknown[]).map((c) => String(c ?? '').trim());
  const rows: Row[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] as unknown[];
    const obj: Row = {};
    fields.forEach((f, j) => {
      obj[f] = String(arr[j] ?? '').trim();
    });
    if (Object.values(obj).some((v) => v)) rows.push(obj);
  }
  return { rows, fields, delimiter: '(Excel)' };
}

// ── Análisis: detecta el formato y arma la vista previa + lo que se importará ──
type Format = 'standard' | 'natural' | 'subjects' | 'unknown';
interface PreviewRow {
  c1: string;
  c2: string;
  c3: string;
  detail: string;
  warns: string[];
}
interface Analysis {
  format: Format;
  preview: PreviewRow[];
  professors: Partial<Backend.Professor>[]; // payload profesores
  subjects: (Partial<Backend.PensumSubject> & { code: string; semester: number | string })[]; // payload materias
  fields: string[];
  delimiter?: string;
}

function analyze(parsed: ParsedFile | null, kind: Kind, catalog: SubjectLite[]): Analysis | null {
  if (!parsed) return null;
  const { rows, fields, delimiter } = parsed;
  const base = { preview: [] as PreviewRow[], professors: [], subjects: [], fields, delimiter };

  if (kind === 'subjects') {
    if (!fields.includes('code')) return { ...base, format: 'unknown' };
    const subjects = rows
      .filter((r) => r.code?.trim())
      .map((r) => ({
        code: r.code.trim(),
        semester: r.semester?.trim() || '1',
        name: r.name?.trim() || r.code.trim(),
        credits: Number(r.credits) || 0,
        hoursTheory: Number(r.hoursTheory) || 0,
        hoursLab: Number(r.hoursLab) || 0,
        prerequisites: splitList(r.prerequisites),
        labNumber: r.labNumber?.trim() || undefined,
      }));
    const preview: PreviewRow[] = subjects.map((s) => ({
      c1: s.code,
      c2: s.name,
      c3: Number(s.hoursLab) > 0 ? 'con lab' : 'sin lab',
      detail: `semestre ${s.semester}`,
      warns: [],
    }));
    return { ...base, format: 'subjects', subjects, preview };
  }

  // kind === 'professors'
  if (fields.includes('fullName')) {
    const professors = rows.map((r) => ({
      fullName: r.fullName?.trim() || 'Sin nombre',
      title: (r.title?.trim() as 'Prof.') || 'Prof.',
      cedula: r.cedula?.trim() || undefined,
      type: (r.type?.trim() as 'both') || 'both',
      subjects: splitList(r.subjects),
    }));
    const preview: PreviewRow[] = professors.map((p) => {
      const warns: string[] = [];
      if (!p.fullName || p.fullName === 'Sin nombre') warns.push('sin nombre');
      if (!['theory', 'practice', 'both'].includes(p.type)) warns.push(`tipo «${p.type}» inválido`);
      return {
        c1: p.fullName,
        c2: TYPE_LABEL[p.type] ?? p.type,
        c3: `${p.subjects.length} materia${p.subjects.length === 1 ? '' : 's'}`,
        detail: p.subjects.join(', '),
        warns,
      };
    });
    return { ...base, format: 'standard', professors, preview };
  }

  // Formato natural (lista por profesor): "Apellido nombre" + "Unidad curricular"
  const cols = detectNaturalColumns(fields);
  if (cols) {
    const mapped = mapGroupedList(rows, cols.nameKey, cols.subjectKey, catalog);
    const professors = mapped.map((p) => ({ fullName: p.fullName, title: 'Prof.' as const, type: p.type, subjects: p.subjects }));
    const preview: PreviewRow[] = mapped.map((p) => ({
      c1: p.fullName,
      c2: TYPE_LABEL[p.type] ?? p.type,
      c3: `${p.subjects.length} materia${p.subjects.length === 1 ? '' : 's'}`,
      detail: p.subjects.join(', '),
      warns: p.unmatched.length ? [`no encontré: ${p.unmatched.join('; ')}`] : [],
    }));
    return { ...base, format: 'natural', professors, preview };
  }

  return { ...base, format: 'unknown' };
}

export function ImportModal({ kind, onClose, onDone }: { kind: Kind; onClose: () => void; onDone: () => void }) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [catalog, setCatalog] = useState<SubjectLite[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cols = TEMPLATES[kind].headers;
  const label = kind === 'professors' ? 'profesores' : 'materias';

  // Catálogo de materias (para mapear nombre→código en el formato natural).
  useEffect(() => {
    if (kind !== 'professors') return;
    let alive = true;
    Backend.getSubjects()
      .then((sems) => {
        if (!alive) return;
        setCatalog(sems.flatMap((s) => s.subjects).map((x) => ({ code: x.code, name: x.name, hasLab: x.hasLab })));
      })
      .catch(() => {
        /* sin catálogo el formato natural avisará materias no encontradas */
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isXlsx = /\.xlsx?$/i.test(file.name);
    (isXlsx ? parseXlsx(file) : parseCsv(file))
      .then(setParsed)
      .catch(() => toast.error('No se pudo leer el archivo.'));
    e.target.value = ''; // permite volver a elegir el mismo archivo
  };

  const analysis = useMemo(() => analyze(parsed, kind, catalog), [parsed, kind, catalog]);

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATES[kind].sample], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla_${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = async () => {
    if (!analysis || analysis.format === 'unknown') return;
    try {
      setBusy(true);
      const n = analysis.preview.length;
      if (kind === 'professors') {
        await Backend.bulkUpsertProfessors(analysis.professors);
      } else {
        await Backend.bulkUpsertSubjects(analysis.subjects);
      }
      toast.success(`${n} ${label} importadas correctamente.`);
      onDone();
      onClose();
    } catch (err) {
      toast.error('Error al importar: ' + (err instanceof Error ? err.message : 'desconocido'));
    } finally {
      setBusy(false);
    }
  };

  const previewHeaders =
    kind === 'professors' ? ['Profesor', 'Tipo', 'Materias'] : ['Código', 'Materia', 'Lab'];
  const warnCount = analysis ? analysis.preview.filter((p) => p.warns.length).length : 0;
  const okToImport = !!analysis && analysis.format !== 'unknown' && analysis.preview.length > 0;
  const formatNote =
    analysis?.format === 'natural'
      ? 'Detecté tu lista por profesor (Apellido / Unidad curricular): mapeo las materias a su código y deduzco el tipo automáticamente.'
      : analysis?.format === 'standard'
        ? 'Formato estándar de la plantilla.'
        : '';

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 relative max-h-[85vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Importar {label} (CSV o Excel)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sube un archivo <span className="font-mono text-xs">.csv</span> o{' '}
          <span className="font-mono text-xs">.xlsx</span> con las columnas:{' '}
          <span className="font-mono text-xs">{cols.join(', ')}</span>.{' '}
          {kind === 'professors' && (
            <>
              También acepta la lista por profesor (columnas <span className="font-mono text-xs">Apellido nombre</span>{' '}
              y <span className="font-mono text-xs">Unidad curricular</span>); las materias se mapean a su código
              automáticamente.{' '}
            </>
          )}
          Las listas se separan con <span className="font-mono">;</span> y las columnas con{' '}
          <span className="font-mono">,</span> (coma).
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Upload className="w-4 h-4" /> Elegir archivo (CSV/Excel)
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <FileDown className="w-4 h-4" /> Descargar plantilla
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Formato no reconocido: avisamos en vez de importar basura */}
        {analysis && analysis.format === 'unknown' && (
          <div className="flex items-start gap-3 p-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">No reconocí las columnas del archivo.</p>
              <p className="mt-1">
                Separador: <span className="font-mono">{JSON.stringify(analysis.delimiter)}</span>. Columnas
                encontradas: <span className="font-mono">{analysis.fields.join(' | ') || '(ninguna)'}</span>.
              </p>
              <p className="mt-1">
                {kind === 'professors'
                  ? 'Esperaba la columna «fullName» (plantilla) o «Apellido nombre» + «Unidad curricular» (lista por profesor). '
                  : 'Esperaba la columna «code». '}
                Si lo guardaste en Excel con <span className="font-mono">;</span> como separador de columnas, descarga
                la plantilla y guárdala con separador <span className="font-mono">,</span> (coma), o súbela como{' '}
                <span className="font-mono">.xlsx</span>.
              </p>
            </div>
          </div>
        )}

        {/* Vista previa */}
        {okToImport && (
          <>
            {formatNote && (
              <div className="flex items-start gap-2 p-2.5 mb-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                <Info className="w-4 h-4 shrink-0 mt-0.5" /> {formatNote}
              </div>
            )}
            <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mb-3">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-400 w-8">#</th>
                    {previewHeaders.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium text-gray-500">
                        {c}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analysis!.preview.slice(0, 200).map((p, i) => (
                    <tr key={i} className={p.warns.length ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">{p.c1}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{p.c2}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap" title={p.detail}>
                        {p.c3}
                      </td>
                      <td className="px-3 py-1.5">
                        {p.warns.length ? (
                          <span className="inline-flex items-center gap-1 text-amber-700" title={p.warns.join(' · ')}>
                            <AlertTriangle className="w-3.5 h-3.5" /> {p.warns.join(' · ')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="w-3.5 h-3.5" /> ok
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {!analysis
              ? 'Ningún archivo cargado'
              : analysis.format === 'unknown'
                ? 'Revisa el formato del archivo'
                : `${analysis.preview.length} ${label} detectados` +
                  (warnCount ? ` · ${warnCount} con avisos` : '') +
                  (analysis.preview.length > 200 ? ' (se muestran 200)' : '')}
          </span>
          <button
            onClick={handleImport}
            disabled={!okToImport || busy}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar {okToImport ? analysis!.preview.length : ''} {label}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
