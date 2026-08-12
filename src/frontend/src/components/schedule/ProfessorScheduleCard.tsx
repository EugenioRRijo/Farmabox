import { useMemo, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Professor, PensumSubject } from '../../../../shared/src/index';
import type { ScheduleBlock } from '@/types/schedule';
import { slotLabel, MAX_SLOT } from '@/lib/timeSlots';
import { useAppData } from '../../context/AppDataContext';
import { ProfessorScheduleGrid } from './ProfessorScheduleGrid';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const ROLES = [
  'Coordinación Comisión Técnica Trabajo Especial de Grado',
  'Servicio Comunitario',
  'Jefe de Departamento',
  'Coordinador de Pasantías',
];

/**
 * Horario individual de un profesor + editor de HORAS ADMINISTRATIVAS.
 * Las horas administrativas son aparte de las clases: no chocan ni afectan el horario de
 * clases; solo se ven aquí (y en el export docente) y suman al total del profesor.
 */
export function ProfessorScheduleCard({
  professor,
  blocks,
  subjects,
  academicPeriod,
}: {
  professor: Professor;
  blocks: ScheduleBlock[];
  subjects: PensumSubject[];
  academicPeriod?: string;
}) {
  const { adminHours, addAdminHour, removeAdminHour } = useAppData();
  const mine = useMemo(
    () => adminHours.filter((a) => a.professorId === professor.id),
    [adminHours, professor.id],
  );

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [day, setDay] = useState(0);
  const [startHour, setStartHour] = useState(0);
  const [duration, setDuration] = useState(1);

  const submit = () => {
    const finalRole = (role === 'Otro' ? customRole : role).trim();
    if (!finalRole) return;
    addAdminHour({
      // UUID y no Date.now(): dos PCs no pueden mintear el mismo id (regla del proyecto).
      id: `admin-${crypto.randomUUID()}`,
      professorId: professor.id,
      role: finalRole,
      day,
      startHour,
      duration,
    });
    setOpen(false);
    setRole(ROLES[0]);
    setCustomRole('');
    setDay(0);
    setStartHour(0);
    setDuration(1);
  };

  const hourOptions = Array.from({ length: MAX_SLOT + 1 }, (_, i) => i);

  return (
    <div>
      <ProfessorScheduleGrid
        professor={professor}
        blocks={blocks}
        subjects={subjects}
        academicPeriod={academicPeriod}
        adminHours={mine}
      />

      {/* Editor de horas administrativas */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-800">
            Horas administrativas {mine.length > 0 && `(${mine.length})`}
          </span>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar horas administrativas
          </button>
        </div>

        {/* Lista de las admin del profesor */}
        {mine.length > 0 && (
          <ul className="mt-2 space-y-1">
            {mine
              .slice()
              .sort((a, b) => a.day - b.day || a.startHour - b.startHour)
              .map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate text-gray-700">
                    <span className="font-semibold">{a.role}</span> · {DAYS[a.day]}{' '}
                    {slotLabel(a.startHour).split('-')[0]}–{slotLabel(a.startHour + a.duration - 1).split('-')[1]}
                  </span>
                  <button
                    onClick={() => removeAdminHour(a.id)}
                    className="shrink-0 text-gray-400 hover:text-red-600"
                    aria-label="Eliminar hora administrativa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        )}

        {/* Formulario */}
        {open && (
          <div className="mt-2 grid grid-cols-1 gap-2 rounded-lg border border-amber-300 bg-white p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="font-medium text-gray-600">Rol</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                <option value="Otro">Otro…</option>
              </select>
              {role === 'Otro' && (
                <input
                  type="text"
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="Escribe el rol"
                  className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-gray-600">Día</span>
              <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-gray-600">Hora de inicio</span>
              <select value={startHour} onChange={(e) => setStartHour(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                {hourOptions.map((i) => (
                  <option key={i} value={i}>
                    {slotLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-gray-600">Duración (franjas de 45 min)</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} ({(n * 45) / 60}h)
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center justify-end gap-2 sm:col-span-2">
              <button onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100">
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <button onClick={submit} className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                Agregar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
