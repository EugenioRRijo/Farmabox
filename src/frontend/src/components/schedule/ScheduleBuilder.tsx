import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus, FlaskConical, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { PensumSubject, Professor } from '../../../../shared/src/index';
import { ScheduleBlock } from '@/types/schedule';
import { ExportButton } from './ExportButton';
import { CourseInfoTable } from './CourseInfoTable';
import { Toaster, toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { useAppData } from '../../context/AppDataContext';
import { useScheduleValidation } from '../../hooks/useScheduleValidation';
import { slotLabel, turnoForSemester, defaultWindowForTurno, MIN_SLOT, MAX_SLOT } from '@/lib/timeSlots';

interface ScheduleBuilderProps {
  semesterNumber: number;
  availableSubjects: PensumSubject[];
  section: string;
  readOnly?: boolean;
  filterProfessorIds?: string[];
}

const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

// Paleta de colores BIEN distintos para las materias: hues separados en el
// círculo cromático y ordenados para que materias contiguas contrasten al
// máximo. Tono -100 (más saturado que -50, que se veían casi iguales entre sí).
// Con 12 colores ningún color se repite dentro de un semestre.
const COLORS = [
    { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-300' },
    { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300' },
    { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300' },
    { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
    { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-300' },
    { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-300' },
    { bg: 'bg-green-100', text: 'text-green-900', border: 'border-green-300' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', border: 'border-fuchsia-300' },
    { bg: 'bg-cyan-100', text: 'text-cyan-900', border: 'border-cyan-300' },
    { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-300' },
    { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-300' },
    { bg: 'bg-lime-100', text: 'text-lime-900', border: 'border-lime-300' },
];

interface CellData {
    blocks: ScheduleBlock[]; // todos los bloques que ARRANCAN en esta celda (labs solapados)
    rowspan: number;
    isEmpty: boolean;
}

/** Hora "h:mm a.m./p.m." del INICIO del bloque i (la grilla arranca a las 7:00 AM,
 *  bloques de 45 min). Se usa para mostrar el rango horario visible EN VIVO, así —con
 *  los botones +45/−45 arriba— la persona ve hasta qué hora llega sin scrollear. */
function slotStartClock(i: number): string {
    const total = 7 * 60 + i * 45;
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    const ampm = hh < 12 ? 'a.m.' : 'p.m.';
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export function ScheduleBuilder({ semesterNumber, availableSubjects, section, readOnly = false, filterProfessorIds = [] }: ScheduleBuilderProps) {
    const { academicPeriod, setAcademicPeriod, locationLabel } = useSettings();
    const {
        professors,
        scheduleBlocks,
        pensum,
        academicLoad,
        handleBlocksChange: onBlocksChange,
        handleUpdateSubject,
        logScheduleChange,
        isSaving,
        lastSaved
    } = useAppData();
    const { validateBlock } = useScheduleValidation();

    // Section comes from parent (Feature #8)

    // UI Selection State
    const [selectedSubjectCode, setSelectedSubjectCode] = useState<string | null>(null);
    const [assignmentType, setAssignmentType] = useState<'THEORY' | 'LAB'>('THEORY');
    const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null);
    const [selectionStart, setSelectionStart] = useState<{day: number, row: number} | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{day: number, row: number} | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    // Detalle de una celda ocupada (al hacer click): muestra qué bloques/labs tiene.
    const [detailCell, setDetailCell] = useState<{ day: number; row: number; blocks: ScheduleBlock[] } | null>(null);
    // Materia elegida para "agregar otro laboratorio en este horario" (desde el detalle).
    const [quickAddCode, setQuickAddCode] = useState<string>('');

    // Filter blocks by current semester's subjects and CURRENT SECTION
    const currentSemesterBlocks = useMemo(() => {
        const semesterSubjectCodes = new Set(availableSubjects.map((s: PensumSubject) => s.code));
        return scheduleBlocks.filter((b: ScheduleBlock) =>
            semesterSubjectCodes.has(b.subjectCode) &&
            (b.section === section || (!b.section && section === 'A'))
        );
    }, [scheduleBlocks, availableSubjects, section]);

    // isSaving / lastSaved vienen del contexto (reflejan el guardado real, no un timer falso).

    // handleUpdateCourseInfo removed

    // Orden ESTABLE de materias (por código). El backend no garantiza el orden de
    // filas y, tras un UPDATE (p. ej. asignar salón), las devuelve en otro orden →
    // la lista "saltaba". Ordenar por código fija el orden para siempre.
    const orderedSubjects = useMemo(
        () => [...availableSubjects].sort((a, b) => a.code.localeCompare(b.code)),
        [availableSubjects],
    );

    // Assign a persistent color index to each subject code
    const subjectColors = useMemo(() => {
        const map: Record<string, number> = {};
        orderedSubjects.forEach((sub, index) => {
            map[sub.code] = index % COLORS.length;
        });
        return map;
    }, [orderedSubjects]);

    // Map subjectCode → lab room (salón). Used to detect same-room lab clashes.
    const subjectRooms = useMemo(() => {
        const map: Record<string, string> = {};
        pensum.forEach((sem) => {
            sem.subjects.forEach((sub) => {
                if (sub.labNumber) map[sub.code] = sub.labNumber;
            });
        });
        return map;
    }, [pensum]);

    // Auto-select first subject
    useEffect(() => {
        if (availableSubjects.length > 0 && !selectedSubjectCode) {
            setSelectedSubjectCode(availableSubjects[0].code);
        }
    }, [availableSubjects, selectedSubjectCode]);

    // Auto-update selectedProfessorId when subject or assignment type changes based on Academic Load
    useEffect(() => {
        if (selectedSubjectCode) {
            const subjectLoad = academicLoad[selectedSubjectCode];
            if (subjectLoad) {
                const rawTheory = subjectLoad.theory;
                const rawLab = subjectLoad.lab;
                const assignedProfs = assignmentType === 'THEORY' 
                    ? (Array.isArray(rawTheory) ? rawTheory : (typeof rawTheory === 'string' ? [rawTheory] : []))
                    : (Array.isArray(rawLab) ? rawLab : (typeof rawLab === 'string' ? [rawLab] : []));
                setSelectedProfessorId(assignedProfs.length > 0 ? assignedProfs[0] : null);
            } else {
                setSelectedProfessorId(null);
            }
        }
    }, [selectedSubjectCode, assignmentType, academicLoad]);

    const blocksToDisplay = useMemo(() => {
        // Filtro por profesor: se restringe a los bloques de ESTE semestre/sección
        // que pertenezcan a alguno de los profesores seleccionados (no cruza grillas).
        if (filterProfessorIds.length > 0) {
            return currentSemesterBlocks.filter(
                b => !!b.professorId && filterProfessorIds.includes(b.professorId)
            );
        }
        return currentSemesterBlocks;
    }, [filterProfessorIds, currentSemesterBlocks]);

    // ── Turno + rango visible dinámico ───────────────────────────────────────
    const turno = turnoForSemester(semesterNumber);
    const win = defaultWindowForTurno(turno);
    // Expansión manual del usuario (índices absolutos). Arranca en la ventana del turno.
    const [expandMin, setExpandMin] = useState(win.start);
    const [expandMax, setExpandMax] = useState(win.end);
    // Al cambiar de semestre/turno, resetear la expansión a la ventana nueva.
    useEffect(() => {
        const w = defaultWindowForTurno(turnoForSemester(semesterNumber));
        setExpandMin(w.start);
        setExpandMax(w.end);
    }, [semesterNumber]);

    // Rango cubierto por los bloques existentes (para no ocultar ninguna clase).
    const blockRange = useMemo(() => {
        let lo = Infinity, hi = -Infinity;
        for (const b of blocksToDisplay) {
            if (b.startHour < lo) lo = b.startHour;
            const end = b.startHour + b.duration - 1;
            if (end > hi) hi = end;
        }
        return blocksToDisplay.length ? { lo, hi } : null;
    }, [blocksToDisplay]);

    // Rango visible: arranca en la ventana del turno (expandMin/Max) y SIEMPRE incluye
    // los bloques (nunca se oculta una clase). Por lo demás lo controla el usuario con
    // los botones +45 / −45. Clave del fix #2: ya NO se clava a la ventana del turno, así
    // que también se pueden recortar las filas VACÍAS de adentro de la ventana.
    const visMin = Math.max(MIN_SLOT, Math.min(expandMin, blockRange?.lo ?? expandMin));
    const visMax = Math.max(expandMax, blockRange?.hi ?? expandMax);
    const visibleRows = Array.from({ length: visMax - visMin + 1 }, (_, k) => visMin + k);

    // Se puede QUITAR una fila de 45 min solo si está VACÍA (no recorta una clase): el
    // tope es el primer/último bloque. Sin bloques, se colapsa hasta dejar 1 sola fila.
    const floorTop = blockRange ? blockRange.lo : visMax;
    const ceilBottom = blockRange ? blockRange.hi : visMin;
    const canCollapseTop = visMin < floorTop;      // hay fila(s) vacía(s) arriba
    const canCollapseBottom = visMax > ceilBottom; // hay fila(s) vacía(s) abajo

    const tableData = useMemo(() => {
        const rowCount = visMax + 1; // indexado por índice ABSOLUTO de bloque (0..visMax)
        const data: CellData[][] = Array.from({ length: rowCount }, () =>
            DAYS.map(() => ({ blocks: [] as ScheduleBlock[], rowspan: 1, isEmpty: true }))
        );

        const masked = new Set<string>(); // "day-row" cubiertas por un rowspan

        for (let day = 0; day < DAYS.length; day++) {
            const dayBlocks = blocksToDisplay.filter(
                (b: ScheduleBlock) => b.day === day && b.startHour <= visMax,
            );

            // 1) CLUSTERS DE LABS: fusiona labs solapados O consecutivos (back-to-back)
            //    en un solo bloque que abarca todo el rango → "Laboratorios".
            const labs = dayBlocks
                .filter((b: ScheduleBlock) => b.type === 'LAB')
                .sort((a: ScheduleBlock, b: ScheduleBlock) => a.startHour - b.startHour);

            let i = 0;
            while (i < labs.length) {
                const start = labs[i].startHour;
                let end = labs[i].startHour + labs[i].duration;
                const cluster: ScheduleBlock[] = [labs[i]];
                let j = i + 1;
                // Conectados si el siguiente arranca dentro del rango ya cubierto (<= end).
                while (j < labs.length && labs[j].startHour <= end) {
                    cluster.push(labs[j]);
                    end = Math.max(end, labs[j].startHour + labs[j].duration);
                    j++;
                }
                const clampedEnd = Math.min(end, rowCount);
                data[start][day].blocks.push(...cluster);
                data[start][day].isEmpty = false;
                data[start][day].rowspan = clampedEnd - start;
                for (let r = start + 1; r < clampedEnd; r++) {
                    masked.add(`${day}-${r}`);
                    data[r][day] = { blocks: [], rowspan: 0, isEmpty: true };
                }
                i = j;
            }

            // 2) TEORÍA: cada uno su celda; si solapa un cluster de labs, se agrupa con su
            //    celda "dueña" (la teoría y el lab pueden solaparse según los validadores).
            const theories = dayBlocks.filter((b: ScheduleBlock) => b.type !== 'LAB');
            for (const t of theories) {
                const start = t.startHour;
                const end = Math.min(start + t.duration, rowCount);

                // Si `start` cae DENTRO del rowspan de un cluster (fila enmascarada), buscar
                // la celda de inicio de ese cluster para agrupar ahí en vez de perder el bloque.
                let owner = start;
                if (data[start][day].blocks.length === 0 && masked.has(`${day}-${start}`)) {
                    for (let r = start - 1; r >= 0; r--) {
                        if (data[r][day].blocks.length > 0 && r + data[r][day].rowspan > start) {
                            owner = r;
                            break;
                        }
                    }
                    if (owner === start) continue; // no se encontró dueño (no debería pasar): omitir seguro
                }

                if (data[owner][day].blocks.length === 0) {
                    data[owner][day].isEmpty = false;
                    data[owner][day].rowspan = 1;
                }
                data[owner][day].blocks.push(t);

                // Asegurar que el rowspan del dueño cubra hasta `end`, enmascarando filas nuevas.
                const clampedEnd = Math.min(Math.max(owner + data[owner][day].rowspan, end), rowCount);
                for (let r = owner + 1; r < clampedEnd; r++) {
                    if (data[r][day].blocks.length === 0) {
                        masked.add(`${day}-${r}`);
                        data[r][day] = { blocks: [], rowspan: 0, isEmpty: true };
                    }
                }
                data[owner][day].rowspan = clampedEnd - owner;
            }
        }

        return data;
    }, [blocksToDisplay, visMax]);

    // Helper: Get Subject details globally (for professor filtered view crossing semesters)
    const getSubject = useCallback((code: string) => {
        let sub = availableSubjects.find(s => s.code === code);
        if (sub) return sub;
        
        for (const semester of pensum) {
            sub = semester.subjects.find(s => s.code === code);
            if (sub) return sub;
        }
        return undefined;
    }, [availableSubjects, pensum]);

    const handleMouseDown = (day: number, row: number) => {
        if (!selectedSubjectCode) return;
        setIsDragging(true);
        setSelectionStart({ day, row });
        setSelectionEnd({ day, row });
    };

    const handleMouseEnter = (day: number, row: number) => {
        if (isDragging && selectionStart) {
            // Only allow dragging within the same day
            if (day === selectionStart.day) {
                setSelectionEnd({ day, row });
            }
        }
    };

    const handleMouseUp = useCallback(() => {
        if (!isDragging || !selectionStart || !selectionEnd || !selectedSubjectCode) {
            setIsDragging(false);
            setSelectionStart(null);
            setSelectionEnd(null);
            return;
        }

        const day = selectionStart.day;
        const startRow = Math.min(selectionStart.row, selectionEnd.row);
        const endRow = Math.max(selectionStart.row, selectionEnd.row);
        const duration = endRow - startRow + 1;

        const subject = getSubject(selectedSubjectCode);
        if (!subject) return;

        // SOLID: Delegate all validation to the useScheduleValidation hook
        const proposedBlock = {
            subjectCode: selectedSubjectCode,
            day,
            startHour: startRow,
            duration,
            type: assignmentType as 'THEORY' | 'LAB',
            professorId: selectedProfessorId || undefined,
            section,
        };

        const result = validateBlock({
            newBlock: proposedBlock,
            currentSemesterBlocks,
            allBlocks: scheduleBlocks,
            subject,
            assignmentType,
            section,
            professorId: selectedProfessorId || undefined,
            subjectRooms,
        });

        if (!result.isValid) {
            toast.error(result.errorMessage || 'Error de validación');
            setIsDragging(false);
            setSelectionStart(null);
            setSelectionEnd(null);
            return;
        }

        const newBlock: ScheduleBlock = {
            id: Math.random().toString(36).substr(2, 9),
            subjectCode: selectedSubjectCode,
            semester: semesterNumber,
            day: day,
            startHour: startRow,
            duration: duration,
            color: 'default',
            type: assignmentType,
            professorId: selectedProfessorId || undefined,
            section: section
        };

        const time = slotLabel(startRow).split('-')[0];
        logScheduleChange('Agregar Bloque', `Se agregó bloque de ${subject.name} el día ${DAYS[day]} a las ${time}`);

        onBlocksChange([...scheduleBlocks, newBlock]);

        setIsDragging(false);
        setSelectionStart(null);
        setSelectionEnd(null);
    }, [isDragging, selectionStart, selectionEnd, selectedSubjectCode, currentSemesterBlocks, scheduleBlocks, assignmentType, onBlocksChange, getSubject, selectedProfessorId, section, validateBlock, logScheduleChange, subjectRooms, semesterNumber]);

    // Eliminar un bloque concreto desde el modal de detalle de la celda.
    const removeBlockFromDetail = useCallback((b: ScheduleBlock) => {
        const newBlocks = scheduleBlocks.filter((x: ScheduleBlock) => x.id !== b.id);
        const sub = getSubject(b.subjectCode);
        const time = slotLabel(b.startHour).split('-')[0];
        logScheduleChange('Eliminar Bloque', `Se eliminó bloque de ${sub?.name || b.subjectCode} el día ${DAYS[b.day]} a las ${time}`);
        onBlocksChange(newBlocks);
        setDetailCell((prev) => {
            if (!prev) return null;
            const remaining = prev.blocks.filter((x) => x.id !== b.id);
            return remaining.length ? { ...prev, blocks: remaining } : null;
        });
    }, [scheduleBlocks, getSubject, logScheduleChange, onBlocksChange]);

    // Agregar otro laboratorio en el mismo día/rango desde el modal de detalle.
    // Permite apilar labs en el mismo horario (distinto salón); valida choques de salón.
    const addLabAtRange = useCallback((day: number, startRow: number, duration: number, subjectCode: string) => {
        const subject = getSubject(subjectCode);
        if (!subject) return;

        const rawLab = academicLoad[subjectCode]?.lab;
        const labProfs = Array.isArray(rawLab) ? rawLab : (typeof rawLab === 'string' ? [rawLab] : []);
        const professorId = labProfs.length > 0 ? labProfs[0] : undefined;

        const result = validateBlock({
            newBlock: { subjectCode, day, startHour: startRow, duration, type: 'LAB', professorId, section },
            currentSemesterBlocks,
            allBlocks: scheduleBlocks,
            subject,
            assignmentType: 'LAB',
            section,
            professorId,
            subjectRooms,
        });

        if (!result.isValid) {
            toast.error(result.errorMessage || 'Error de validación');
            return;
        }

        const newBlock: ScheduleBlock = {
            id: Math.random().toString(36).substr(2, 9),
            subjectCode,
            semester: semesterNumber,
            day,
            startHour: startRow,
            duration,
            color: 'default',
            type: 'LAB',
            professorId,
            section,
        };

        const time = slotLabel(startRow).split('-')[0];
        logScheduleChange('Agregar Bloque', `Se agregó laboratorio de ${subject.name} el día ${DAYS[day]} a las ${time}`);
        onBlocksChange([...scheduleBlocks, newBlock]);
        // Reflejar el nuevo lab en el modal para poder seguir apilando.
        setDetailCell((prev) => (prev ? { ...prev, blocks: [...prev.blocks, newBlock] } : prev));
        toast.success(`Laboratorio agregado: ${subject.name}`);
    }, [getSubject, academicLoad, validateBlock, currentSemesterBlocks, scheduleBlocks, section, semesterNumber, subjectRooms, onBlocksChange, logScheduleChange]);

    // Helper to visualize selection
    const isCellSelected = (day: number, row: number) => {
        if (!isDragging || !selectionStart || !selectionEnd) return false;
        if (day !== selectionStart.day) return false;
        const start = Math.min(selectionStart.row, selectionEnd.row);
        const end = Math.max(selectionStart.row, selectionEnd.row);
        return row >= start && row <= end;
    };

    // Add global mouse up listener to handle releasing outside the grid
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                handleMouseUp();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging, handleMouseUp]);


    const getSubjectColor = (code: string) => COLORS[subjectColors[code] || 0];

    return (
        <div className="w-full bg-transparent">
            <Toaster position="top-right" />

            <div className="flex flex-col lg:flex-row items-start gap-6 max-w-full mx-auto relative">
                {/* Sidebar with subjects */}
                {!readOnly && (
                <div className="w-full lg:w-72 flex-shrink-0 sticky top-6 z-10">
                    <div className="bg-white rounded-lg shadow-lg border border-gray-300 p-4">
                        
                        <div className="mb-4 pb-3 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-800 mb-1">Materia a Asignar</h2>
                            <p className="text-xs text-gray-500">Selecciona una materia y haz clic en el horario.</p>
                        </div>

                        {/* Save Status Indicator */}
                        <div className="flex items-center gap-2 text-xs font-medium bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 mb-4">
                            {isSaving ? (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                                    <span className="text-gray-500">Guardando cambios...</span>
                                </>
                            ) : lastSaved ? (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="text-gray-500">
                                        Guardado {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </>
                            ) : (
                                <span className="text-gray-400">Listo</span>
                            )}
                        </div>

                        <div className="flex gap-2">
                             <button
                                onClick={() => setAssignmentType('THEORY')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded border ${assignmentType === 'THEORY' ? 'bg-brand-accent text-white border-brand-accent' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                             >
                                TEORÍA
                             </button>
                             <button
                                onClick={() => setAssignmentType('LAB')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded border ${assignmentType === 'LAB' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                             >
                                PRÁCTICA/LAB
                             </button>
                        </div>

                        {/* El profesor del bloque sale SIEMPRE de la Carga Académica
                            (fuente única de verdad); no hay selección manual por bloque. */}

                        <div className="space-y-2 max-h-[calc(100vh-250px)] lg:max-h-[calc(100vh-200px)] overflow-y-auto p-2">
                            {orderedSubjects
                                .filter((sub: PensumSubject) => {
                                    // Show subjects with 0/0 hours always (e.g. TEG)
                                    if (sub.hoursTheory === 0 && sub.hoursLab === 0) return true;
                                    if (assignmentType === 'THEORY') return sub.hoursTheory > 0;
                                    if (assignmentType === 'LAB') return sub.hoursLab > 0;
                                    return true;
                                })
                                .map((sub: PensumSubject) => {
                                    const color = getSubjectColor(sub.code);
                                    const isSelected = selectedSubjectCode === sub.code;

                                    // Validation Stats
                                    const theoryBlocks = currentSemesterBlocks.filter((b: ScheduleBlock) => b.subjectCode === sub.code && (b.type === 'THEORY' || !b.type));
                                    const labBlocks = currentSemesterBlocks.filter((b: ScheduleBlock) => b.subjectCode === sub.code && b.type === 'LAB');
                                    const usedTheory = theoryBlocks.reduce((acc: number, b: ScheduleBlock) => acc + b.duration, 0);
                                    const usedLab = labBlocks.reduce((acc: number, b: ScheduleBlock) => acc + b.duration, 0);

                                    const isTheoryComplete = usedTheory === sub.hoursTheory;
                                    const isLabComplete = usedLab === sub.hoursLab;

                                    return (
                                        <motion.button
                                            key={sub.code}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                setSelectedSubjectCode(sub.code);
                                            }}
                                            className={`
                                                w-full text-left p-3 rounded-lg transition-all border-2 relative
                                                ${isSelected
                                                    ? `${color.bg} ${color.border} ${color.text} shadow-md ring-2 ring-brand-accent`
                                                    : 'bg-white hover:bg-brand-pale/20 text-gray-700 border-gray-200'
                                                }
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="font-semibold text-sm leading-tight pr-6">
                                                    {sub.name}
                                                </div>
                                            </div>
                                            <div className="text-xs opacity-70 mb-1">
                                                {sub.code} • {sub.credits} UC
                                            </div>
                                            {/* Progress Bars */}
                                            <div className="space-y-1">
                                                 {assignmentType === 'THEORY' && (
                                                     <div className="flex justify-between text-[10px] text-gray-500">
                                                        <span>Teoría: {usedTheory}/{sub.hoursTheory}</span>
                                                        <span className={isTheoryComplete ? 'text-green-600 font-bold' : 'text-orange-500'}>
                                                            {sub.hoursTheory > 0 ? Math.round((usedTheory / sub.hoursTheory) * 100) : 0}%
                                                        </span>
                                                     </div>
                                                 )}
                                                 {assignmentType === 'LAB' && sub.hoursLab > 0 && (
                                                    <div className="flex justify-between text-[10px] text-gray-500">
                                                        <span>Lab: {usedLab}/{sub.hoursLab}</span>
                                                        <span className={isLabComplete ? 'text-green-600 font-bold' : 'text-brand-accent'}>
                                                            {Math.round((usedLab/sub.hoursLab)*100)}%
                                                        </span>
                                                    </div>
                                                 )}
                                            </div>
                                        </motion.button>
                                    );
                                })}
                        </div>

                        {/* Feature #7: Professor dropdown removed from sidebar */}

                        <div className="mt-4 pt-3 border-t border-gray-200">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    // Remove blocks only for the current semester and section
                                    const semesterSubjectCodes = new Set(availableSubjects.map((s: PensumSubject) => s.code));
                                    const otherBlocks = scheduleBlocks.filter((b: ScheduleBlock) =>
                                        !(semesterSubjectCodes.has(b.subjectCode) && (b.section === section || (!b.section && section === 'A')))
                                    );
                                    logScheduleChange('Limpiar Horario', `Se eliminaron todos los bloques del semestre ${semesterNumber} sección ${section}`);
                                    onBlocksChange(otherBlocks);
                                }}
                                className="w-full text-red-600 hover:text-red-700 text-sm font-medium py-2 rounded-lg hover:bg-red-50 transition-colors border-2 border-dashed border-red-300"
                            >
                                Limpiar Horario
                            </motion.button>
                        </div>
                    </div>
                </div>
                )}

                {/* Main Content - Tabla de Horarios */}
                <div className="flex-grow min-w-0">
                    <div
                        className="bg-white shadow-2xl rounded-lg border-2 border-brand-navy overflow-hidden"
                    >
                        {/* Document Header */}
                        <div className="bg-white px-8 py-6 border-b-4 border-black">
                            <div className="text-center">
                                <div className="mb-4">
                                    <div className="h-12 w-32 bg-brand-navy text-white flex items-center justify-center text-xs font-bold tracking-wider rounded">
                                        LOGO USM
                                    </div>
                                </div>
                                <h1 className="text-2xl font-bold text-black mb-1 tracking-tight">
                                    FACULTAD DE FARMACIA
                                </h1>
                                <h2 className="text-xl font-bold text-black mb-4 flex justify-center items-center gap-2">
                                    HORARIOS PERIODO ACADÉMICO
                                    <input 
                                        type="text" 
                                        value={academicPeriod} 
                                        onChange={(e) => setAcademicPeriod(e.target.value)} 
                                        className="w-32 bg-transparent border-b border-transparent hover:border-gray-400 focus:border-black focus:outline-none uppercase text-center"
                                        placeholder="EJ. 2026-01"
                                    />
                                </h2>
                                <div className="flex justify-between items-center border-t-2 border-b-2 border-black py-2 px-2 text-sm font-bold">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <span>SEMESTRE {semesterNumber}° SECCIÓN "{section}"</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${turno === 'Diurno' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}`}>
                                                {turno}
                                            </span>
                                        </div>

                                        {/* Filter Dropdown removed from here */}


                                    </div>
                                    <span>{locationLabel}</span>
                                </div>
                                {!readOnly && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                    {/* Barra compacta: ajustar las horas visibles de la grilla (antes
                                        eran barras de ancho completo arriba/abajo de la tabla). */}
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                                        {/* Rango EN VIVO: se actualiza al tocar +45/−45, así se ve
                                            hasta qué hora llega la grilla sin tener que scrollear. */}
                                        <span className="font-semibold text-gray-500">
                                            Horas visibles:{' '}
                                            <span className="font-bold text-brand-navy">
                                                {slotStartClock(visMin)} a {slotStartClock(visMax + 1)}
                                            </span>
                                        </span>

                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-medium text-gray-400">Mañana</span>
                                            <div className="flex items-center overflow-hidden rounded-md border border-gray-200">
                                                <button
                                                    onClick={() => setExpandMin(Math.max(MIN_SLOT, visMin - 1))}
                                                    disabled={visMin <= MIN_SLOT}
                                                    title="Mostrar 45 min más temprano"
                                                    className="flex items-center gap-0.5 px-2 py-1 font-medium text-brand-navy transition-colors hover:bg-brand-pale/40 disabled:cursor-not-allowed disabled:opacity-30"
                                                >
                                                    <ChevronUp className="h-3.5 w-3.5" /> +45
                                                </button>
                                                <button
                                                    onClick={() => setExpandMin(visMin + 1)}
                                                    disabled={!canCollapseTop}
                                                    title="Quitar la primera fila (solo si está vacía)"
                                                    className="flex items-center gap-0.5 border-l border-gray-200 px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                                >
                                                    <ChevronUp className="h-3.5 w-3.5" /> −45
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-medium text-gray-400">Tarde</span>
                                            <div className="flex items-center overflow-hidden rounded-md border border-gray-200">
                                                <button
                                                    onClick={() => setExpandMax(Math.min(MAX_SLOT, visMax + 1))}
                                                    disabled={visMax >= MAX_SLOT}
                                                    title="Mostrar 45 min más tarde (máximo 10:00 p.m.)"
                                                    className="flex items-center gap-0.5 px-2 py-1 font-medium text-brand-navy transition-colors hover:bg-brand-pale/40 disabled:cursor-not-allowed disabled:opacity-30"
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" /> +45
                                                </button>
                                                <button
                                                    onClick={() => setExpandMax(visMax - 1)}
                                                    disabled={!canCollapseBottom}
                                                    title="Quitar la última fila (solo si está vacía)"
                                                    className="flex items-center gap-0.5 border-l border-gray-200 px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                                >
                                                    <ChevronDown className="h-3.5 w-3.5" /> −45
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <ExportButton
                                        semesterNumber={semesterNumber}
                                        subjects={availableSubjects}
                                        scheduleBlocks={currentSemesterBlocks}
                                        academicLoad={academicLoad}
                                        professors={professors}
                                        section={section}
                                    />
                                </div>
                                )}
                            </div>
                        </div>

                        {/* Schedule Table - HTML TABLE con formato exacto de la imagen */}
                        {/* (Los botones +45/−45 ahora viven en la barra compacta del header.) */}
                        <div className="overflow-x-auto bg-white">
                            <table className="w-full border-collapse" style={{ border: '2px solid black' }}>
                                <thead>
                                    <tr>
                                        <th
                                            className="px-3 py-2.5 text-center font-bold text-sm text-black bg-white"
                                            style={{ border: '2px solid black', borderRight: '2px solid black', width: '100px' }}
                                        >
                                            HORA
                                        </th>
                                        {DAYS.map((day, idx) => (
                                            <th
                                                key={day}
                                                className="px-3 py-2.5 text-center font-bold text-sm text-black bg-white"
                                                style={{
                                                    border: '2px solid black',
                                                    borderLeft: idx === 0 ? '2px solid black' : 'none',
                                                    borderRight: idx < DAYS.length - 1 ? '2px solid black' : '2px solid black'
                                                }}
                                            >
                                                {day}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleRows.map((rowIndex) => (
                                        <tr key={rowIndex}>
                                            {/* Time Column */}
                                            <td
                                                className="px-2 py-3 text-center text-xs font-semibold text-black bg-white"
                                                style={{
                                                    border: '2px solid black',
                                                    borderRight: '2px solid black',
                                                    borderTop: rowIndex === visMin ? '2px solid black' : '1px solid black',
                                                    borderBottom: rowIndex === visMax ? '2px solid black' : '1px solid black',
                                                    width: '100px',
                                                    minHeight: '50px'
                                                }}
                                            >
                                                {slotLabel(rowIndex)}
                                            </td>

                                            {/* Day Columns */}
                                            {DAYS.map((_, dayIndex) => {
                                                const cell = tableData[rowIndex][dayIndex];

                                                // Skip cells that are part of a rowspan (rendered by previous row)
                                                if (cell.rowspan === 0) {
                                                    return null;
                                                }

                                                // Bloques que arrancan en esta celda (puede haber varios labs solapados).
                                                const blocks = cell.blocks;
                                                const hasBlocks = blocks.length > 0;
                                                const isMulti = blocks.length > 1;
                                                const primary = blocks[0] ?? null;
                                                const allLab = hasBlocks && blocks.every((b) => b.type === 'LAB');
                                                const allSameSubject = hasBlocks && blocks.every((b) => b.subjectCode === blocks[0].subjectCode);
                                                const subject = primary ? getSubject(primary.subjectCode) : null;
                                                const color = primary && subject ? getSubjectColor(subject.code) : null;
                                                // Salón: solo para LAB con número asignado (no inventamos aula para teoría).
                                                const roomLabel = primary?.type === 'LAB' && subject?.labNumber ? `Salón ${subject.labNumber}` : null;
                                                // Salones presentes en un cluster de labs agrupados.
                                                const clusterRooms = isMulti
                                                    ? Array.from(new Set(blocks.map((b) => getSubject(b.subjectCode)?.labNumber).filter(Boolean)))
                                                    : [];
                                                const professor = primary?.professorId
                                                    ? professors.find((p: Professor) => p.id === primary.professorId)
                                                    : null;

                                                // Filtro por profesor: se atenúa si NINGÚN bloque de la celda es de los profes seleccionados.
                                                const isFilteredOut = filterProfessorIds.length > 0 &&
                                                                      hasBlocks &&
                                                                      !blocks.some((b) => !!b.professorId && filterProfessorIds.includes(b.professorId));

                                                return (
                                                    <td
                                                        key={`${dayIndex}-${rowIndex}`}
                                                        rowSpan={cell.rowspan}
                                                        onMouseDown={readOnly ? undefined : (e) => {
                                                            e.preventDefault();
                                                            // Click sobre celda ocupada → abrir detalle (qué bloques/labs tiene).
                                                            if (hasBlocks) {
                                                                setDetailCell({ day: dayIndex, row: rowIndex, blocks });
                                                                return;
                                                            }
                                                            handleMouseDown(dayIndex, rowIndex);
                                                        }}
                                                        onMouseEnter={readOnly ? undefined : () => handleMouseEnter(dayIndex, rowIndex)}
                                                        className={`
                                                            px-2 py-2 text-center align-middle cursor-pointer transition-all select-none
                                                            ${hasBlocks
                                                                ? (isMulti
                                                                    ? 'bg-purple-50 text-purple-900 hover:opacity-85'
                                                                    : `${color?.bg || 'bg-gray-50'} ${color?.text || 'text-black'} hover:opacity-85`)
                                                                : isCellSelected(dayIndex, rowIndex)
                                                                    ? 'bg-brand-pale/50 ring-2 ring-inset ring-brand-accent'
                                                                    : 'bg-white hover:bg-brand-pale/10'
                                                            }
                                                            ${isFilteredOut ? 'opacity-20' : ''}
                                                        `}
                                                        style={{
                                                            border: '2px solid black',
                                                            borderLeft: dayIndex === 0 ? '2px solid black' : '1px solid black',
                                                            borderRight: dayIndex === DAYS.length - 1 ? '2px solid black' : '1px solid black',
                                                            borderTop: rowIndex === 0 ? '2px solid black' : '1px solid black',
                                                            borderBottom: rowIndex === visMax ? '2px solid black' : '1px solid black',
                                                            minHeight: '50px',
                                                            verticalAlign: 'middle'
                                                        }}
                                                    >
                                                        {hasBlocks ? (
                                                            isMulti ? (
                                                                <div className="flex flex-col justify-center items-center h-full py-1 text-purple-800">
                                                                    <div className="font-bold text-[10px] uppercase leading-tight px-1 text-center">
                                                                        {allLab ? (allSameSubject && subject ? subject.name : '🧪 Laboratorios') : 'Clases'}
                                                                    </div>
                                                                    <span className="text-[8px] border border-purple-400 rounded px-1 text-purple-700 bg-purple-50 font-bold mt-0.5">
                                                                        🧪 {blocks.length} {allLab ? (allSameSubject ? 'grupos' : 'labs') : 'bloques'} · ver
                                                                    </span>
                                                                    {clusterRooms.length > 0 && (
                                                                        <span className="text-[8px] font-semibold text-purple-700 mt-0.5">
                                                                            {clusterRooms.length === 1 ? 'Salón' : 'Salones'} {clusterRooms.join(', ')}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : subject ? (
                                                                <div className={`flex flex-col justify-center items-center h-full py-1 ${primary!.type === 'LAB' ? 'text-purple-800' : ''}`}>
                                                                    <div className="font-bold text-[10px] uppercase leading-tight mb-0.5 px-1 text-center">
                                                                        {subject.name}
                                                                    </div>
                                                                    <div className="text-[9px] font-normal opacity-75 text-center flex flex-col items-center justify-center gap-0.5">
                                                                        <div className="flex items-center justify-center gap-1 flex-wrap">
                                                                            {primary!.type === 'LAB' && (
                                                                                <span className="text-[8px] border border-purple-400 rounded px-1 text-purple-700 bg-purple-50 font-bold">
                                                                                    🧪 {roomLabel ?? 'LAB'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {professor && (
                                                                            <span className="text-[8px] italic">{professor.title} {professor.fullName}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : null
                                                        ) : (
                                                            <div className="h-full flex items-center justify-center">
                                                                <span className="text-[8px] text-gray-400 opacity-50">
                                                                    {selectedSubjectCode ? '↗' : ''}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Information Table Removed Component */}

                        {/* Footer */}
                        <div className="px-8 py-3 bg-white border-t-2 border-gray-300">
                            <p className="text-[10px] text-gray-500 text-center">
                                * Horario sujeto a cambios. Generado electrónicamente.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Resumen de Asignaturas */}
            <CourseInfoTable
                subjects={orderedSubjects}
                academicLoad={academicLoad}
                professors={professors}
                editable={!readOnly}
                onSetRoom={(code, room) => handleUpdateSubject(code, { labNumber: room })}
            />

            {/* Detalle de la celda: qué bloques/labs tiene este horario (al hacer click) */}
            {detailCell && createPortal(
                (() => {
                    const sorted = [...detailCell.blocks].sort((a, b) => a.startHour - b.startHour);
                    const minStart = Math.min(...sorted.map((b) => b.startHour));
                    const maxEnd = Math.max(...sorted.map((b) => b.startHour + b.duration));
                    const rangeLabel = `${slotLabel(minStart).split('-')[0]} – ${slotLabel(maxEnd - 1).split('-')[1]}`;
                    const allLabs = sorted.length > 1 && sorted.every((b) => b.type === 'LAB');
                    // Materias de laboratorio disponibles para apilar en este horario.
                    const labSubjects = orderedSubjects.filter((s) => s.hoursLab > 0);
                    const addCode = labSubjects.some((s) => s.code === quickAddCode)
                        ? quickAddCode
                        : (selectedSubjectCode && labSubjects.some((s) => s.code === selectedSubjectCode)
                            ? selectedSubjectCode
                            : (labSubjects[0]?.code ?? ''));
                    return (
                        <div
                            className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy/50 p-4 backdrop-blur-sm"
                            onMouseDown={() => setDetailCell(null)}
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {/* Encabezado institucional */}
                                <div className="relative flex items-center gap-3 bg-gradient-to-r from-brand-navy to-brand-blue px-5 py-4">
                                    <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-white/15 text-white">
                                        <Clock className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-bold leading-tight text-white">{DAYS[detailCell.day]}</h3>
                                        <p className="text-[11px] text-brand-pale/90">
                                            {rangeLabel} · {sorted.length} {sorted.length === 1 ? 'bloque' : 'bloques'}
                                            {allLabs ? ' en paralelo' : ''}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setDetailCell(null)}
                                        className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                        aria-label="Cerrar"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>

                                <div className="px-5 py-4">
                                    {/* Lista de bloques */}
                                    <div className="-mx-1 max-h-[48vh] space-y-2 overflow-auto px-1">
                                        {sorted.map((b) => {
                                            const sub = getSubject(b.subjectCode);
                                            const prof = b.professorId ? professors.find((p: Professor) => p.id === b.professorId) : null;
                                            const bEnd = b.startHour + b.duration;
                                            const bTime = `${slotLabel(b.startHour).split('-')[0]}–${slotLabel(bEnd - 1).split('-')[1]}`;
                                            const isLab = b.type === 'LAB';
                                            return (
                                                <div
                                                    key={b.id}
                                                    className={`group flex items-center gap-3 rounded-xl border border-l-4 bg-white p-2.5 transition-shadow hover:shadow-sm ${
                                                        isLab ? 'border-gray-200 border-l-purple-400' : 'border-gray-200 border-l-brand-accent'
                                                    }`}
                                                >
                                                    <span
                                                        className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-xs font-bold ${
                                                            isLab ? 'bg-purple-100 text-purple-700' : 'bg-brand-pale/40 text-brand-blue'
                                                        }`}
                                                    >
                                                        {isLab ? <FlaskConical className="h-4 w-4" /> : 'Tª'}
                                                    </span>
                                                    <div className="min-w-0 flex-grow">
                                                        <div className="truncate text-sm font-semibold text-gray-800">{sub?.name ?? b.subjectCode}</div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                                                            <span className="font-mono font-medium text-gray-600">{bTime}</span>
                                                            {isLab && (
                                                                <span className={`rounded-full px-1.5 py-0.5 font-semibold ${sub?.labNumber ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                    {sub?.labNumber ? `Salón ${sub.labNumber}` : 'sin salón'}
                                                                </span>
                                                            )}
                                                            {b.section && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">Sec {b.section}</span>}
                                                            {prof && <span className="truncate text-gray-400">{prof.title} {prof.fullName}</span>}
                                                        </div>
                                                    </div>
                                                    {!readOnly && (
                                                        <button
                                                            onClick={() => removeBlockFromDetail(b)}
                                                            title="Eliminar este bloque"
                                                            className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Agregar otro laboratorio en este mismo horario */}
                                    {!readOnly && labSubjects.length > 0 && (
                                        <div className="mt-4 rounded-xl border border-brand-pale/60 bg-brand-pale/15 p-3">
                                            <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-blue">
                                                <FlaskConical className="h-3.5 w-3.5" />
                                                Agregar otro laboratorio aquí
                                            </label>
                                            <div className="flex gap-2">
                                                <div className="relative min-w-0 flex-1">
                                                    <select
                                                        value={addCode}
                                                        onChange={(e) => setQuickAddCode(e.target.value)}
                                                        className="w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-800 transition-colors focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                                                    >
                                                        {labSubjects.map((s) => (
                                                            <option key={s.code} value={s.code}>
                                                                {s.name}{s.labNumber ? ` · Salón ${s.labNumber}` : ' · sin salón'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                                </div>
                                                <motion.button
                                                    whileHover={{ scale: addCode ? 1.03 : 1 }}
                                                    whileTap={{ scale: addCode ? 0.97 : 1 }}
                                                    onClick={() => addCode && addLabAtRange(detailCell.day, minStart, maxEnd - minStart, addCode)}
                                                    disabled={!addCode}
                                                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-blue disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                                                >
                                                    <Plus className="h-4 w-4" /> Agregar
                                                </motion.button>
                                            </div>
                                            <p className="mt-2 text-[10px] leading-snug text-gray-500">
                                                Se agrega en <strong className="text-gray-600">{DAYS[detailCell.day]} {rangeLabel}</strong>. Dos labs pueden coincidir en salones distintos; mismo salón a la misma hora se bloquea.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    );
                })(),
                document.body
            )}
        </div>
    );
}