import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

interface SettingsContextType {
  academicPeriod: string;
  setAcademicPeriod: (period: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  compact: boolean;
  setCompact: (compact: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [academicPeriod, setAcademicPeriod] = useState(
    () => localStorage.getItem('academicPeriod') || '2026-01',
  );
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    // Compatibilidad con la clave antigua 'darkMode'
    return localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light';
  });
  const [compact, setCompact] = useState<boolean>(
    () => localStorage.getItem('compactMode') === 'true',
  );

  useEffect(() => {
    localStorage.setItem('academicPeriod', academicPeriod);
  }, [academicPeriod]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('darkMode', String(theme === 'dark'));
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('compactMode', String(compact));
    document.documentElement.classList.toggle('compact', compact);
  }, [compact]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <SettingsContext.Provider
      value={{ academicPeriod, setAcademicPeriod, theme, setTheme, toggleTheme, compact, setCompact }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
