import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
type FontScale = 'normal' | 'large' | 'xlarge';

interface SettingsContextType {
  academicPeriod: string;
  setAcademicPeriod: (period: string) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  compact: boolean;
  setCompact: (compact: boolean) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  reduceMotion: boolean;
  setReduceMotion: (reduce: boolean) => void;
  resetSettings: () => void;
}

const DEFAULTS = {
  academicPeriod: '2026-01',
  theme: 'light' as Theme,
  compact: false,
  fontScale: 'normal' as FontScale,
  reduceMotion: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [academicPeriod, setAcademicPeriod] = useState(
    () => localStorage.getItem('academicPeriod') || DEFAULTS.academicPeriod,
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
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    const s = localStorage.getItem('fontScale');
    return s === 'large' || s === 'xlarge' ? s : 'normal';
  });
  const [reduceMotion, setReduceMotion] = useState<boolean>(
    () => localStorage.getItem('reduceMotion') === 'true',
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

  useEffect(() => {
    localStorage.setItem('fontScale', fontScale);
    const el = document.documentElement;
    el.classList.toggle('text-scale-large', fontScale === 'large');
    el.classList.toggle('text-scale-xlarge', fontScale === 'xlarge');
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem('reduceMotion', String(reduceMotion));
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const resetSettings = () => {
    setAcademicPeriod(DEFAULTS.academicPeriod);
    setTheme(DEFAULTS.theme);
    setCompact(DEFAULTS.compact);
    setFontScale(DEFAULTS.fontScale);
    setReduceMotion(DEFAULTS.reduceMotion);
  };

  return (
    <SettingsContext.Provider
      value={{
        academicPeriod,
        setAcademicPeriod,
        theme,
        setTheme,
        toggleTheme,
        compact,
        setCompact,
        fontScale,
        setFontScale,
        reduceMotion,
        setReduceMotion,
        resetSettings,
      }}
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
