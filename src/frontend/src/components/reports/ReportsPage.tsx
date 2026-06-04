import { useEffect, useState, useMemo } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';
// Import type only for props
import type { ScheduleBlock } from '@/types/schedule'; 
import * as Backend from '../../services/BackendService';
import { VisualCollisionGrid } from './VisualCollisionGrid';

import { useAppData } from '../../context/AppDataContext';

interface ReportsPageProps {
  initialTab?: 'logs' | 'collisions';
}

export function ReportsPage({ initialTab = 'collisions' }: ReportsPageProps) {
  const { scheduleBlocks, pensum, professors } = useAppData();
  const [activeTab, setActiveTab] = useState<'logs' | 'collisions'>(initialTab);
  
  // ── Logs State ───────────────────────────────────────
  const [logs, setLogs] = useState<Backend.LogEntry[]>([]);
  
  // ── Collisions State ─────────────────────────────────
  const [filterSemester, setFilterSemester] = useState<number | 'all'>('all');
  const [filterSection, setFilterSection] = useState<string | 'all'>('all');

  useEffect(() => {
    async function fetchLogs() {
      try {
        const data = await Backend.getLogs();
        setLogs(data);
      } catch (err) {
        console.error('Failed to load logs', err);
      }
    }
    if (activeTab === 'logs') {
        fetchLogs();
    }
  }, [activeTab]);

  // ── Collision Detection Logic ────────────────────────
  const collisions = useMemo(() => {
    if (!scheduleBlocks.length || !pensum.length) return [];

    // Map subject code to Semester Number & Name
    const subjectMap = new Map<string, { semester: number, name: string }>();
    pensum.forEach((sem: { number: number, subjects: { code: string, name: string }[] }) => {
      sem.subjects.forEach(sub => {
        subjectMap.set(sub.code, { semester: sem.number, name: sub.name });
      });
    });

    const detected: Array<{
      blockA: ScheduleBlock;
      blockB: ScheduleBlock;
      nameA: string;
      nameB: string;
      semA: number;
      semB: number;
      section: string;
      type: 'PROFESOR' | 'LABORATORIO' | 'TEORIA';
      professorName?: string;
    }> = [];

    // O(N^2) overlap detection across ALL blocks (all semesters, all sections)
    for (let i = 0; i < scheduleBlocks.length; i++) {
        for (let j = i + 1; j < scheduleBlocks.length; j++) {
            const b1 = scheduleBlocks[i];
            const b2 = scheduleBlocks[j];

            const b1Section = b1.section || 'A';
            const b2Section = b2.section || 'A';
            
            // Only compare blocks within the SAME day and SAME section
            if (b1.day !== b2.day || b1Section !== b2Section) continue;
            
            const b1End = b1.startHour + b1.duration;
            const b2End = b2.startHour + b2.duration;

            const overlap = (b1.startHour < b2End) && (b2.startHour < b1End);
            
            if (overlap) {
                const info1 = subjectMap.get(b1.subjectCode);
                const info2 = subjectMap.get(b2.subjectCode);

                if (!info1 || !info2) continue;

                // Rule 1: Professor Collision (Any Semester)
                const isProfCollision = b1.professorId && b2.professorId && b1.professorId === b2.professorId;
                
                // Rule 2: Lab Collision (same subject, same section, same time)
                // Since they are the same subject Code and same section (from earlier), any overlap is a collision
                const isLabCollision = b1.type === 'LAB' && b2.type === 'LAB' && info1.semester === info2.semester && b1.subjectCode === b2.subjectCode;

                // Rule 3: Theory Collision (Same semester, students can't be in 2 theory classes)
                const isTheoryCollision = b1.type === 'THEORY' && b2.type === 'THEORY' && info1.semester === info2.semester;

                if (isProfCollision || isLabCollision || isTheoryCollision) {
                    const prof = isProfCollision ? professors.find(p => p.id === b1.professorId) : undefined;
                    
                    let collisionType: 'PROFESOR' | 'LABORATORIO' | 'TEORIA' = 'TEORIA';
                    if (isProfCollision) collisionType = 'PROFESOR';
                    else if (isLabCollision) collisionType = 'LABORATORIO';

                    detected.push({
                        blockA: b1,
                        blockB: b2,
                        nameA: info1.name,
                        nameB: info2.name,
                        semA: info1.semester,
                        semB: info2.semester,
                        section: b1Section,
                        type: collisionType,
                        professorName: prof?.fullName
                    });
                }
            }
        }
    }
    return detected;

  }, [scheduleBlocks, pensum, professors]);



  // Pass only the colliding blocks to VisualCollisionGrid
  const relevantBlocks = useMemo(() => {
    const blocksSet = new Set<ScheduleBlock>();
    collisions.forEach(c => {
        blocksSet.add(c.blockA);
        blocksSet.add(c.blockB);
    });
    return Array.from(blocksSet);
  }, [collisions]);

  // Filter collisions based on view mode and filters
  const filteredCollisions = useMemo(() => {
    let result = collisions;
    if (filterSemester !== 'all') {
        result = result.filter(c => c.semA === filterSemester || c.semB === filterSemester);
    }
    if (filterSection !== 'all') {
        result = result.filter(c => c.section === filterSection);
    }
    return result;
  }, [collisions, filterSemester, filterSection]);

  // Group filtered collisions by section
  const filteredBySection = useMemo(() => {
    const groups: Record<string, typeof filteredCollisions> = {};
    filteredCollisions.forEach(c => {
        if (!groups[c.section]) groups[c.section] = [];
        groups[c.section].push(c);
    });
    return groups;
  }, [filteredCollisions]);


  const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  const TIME_SLOTS = [
    "7:00", "7:45", "8:30", "9:15", 
    "10:00", "10:45", "11:30", "12:15",
    "1:00", "1:45", "2:30", "3:15",
    "4:00", "4:45", "5:30", "6:15", "7:00"
  ];

  /* 
     Helper to format time range 
     Assuming blocks align with the 45min slots standard used in the app.
     startHour is the index in the slot array. 
  */
  const formatBlockTime = (start: number, duration: number) => {
      // Safety check
      if (start < 0 || start >= TIME_SLOTS.length) return `${start}:00 - ${start + duration}:00`;
      
      const startTime = TIME_SLOTS[start];
      const endIndex = start + duration;
      const endTime = TIME_SLOTS[endIndex] || "???";
      
      return `${startTime} - ${endTime}`;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <h1 className="text-3xl font-bold text-gray-800">Reportes del Sistema</h1>
        {/* ... tabs ... */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
                onClick={() => setActiveTab('collisions')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'collisions' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'
                }`}
            >
                Cruce de Horarios
            </button>
            <button
                onClick={() => setActiveTab('logs')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'logs' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-black'
                }`}
            >
                Entradas de Registro (Logs)
            </button>
        </div>

        {/* View mode toggle - only show on collisions tab */}
        {activeTab === 'collisions' && (
          <div className="ml-auto flex items-center gap-5">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium">Semestre:</span>
                <select
                    value={filterSemester}
                    onChange={(e) => setFilterSemester(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:outline-none bg-white font-medium"
                >
                    <option value="all">Todos</option>
                    {pensum.map(s => <option key={s.number} value={s.number}>{s.number}°</option>)}
                </select>
            </div>
            
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 font-medium">Sección:</span>
                <select
                    value={filterSection}
                    onChange={(e) => setFilterSection(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-black focus:outline-none bg-white font-medium uppercase"
                >
                    <option value="all">Todas</option>
                    {Array.from(new Set(scheduleBlocks.map((b: ScheduleBlock) => b.section || 'A'))).sort().map(sec => (
                        <option key={sec} value={sec}>{sec}</option>
                    ))}
                </select>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'logs' ? (
           // ... logs view ...
           <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-700">Historial de Cambios</h2>
                <button 
                    onClick={() => Backend.getLogs().then(setLogs)}
                    className="text-sm text-blue-600 hover:underline"
                >
                    Actualizar
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">Fecha</th>
                            <th className="px-6 py-3">Acción</th>
                            <th className="px-6 py-3">Detalle</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                                    No hay registros disponibles.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 whitespace-nowrap text-gray-500">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-3 font-medium text-gray-900">
                                        {log.action}
                                    </td>
                                    <td className="px-6 py-3 text-gray-600">
                                        {log.details}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>
      ) : (
          <div className="flex flex-col gap-8">
              {/* Top Section: Controls & Collision List */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Controls (1/3 width approx -> 4 cols) */}
                  <div className="lg:col-span-4 flex flex-col gap-6">
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                          <h2 className="text-lg font-bold mb-4">Resumen Global</h2>
                          <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                                  <span className="text-sm font-medium text-red-800">Total Colisiones</span>
                                  <span className="bg-red-200 text-red-900 px-2 py-1 rounded-full text-xs font-bold">{collisions.length}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                                  <span className="text-sm font-medium text-orange-800">De Profesor</span>
                                  <span className="bg-orange-200 text-orange-900 px-2 py-1 rounded-full text-xs font-bold">{collisions.filter(c => c.type === 'PROFESOR').length}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                                  <span className="text-sm font-medium text-purple-800">De Laboratorio</span>
                                  <span className="bg-purple-200 text-purple-900 px-2 py-1 rounded-full text-xs font-bold">{collisions.filter(c => c.type === 'LABORATORIO').length}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                  <span className="text-sm font-medium text-blue-800">De Teoría</span>
                                  <span className="bg-blue-200 text-blue-900 px-2 py-1 rounded-full text-xs font-bold">{collisions.filter(c => c.type === 'TEORIA').length}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                  <span className="text-sm font-medium text-gray-700">Secciones con choques</span>
                                  <span className="bg-gray-200 text-gray-900 px-2 py-1 rounded-full text-xs font-bold">{Object.keys(filteredBySection).length}</span>
                              </div>
                          </div>
                      </div>
                      
                      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                          <p className="font-bold flex items-center gap-2 mb-1"> <Activity className="w-4 h-4"/> Cómo funciona</p>
                          <p className="opacity-90">
                              El sistema evalúa <strong>todas las secciones y semestres</strong> para detectar imposibilidades físicas:
                              <br/>1. Dos clases teóricas del mismo semestre a la misma hora.
                              <br/>2. Dos prácticas de laboratorio del mismo semestre en el MISMO salón a la misma hora.
                              <br/>3. Un profesor dictando dos materias distintas a la misma hora.
                          </p>
                      </div>
                  </div>

                  {/* List Results (2/3 width approx -> 8 cols) */}
                  <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[500px]">
                      <div className="px-6 py-4 border-b border-gray-200 bg-red-50 flex justify-between items-center">
                          <h2 className="font-bold text-red-800 flex items-center gap-2">
                              <span>⚠️</span> Conflictos por Sección y Semestre
                          </h2>
                          <span className="bg-red-200 text-red-900 px-2 py-1 rounded-full text-xs font-bold">
                              {filteredCollisions.length}
                          </span>
                      </div>
                      <div className="overflow-y-auto p-0 flex-grow">
                           {filteredCollisions.length === 0 ? (
                               <div className="h-full flex flex-col items-center justify-center text-gray-500">
                                   <p className="font-medium text-lg">Sin choques detectados</p>
                                   <p className="text-sm text-gray-400 mt-1">Todas las secciones y semestres están libres de conflictos</p>
                               </div>
                           ) : (
                               <div>
                                   {Object.entries(filteredBySection).map(([sec, secCollisions]) => (
                                       <div key={sec} className="border-b-2 border-gray-200 last:border-b-0">
                                           <div className="px-4 py-2 bg-gray-100 font-bold text-sm text-gray-700 sticky top-0 z-10 flex justify-between items-center">
                                               <span>Sección "{sec}"</span>
                                               <span className="text-xs bg-gray-300 text-gray-800 px-2 py-0.5 rounded-full">{secCollisions.length} choque(s)</span>
                                           </div>
                                           <div className="divide-y divide-gray-100">
                                               {secCollisions.map((c, i) => (
                                                   <div key={i} className="p-4 hover:bg-gray-50 transition-colors bg-white">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-16 flex-shrink-0 text-center">
                                                                <span className="block text-xs font-bold text-gray-500 uppercase">{DAYS[c.blockA.day]}</span>
                                                            </div>
                                                            
                                                            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                                                                 {/* Block A */}
                                                                <div className="bg-white p-3 rounded-lg border-l-4 border-blue-400 relative shadow-sm">
                                                                    <div className="text-xs text-blue-700 uppercase font-bold mb-1">{c.type === 'PROFESOR' ? `Choque de Profesor${c.professorName ? `: ${c.professorName}` : ''}` : c.type === 'LABORATORIO' ? 'Choque de LAB' : 'Choque de TEORÍA'}</div>
                                                                    <div className="font-bold text-gray-900 leading-tight">{c.nameA}</div>
                                                                    <div className="text-xs text-gray-500 mt-1 flex justify-between">
                                                                        <span className="bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Sem {c.semA}</span>
                                                                        <span className="font-mono">{formatBlockTime(c.blockA.startHour, c.blockA.duration)}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Block B */}
                                                                <div className="bg-white p-3 rounded-lg border-l-4 border-orange-400 relative shadow-sm">
                                                                    <div className="font-bold text-gray-900 leading-tight">{c.nameB}</div>
                                                                    <div className="text-xs text-gray-500 mt-1 flex justify-between">
                                                                        <span className="bg-orange-50 text-orange-800 px-1.5 py-0.5 rounded text-[10px] font-bold">Sem {c.semB}</span>
                                                                        <span className="font-mono">{formatBlockTime(c.blockB.startHour, c.blockB.duration)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="hidden md:block">
                                                                <AlertTriangle className="w-6 h-6 text-red-400" />
                                                            </div>
                                                        </div>
                                                   </div>
                                               ))}
                                           </div>
                                       </div>
                                   ))}
                               </div>
                           )}
                      </div>
                  </div>
              </div>

              {/* Bottom Panel: Visual Grid */}
              <div className="w-full">
                 <VisualCollisionGrid 
                    blocks={relevantBlocks}
                    pensum={pensum}
                    professors={professors}
                 />
              </div>
          </div>
      )}
    </div>
  );
}
