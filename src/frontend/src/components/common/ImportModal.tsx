import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { Upload, X, FileDown, Loader2 } from 'lucide-react';
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

const splitList = (s?: string): string[] =>
  (s ?? '')
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function ImportModal({ kind, onClose, onDone }: { kind: Kind; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cols = TEMPLATES[kind].headers;
  const label = kind === 'professors' ? 'profesores' : 'materias';

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRows(res.data.filter((r) => Object.values(r).some((v) => (v ?? '').trim())));
      },
      error: () => toast.error('No se pudo leer el archivo CSV.'),
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATES[kind].sample], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plantilla_${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = async () => {
    if (!rows.length) return;
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
          Las listas (materias / prelaciones) se separan con <span className="font-mono">;</span>. En Excel:
          “Guardar como → CSV”.
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

        {rows.length > 0 && (
          <div className="flex-1 overflow-auto border border-gray-200 rounded-lg mb-4">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium text-gray-500">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{r[c] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {rows.length > 0 ? `${rows.length} fila(s) detectadas${rows.length > 50 ? ' (se muestran 50)' : ''}` : 'Ningún archivo cargado'}
          </span>
          <button
            onClick={handleImport}
            disabled={!rows.length || busy}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar {rows.length || ''} {label}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
