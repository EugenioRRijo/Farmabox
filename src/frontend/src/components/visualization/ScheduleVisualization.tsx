import { useState, useMemo } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { ScheduleBuilder } from '../schedule/ScheduleBuilder';
import { Semester, Professor } from '../../../../shared/src/index';
import { ScheduleBlock } from '@/types/schedule';
import { generateAllSchedulesPdf, generateProfessorSchedulePdf, SchedulePageConfig } from '../../services/PdfExportService';

export function ScheduleVisualization() {
  const { pensum, professors, scheduleBlocks, academicLoad } = useAppData();
  const [filterProfessorId, setFilterProfessorId] = useState<string>('all');

  const existingSections = useMemo(() => {
      const sections = new Set<string>();
      scheduleBlocks.forEach((b: ScheduleBlock) => sections.add(b.section || 'A'));
      if (sections.size === 0) sections.add('A');
      return Array.from(sections).sort();
  }, [scheduleBlocks]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-end flex-wrap gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-800">Visualización de Horarios</h1>
            <p className="text-sm text-gray-500 mt-1">Vista de solo lectura de todos los semestres</p>
        </div>
        
        <div className="flex items-center gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-600">Filtrar Profesor:</span>
                <select
                    value={filterProfessorId}
                    onChange={(e) => setFilterProfessorId(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-brand-accent focus:outline-none"
                >
                    <option value="all">Todos los profesores</option>
                    {professors.map((p: Professor) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                    ))}
                </select>
            </div>
            
            <button
                className="px-4 py-1.5 bg-brand-navy hover:bg-brand-navy/90 text-white text-sm font-bold rounded shadow-sm transition-colors flex items-center gap-2"
                onClick={async () => {
                    // Si hay un profesor filtrado → exportar SOLO su horario consolidado.
                    if (filterProfessorId !== 'all') {
                        const prof = professors.find((p: Professor) => p.id === filterProfessorId);
                        if (!prof) return;
                        const profBlocks = scheduleBlocks.filter((b: ScheduleBlock) => b.professorId === filterProfessorId);
                        if (profBlocks.length === 0) {
                            alert(`${prof.fullName} no tiene clases asignadas en ningún horario.`);
                            return;
                        }
                        const allSubjects = pensum.flatMap((s: Semester) => s.subjects);
                        await generateProfessorSchedulePdf(prof, scheduleBlocks, allSubjects);
                        return;
                    }
                    // Sin filtro → exportar todos los semestres/secciones.
                    const configs: SchedulePageConfig[] = [];
                    for (const sec of existingSections) {
                        for (const s of pensum) {
                            const semesterSubjectCodes = new Set(s.subjects.map(sub => sub.code));
                            const blocks = scheduleBlocks.filter((b: ScheduleBlock) => semesterSubjectCodes.has(b.subjectCode) && (b.section === sec || (!b.section && sec === 'A')));
                            if (blocks.length > 0) {
                                configs.push({
                                    semesterNumber: s.number,
                                    subjects: s.subjects,
                                    blocks,
                                    academicLoad,
                                    professors,
                                    section: sec
                                });
                            }
                        }
                    }
                    if (configs.length === 0) {
                        alert("No hay horarios creados para exportar.");
                        return;
                    }
                    generateAllSchedulesPdf(configs, "Todos_Los_Horarios.pdf");
                }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {filterProfessorId !== 'all' ? 'Exportar este profesor' : 'Exportar Todos'}
            </button>
        </div>
      </div>

      <div className="space-y-16">
        {existingSections.map(sec => (
            <div key={sec} className="space-y-10">
                <h2 className="text-2xl font-bold border-b pb-2 text-brand-navy">Sección {sec}</h2>
                {pensum.map((s: Semester) => {
                    // Solo renderizar si hay materias para este semestre y sección
                    const semesterSubjectCodes = new Set(s.subjects.map(sub => sub.code));
                    const hasBlocks = scheduleBlocks.some((b: ScheduleBlock) => semesterSubjectCodes.has(b.subjectCode) && (b.section === sec || (!b.section && sec === 'A')));
                    
                    if (!hasBlocks) return null;

                    return (
                        <div key={`${sec}-${s.number}`}>
                            <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg inline-block shadow-sm">
                                <span className="text-sm font-bold text-blue-800">Semestre {s.number}° - Sección {sec}</span>
                            </div>
                            <ScheduleBuilder
                                semesterNumber={s.number}
                                availableSubjects={s.subjects}
                                section={sec}
                                readOnly={true}
                                filterProfessorId={filterProfessorId}
                            />
                        </div>
                    );
                })}
            </div>
        ))}
      </div>
    </div>
  );
}
