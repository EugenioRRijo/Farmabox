
import { useMemo } from 'react';
import { ScheduleBlock } from '@/types/schedule';
import { PensumSubject, Semester } from '../../../../shared/src/index';
import { Professor } from '../../../../shared/src/data/professorsData';
import { slotLabel } from '@/lib/timeSlots';

interface VisualCollisionGridProps {
  blocks: ScheduleBlock[];
  pensum: Semester[]; 
  professors: Professor[];
}

// Rango base 7am-7pm (la grilla de colisiones es de análisis; no necesita la noche).
const GRID_TIME_SLOTS = Array.from({ length: 16 }, (_, i) => slotLabel(i));

const DAYS_OF_WEEK = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

// Copied from ScheduleBuilder for consistency
const SUBJECT_COLORS = [
    { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200' },
    { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-200' },
    { bg: 'bg-yellow-50', text: 'text-yellow-900', border: 'border-yellow-200' },
    { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200' },
    { bg: 'bg-pink-50', text: 'text-pink-900', border: 'border-pink-200' },
    { bg: 'bg-orange-50', text: 'text-orange-900', border: 'border-orange-200' },
];

export function VisualCollisionGrid({ blocks, pensum, professors }: VisualCollisionGridProps) {

    // Flatten all subjects for easy lookup AND include semester
    const allSubjects = useMemo(() => {
        const map = new Map<string, PensumSubject & { semester: number }>();
        pensum.forEach(sem => {
            sem.subjects.forEach((sub: PensumSubject) => {
                map.set(sub.code, { ...sub, semester: sem.number });
            });
        });
        return map;
    }, [pensum]);

    // Compute consistent colors based on subject code
    const getSubjectColor = (code: string) => {
        // Simple hash to pick a color
        let hash = 0;
        for (let i = 0; i < code.length; i++) {
            hash = code.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % SUBJECT_COLORS.length;
        return SUBJECT_COLORS[index];
    };

    // Helper to calculate overlapped blocks layout
    const getDayLayout = (dayIndex: number) => {
        const dayBlocks = blocks.filter(b => b.day === dayIndex);
        
        // Sort by length (longer first) then start time to optimize packing? 
        // Or mostly by start time.
        dayBlocks.sort((a, b) => a.startHour - b.startHour || b.duration - a.duration);

        // Simple column assignment for overlaps
        const columns: ScheduleBlock[][] = [];
        
        dayBlocks.forEach(block => {
            let placed = false;
            // Try to fit in existing column
            for (const col of columns) {
                const lastInCol = col[col.length - 1];
                // Check if overlaps with the last block in this column
                // Overlap condition: Start < End
                const lastEnd = lastInCol.startHour + lastInCol.duration;
                if (block.startHour >= lastEnd) {
                    col.push(block);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                columns.push([block]);
            }
        });

        return { dayBlocks, columns };
    };

    return (
        <div className="bg-white border-2 border-gray-800 rounded-lg overflow-hidden shadow-lg">
            <div className="bg-gray-100 px-4 py-2 border-b-2 border-black flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-800">Visualización de Choques</h3>
                <div className="text-xs flex gap-2">
                    <span className="px-2 py-1 bg-white border border-gray-300 rounded shadow-sm">
                        Total bloques implicados: {blocks.length}
                    </span>
                </div>
            </div>

            {/* Removed overflow-x-auto to encourage fitting in viewport, handled by w-full */}
            <div className="w-full">
                {/* Changed min-width to w-full and reduced time column from 80px to 60px */}
                <div className="w-full grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr] border-b-2 border-black">
                    {/* Header */}
                    <div className="bg-gray-50 border-r-2 border-black p-1 text-center font-bold text-xs flex items-center justify-center">
                        HORA
                    </div>
                    {DAYS_OF_WEEK.map((day, i) => (
                        <div key={day} className={`bg-gray-50 p-1 text-center font-bold text-xs border-b-2 border-black ${i < 4 ? 'border-r-2 border-black' : ''}`}>
                            {day}
                        </div>
                    ))}
                </div>

                <div className="w-full grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr] relative">
                     {/* Time Labels Column */}
                     <div className="border-r-2 border-black">
                        {GRID_TIME_SLOTS.map((slot, i) => (
                            <div key={i} className="h-20 border-b border-gray-300 text-[10px] flex items-center justify-center bg-gray-50 font-medium text-gray-500 text-center leading-tight px-1">
                                {slot}
                            </div>
                        ))}
                     </div>

                     {/* Day Columns */}
                     {DAYS_OF_WEEK.map((_, dayIndex) => {
                         const { columns } = getDayLayout(dayIndex);
                         const colCount = columns.length;

                         return (
                            <div key={dayIndex} className={`relative border-b-2 border-black ${dayIndex < 4 ? 'border-r-2 border-black' : ''}`}>
                                {/* Grid Lines */}
                                {GRID_TIME_SLOTS.map((_, i) => (
                                    <div key={i} className="h-20 border-b border-gray-200 w-full" />
                                ))}

                                {/* Render Blocks */}
                                {columns.map((col, colIndex) => (
                                    col.map(block => {
                                        const subject = allSubjects.get(block.subjectCode);
                                        const color = getSubjectColor(block.subjectCode);
                                        const professor = professors.find(p => p.id === block.professorId);
                                        
                                        const top = block.startHour * 80; 
                                        const height = block.duration * 80;
                                        const widthPercent = 100 / colCount;
                                        const leftPercent = colIndex * widthPercent;

                                        return (
                                            <div
                                                key={block.id}
                                                className={`absolute p-0.5 rounded border overflow-hidden hover:z-10 hover:shadow-lg transition-all ${color.bg} ${color.border} ${color.text}`}
                                                style={{
                                                    top: `${top}px`,
                                                    height: `${height}px`,
                                                    left: `${leftPercent}%`,
                                                    width: `${widthPercent}%`,
                                                    zIndex: 1,
                                                    borderWidth: '1px',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                }}
                                                title={`${subject?.name} (${block.startHour}:00 - ${block.startHour + block.duration}:00)`}
                                            >
                                                <div className="flex flex-col h-full justify-center items-center text-center leading-none">
                                                    <span className="text-[10px] font-bold uppercase mb-0.5 break-words w-full leading-tight">
                                                        {subject?.name || block.subjectCode}
                                                    </span>
                                                    <span className="text-[9px] opacity-75 mb-0.5 hidden 2xl:block">
                                                        {block.type === 'LAB' ? 'LAB' : 'TEORÍA'}
                                                    </span>
                                                    {professor?.fullName && (
                                                        <span className="text-[9px] italic truncate w-full hidden xl:block">
                                                             {professor.fullName.split(' ')[0]}
                                                             {professor.fullName.split(' ')[1] ? ` ${professor.fullName.split(' ')[1].charAt(0)}.` : ''}
                                                        </span>
                                                    )}
                                                    {subject?.semester != null && (
                                                        <div className="text-[8px] font-bold bg-white/50 px-1 py-0 rounded mt-0.5 shadow-sm inline-block">
                                                            Sem {subject.semester}°
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                ))}
                            </div>
                         );
                     })}
                </div>
            </div>
        </div>
    );
}
