import React, { createContext, useContext, useState, useEffect } from 'react';

type FontScale = 'normal' | 'large' | 'xlarge';

interface SettingsContextType {
  academicPeriod: string;
  setAcademicPeriod: (period: string) => void;
  locationLabel: string;
  setLocationLabel: (label: string) => void;
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
  locationLabel: 'UBICACIÓN NIVEL FERIA PISO 2',
  compact: false,
  fontScale: 'normal' as FontScale,
  reduceMotion: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [academicPeriod, setAcademicPeriod] = useState(
    () => localStorage.getItem('academicPeriod') || DEFAULTS.academicPeriod,
  );
  const [locationLabel, setLocationLabel] = useState(
    () => localStorage.getItem('locationLabel') || DEFAULTS.locationLabel,
  );
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
    localStorage.setItem('locationLabel', locationLabel);
  }, [locationLabel]);

  // El modo oscuro se eliminó de la app: limpiamos las claves viejas y la
  // clase residual para que una PC que estaba en oscuro vuelva a claro sola.
  useEffect(() => {
    localStorage.removeItem('theme');
    localStorage.removeItem('darkMode');
    document.documentElement.classList.remove('dark');
  }, []);

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

  const resetSettings = () => {
    setAcademicPeriod(DEFAULTS.academicPeriod);
    setLocationLabel(DEFAULTS.locationLabel);
    setCompact(DEFAULTS.compact);
    setFontScale(DEFAULTS.fontScale);
    setReduceMotion(DEFAULTS.reduceMotion);
  };

  return (
    <SettingsContext.Provider
      value={{
        academicPeriod,
        setAcademicPeriod,
        locationLabel,
        setLocationLabel,
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
