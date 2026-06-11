import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, BookOpen, LayoutGrid, Download, RotateCcw, ChevronDown, Users, CalendarDays, Check, Search } from 'lucide-react';
import { useAppData } from '../../context/AppDataContext';
import { ScheduleBuilder } from '../schedule/ScheduleBuilder';
import { Semester, Professor } from '../../../../shared/src/index';
import { ScheduleBlock } from '@/types/schedule';
import { normalizeText } from '@/lib/utils';
import {
  generateAllSchedulesPdf,
  generateAllProfessorsSchedulesPdf,
  SchedulePageConfig,
} from '../../services/PdfExportService';

interface Option {
  value: string;
  label: string;
}

// Filtro de selección múltiple: botón con resumen + panel de casillas (búsqueda opcional).
// selected vacío = "todos". Cerrar al hacer clic afuera.
function MultiSelect({
  icon,
  allLabel,
  noun,
  options,
  selected,
  onChange,
  searchable = false,
  ariaLabel,
  width = 'w-56',
}: {
  icon: ReactNode;
  allLabel: string;
  noun: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
  ariaLabel: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.label ?? `1 ${noun}`
        : `${selected.length} ${noun}`;

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const filtered = searchable && q.trim()
    ? options.filter(o => normalizeText(o.label).includes(normalizeText(q)))
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={`h-9 inline-flex items-center gap-2 pl-3 pr-2 rounded-lg border bg-white text-sm font-medium transition-colors ${
          selected.length ? 'border-brand-accent text-brand-navy' : 'border-gray-300 text-gray-600 hover:border-gray-400'
        }`}
      >
        <span className={selected.length ? 'text-brand-accent' : 'text-gray-400'}>{icon}</span>
        <span className="max-w-[10rem] truncate">{summary}</span>
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-brand-accent/15 text-brand-navy text-[11px] font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute left-0 z-40 mt-1 ${width} rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden`}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500">
                {selected.length > 0 ? `${selected.length} seleccionado(s)` : 'Mostrando todos'}
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={selected.length === 0}
                className="text-xs font-semibold text-brand-navy hover:underline disabled:text-gray-300 disabled:no-underline"
              >
                Todos
              </button>
            </div>

            {searchable && (
              <div className="relative border-b border-gray-100">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Buscar…"
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none"
                />
              </div>
            )}

            <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-gray-400">Sin opciones</div>
              ) : (
                filtered.map(o => {
                  const checked = selected.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => toggle(o.value)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                    >
                      <span
                        className={`flex items-center justify-center w-4 h-4 shrink-0 rounded border transition-colors ${
                          checked ? 'bg-brand-navy border-brand-navy text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <span className={`truncate ${checked ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Menú de exportación: una sola acción visible que despliega las opciones.
function ExportMenu({
  onExportFiltered,
  onExportEachProfessor,
  professorScopeLabel,
}: {
  onExportFiltered: () => void;
  onExportEachProfessor: () => void;
  professorScopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const item = (icon: ReactNode, title: string, desc: string, action: () => void) => (
    <button
      onClick={() => {
        setOpen(false);
        action();
      }}
      className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-brand-pale/50 transition-colors"
    >
      <span className="mt-0.5 text-brand-accent shrink-0">{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-gray-800">{title}</span>
        <span className="block text-xs text-gray-500">{desc}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 h-9 px-4 bg-brand-navy hover:bg-brand-navy/90 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
      >
        <Download className="w-4 h-4" />
        Exportar PDF
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-gray-200 bg-white py-1 shadow-lg overflow-hidden"
          >
            {item(<CalendarDays className="w-4 h-4" />, 'Exportar lo filtrado', 'Las tablas que ves arriba, en un solo PDF', onExportFiltered)}
            {item(<Users className="w-4 h-4" />, 'Horario por profesor', `Una hoja por profesor (${professorScopeLabel})`, onExportEachProfessor)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ScheduleVisualization() {
  const { pensum, professors, scheduleBlocks, academicLoad } = useAppData();
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedSemesters, setSelectedSemesters] = useState<number[]>([]);

  // ── Opciones de filtro: SOLO lo que realmente existe en los horarios ──────
  const existingSections = useMemo(() => {
    const set = new Set<string>();
    scheduleBlocks.forEach((b: ScheduleBlock) => set.add(b.section || 'A'));
    if (set.size === 0) set.add('A');
    return Array.from(set).sort();
  }, [scheduleBlocks]);

  const existingSemesters = useMemo(() => {
    const withBlocks = new Set<number>();
    pensum.forEach((s: Semester) => {
      const codes = new Set(s.subjects.map(sub => sub.code));
      if (scheduleBlocks.some((b: ScheduleBlock) => codes.has(b.subjectCode))) withBlocks.add(s.number);
    });
    return pensum.filter((s: Semester) => withBlocks.has(s.number));
  }, [pensum, scheduleBlocks]);

  const professorOptions = useMemo<Option[]>(() => {
    const ids = new Set(
      scheduleBlocks.map((b: ScheduleBlock) => b.professorId).filter(Boolean) as string[]
    );
    return [...professors]
      .filter((p: Professor) => ids.has(p.id))
      .sort((a: Professor, b: Professor) => a.fullName.localeCompare(b.fullName))
      .map((p: Professor) => ({ value: p.id, label: p.fullName }));
  }, [professors, scheduleBlocks]);

  // Bloques visibles para un (sección, semestre) según los filtros activos.
  // Misma lógica que usa ScheduleBuilder al renderizar → render y export coinciden.
  const blocksFor = useCallback(
    (sec: string, s: Semester) => {
      const codes = new Set(s.subjects.map(sub => sub.code));
      return scheduleBlocks.filter(
        (b: ScheduleBlock) =>
          codes.has(b.subjectCode) &&
          (b.section === sec || (!b.section && sec === 'A')) &&
          (selectedProfessorIds.length === 0 ||
            (!!b.professorId && selectedProfessorIds.includes(b.professorId)))
      );
    },
    [scheduleBlocks, selectedProfessorIds]
  );

  const visibleSchedules = useMemo(() => {
    const result: { section: string; semester: Semester }[] = [];
    for (const sec of existingSections) {
      if (selectedSections.length && !selectedSections.includes(sec)) continue;
      for (const s of pensum) {
        if (selectedSemesters.length && !selectedSemesters.includes(s.number)) continue;
        if (blocksFor(sec, s).length > 0) result.push({ section: sec, semester: s });
      }
    }
    return result;
  }, [existingSections, pensum, selectedSections, selectedSemesters, blocksFor]);

  const filtersActive =
    selectedProfessorIds.length > 0 || selectedSections.length > 0 || selectedSemesters.length > 0;

  const resetFilters = () => {
    setSelectedProfessorIds([]);
    setSelectedSections([]);
    setSelectedSemesters([]);
  };

  // ── Exportación ───────────────────────────────────────────────────────────
  const exportFiltered = () => {
    const configs: SchedulePageConfig[] = [];
    for (const { section: sec, semester: s } of visibleSchedules) {
      const blocks = blocksFor(sec, s);
      if (blocks.length > 0) {
        configs.push({ semesterNumber: s.number, subjects: s.subjects, blocks, academicLoad, professors, section: sec });
      }
    }
    if (configs.length === 0) {
      alert('No hay horarios que coincidan con los filtros actuales.');
      return;
    }
    generateAllSchedulesPdf(configs, 'Horarios_Filtrados.pdf');
  };

  const exportEachProfessor = async () => {
    const scope = selectedProfessorIds.length
      ? professors.filter((p: Professor) => selectedProfessorIds.includes(p.id))
      : professors;
    const allSubjects = pensum.flatMap((s: Semester) => s.subjects);
    try {
      await generateAllProfessorsSchedulesPdf(scope, scheduleBlocks, allSubjects);
    } catch {
      alert('Ningún profesor (de los filtrados) tiene clases asignadas para exportar.');
    }
  };

  const sectionsToRender = existingSections.filter(
    sec => selectedSections.length === 0 || selectedSections.includes(sec)
  );

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-gray-800">Visualización de Horarios</h1>
        <p className="text-sm text-gray-500 mt-1">
          Elige uno o varios semestres, secciones y profesores. Exporta exactamente lo que ves.
        </p>
      </div>

      {/* ── Barra de filtros compacta ──────────────────────────────────────── */}
      <div className="mb-8 flex flex-wrap items-center gap-2.5 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2.5">
        <MultiSelect
          icon={<User className="w-4 h-4" />}
          allLabel="Todos los profesores"
          noun="profesores"
          options={professorOptions}
          selected={selectedProfessorIds}
          onChange={setSelectedProfessorIds}
          searchable
          ariaLabel="Filtrar por profesor"
          width="w-64"
        />

        <MultiSelect
          icon={<LayoutGrid className="w-4 h-4" />}
          allLabel="Todas las secciones"
          noun="secciones"
          options={existingSections.map(sec => ({ value: sec, label: `Sección ${sec}` }))}
          selected={selectedSections}
          onChange={setSelectedSections}
          ariaLabel="Filtrar por sección"
        />

        <MultiSelect
          icon={<BookOpen className="w-4 h-4" />}
          allLabel="Todos los semestres"
          noun="semestres"
          options={existingSemesters.map((s: Semester) => ({ value: String(s.number), label: `Semestre ${s.number}°` }))}
          selected={selectedSemesters.map(String)}
          onChange={(vals) => setSelectedSemesters(vals.map(Number))}
          ariaLabel="Filtrar por semestre"
        />

        {filtersActive && (
          <button
            onClick={resetFilters}
            title="Limpiar filtros"
            className="inline-flex items-center gap-1.5 h-9 px-2.5 text-sm text-gray-500 hover:text-brand-navy rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden md:inline">Limpiar</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:block text-xs text-gray-400">
            {visibleSchedules.length} {visibleSchedules.length === 1 ? 'horario' : 'horarios'}
          </span>
          <ExportMenu
            onExportFiltered={exportFiltered}
            onExportEachProfessor={exportEachProfessor}
            professorScopeLabel={selectedProfessorIds.length ? 'de los filtrados' : 'de todos'}
          />
        </div>
      </div>

      {visibleSchedules.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500 font-medium">No hay horarios que coincidan con los filtros seleccionados.</p>
          {filtersActive && (
            <button onClick={resetFilters} className="mt-3 text-sm text-brand-navy font-semibold hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-16">
          {sectionsToRender.map(sec => {
            const semestersForSec = visibleSchedules.filter(v => v.section === sec);
            if (semestersForSec.length === 0) return null;

            return (
              <div key={sec} className="space-y-10">
                <h2 className="text-2xl font-bold border-b pb-2 text-brand-navy">Sección {sec}</h2>
                {semestersForSec.map(({ semester: s }) => (
                  <div key={`${sec}-${s.number}`}>
                    <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg inline-block shadow-sm">
                      <span className="text-sm font-bold text-blue-800">Semestre {s.number}° - Sección {sec}</span>
                    </div>
                    <ScheduleBuilder
                      semesterNumber={s.number}
                      availableSubjects={s.subjects}
                      section={sec}
                      readOnly={true}
                      filterProfessorIds={selectedProfessorIds}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
