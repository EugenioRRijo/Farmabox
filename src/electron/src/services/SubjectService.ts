/**
 * SubjectService — Lógica de dominio para materias y pensum.
 * Maneja el pensum por semestres y la asignación de profesores a materias
 * (que actualiza el array `subjects` de cada Professor).
 */
import type { Semester, PensumSubject } from '@scheduler/shared';
import type { IStorageService } from './IStorageService';

type CreateSubjectInput = Partial<PensumSubject> & {
  code: string;
  name: string;
  semester: number | string;
};

export class SubjectService {
  constructor(
    private readonly subjectStorage: IStorageService,
    private readonly professorStorage: IStorageService,
  ) {}

  getAll(): Semester[] {
    return this.subjectStorage.loadPensum();
  }

  /** Vacía el pensum (tombstones → se sincronizan). Ya no re-siembra datos hardcodeados. */
  resetPensum(): Semester[] {
    this.subjectStorage.savePensum([]);
    return [];
  }

  /** Importación en lote: crea/actualiza materias por código (upsert). */
  bulkUpsert(incoming: (Partial<PensumSubject> & { code: string; semester: number | string })[]): Semester[] {
    const pensum = this.subjectStorage.loadPensum();
    for (const raw of incoming) {
      if (!raw.code) continue;
      const semNum = Number(raw.semester) || 1;
      const sub: PensumSubject = {
        code: String(raw.code).trim(),
        name: raw.name ?? String(raw.code),
        credits: Number(raw.credits) || 0,
        hasLab: Number(raw.hoursLab) > 0 || !!raw.hasLab,
        hoursTheory: Number(raw.hoursTheory) || 0,
        hoursLab: Number(raw.hoursLab) || 0,
        prerequisites: raw.prerequisites ?? [],
        ...(raw.labNumber ? { labNumber: String(raw.labNumber) } : {}),
        ...(raw.aula ? { aula: String(raw.aula) } : {}),
      };
      // Quitar el código de cualquier semestre (por si cambió) y reubicar.
      for (const s of pensum) s.subjects = s.subjects.filter((x) => x.code !== sub.code);
      let sem = pensum.find((s) => s.number === semNum);
      if (!sem) {
        sem = { number: semNum, subjects: [] };
        pensum.push(sem);
      }
      sem.subjects.push(sub);
    }
    const cleaned = pensum.filter((s) => s.subjects.length > 0).sort((a, b) => a.number - b.number);
    this.subjectStorage.savePensum(cleaned);
    return cleaned;
  }

  create(data: CreateSubjectInput): PensumSubject | { error: string } {
    const pensum = this.subjectStorage.loadPensum();
    const semesterNum = Number(data.semester);

    // Validar código duplicado ANTES de mutar el pensum
    const allCodes = pensum.flatMap((s) => s.subjects.map((sub) => sub.code));
    if (allCodes.includes(data.code)) {
      return { error: `Subject with code ${data.code} already exists` };
    }

    let targetSemester = pensum.find((s) => s.number === semesterNum);
    if (!targetSemester) {
      targetSemester = { number: semesterNum, subjects: [] };
      pensum.push(targetSemester);
      pensum.sort((a, b) => a.number - b.number);
    }

    const newSubject: PensumSubject = {
      code: data.code,
      name: data.name,
      credits: data.credits ?? 3,
      hasLab: data.hasLab ?? false,
      hoursTheory: data.hoursTheory ?? 0,
      hoursLab: data.hoursLab ?? 0,
      prerequisites: data.prerequisites ?? [],
      ...(data.aula ? { aula: data.aula } : {}),
    };

    const sem = pensum.find((s) => s.number === semesterNum)!;
    sem.subjects.push(newSubject);
    this.subjectStorage.savePensum(pensum);
    return newSubject;
  }

  update(code: string, updateData: Partial<PensumSubject>): PensumSubject | null {
    let found = false;
    let updatedSubject: PensumSubject | null = null;
    const pensum = this.subjectStorage.loadPensum().map((sem) => {
      sem.subjects = sem.subjects.map((s) => {
        if (s.code === code) {
          found = true;
          updatedSubject = { ...s, ...updateData, code };
          return updatedSubject;
        }
        return s;
      });
      return sem;
    });
    if (!found) return null;
    this.subjectStorage.savePensum(pensum);
    return updatedSubject;
  }

  delete(code: string): boolean {
    let found = false;
    const pensum = this.subjectStorage.loadPensum().map((sem) => {
      const initialLength = sem.subjects.length;
      sem.subjects = sem.subjects.filter((s) => s.code !== code);
      if (sem.subjects.length < initialLength) found = true;
      return sem;
    });
    if (!found) return false;
    this.subjectStorage.savePensum(pensum);
    return true;
  }

  /**
   * Asigna profesores a una materia: limpia la materia de todos los profesores
   * y luego la reasigna a los indicados.
   */
  updateProfessors(subjectCode: string, professorIds: string[]): boolean {
    const professors = this.professorStorage.loadProfessors();
    professors.forEach((p) => {
      p.subjects = p.subjects.filter((s) => s !== subjectCode);
    });
    for (const profId of professorIds) {
      const prof = professors.find((p) => p.id === profId);
      if (prof && !prof.subjects.includes(subjectCode)) {
        prof.subjects.push(subjectCode);
      }
    }
    this.professorStorage.saveProfessors(professors);
    return true;
  }
}
