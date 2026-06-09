import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { PensumSubject, Professor } from '../../../../shared/src/index';
import { ScheduleBlock } from '@/types/schedule';
import { ExportButton } from './ExportButton';
import { CourseInfoTable } from './CourseInfoTable';
import { Toaster, toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useSettings } from '../../context/SettingsContext';
import { useAppData } from '../../context/AppDataContext';
import { useScheduleValidation } from '../../hooks/useScheduleValidation';

interface ScheduleBuilderProps {
  semesterNumber: number;
  availableSubjects: PensumSubject[];
  section: string;
  readOnly?: boolean;
  filterProfessorId?: string;
}

const TIME_SLOTS = [
    "7:00-7:45", "7:45-8:30", "8:30-9:15", "9:15-10:00", 
    "10:00-10:45", "10:45-11:30", "11:30-12:15", "12:15-1:00",
    "1:00-1:45", "1:45-2:30", "2:30-3:15", "3:15-4:00",
    "4:00-4:45", "4:45-5:30", "5:30-6:15", "6:15-7:00"
];

const DAYS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

// Colores suaves para las materias, similar al documento
const COLORS = [
    { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200' },
    { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-200' },
    { bg: 'bg-yellow-50', text: 'text-yellow-900', border: 'border-yellow-200' },
    { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200' },
    { bg: 'bg-pink-50', text: 'text-pink-900', border: 'border-pink-200' },
    { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-200' },
];

interface CellData {
    blocks: ScheduleBlock[]; // todos los bloques que ARRANCAN en esta celda (labs solapados)
    rowspan: number;
    isEmpty: boolean;
}

export function ScheduleBuilder({ semesterNumber, availableSubjects, section, readOnly = false, filterProfessorId = 'all' }: ScheduleBuilderProps) {
    const { academicPeriod, setAcademicPeriod } = useSettings();
    const {
        professors,
        scheduleBlocks,
        pensum,
        academicLoad,
        handleBlocksChange: onBlocksChange,
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

    // Assign a persistent color index to each subject code
    const subjectColors = useMemo(() => {
        const map: Record<string, number> = {};
        availableSubjects.forEach((sub, index) => {
            map[sub.code] = index % COLORS.length;
        });
        return map;
    }, [availableSubjects]);

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
        if (filterProfessorId !== 'all') {
            return scheduleBlocks.filter(b => b.professorId === filterProfessorId);
        }
        return currentSemesterBlocks;
    }, [filterProfessorId, scheduleBlocks, currentSemesterBlocks]);

    const tableData = useMemo(() => {
        const data: CellData[][] = TIME_SLOTS.map(() =>
            DAYS.map(() => ({ blocks: [] as ScheduleBlock[], rowspan: 1, isEmpty: true }))
        );

        // 1) Agrupar TODOS los bloques que arrancan en cada celda (permite labs solapados).
        blocksToDisplay.forEach((block: ScheduleBlock) => {
            const row = block.startHour;
            const day = block.day;
            if (row < TIME_SLOTS.length) {
                data[row][day].blocks.push(block);
                data[row][day].isEmpty = false;
            }
        });

        // 2) Rowspan = mayor duración del grupo; enmascarar las filas cubiertas (si están vacías).
        for (let r = 0; r < TIME_SLOTS.length; r++) {
            for (let d = 0; d < DAYS.length; d++) {
                const cell = data[r][d];
                if (cell.blocks.length === 0) continue;
                const maxDur = Math.max(...cell.blocks.map((b) => b.duration));
                cell.rowspan = maxDur;
                for (let i = 1; i < maxDur; i++) {
                    if (r + i < TIME_SLOTS.length && data[r + i][d].blocks.length === 0) {
                        data[r + i][d] = { blocks: [], rowspan: 0, isEmpty: true };
                    }
                }
            }
        }

        return data;
    }, [blocksToDisplay]);

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
            day: day,
            startHour: startRow,
            duration: duration,
            color: 'default',
            type: assignmentType,
            professorId: selectedProfessorId || undefined,
            section: section
        };

        const time = TIME_SLOTS[startRow].split('-')[0];
        logScheduleChange('Agregar Bloque', `Se agregó bloque de ${subject.name} el día ${DAYS[day]} a las ${time}`);

        onBlocksChange([...scheduleBlocks, newBlock]);

        setIsDragging(false);
        setSelectionStart(null);
        setSelectionEnd(null);
    }, [isDragging, selectionStart, selectionEnd, selectedSubjectCode, currentSemesterBlocks, scheduleBlocks, assignmentType, onBlocksChange, getSubject, selectedProfessorId, section, validateBlock, logScheduleChange]);

    // Eliminar un bloque concreto desde el modal de detalle de la celda.
    const removeBlockFromDetail = useCallback((b: ScheduleBlock) => {
        const newBlocks = scheduleBlocks.filter((x: ScheduleBlock) => x.id !== b.id);
        const sub = getSubject(b.subjectCode);
        const time = TIME_SLOTS[b.startHour].split('-')[0];
        logScheduleChange('Eliminar Bloque', `Se eliminó bloque de ${sub?.name || b.subjectCode} el día ${DAYS[b.day]} a las ${time}`);
        onBlocksChange(newBlocks);
        setDetailCell((prev) => {
            if (!prev) return null;
            const remaining = prev.blocks.filter((x) => x.id !== b.id);
            return remaining.length ? { ...prev, blocks: remaining } : null;
        });
    }, [scheduleBlocks, getSubject, logScheduleChange, onBlocksChange]);

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

                        {/* Feature #14: Dynamic Professor Assignment Dropdown */}
                        <div className="mt-3">
                            <label className="block text-xs font-bold text-gray-700 mb-1">Profesor Asignado al Bloque:</label>
                            <select
                                value={selectedProfessorId || ''}
                                onChange={(e) => setSelectedProfessorId(e.target.value || null)}
                                className="w-full text-xs font-medium border border-gray-300 rounded px-2 py-1.5 focus:border-brand-accent focus:outline-none bg-gray-50 text-gray-800"
                            >
                                <option value="">Sin Asignar</option>
                                {(() => {
                                    const loadObj = selectedSubjectCode ? academicLoad[selectedSubjectCode] : undefined;
                                    const rawProfIds = loadObj 
                                        ? (assignmentType === 'THEORY' ? loadObj.theory : loadObj.lab) 
                                        : undefined;
                                    const profIds = Array.isArray(rawProfIds) ? Array.from(rawProfIds) : (typeof rawProfIds === 'string' ? [rawProfIds] : []);
                                    
                                    return (profIds || []).map((id: string) => {
                                        const p = professors.find(prof => prof.id === id);
                                        return p ? <option key={p.id} value={p.id}>{p.fullName}</option> : null;
                                    });
                                })()}
                            </select>
                            <p className="text-[9px] text-gray-500 mt-1 italic leading-tight">Cambiará automáticamente según tu Carga Académica al seleccionar una materia, pero puedes elegir otro manual.</p>
                        </div>

                        <div className="space-y-2 max-h-[calc(100vh-250px)] lg:max-h-[calc(100vh-200px)] overflow-y-auto p-2">
                            {availableSubjects
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
                                        <div className="flex items-center gap-1">
                                            <span>SEMESTRE {semesterNumber}° SECCIÓN "{section}"</span>
                                        </div>

                                        {/* Filter Dropdown removed from here */}


                                    </div>
                                    <span>UBICACIÓN NIVEL FERIA PISO 2</span>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    {!readOnly && (
                                    <ExportButton
                                        semesterNumber={semesterNumber}
                                        subjects={availableSubjects}
                                        scheduleBlocks={currentSemesterBlocks}
                                        academicLoad={academicLoad}
                                        professors={professors}
                                        section={section}
                                    />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Schedule Table - HTML TABLE con formato exacto de la imagen */}
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
                                    {TIME_SLOTS.map((timeLabel, rowIndex) => (
                                        <tr key={rowIndex}>
                                            {/* Time Column */}
                                            <td
                                                className="px-2 py-3 text-center text-xs font-semibold text-black bg-white"
                                                style={{
                                                    border: '2px solid black',
                                                    borderRight: '2px solid black',
                                                    borderTop: rowIndex === 0 ? '2px solid black' : '1px solid black',
                                                    borderBottom: rowIndex === TIME_SLOTS.length - 1 ? '2px solid black' : '1px solid black',
                                                    width: '100px',
                                                    minHeight: '50px'
                                                }}
                                            >
                                                {timeLabel}
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
                                                const subject = primary ? getSubject(primary.subjectCode) : null;
                                                const color = primary && subject ? getSubjectColor(subject.code) : null;
                                                const classroomDisplay = subject?.labNumber ? `Lab ${subject.labNumber}` : 'Aula-F1';
                                                const professor = primary?.professorId
                                                    ? professors.find((p: Professor) => p.id === primary.professorId)
                                                    : null;

                                                // Filtro por profesor: se atenúa si NINGÚN bloque de la celda es de ese profe.
                                                const isFilteredOut = filterProfessorId !== 'all' &&
                                                                      hasBlocks &&
                                                                      !blocks.some((b) => b.professorId === filterProfessorId);

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
                                                            borderBottom: rowIndex === TIME_SLOTS.length - 1 ? '2px solid black' : '1px solid black',
                                                            minHeight: '50px',
                                                            verticalAlign: 'middle'
                                                        }}
                                                    >
                                                        {hasBlocks ? (
                                                            isMulti ? (
                                                                <div className="flex flex-col justify-center items-center h-full py-1 text-purple-800">
                                                                    <div className="font-bold text-[10px] uppercase leading-tight">
                                                                        {allLab ? '🧪 Laboratorios' : 'Clases'}
                                                                    </div>
                                                                    <span className="text-[8px] border border-purple-400 rounded px-1 text-purple-700 bg-purple-50 font-bold mt-0.5">
                                                                        {blocks.length} {allLab ? 'labs' : 'bloques'} · ver
                                                                    </span>
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
                                                                                    LAB {subject.labNumber ? `(${subject.labNumber})` : ''}
                                                                                </span>
                                                                            )}
                                                                            <span>{classroomDisplay}</span>
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
                subjects={availableSubjects}
                academicLoad={academicLoad}
                professors={professors}
            />

            {/* Detalle de la celda: qué bloques/labs tiene este horario (al hacer click) */}
            {detailCell && createPortal(
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
                    onMouseDown={() => setDetailCell(null)}
                >
                    <div
                        className="bg-white rounded-lg shadow-xl w-full max-w-md p-5"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-gray-900">
                                {DAYS[detailCell.day]} · {TIME_SLOTS[detailCell.row]}
                            </h3>
                            <button onClick={() => setDetailCell(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                            {detailCell.blocks.length} bloque(s) en este horario
                            {detailCell.blocks.length > 1 && detailCell.blocks.every((b) => b.type === 'LAB')
                                ? ' — laboratorios en paralelo'
                                : ''}:
                        </p>
                        <div className="space-y-2 max-h-[55vh] overflow-auto">
                            {detailCell.blocks.map((b) => {
                                const sub = getSubject(b.subjectCode);
                                const prof = b.professorId ? professors.find((p: Professor) => p.id === b.professorId) : null;
                                return (
                                    <div key={b.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2.5">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-800 truncate">{sub?.name ?? b.subjectCode}</div>
                                            <div className="text-xs text-gray-500 flex gap-2 flex-wrap mt-0.5">
                                                <span className={b.type === 'LAB' ? 'text-purple-700 font-medium' : ''}>
                                                    {b.type === 'LAB' ? `🧪 Lab${sub?.labNumber ? ' ' + sub.labNumber : ''}` : 'Teoría'}
                                                </span>
                                                {b.section && <span>Sección {b.section}</span>}
                                                {prof && <span>{prof.title} {prof.fullName}</span>}
                                            </div>
                                        </div>
                                        {!readOnly && (
                                            <button
                                                onClick={() => removeBlockFromDetail(b)}
                                                title="Eliminar este bloque"
                                                className="flex-shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1.5"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}