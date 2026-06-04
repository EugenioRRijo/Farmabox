import { useEffect, useState } from 'react';
import { 
  Users, 
  BookOpen, 
  GraduationCap, 
  Calendar,
  Activity,
  ArrowRight
} from 'lucide-react';
import * as BackendService from '../../services/BackendService';
import { TutorialSection } from './TutorialSection';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { useSettings } from '../../context/SettingsContext';

export function HomePage() {
  const { professors, pensum, academicLoad, scheduleBlocks } = useAppData();
  const navigate = useNavigate();
  const { academicPeriod } = useSettings();
  const [logs, setLogs] = useState<BackendService.LogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const data = await BackendService.getLogs();
        // Sort by timestamp desc and take top 10
        const sorted = data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
        setLogs(sorted);
      } catch (error) {
        console.error('Error fetching logs:', error);
      } finally {
        setLoadingLogs(false);
      }
    }
    fetchLogs();
  }, []);

  const stats = [
    {
      label: 'Profesores',
      value: professors.length,
      icon: <Users className="w-6 h-6 text-brand-accent" />,
      color: 'bg-brand-pale/30 border-brand-light/30',
      textColor: 'text-brand-navy'
    },
    {
      label: 'Materias',
      value: pensum.reduce((acc, sem) => acc + sem.subjects.length, 0),
      icon: <BookOpen className="w-6 h-6 text-emerald-600" />, // Keep emerald for contrast or change to brand-blue? Let's keep distinct colors for stats but muted. 
      // Actually, let's make them all fit the theme:
      color: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-900'
    },
    {
      label: 'Semestres',
      value: pensum.length,
      icon: <GraduationCap className="w-6 h-6 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200',
      textColor: 'text-purple-900'
    }
  ];
  // Wait, I should probably use the palette for at least the 'Profesores' one which was blue. 
  // The user sent a palette of 5 blues. It might be better to make the app monochrome-ish (all blues) or keep semantic colors.
  // "Cambiar el front... con esta paleta" usually implies the main theme.
  // I'll update the blue one to use brand colors, and maybe shift the others to be compatible (e.g. Desaturated or related).
  // For now I'll just update the blue one as shown above.


  const quickActions = [
    {
      label: 'Gestionar Profesores',
      desc: 'Agregar o editar docentes',
      icon: <Users className="w-5 h-5" />,
      path: 'professors',
      color: 'bg-white hover:bg-gray-50'
    },
    {
      label: 'Ver Materias',
      desc: 'Administrar pensum',
      icon: <BookOpen className="w-5 h-5" />,
      path: 'subjects',
      color: 'bg-white hover:bg-gray-50'
    },
    {
      label: 'Planificar Horario',
      desc: 'Crear horarios por semestre',
      icon: <Calendar className="w-5 h-5" />,
      path: 'schedule',
      color: 'bg-white hover:bg-gray-50'
    },
    {
      label: 'Cruce de Horarios',
      desc: 'Detectar conflictos entre semestres',
      icon: <Activity className="w-5 h-5" />,
      path: 'collisions',
      color: 'bg-white hover:bg-gray-50'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Panel de Control</h1>
        <p className="text-gray-600 mt-2">Bienvenido al sistema de gestión académica.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`p-6 rounded-xl border ${stat.color} shadow-sm`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className={`text-3xl font-bold mt-2 ${stat.textColor}`}>{stat.value}</p>
              </div>
              <div className="p-3 bg-white rounded-lg shadow-sm">
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-500" />
            Acciones Rápidas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={`flex items-start p-4 rounded-xl border border-gray-200 shadow-sm transition-all text-left group ${action.color} h-full`}
              >
                <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-brand-pale group-hover:text-brand-blue transition-colors">
                  {action.icon}
                </div>
                <div className="ml-4">
                  <h3 className="font-semibold text-gray-900 group-hover:text-brand-blue transition-colors">
                    {action.label}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{action.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 ml-auto group-hover:text-brand-accent group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>
          
          {/* Tutorial Section */}
          <div className="pt-6 border-t border-gray-100">
            <TutorialSection />
          </div>
        </div>

        {/* Recent Activity & System Status */}
        <div className="space-y-6 lg:col-span-1">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Actividad Reciente</h2>
              <button 
                onClick={() => navigate('/reports')}
                className="text-sm text-brand-accent hover:text-brand-blue font-medium"
              >
                Ver todo
              </button>
            </div>
            
            {loadingLogs ? (
              <div className="text-center py-8 text-gray-400">Cargando actividad...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-400">No hay actividad reciente</div>
            ) : (
              <div className="space-y-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-brand-accent mt-2"></div>
                      <div className="w-px h-full bg-gray-100 my-1"></div>
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-medium text-gray-900">{log.action}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{log.details}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(log.timestamp).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Planning Status Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Estado de Planificación
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <span className="text-sm text-gray-600">Periodo Académico</span>
                <span className="text-sm font-bold text-brand-navy bg-brand-pale px-2 py-1 rounded">
                  {academicPeriod}
                </span>
              </div>
              
              <div className="space-y-3">
                 {/* Computation of metrics */}
                 {(() => {
                   const totalSubjects = pensum.reduce((acc, sem) => acc + sem.subjects.length, 0);
                   const assignedSubjects = Object.keys(academicLoad).length;
                   const scheduledSubjects = new Set(scheduleBlocks.map(b => b.subjectCode)).size;
                   
                   const pendingTeachers = Math.max(0, totalSubjects - assignedSubjects);
                   const pendingSchedule = Math.max(0, totalSubjects - scheduledSubjects);
                   
                   const activeProfessors = new Set(
                     Object.values(academicLoad).flatMap((l: { theory?: string[] | string, lab?: string[] | string }) => [
                       ...(Array.isArray(l.theory) ? l.theory : (typeof l.theory === 'string' ? [l.theory] : [])),
                       ...(Array.isArray(l.lab) ? l.lab : (typeof l.lab === 'string' ? [l.lab] : []))
                     ])
                   );
                   const unusedProfessors = Math.max(0, professors.length - activeProfessors.size);

                   return (
                     <>
                        <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-md shadow-sm">
                              <BookOpen className="w-4 h-4 text-orange-500" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{pendingTeachers}</p>
                              <p className="text-xs text-gray-500">Materias sin docente</p>
                            </div>
                          </div>
                          {pendingTeachers > 0 && <span className="w-2 h-2 rounded-full bg-orange-500"></span>}
                        </div>

                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-md shadow-sm">
                              <Calendar className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{pendingSchedule}</p>
                              <p className="text-xs text-gray-500">Materias sin horario</p>
                            </div>
                          </div>
                          {pendingSchedule > 0 && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                        </div>

                        <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-md shadow-sm">
                              <Users className="w-4 h-4 text-purple-500" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{unusedProfessors}</p>
                              <p className="text-xs text-gray-500">Docentes sin carga</p>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
              </div>
              
              <div className="pt-2 text-center border-t border-gray-50 mt-2">
                 <p className="text-[10px] text-gray-400">Datos actualizados en tiempo real</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
