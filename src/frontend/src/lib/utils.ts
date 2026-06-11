import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind CSS de manera segura
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza texto para búsquedas: minúsculas y sin acentos/diacríticos.
 * Así "analisis" encuentra "Análisis" y "Pena" encuentra "Peña".
 */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
