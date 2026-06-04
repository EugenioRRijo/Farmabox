import React, { useState } from "react";

type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

interface ScheduleBlockFormData {
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  professorId: string;
  professorName: string;
  classroomId: string;
  classroomName: string;
}

interface ScheduleBlockFormProps {
  initialData?: Partial<ScheduleBlockFormData>;
  onSubmit: (data: ScheduleBlockFormData) => void;
  onCancel: () => void;
  onValidate?: (data: ScheduleBlockFormData) => Promise<{ hasCollision: boolean; reason?: string }>;
  isEditing?: boolean;
  professors?: Array<{ id: string; name: string }>;
  classrooms?: Array<{ id: string; name: string }>;
  subjects?: Array<{ id: string; name: string }>;
}

const DAYS_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: "MONDAY", label: "Lunes" },
  { value: "TUESDAY", label: "Martes" },
  { value: "WEDNESDAY", label: "Miércoles" },
  { value: "THURSDAY", label: "Jueves" },
  { value: "FRIDAY", label: "Viernes" },
  { value: "SATURDAY", label: "Sábado" },
];

const TIME_OPTIONS = [
  "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30",
  "19:00", "19:30", "20:00", "20:30", "21:00",
];

/**
 * ScheduleBlockForm Component
 * Form for creating or editing a schedule block with collision validation.
 */
export const ScheduleBlockForm: React.FC<ScheduleBlockFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  onValidate,
  isEditing = false,
  professors = [],
  classrooms = [],
  subjects = [],
}) => {
  const [formData, setFormData] = useState<ScheduleBlockFormData>({
    day: initialData?.day || "MONDAY",
    startTime: initialData?.startTime || "08:00",
    endTime: initialData?.endTime || "10:00",
    subjectId: initialData?.subjectId || "",
    subjectName: initialData?.subjectName || "",
    professorId: initialData?.professorId || "",
    professorName: initialData?.professorName || "",
    classroomId: initialData?.classroomId || "",
    classroomName: initialData?.classroomName || "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collisionError, setCollisionError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.subjectId) {
      newErrors.subject = "La materia es requerida";
    }
    if (!formData.professorId) {
      newErrors.professor = "El profesor es requerido";
    }
    if (!formData.classroomId) {
      newErrors.classroom = "El aula es requerida";
    }
    if (formData.startTime >= formData.endTime) {
      newErrors.time = "La hora de fin debe ser mayor a la de inicio";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollisionError(null);

    if (!validate()) return;

    // Validate collisions if validator provided
    if (onValidate) {
      setIsValidating(true);
      try {
        const result = await onValidate(formData);
        if (result.hasCollision) {
          setCollisionError(result.reason || "Se detectó una colisión de horarios");
          setIsValidating(false);
          return;
        }
      } catch (err) {
        setCollisionError("Error al validar el horario");
        setIsValidating(false);
        return;
      }
      setIsValidating(false);
    }

    onSubmit(formData);
  };

  const handleSelectChange = (
    field: "subjectId" | "professorId" | "classroomId",
    value: string,
    nameField: "subjectName" | "professorName" | "classroomName",
    options: Array<{ id: string; name: string }>
  ) => {
    const selected = options.find((o) => o.id === value);
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      [nameField]: selected?.name || "",
    }));
    setCollisionError(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            {isEditing ? "Editar Bloque" : "Nuevo Bloque de Horario"}
          </h2>
        </div>

        {/* Collision Warning */}
        {collisionError && (
          <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
            <div className="flex items-center">
              <span className="text-red-600 dark:text-red-400 text-lg mr-2">⚠️</span>
              <div>
                <h4 className="font-medium text-red-800 dark:text-red-300">
                  ¡Colisión Detectada! (Tolerancia Cero)
                </h4>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {collisionError}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Day */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Día *
            </label>
            <select
              value={formData.day}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, day: e.target.value as DayOfWeek }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {DAYS_OPTIONS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hora Inicio *
              </label>
              <select
                value={formData.startTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, startTime: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hora Fin *
              </label>
              <select
                value={formData.endTime}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                }
                className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                  errors.time ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                }`}
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              {errors.time && (
                <p className="mt-1 text-sm text-red-500">{errors.time}</p>
              )}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Materia *
            </label>
            <select
              value={formData.subjectId}
              onChange={(e) =>
                handleSelectChange("subjectId", e.target.value, "subjectName", subjects)
              }
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                errors.subject ? "border-red-500" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <option value="">Seleccionar materia...</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            {errors.subject && (
              <p className="mt-1 text-sm text-red-500">{errors.subject}</p>
            )}
          </div>

          {/* Professor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Profesor *
            </label>
            <select
              value={formData.professorId}
              onChange={(e) =>
                handleSelectChange("professorId", e.target.value, "professorName", professors)
              }
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                errors.professor ? "border-red-500" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <option value="">Seleccionar profesor...</option>
              {professors.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.name}
                </option>
              ))}
            </select>
            {errors.professor && (
              <p className="mt-1 text-sm text-red-500">{errors.professor}</p>
            )}
          </div>

          {/* Classroom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Aula *
            </label>
            <select
              value={formData.classroomId}
              onChange={(e) =>
                handleSelectChange("classroomId", e.target.value, "classroomName", classrooms)
              }
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                errors.classroom ? "border-red-500" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              <option value="">Seleccionar aula...</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
            {errors.classroom && (
              <p className="mt-1 text-sm text-red-500">{errors.classroom}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isValidating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? "Validando..." : isEditing ? "Guardar Cambios" : "Crear Bloque"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
