

interface PeriodManagerProps {
  currentPeriod?: string;
  onChange?: (period: string) => void;
}

export function PeriodManager({ currentPeriod = "2026-01", onChange }: PeriodManagerProps) {
  return (
    <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 mb-6">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 text-white p-2 rounded-md">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Periodo Académico</p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{currentPeriod}</h2>
        </div>
      </div>
      
      {/* Placeholder for period selection/change logic if needed later */}
      {onChange && (
        <button 
          className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors"
          onClick={() => onChange?.(currentPeriod)}
        >
          Cambiar Periodo
        </button>
      )}
    </div>
  );
}
