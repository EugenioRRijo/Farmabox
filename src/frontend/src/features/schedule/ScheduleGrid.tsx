import React, { useState, useMemo } from "react";

/**
 * Day of week type
 */
type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

/**
 * Schedule block for the grid
 */
interface ScheduleBlock {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  subjectName: string;
  professorName: string;
  classroomName: string;
}

interface ScheduleGridProps {
  blocks?: ScheduleBlock[];
  onBlockClick?: (block: ScheduleBlock) => void;
  onAddBlock?: (day: DayOfWeek, time: string) => void;
}

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: "MONDAY", label: "Lunes" },
  { key: "TUESDAY", label: "Martes" },
  { key: "WEDNESDAY", label: "Miércoles" },
  { key: "THURSDAY", label: "Jueves" },
  { key: "FRIDAY", label: "Viernes" },
  { key: "SATURDAY", label: "Sábado" },
];

const TIME_SLOTS = [
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

// Color palette for subjects
const SUBJECT_COLORS = [
  "bg-blue-500",
  "bg-green-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-red-500",
];

/**
 * ScheduleGrid Component
 * Weekly calendar view with schedule blocks.
 */
export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  blocks = [],
  onBlockClick,
  onAddBlock,
}) => {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Create color map for subjects
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueSubjects = [...new Set(blocks.map((b) => b.subjectName))];
    uniqueSubjects.forEach((subject, index) => {
      map.set(subject, SUBJECT_COLORS[index % SUBJECT_COLORS.length]);
    });
    return map;
  }, [blocks]);

  // Get blocks for a specific cell
  const getBlocksForCell = (day: DayOfWeek, time: string): ScheduleBlock[] => {
    return blocks.filter((block) => {
      return block.day === day && block.startTime <= time && block.endTime > time;
    });
  };

  // Calculate block height in rows
  const getBlockSpan = (block: ScheduleBlock): number => {
    const startHour = parseInt(block.startTime.split(":")[0]);
    const endHour = parseInt(block.endTime.split(":")[0]);
    return endHour - startHour;
  };

  // Check if this is the first cell of a block
  const isFirstCellOfBlock = (block: ScheduleBlock, time: string): boolean => {
    return block.startTime === time;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
          Horario Semanal
        </h2>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            <div className="p-3 text-center font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900">
              Hora
            </div>
            {DAYS.map((day) => (
              <div
                key={day.key}
                className="p-3 text-center font-medium text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900"
              >
                {day.label}
              </div>
            ))}
          </div>

          {/* Time Rows */}
          {TIME_SLOTS.map((time) => (
            <div
              key={time}
              className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700"
            >
              {/* Time Label */}
              <div className="p-2 text-center text-sm text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                {time}
              </div>

              {/* Day Cells */}
              {DAYS.map((day) => {
                const cellBlocks = getBlocksForCell(day.key, time);
                const cellKey = `${day.key}-${time}`;
                const isHovered = hoveredCell === cellKey;

                return (
                  <div
                    key={cellKey}
                    className={`relative min-h-[60px] border-r border-gray-100 dark:border-gray-700 transition-colors ${
                      isHovered && cellBlocks.length === 0
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : ""
                    }`}
                    onMouseEnter={() => setHoveredCell(cellKey)}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => {
                      if (cellBlocks.length === 0 && onAddBlock) {
                        onAddBlock(day.key, time);
                      }
                    }}
                  >
                    {/* Render blocks */}
                    {cellBlocks.map((block) => {
                      if (!isFirstCellOfBlock(block, time)) return null;

                      const span = getBlockSpan(block);
                      const colorClass =
                        subjectColorMap.get(block.subjectName) || "bg-gray-500";

                      return (
                        <div
                          key={block.id}
                          className={`absolute inset-x-1 rounded-md ${colorClass} text-white p-2 cursor-pointer hover:opacity-90 transition-opacity shadow-sm overflow-hidden`}
                          style={{
                            top: "2px",
                            height: `calc(${span * 100}% + ${(span - 1) * 4}px - 4px)`,
                            zIndex: 10,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBlockClick?.(block);
                          }}
                        >
                          <div className="font-medium text-sm truncate">
                            {block.subjectName}
                          </div>
                          <div className="text-xs opacity-90 truncate">
                            {block.professorName}
                          </div>
                          <div className="text-xs opacity-75 truncate">
                            {block.classroomName}
                          </div>
                          <div className="text-xs opacity-75">
                            {block.startTime} - {block.endTime}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add button on hover */}
                    {isHovered && cellBlocks.length === 0 && (
                      <button
                        className="absolute inset-0 flex items-center justify-center text-blue-500 dark:text-blue-400 hover:text-blue-600"
                        onClick={() => onAddBlock?.(day.key, time)}
                      >
                        <span className="text-2xl">+</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      {blocks.length > 0 && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Materias
          </h3>
          <div className="flex flex-wrap gap-2">
            {[...subjectColorMap.entries()].map(([subject, color]) => (
              <div key={subject} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${color}`}></div>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {subject}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
