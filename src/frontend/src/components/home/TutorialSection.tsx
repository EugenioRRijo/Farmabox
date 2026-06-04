import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  Users, 
  BookOpen, 
  Calendar, 
  FileText, 
  CheckCircle,
  AlertTriangle,
  Printer
} from 'lucide-react';

export function TutorialSection() {
  const steps = [
    {
      title: "1. Gestión de Profesores",
      description: "Comienza registrando a los docentes en el sistema. Puedes agregar su carga académica predeterminada y disponibilidad.",
      icon: <Users className="w-6 h-6 text-blue-600" />,
      color: "bg-blue-50 border-blue-200"
    },
    {
      title: "2. Revisión de Materias",
      description: "Verifica que el pensum esté actualizado. Las materias se cargarán automáticamente al crear los horarios.",
      icon: <BookOpen className="w-6 h-6 text-emerald-600" />,
      color: "bg-emerald-50 border-emerald-200"
    },
    {
      title: "3. Planificación de Horarios",
      description: "Utiliza el constructor visual para asignar bloques de horario. El sistema evitará solpes dentro del mismo semestre.",
      icon: <Calendar className="w-6 h-6 text-purple-600" />,
      color: "bg-purple-50 border-purple-200"
    },
    {
      title: "4. Verificación de Cruces",
      description: "Usa la herramienta de 'Cruce de Horarios' para detectar conflictos entre diferentes semestres (ej. Semestre 1 vs 2).",
      icon: <AlertTriangle className="w-6 h-6 text-orange-600" />,
      color: "bg-orange-50 border-orange-200"
    },
    {
      title: "5. Seguimiento y Control",
      description: "Visualiza el historial de cambios en tiempo real para mantener un control detallado de todas las modificaciones realizadas.",
      icon: <FileText className="w-6 h-6 text-gray-600" />,
      color: "bg-gray-50 border-gray-200"
    },
    {
      title: "6. Validación y Entrega",
      description: "Revisa el estado general del sistema para asegurar que no existan conflictos y genera los documentos finales para su distribución.",
      icon: <Printer className="w-6 h-6 text-teal-600" />,
      color: "bg-teal-50 border-teal-200"
    }
  ];

  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <div ref={containerRef} className="py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <CheckCircle className="w-5 h-5 text-indigo-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Guía de Uso del Sistema</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className={`p-6 rounded-xl border ${step.color} bg-white shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group`}
          >
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500`}>
              {step.icon}
            </div>
            
            <div className="relative z-10">
              <div className="w-12 h-12 rounded-lg bg-white shadow-sm flex items-center justify-center mb-4">
                {step.icon}
              </div>
              
              <h3 className="font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
