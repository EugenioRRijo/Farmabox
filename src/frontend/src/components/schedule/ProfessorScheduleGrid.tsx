/**
 * ProfessorScheduleGrid — Horario semanal de UN profesor, en pantalla.
 *
 * Replica el PDF docente (PdfExportService.buildProfessorPage): semana Lunes–Viernes,
 * franjas 7:00am–7:00pm, consolidando TODAS las clases del profesor (todos los
 * semestres/secciones) en una sola grilla. Las clases que caen en la misma franja se
 * reparten en columnas (no se oculta ninguna). Usa el mismo helper puro que el PDF
 * (lib/professorSchedule) para que pantalla y PDF coincidan.
 */
import { useMemo } from 'react';
import { Professor, PensumSubject } from '../../../../shared/src/index';
import { ScheduleBlock } from '@/types/schedule';
import { slotLabel } from '@/lib/timeSlots';
import { buildProfessorWeek } from '@/lib/professorSchedule';

interface ProfessorScheduleGridProps {
  professor: Professor;
  blocks: ScheduleBlock[];
  subjects: PensumSubject[];
  academicPeriod?: string;
}

const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
const ROWS = 16; // 7:00am → 7:00pm (mismas franjas que el PDF)
const ROW_H = 54; // px por franja

// Color suave y consistente por materia (mismo criterio visual que la grilla de choques).
const TINTS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-purple-50 border-purple-200 text-purple-900',
  'bg-pink-50 border-pink-200 text-pink-900',
  'bg-cyan-50 border-cyan-200 text-cyan-900',
];
function tintFor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = code.charCodeAt(i) + ((h << 5) - h);
  return TINTS[Math.abs(h) % TINTS.length];
}

export function ProfessorScheduleGrid({
  professor,
  blocks,
  subjects,
  academicPeriod,
}: ProfessorScheduleGridProps) {
  const week = useMemo(
    () => buildProfessorWeek(professor.id, blocks, subjects),
    [professor.id, blocks, subjects],
  );

  return (
    <div className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden shadow-lg">
      {/* ── Encabezado (igual al PDF docente) ─────────────────────────────── */}
      <div className="px-5 py-4 border-b-2 border-black bg-gray-50">
        <p className="text-center text-xs font-bold tracking-wide text-gray-700">FACULTAD DE FARMACIA</p>
        <p className="text-center text-xs font-bold tracking-wide text-gray-700">HORARIO DE CLASES DOCENTES</p>
        <p className="text-center text-[11px] font-semibold text-gray-500 mb-2">
          {academicPeriod ? `PERIODO ${academicPeriod}` : 'PERIODO'}
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-base font-bold text-gray-900">
            Docente: {professor.fullName.toUpperCase()}
          </span>
          {professor.cedula && (
            <span className="text-sm font-bold text-gray-700">C.I. {professor.cedula}</span>
          )}
        </div>
        {week.subjects.length > 0 && (
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-bold">Asignaturas: </span>
            {week.subjects.join('  ·  ')}
          </p>
        )}
      </div>

      {/* ── Grilla ────────────────────────────────────────────────────────── */}
      <div className="w-full">
        {/* Cabecera de días */}
        <div className="w-full grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr] border-b-2 border-black">
          <div className="bg-gray-50 border-r-2 border-black p-1 text-center font-bold text-xs flex items-center justify-center">
            HORA
          </div>
          {DAYS.map((day, i) => (
            <div
              key={day}
              className={`bg-gray-50 p-1 text-center font-bold text-xs ${i < 4 ? 'border-r-2 border-black' : ''}`}
            >
              {day}
            </div>
          ))}
        </div>

        <div className="w-full grid grid-cols-[64px_1fr_1fr_1fr_1fr_1fr]">
          {/* Columna de horas */}
          <div className="border-r-2 border-black">
            {Array.from({ length: ROWS }, (_, i) => (
              <div
                key={i}
                style={{ height: ROW_H }}
                className="border-b border-gray-300 text-[10px] flex items-center justify-center bg-gray-50 font-semibold text-gray-500 text-center leading-tight px-1"
              >
                {slotLabel(i)}
              </div>
            ))}
          </div>

          {/* Columnas de días */}
          {DAYS.map((_, dayIndex) => (
            <div
              key={dayIndex}
              className={`relative ${dayIndex < 4 ? 'border-r-2 border-black' : ''}`}
              style={{ height: ROWS * ROW_H }}
            >
              {/* Líneas de la grilla */}
              {Array.from({ length: ROWS }, (_, i) => (
                <div key={i} style={{ height: ROW_H }} className="border-b border-gray-200 w-full" />
              ))}

              {/* Clases del profesor ese día */}
              {week.days[dayIndex].map((cell) => {
                const widthPct = 100 / cell.colCount;
                return (
                  <div
                    key={cell.block.id}
                    className={`absolute p-1 rounded border overflow-hidden flex flex-col items-center justify-center text-center leading-tight ${tintFor(cell.block.subjectCode)}`}
                    style={{
                      top: cell.block.startHour * ROW_H + 1,
                      height: cell.block.duration * ROW_H - 2,
                      left: `calc(${cell.col * widthPct}% + 1px)`,
                      width: `calc(${widthPct}% - 2px)`,
                    }}
                    title={`${cell.name}${cell.block.semester ? ` · ${cell.block.semester}°${cell.block.section ?? 'A'}` : ''}`}
                  >
                    {cell.isLab && (
                      <span className="text-[9px] font-bold uppercase opacity-70">Laboratorio</span>
                    )}
                    <span className="text-[11px] font-bold break-words w-full">{cell.name}</span>
                    {!cell.isLab && cell.aula && (
                      <span className="text-[9px] opacity-80">Aula {cell.aula}</span>
                    )}
                    {cell.block.semester != null && (
                      <span className="mt-0.5 text-[8px] font-bold bg-white/60 px-1 rounded">
                        {cell.block.semester}°{cell.block.section ?? 'A'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Total ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-2.5 border-t-2 border-black bg-gray-50">
        <span className="text-sm font-bold text-gray-900">TOTAL: {week.totalHours} HORAS</span>
      </div>
    </div>
  );
}
