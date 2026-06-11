import { useState } from 'react';
import { Plus, Check } from 'lucide-react';
import { PensumSubject, Professor } from '../../../../shared/src/index';
import { AcademicLoad } from '@/types/schedule';

interface CourseInfoTableProps {
    subjects: PensumSubject[];
    academicLoad: AcademicLoad;
    professors: Professor[];
    /** Permite asignar/editar el salón de laboratorio inline (oculto en modo solo-lectura). */
    editable?: boolean;
    /** Guarda el salón (labNumber) de una materia. */
    onSetRoom?: (subjectCode: string, room: string) => void;
}

export function CourseInfoTable({ subjects, academicLoad, professors, editable = false, onSetRoom }: CourseInfoTableProps) {
    const [editingCode, setEditingCode] = useState<string | null>(null);
    const [roomDraft, setRoomDraft] = useState('');

    const getProfNames = (ids?: string[] | string) => {
        const safeIds = Array.isArray(ids) ? ids : (typeof ids === 'string' ? [ids] : []);
        // Solo nombres que resuelven a un profesor vivo; un id colgante
        // (p. ej. "prof-001" de un profesor borrado) NO se muestra crudo.
        const names = safeIds
            .map(id => professors.find(p => p.id === id)?.fullName)
            .filter((n): n is string => !!n);
        if (names.length === 0) return <span className="text-red-400 italic">Sin Asignar</span>;
        return names.join(', ');
    };

    const startEdit = (code: string, current?: string) => {
        setEditingCode(code);
        setRoomDraft(current || '');
    };
    const commit = () => {
        if (editingCode) onSetRoom?.(editingCode, roomDraft.trim());
        setEditingCode(null);
        setRoomDraft('');
    };
    const cancel = () => {
        setEditingCode(null);
        setRoomDraft('');
    };

    if (!subjects || subjects.length === 0) return null;

    return (
        <div className="mt-8 bg-white overflow-hidden">
            <table className="w-full border-collapse" style={{ border: '2px solid black' }}>
                <thead>
                    <tr>
                        {['Código', 'Cátedra', 'Prof. Teoría', 'Prof. Práctica', 'N° Laboratorio', 'Prelación'].map((header, i) => (
                            <th
                                key={i}
                                className="px-3 py-2.5 text-center font-bold text-sm text-black bg-white"
                                style={{ border: '2px solid black' }}
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {subjects.map((subject) => {
                        const load = academicLoad[subject.code] || {};
                        const hasLab = subject.hoursLab > 0;
                        const isEditing = editingCode === subject.code;
                        return (
                            <tr key={subject.code}>
                                <td className="px-2 py-3 text-center text-xs font-semibold text-black bg-white" style={{ border: '1px solid black' }}>
                                    {subject.code}
                                </td>
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {subject.name}
                                </td>
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {getProfNames(load.theory)}
                                </td>
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {getProfNames(load.lab)}
                                </td>
                                {/* N° Laboratorio — asignar/editar salón inline (solo materias con lab) */}
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {!hasLab ? (
                                        ''
                                    ) : isEditing ? (
                                        <span className="inline-flex items-center gap-1">
                                            <input
                                                autoFocus
                                                value={roomDraft}
                                                onChange={(e) => setRoomDraft(e.target.value)}
                                                onBlur={commit}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') commit();
                                                    if (e.key === 'Escape') cancel();
                                                }}
                                                placeholder="Ej. 1"
                                                className="w-16 rounded-md border border-brand-accent bg-white px-1.5 py-1 text-center text-xs font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
                                            />
                                            <button
                                                // onMouseDown evita que el blur dispare antes del click
                                                onMouseDown={(e) => { e.preventDefault(); commit(); }}
                                                className="grid h-6 w-6 place-items-center rounded-md bg-brand-accent text-white hover:bg-brand-blue"
                                                title="Guardar salón"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </button>
                                        </span>
                                    ) : subject.labNumber ? (
                                        editable ? (
                                            <button
                                                onClick={() => startEdit(subject.code, subject.labNumber)}
                                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold text-brand-blue transition-colors hover:bg-brand-pale/40"
                                                title="Editar salón de laboratorio"
                                            >
                                                # {subject.labNumber}
                                            </button>
                                        ) : (
                                            <span className="font-bold text-brand-blue"># {subject.labNumber}</span>
                                        )
                                    ) : editable ? (
                                        <button
                                            onClick={() => startEdit(subject.code, '')}
                                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-accent/70 px-2 py-0.5 text-[11px] font-semibold text-brand-accent transition-colors hover:bg-brand-accent hover:text-white"
                                            title="Asignar salón de laboratorio"
                                        >
                                            <Plus className="h-3 w-3" strokeWidth={3} /> Salón
                                        </button>
                                    ) : (
                                        <span className="text-gray-300">—</span>
                                    )}
                                </td>
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {subject.prerequisites && subject.prerequisites.length > 0
                                        ? subject.prerequisites.join(', ')
                                        : ''}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
