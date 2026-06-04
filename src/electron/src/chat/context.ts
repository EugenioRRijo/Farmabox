/**
 * context.ts — Construye el contexto del asistente y el fallback offline.
 *
 * - buildChatContext: instrucción de sistema con un resumen de los datos cargados
 *   (profesores, materias, bloques) para que el asistente responda con conocimiento.
 * - localFallback: búsqueda local por palabras clave cuando no hay internet.
 */
import type { IStorageService } from '../services/IStorageService';
import type { ChatMessage } from '../services/GeminiService';

export function buildChatContext(storage: IStorageService): string {
  const profs = storage.loadProfessors();
  const pensum = storage.loadPensum();
  const blocks = storage.loadScheduleBlocks();

  const profNames = profs
    .map((p) => `${p.title} ${p.fullName}`)
    .slice(0, 60)
    .join(', ');
  const subjects = pensum
    .flatMap((s) => s.subjects.map((sub) => `${sub.code} ${sub.name} (sem ${s.number})`))
    .slice(0, 120)
    .join('; ');

  return [
    'Eres el asistente del "Sistema de Gestión de Horarios" de la Facultad de Farmacia (Universidad Santa María).',
    'Ayudas a usar la aplicación y respondes preguntas sobre los datos cargados. Responde en español, breve y claro.',
    'La app gestiona profesores, materias (pensum por semestres), carga académica y bloques de horario, con detección estricta de colisiones (un profesor o aula no puede estar en dos lugares a la vez).',
    `Profesores cargados (${profs.length}): ${profNames}.`,
    `Materias del pensum: ${subjects}.`,
    `Bloques de horario colocados actualmente: ${blocks.length}.`,
    'Si preguntan algo fuera de este ámbito, responde con sentido común pero recuerda tu rol.',
  ].join('\n');
}

export function localFallback(messages: ChatMessage[], storage: IStorageService): string {
  const last = messages.filter((m) => m.role === 'user').pop()?.text ?? '';
  const terms = last
    .toLowerCase()
    .split(/[^a-záéíóúñ0-9]+/i)
    .filter((w) => w.length >= 3);
  const matches = (text: string): boolean =>
    terms.some((t) => text.toLowerCase().includes(t));

  const hits: string[] = [];
  for (const p of storage.loadProfessors()) {
    if (matches(p.fullName)) {
      hits.push(`👤 ${p.title} ${p.fullName} — materias: ${p.subjects.join(', ') || 'sin asignar'}`);
    }
  }
  for (const s of storage.loadPensum()) {
    for (const sub of s.subjects) {
      if (matches(sub.name) || terms.some((t) => sub.code.includes(t))) {
        hits.push(`📘 ${sub.code} ${sub.name} (semestre ${s.number})`);
      }
    }
  }

  const head = '⚠️ Sin conexión a internet — modo búsqueda local.';
  if (hits.length) {
    return `${head}\n\nEncontré:\n${hits.slice(0, 8).join('\n')}`;
  }
  return `${head}\n\nNo encontré coincidencias para tu consulta. Probá con el nombre de un profesor o materia. (El asistente IA completo necesita internet.)`;
}
