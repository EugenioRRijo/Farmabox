import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Copy, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Semester, PensumSubject } from '../../../../shared/src/index';
import type { ScheduleBlock } from '@/types/schedule';
import { useAppData } from '../../context/AppDataContext';

interface ScheduleControlBarProps {
  sections: string[];
  selectedSection: string;
  onSelectSection: (section: string) => void;
  onAddSection: () => void;
  onRemoveSection: (section: string) => void;
}

const genId = () => Math.random().toString(36).slice(2, 11);

/**
 * Barra simple para elegir Semestre + Sección y copiar el horario cargado
 * hacia otra sección (a una a la vez; si la destino ya tiene horario, se
 * reemplaza solo tras confirmar).
 */
export function ScheduleControlBar({
  sections,
  selectedSection,
  onSelectSection,
  onAddSection,
  onRemoveSection,
}: ScheduleControlBarProps) {
  const {
    pensum,
    selectedSemester,
    setSelectedSemester,
    availableSubjects,
    scheduleBlocks,
    handleBlocksChange,
    logScheduleChange,
  } = useAppData();

  const [copyOpen, setCopyOpen] = useState(false);

  // Cuántos bloques tiene una sección en el semestre actual.
  const countForSection = useMemo(() => {
    const codes = new Set(availableSubjects.map((s: PensumSubject) => s.code));
    return (sec: string) =>
      scheduleBlocks.filter(
        (b: ScheduleBlock) =>
          codes.has(b.subjectCode) && (b.section === sec || (!b.section && sec === 'A')),
      ).length;
  }, [availableSubjects, scheduleBlocks]);

  const currentCount = countForSection(selectedSection);

  const pasteInto = (target: string) => {
    const codes = new Set(availableSubjects.map((s: PensumSubject) => s.code));
    const source = scheduleBlocks.filter(
      (b: ScheduleBlock) =>
        codes.has(b.subjectCode) &&
        (b.section === selectedSection || (!b.section && selectedSection === 'A')),
    );
    const rest = scheduleBlocks.filter(
      (b: ScheduleBlock) =>
        !(codes.has(b.subjectCode) && (b.section === target || (!b.section && target === 'A'))),
    );
    const cloned: ScheduleBlock[] = source.map((b) => ({
      ...b,
      id: genId(),
      section: target,
      semester: selectedSemester,
    }));

    handleBlocksChange([...rest, ...cloned]);
    logScheduleChange(
      'Copiar Horario',
      `Se copió el horario del Semestre ${selectedSemester} Sección ${selectedSection} a la Sección ${target} (${cloned.length} bloques)`,
    );
    toast.success(`Horario copiado a la Sección ${target}`);
    setCopyOpen(false);
  };

  const canCopy = currentCount > 0 && sections.length > 1;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        {/* Semestre */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 flex-shrink-0 text-sm font-medium text-gray-500">Semestre</span>
          {pensum.map((s: Semester) => {
            const active = selectedSemester === s.number;
            return (
              <button
                key={s.number}
                onClick={() => setSelectedSemester(s.number)}
                aria-pressed={active}
                className={`h-9 min-w-[40px] rounded-lg px-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s.number}°
              </button>
            );
          })}
        </div>

        {/* Sección + copiar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 flex-shrink-0 text-sm font-medium text-gray-500">Sección</span>
          {sections.map((sec) => {
            const active = selectedSection === sec;
            const n = countForSection(sec);
            return (
              <div key={sec} className="group relative">
                <button
                  onClick={() => onSelectSection(sec)}
                  aria-pressed={active}
                  className={`h-9 rounded-lg px-3 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {sec}
                  {n > 0 && (
                    <span className={`ml-1 text-xs font-normal ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                      ({n})
                    </span>
                  )}
                </button>
                {sections.length > 1 && (
                  <button
                    onClick={() => onRemoveSection(sec)}
                    className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-gray-300 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                    title={`Eliminar sección ${sec}`}
                    aria-label={`Eliminar sección ${sec}`}
                  >
                    <X className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={onAddSection}
            className="grid h-9 w-9 place-items-center rounded-lg border border-dashed border-gray-300 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            title="Agregar sección"
            aria-label="Agregar sección"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            onClick={() => setCopyOpen(true)}
            disabled={!canCopy}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-blue-600 px-3 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent"
            title={
              currentCount === 0
                ? 'No hay horario para copiar'
                : sections.length < 2
                  ? 'Agrega otra sección para copiar'
                  : 'Copiar este horario a otra sección'
            }
          >
            <Copy className="h-4 w-4" />
            Copiar horario
          </button>
        </div>
      </div>

      {copyOpen &&
        createPortal(
          <CopyScheduleDialog
            sourceSection={selectedSection}
            sourceCount={currentCount}
            sections={sections}
            countForSection={countForSection}
            onPaste={pasteInto}
            onClose={() => setCopyOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}

/* ── Diálogo de copia (simple) ──────────────────────────────────────────── */

interface CopyDialogProps {
  sourceSection: string;
  sourceCount: number;
  sections: string[];
  countForSection: (sec: string) => number;
  onPaste: (target: string) => void;
  onClose: () => void;
}

function CopyScheduleDialog({
  sourceSection,
  sourceCount,
  sections,
  countForSection,
  onPaste,
  onClose,
}: CopyDialogProps) {
  // Sección que pide confirmación porque ya tiene horario.
  const [confirming, setConfirming] = useState<string | null>(null);
  const destinations = sections.filter((s) => s !== sourceSection);

  const handlePick = (sec: string) => {
    if (countForSection(sec) > 0) {
      setConfirming(sec); // ya tiene horario → confirmar reemplazo
    } else {
      onPaste(sec); // vacía → pegar directo
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h3 className="text-base font-bold text-gray-900">Copiar horario</h3>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Copiar la Sección <strong className="text-gray-700">{sourceSection}</strong> ({sourceCount}{' '}
          {sourceCount === 1 ? 'bloque' : 'bloques'}) a:
        </p>

        <div className="space-y-2">
          {destinations.map((sec) => {
            const n = countForSection(sec);
            const isConfirming = confirming === sec;
            return (
              <div key={sec}>
                {isConfirming ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-lg border border-amber-300 bg-amber-50 p-3"
                  >
                    <p className="mb-2.5 text-sm text-amber-800">
                      La Sección {sec} ya tiene {n} {n === 1 ? 'bloque' : 'bloques'}. ¿Reemplazar?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onPaste(sec)}
                        className="flex-1 rounded-lg bg-amber-500 py-1.5 text-sm font-semibold text-white hover:bg-amber-600"
                      >
                        Sí, reemplazar
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    onClick={() => handlePick(sec)}
                    className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-2.5 text-left transition-colors hover:border-blue-400 hover:bg-blue-50"
                  >
                    <span className="text-sm font-semibold text-gray-800">Sección {sec}</span>
                    <span className={`text-xs ${n > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {n > 0 ? `${n} cargados` : 'vacía'}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
