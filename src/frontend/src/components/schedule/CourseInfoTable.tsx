import { PensumSubject, Professor } from '../../../../shared/src/index';
import { AcademicLoad } from '@/types/schedule';

interface CourseInfoTableProps {
    subjects: PensumSubject[];
    academicLoad: AcademicLoad;
    professors: Professor[];
}

export function CourseInfoTable({ subjects, academicLoad, professors }: CourseInfoTableProps) {
    const getProfNames = (ids?: string[] | string) => {
        const safeIds = Array.isArray(ids) ? ids : (typeof ids === 'string' ? [ids] : []);
        if (safeIds.length === 0) return <span className="text-red-400 italic">Sin Asignar</span>;
        return safeIds.map(id => professors.find(p => p.id === id)?.fullName || id).join(', ');
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
                                <td className="px-2 py-3 text-center text-xs text-black bg-white" style={{ border: '1px solid black' }}>
                                    {subject.labNumber ? `# ${subject.labNumber}` : ''}
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
