
export interface AcademicLoad {
    [subjectCode: string]: {
        theory?: string[]; // array of professorIds
        lab?: string[];    // array of professorIds
    };
}

/**
 * Hora administrativa de un profesor (Jefe de Departamento, Servicio Comunitario, etc.).
 * Es APARTE de los bloques de clase: no choca ni afecta el horario de clases. Solo se ve
 * en el horario INDIVIDUAL del profesor (visualizador + su export) y suma a su total.
 */
export interface AdminHour {
  id: string;
  professorId: string;
  role: string; // texto libre (la UI sugiere una lista)
  day: number; // 0=Lunes … 4=Viernes
  startHour: number; // franja (0 = 7:00), misma escala que los bloques
  duration: number; // franjas de 45 min
  /** Sellos de sincronización (tabla admin_hours). Ausentes en items legados
   *  de la v2.3.15 (localStorage puro); ver shared/logic/adminHours. */
  updatedAt?: string | null;
  deletedAt?: string | null;
  /** Equipo que firmó la última edición (atribución por equipo, migración 2.8). */
  updatedBy?: string | null;
}

export interface ScheduleBlock {
  id: string;
  subjectCode: string;
  semester?: number; // FK al semestre (tabla semesters)
  day: number; // 0=Mon, 1=Tue...
  startHour: number; // 7, 8...
  duration: number; // in hours
  color: string;
  type?: 'THEORY' | 'LAB';
  professorId?: string;
  section?: string;
  labGroupId?: string;
  /** Salón/aula de ESTE bloque (texto libre: "F1", "Aula 209"…). Si está vacío, el
   *  export cae al salón de la materia. Permite F1/F2 distintos por bloque. */
  aula?: string;
}
