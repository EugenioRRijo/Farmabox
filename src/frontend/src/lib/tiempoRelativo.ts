/**
 * Tiempo relativo humano en español: "hace un momento", "hace 5 min",
 * "hace 3 h", "hace 2 días". Para los sellos updatedAt/deletedAt que muestra
 * la vista previa de sincronización ("por PC Laboratorio · hace 5 min").
 */
export function tiempoRelativo(iso: string, ahora: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const seg = Math.max(0, Math.round((ahora.getTime() - t) / 1000));
  if (seg < 60) return 'hace un momento';
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? 'hace 1 h' : `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}
