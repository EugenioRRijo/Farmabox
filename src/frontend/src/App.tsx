import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfessorsPage } from '@/components/professors/ProfessorsPage';
import { SubjectsPage } from '@/components/subjects/SubjectsPage';
import { ScheduleBuilder } from '@/components/schedule/ScheduleBuilder';
import { ScheduleVisualization } from '@/components/visualization/ScheduleVisualization';
import { ReportsPage } from '@/components/reports/ReportsPage';
import { HomePage } from '@/components/home/HomePage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { Toaster } from 'react-hot-toast';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { AppDataProvider, useAppData } from '@/context/AppDataContext';
import { Semester } from '../../shared/src/index';


function AppContent() {
  const { 
    loading, 
    error, 
    pensum,
    selectedSemester,
    setSelectedSemester,
    availableSubjects,
  } = useAppData();

  const DEFAULT_SECTIONS = ['A', 'B', 'C', 'D', 'E'];

  // Feature #8: Section management state
  const [sections, setSections] = useState<string[]>(() => {
    const saved = localStorage.getItem('scheduleSections');
    return saved ? JSON.parse(saved) : DEFAULT_SECTIONS;
  });
  const [selectedSection, setSelectedSection] = useState<string>(() => {
    const saved = localStorage.getItem('selectedSection');
    return saved || 'A';
  });

  // Persist sections
  useEffect(() => {
    localStorage.setItem('scheduleSections', JSON.stringify(sections));
  }, [sections]);
  useEffect(() => {
    localStorage.setItem('selectedSection', selectedSection);
  }, [selectedSection]);


  const handleAddSection = () => {
    const nextLetter = String.fromCharCode(65 + sections.length);
    if (sections.length < 26) {
      setSections([...sections, nextLetter]);
    }
  };

  const handleRemoveSection = (sectionToRemove: string) => {
    if (sections.length <= 1) return;
    const updated = sections.filter((s) => s !== sectionToRemove);
    setSections(updated);
    if (selectedSection === sectionToRemove) {
      setSelectedSection(updated[0]);
    }
  };

  useEffect(() => {
    console.log('App Mounted');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-brand-pale/20">
        <div className="text-lg text-gray-500 animate-pulse">Cargando datos...</div>
      </div>
    );
  }

  // Nota: un pensum vacío es un estado VÁLIDO (la app arranca en blanco y el
  // usuario carga materias/profesores). No se bloquea la app por estar vacío.

  return (
    <MainLayout>
      {error && (
        <div className="mb-4 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          ⚠️ {error}
        </div>
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="/professors" element={<ProfessorsPage />} />
        <Route path="/subjects" element={<SubjectsPage />} />
        <Route path="/schedule" element={
          <>
            {/* Semester selector */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-medium text-gray-600">Semestre:</span>
              <div className="flex gap-2">
                {pensum.map((s: Semester) => (
                  <button
                    key={s.number}
                    onClick={() => setSelectedSemester(s.number)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      selectedSemester === s.number
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s.number}°
                  </button>
                ))}
              </div>
            </div>

            {/* Section selector */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-sm font-medium text-gray-600">Sección:</span>
              <div className="flex gap-2 items-center">
                {sections.map((sec) => (
                  <div key={sec} className="relative group">
                    <button
                      onClick={() => setSelectedSection(sec)}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        selectedSection === sec
                          ? 'bg-green-600 text-white shadow-md'
                          : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {sec}
                    </button>
                    {sections.length > 1 && (
                      <button
                        onClick={() => handleRemoveSection(sec)}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        title={`Eliminar sección ${sec}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleAddSection}
                  className="px-2 py-1.5 text-sm bg-gray-100 text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  title="Agregar sección"
                >
                  +
                </button>
              </div>
            </div>

            <ScheduleBuilder
              semesterNumber={selectedSemester}
              availableSubjects={availableSubjects}
              section={selectedSection}
            />
          </>
        } />
        <Route path="/visualization" element={<ScheduleVisualization />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/collisions" element={<ReportsPage initialTab="collisions" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-gray-400 mb-2">404</h2>
            <p className="text-gray-500">Página no encontrada</p>
          </div>
        } />
      </Routes>
      <ChatWidget />
      <Toaster position="top-right" />
    </MainLayout>
  );
}

function MotionWrapper({ children }: { children: ReactNode }) {
  const { reduceMotion } = useSettings();
  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'never'}>{children}</MotionConfig>
  );
}

function App() {
  return (
    <HashRouter>
      <SettingsProvider>
        <MotionWrapper>
          <AppDataProvider>
            <AppContent />
          </AppDataProvider>
        </MotionWrapper>
      </SettingsProvider>
    </HashRouter>
  );
}

export default App;
