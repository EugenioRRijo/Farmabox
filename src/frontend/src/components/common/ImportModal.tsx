import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { Upload, X, FileDown, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import * as Backend from '../../services/BackendService';

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

// Columna obligatoria: si falta tras parsear, el separador se detectó mal (o el
// archivo no tiene el formato esperado) → avisamos en vez de mostrar filas vacías.
const REQUIRED: Record<Kind, string> = { professors: 'fullName', subjects: 'code' };
const TYPE_LABEL: Record<string, string> = { theory: 'Teoría', practice: 'Práctica/Lab', both: 'Ambos' };

const splitList = (s?: string): string[] =>
  (s ?? '')
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

interface Parsed {
  rows: Row[];
  fields: string[];
  ok: boolean; // la columna obligatoria está presente
  delimiter: string;
}

interface PreviewRow {
  c1: string;
  c2: string;
  c3: string;
  detail: string;
  warns: string[];
}

export function ImportModal({ kind, onClose, onDone }: { kind: Kind; onClose: () => void; onDone: () => void }) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cols = TEMPLATES[kind].headers;
  const label = kind === 'professors' ? 'profesores' : 'materias';
  const requiredCol = REQUIRED[kind];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(), // PapaParse ya quita el BOM; solo recortamos espacios
      complete: (res) => {
        const fields = (res.meta.fields ?? []).map((f) => f.trim());
        const rows = (res.data as Row[]).filter((r) => Object.values(r).some((v) => (v ?? '').toString().trim()));
        setParsed({ rows, fields, ok: fields.includes(requiredCol), delimiter: res.meta.delimiter });
      },
      error: () => toast.error('No se pudo leer el archivo CSV.'),
    });
    e.target.value = ''; // permite volver a elegir el mismo archivo
  };

  // Vista previa legible: QUIÉN/QUÉ se va a importar, con avisos por fila.
  const preview = useMemo<PreviewRow[]>(() => {
    if (!parsed?.ok) return [];
    return parsed.rows.map((r) => {
      if (kind === 'professors') {
        const name = (r.fullName ?? '').trim();
        const type = (r.type ?? '').trim() || 'both';
        const subs = splitList(r.subjects);
        const warns: string[] = [];
        if (!name) warns.push('sin nombre');
        if (!['theory', 'practice', 'both'].includes(type)) warns.push(`tipo «${type}» inválido`);
        return {
          c1: name || '(sin nombre)',
          c2: TYPE_LABEL[type] ?? type,
          c3: `${subs.length} materia${subs.length === 1 ? '' : 's'}`,
          detail: subs.join(', '),
          warns,
        };
      }
      const code = (r.code ?? '').trim();
      const subName = (r.name ?? '').trim();
      const warns: string[] = [];
      if (!code) warns.push('sin código');
      return {
        c1: code || '(sin código)',
        c2: subName || '—',
        c3: Number(r.hoursLab) > 0 ? 'con lab' : 'sin lab',
        detail: `semestre ${(r.semester ?? '').trim() || '1'}`,
        warns,
      };
    });
  }, [parsed, kind]);

  const previewHeaders = kind === 'professors' ? ['Profesor', 'Tipo', 'Materias'] : ['Código', 'Materia', 'Lab'];
  const validCount = preview.filter((p) => p.warns.length === 0).length;
  const warnCount = preview.length - validCount;

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATES[kind].sample], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla_${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = async () => {
    if (!parsed?.ok || !parsed.rows.length) return;
    const rows = parsed.rows;
    try {
      setBusy(true);
      if (kind === 'professors') {
        const profs = rows.map((r) => ({
          id: r.id?.trim() || undefined,
          fullName: r.fullName?.trim() || 'Sin nombre',
          title: (r.title?.trim() as 'Prof.') || 'Prof.',
          cedula: r.cedula?.trim() || undefined,
          type: (r.type?.trim() as 'both') || 'both',
          subjects: splitList(r.subjects),
        }));
        await Backend.bulkUpsertProfessors(profs);
      } else {
        const subs = rows
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
        await Backend.bulkUpsertSubjects(subs);
      }
      toast.success(`${rows.length} ${label} importadas correctamente.`);
      onDone();
      onClose();
    } catch (e) {
      toast.error('Error al importar: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 relative max-h-[85vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Importar {label} (CSV)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Subí un archivo CSV con las columnas: <span className="font-mono text-xs">{cols.join(', ')}</span>.
          Las listas (materias / prelaciones) se separan con <span className="font-mono">;</span> y las columnas
          con <span className="font-mono">,</span> (coma). Usá la plantilla para evitar problemas de formato.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            <Upload className="w-4 h-4" /> Elegir archivo CSV
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            <FileDown className="w-4 h-4" /> Descargar plantilla
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        </div>

        {/* Archivo con formato incorrecto: avisamos en vez de mostrar filas vacías */}
        {parsed && !parsed.ok && (
          <div className="flex items-start gap-3 p-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">El archivo no tiene la columna «{requiredCol}».</p>
              <p className="mt-1">
                Separador detectado: <span className="font-mono">{JSON.stringify(parsed.delimiter)}</span>. Columnas
                encontradas: <span className="font-mono">{parsed.fields.join(' | ') || '(ninguna)'}</span>.
              </p>
              <p className="mt-1">
                Suele pasar cuando Excel guarda el CSV con <span className="font-mono">;</span> como separador de
                columnas (choca con las listas, que también usan <span className="font-mono">;</span>). Solución:
                descargá la plantilla y guardá con separador <span className="font-mono">,</span> (coma).
              </p>
            </div>
          </div>
        )}

        {/* Vista previa: a quién/qué se va a importar */}
        {parsed?.ok && (
          <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mb-3">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-400 w-8">#</th>
                  {previewHeaders.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium text-gray-500">{c}</th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 200).map((p, i) => (
                  <tr key={i} className={p.warns.length ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">{p.c1}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{p.c2}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap" title={p.detail}>{p.c3}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {p.warns.length ? (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" /> {p.warns.join(', ')}
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
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {!parsed
              ? 'Ningún archivo cargado'
              : !parsed.ok
                ? 'Revisá el formato del archivo'
                : `${preview.length} ${label} detectados` +
                  (warnCount ? ` · ${warnCount} con avisos` : '') +
                  (preview.length > 200 ? ' (se muestran 200)' : '')}
          </span>
          <button
            onClick={handleImport}
            disabled={!parsed?.ok || !preview.length || busy}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar {parsed?.ok ? preview.length : ''} {label}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
