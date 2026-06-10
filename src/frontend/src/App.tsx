import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProfessorsPage } from '@/components/professors/ProfessorsPage';
import { SubjectsPage } from '@/components/subjects/SubjectsPage';
import { ScheduleBuilder } from '@/components/schedule/ScheduleBuilder';
import { ScheduleControlBar } from '@/components/schedule/ScheduleControlBar';
import { ScheduleVisualization } from '@/components/visualization/ScheduleVisualization';
import { ReportsPage } from '@/components/reports/ReportsPage';
import { HomePage } from '@/components/home/HomePage';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { ChatWidget } from '@/components/chat/ChatWidget';
import { Toaster } from 'react-hot-toast';
import { SettingsProvider, useSettings } from '@/context/SettingsContext';
import { AppDataProvider, useAppData } from '@/context/AppDataContext';


function AppContent() {
  const {
    loading,
    error,
    selectedSemester,
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
    if (sections.length >= 26) return;
    // Buscar la primera letra libre (evita duplicar al borrar una del medio).
    let i = 0;
    while (sections.includes(String.fromCharCode(65 + i))) i++;
    setSections([...sections, String.fromCharCode(65 + i)]);
  };

  const handleRemoveSection = (sectionToRemove: string) => {
    if (sections.length <= 1) return;
    const updated = sections.filter((s) => s !== sectionToRemove);
    setSections(updated);
    if (selectedSection === sectionToRemove) {
      setSelectedSection(updated[0]);
    }
  };

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
            <ScheduleControlBar
              sections={sections}
              selectedSection={selectedSection}
              onSelectSection={setSelectedSection}
              onAddSection={handleAddSection}
              onRemoveSection={handleRemoveSection}
            />

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
