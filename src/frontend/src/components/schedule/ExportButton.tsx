import { PensumSubject, Professor } from '../../../../shared/src/index';
import { generateSchedulePdf } from '@/services/PdfExportService';
import { useState } from 'react';
import { ScheduleBlock, AcademicLoad } from '@/types/schedule';
interface ExportButtonProps {
  semesterNumber: number;
  subjects: PensumSubject[];
  scheduleBlocks: ScheduleBlock[];
  academicLoad: AcademicLoad;
  professors: Professor[];
  section: string;
}

export function ExportButton({ semesterNumber, subjects, scheduleBlocks, academicLoad, professors, section }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [filename, setFilename] = useState(`Horario_Semestre_${semesterNumber}`);

  const handleExportClick = () => {
    setShowNameInput(true);
  };

  const handleConfirmExport = async () => {
    try {
      setIsExporting(true);
      await generateSchedulePdf(semesterNumber, subjects, scheduleBlocks, academicLoad, professors, filename, section);
      setShowNameInput(false);
    } catch (error) {
      console.error('Error exporting schedule:', error);
      alert('Error al exportar. Intenta de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      {!showNameInput ? (
        <button
          onClick={handleExportClick}
          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm font-medium text-sm border border-transparent hover:border-red-400/30"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <path d="M12 18v-6"/>
            <path d="m9 15 3 3 3-3"/>
          </svg>
          Exportar PDF
        </button>
      ) : (
        <div className="flex items-center gap-2 bg-white border border-brand-light/30 p-1 pr-2 rounded-lg shadow-lg absolute right-0 top-0 z-50 min-w-[300px]">
            <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none"
                placeholder="Nombre del archivo"
                autoFocus
            />
             <span className="text-gray-400 text-xs">.pdf</span>
            
            <button
                onClick={handleConfirmExport}
                disabled={isExporting}
                className="p-1.5 bg-brand-navy text-white rounded hover:bg-brand-blue disabled:opacity-50"
                title="Guardar"
            >
                {isExporting ? (
                     <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </button>
            <button
                onClick={() => setShowNameInput(false)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="Cancelar"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
      )}
    </div>
  );
}
