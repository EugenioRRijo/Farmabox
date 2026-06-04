import { Semester } from '../../../../shared/src/index';

interface SemesterSelectorProps {
  selectedSemester: number | null;
  onSelect: (semester: number) => void;
  semesters: Semester[];
}

export function SemesterSelector({ selectedSemester, onSelect, semesters }: SemesterSelectorProps) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
        Selecciona un Semestre
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {semesters.map((sem) => (
          <button
            key={sem.number}
            onClick={() => onSelect(sem.number)}
            className={`
              p-4 rounded-lg font-semibold
              ${
                selectedSemester === sem.number
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200'
              }
            `}
          >
            Semestre {sem.number}
          </button>
        ))}
      </div>
    </div>
  );
}
