import { useState, useMemo } from 'react';
import { 
  Search,
  Mail,
  BookOpen,
  Beaker,
  GraduationCap,
  Edit2,
  UserPlus,
  Users,
  X,
  LayoutGrid,
  List as ListIcon,
  Trash2,
  Copy,
  Upload,
  CalendarDays
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { normalizeText } from '@/lib/utils';

import { Professor, Semester, PensumSubject } from '../../../../shared/src/index';
import { useAppData } from '../../context/AppDataContext';
import { ImportModal } from '@/components/common/ImportModal';
import { generateProfessorSchedulePdf } from '../../services/PdfExportService';
import toast from 'react-hot-toast';

// Deterministic avatar gradient per professor — adds warmth and makes cards
// easier to tell apart at a glance. Full literal strings so Tailwind JIT keeps them.
const AVATAR_GRADIENTS = [
  'from-purple-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-fuchsia-600',
  'from-sky-500 to-blue-600',
];
function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function ProfessorsPage() {
  const {
    professors,
    pensum,
    scheduleBlocks,
    handleAddProfessor: onAdd,
    handleUpdateProfessor: onUpdate,
    handleDeleteProfessor: onDelete,
    academicLoad,
    handleUpdateLoad: onUpdateLoad
  } = useAppData();
  const [showImport, setShowImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Exporta el horario de UN profesor a PDF, con avisos claros.
  const handleExportProfessorPdf = async (prof: Professor) => {
    const myBlocks = scheduleBlocks.filter((b) => b.professorId === prof.id);
    if (myBlocks.length === 0) {
      toast.error(
        `${prof.fullName} no tiene clases asignadas en ningún horario todavía. Andá a "Horarios", asignale el profesor a sus bloques, y volvé a exportar.`,
        { duration: 6000 },
      );
      return;
    }
    try {
      await generateProfessorSchedulePdf(prof, scheduleBlocks, pensum.flatMap((s: Semester) => s.subjects));
      toast.success(`Horario de ${prof.fullName} exportado (${myBlocks.length} bloque(s)).`);
    } catch (e) {
      toast.error('No se pudo generar el PDF: ' + (e instanceof Error ? e.message : 'error desconocido'));
    }
  };
  const [sortOption, setSortOption] = useState<string>('alpha-asc');
  const [selectedProfessor, setSelectedProfessor] = useState<Professor | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Professor>>({});
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('professors-view') as 'grid' | 'list') || 'list',
  );
  const setViewMode = (m: 'grid' | 'list') => {
    localStorage.setItem('professors-view', m);
    setViewModeState(m);
  };
  const [emailsCopied, setEmailsCopied] = useState(false);
  
  // State for Subject Autocomplete in Modal
  const [subjectSearch, setSubjectSearch] = useState('');

  // Feature #1: Copy all professor emails to clipboard
  const handleCopyEmails = () => {
    const emails = professors.filter(p => p.email).map(p => p.email).join(', ');
    navigator.clipboard.writeText(emails).then(() => {
      setEmailsCopied(true);
      setTimeout(() => setEmailsCopied(false), 2000);
    });
  };

  const handleOpenDialog = (prof?: Professor) => {
    if (prof) {
        setSelectedProfessor(prof);
        setFormData(prof);
    } else {
        setSelectedProfessor(null);
        setFormData({
            title: 'Prof.',
            type: 'both',
            subjects: []
        });
    }
    setSubjectSearch('');
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (selectedProfessor) {
        // Update
        onUpdate({ 
            ...selectedProfessor, 
            ...formData as Professor 
        });
    } else {
        // Add — spread para incluir cédula, profesión, email, etc.
        const newProf: Professor = {
            ...formData,
            id: `prof-${Date.now()}`,
            fullName: formData.fullName || 'Nuevo Profesor',
            title: formData.title || 'Prof.',
            subjects: formData.subjects || [],
            type: formData.type || 'both'
        } as Professor;
        onAdd(newProf);
    }
    setIsDialogOpen(false);
  };

  // Filtrar y ordenar profesores
  const filteredProfessors = useMemo(() => {
    let result = professors;
    
    // 1. Filtrar
    if (searchQuery.trim()) {
      const query = normalizeText(searchQuery);
      result = result.filter(
        (prof) =>
          normalizeText(prof.fullName).includes(query) ||
          normalizeText(prof.title).includes(query) ||
          normalizeText(prof.email).includes(query) ||
          prof.subjects.some((code: string) => {
            const subject = pensum.flatMap((s: Semester) => s.subjects).find(
              (sub: PensumSubject) => sub.code === code
            );
            return normalizeText(subject?.name).includes(query);
          })
      );
    }
    
    // 2. Ordenar
    return [...result].sort((a, b) => {
      switch (sortOption) {
        case 'alpha-asc':
          return a.fullName.localeCompare(b.fullName);
        case 'alpha-desc':
          return b.fullName.localeCompare(a.fullName);
        case 'subjects-desc':
          return b.subjects.length - a.subjects.length;
        case 'subjects-asc':
          return a.subjects.length - b.subjects.length;
        case 'semester-asc': {
          const getLowestSem = (prof: Professor) => {
            if (!prof.subjects.length) return 99;
            let lowest = 99;
            prof.subjects.forEach(code => {
              const sem = pensum.find((s: Semester) => s.subjects.some((sub: PensumSubject) => sub.code === code));
              if (sem && sem.number < lowest) lowest = sem.number;
            });
            return lowest;
          };
          return getLowestSem(a) - getLowestSem(b);
        }
        default:
          return 0;
      }
    });
  }, [searchQuery, professors, pensum, sortOption]);

  const getSubjectName = (code: string): string => {
    for (const semester of pensum) {
      const subject = semester.subjects.find((s: PensumSubject) => s.code === code);
      if (subject) return subject.name;
    }
    return code;
  };
  
  // Get all unique subjects for Autocomplete
  const allSubjects = useMemo(() => {
    return pensum.flatMap(s => s.subjects).sort((a, b) => a.name.localeCompare(b.name));
  }, [pensum]);

  // Filtered suggestions for Autocomplete
  const subjectSuggestions = allSubjects.filter(
      s => s.name.toLowerCase().includes(subjectSearch.toLowerCase()) || 
           s.code.toLowerCase().includes(subjectSearch.toLowerCase())
  ).filter(s => !formData.subjects?.includes(s.code));


  // Estadísticas
  const stats = useMemo(() => {
    const total = professors.length;
    const withEmail = professors.filter((p) => p.email).length;
    const theoryOnly = professors.filter((p) => p.type === 'theory').length;
    const practiceOnly = professors.filter((p) => p.type === 'practice').length;
    const both = professors.filter((p) => p.type === 'both').length;
    const totalSubjects = new Set(professors.flatMap((p) => p.subjects)).size;

    return {
      total,
      withEmail,
      theoryOnly,
      practiceOnly,
      both,
      totalSubjects,
    };
  }, [professors]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-8 h-8 text-purple-600" />
              Profesores
            </h1>
            <p className="text-gray-600 mt-2">
              Facultad de Farmacia - Universidad Santa María
            </p>
          </div>
          <div className="flex gap-2">
            {/* Feature #1: Copy emails button */}
            <Button
                onClick={handleCopyEmails}
                variant="outline"
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
                <Copy className="w-4 h-4" />
                {emailsCopied ? '¡Copiado!' : 'Copiar Correos'}
            </Button>
            <Button
                onClick={() => setShowImport(true)}
                variant="outline"
                className="flex items-center gap-2 text-gray-600"
            >
                <Upload className="w-4 h-4" />
                Importar
            </Button>
            <Button
                onClick={() => handleOpenDialog()}
                className="flex items-center gap-2"
            >
                <UserPlus className="w-4 h-4" />
                Agregar Profesor
            </Button>
          </div>
        </div>

        {/* Search Bar and View Toggles */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                    type="search"
                    placeholder="Buscar por nombre, título, email o materia..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>
            
            <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="p-2 border border-gray-200 rounded-lg text-gray-700 bg-white shadow-sm focus:ring-2 focus:ring-purple-500 outline-none"
            >
                <option value="alpha-asc">Alfabético (A a Z)</option>
                <option value="alpha-desc">Alfabético (Z a A)</option>
                <option value="subjects-desc">Más materias asignadas</option>
                <option value="subjects-asc">Menos materias asignadas</option>
                <option value="semester-asc">Por número de semestre</option>
            </select>

            <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-all ${
                        viewMode === 'grid' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Vista de Cuadrícula"
                >
                    <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md transition-all ${
                        viewMode === 'list' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Vista de Lista"
                >
                    <ListIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Profesores</p>
              <p className="text-2xl font-bold text-purple-900">{stats.total}</p>
            </div>
            <Users className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Con Email</p>
              <p className="text-2xl font-bold text-blue-900">{stats.withEmail}</p>
            </div>
            <Mail className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Con Cédula</p>
              <p className="text-2xl font-bold text-green-900">{professors.filter(p => p.cedula).length}</p>
            </div>
            <GraduationCap className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Materias Asignadas</p>
              <p className="text-2xl font-bold text-orange-900">{stats.totalSubjects}</p>
            </div>
            <BookOpen className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Professors List */}
      {filteredProfessors.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-600">
            No se encontraron profesores con "{searchQuery}"
          </p>
          <p className="text-sm text-gray-400 mt-2">Intenta con otro término de búsqueda</p>
        </div>
      ) : (
         viewMode === 'grid' ? (
            // ── Grid View ──────────────────────────────────
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProfessors.map((professor: Professor) => (
              <div
               key={professor.id}
               className="group bg-white rounded-xl shadow-sm border border-gray-200 p-4 transition-all duration-200 hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5"
             >
               {/* Professor Header */}
               <div className="flex items-start gap-3 mb-3">
                 <div className={`w-10 h-10 shrink-0 rounded-full bg-gradient-to-br ${avatarGradient(professor.id || professor.fullName)} flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white`}>
                   {professor.fullName
                     .split(' ')
                     .map((n: string) => n[0])
                     .join('')
                     .toUpperCase()
                     .slice(0, 2)}
                 </div>
                 <div className="min-w-0 flex-1">
                   <h3 className="font-semibold text-gray-900 text-base leading-tight truncate" title={`${professor.title} ${professor.fullName}`}>
                     {professor.title} {professor.fullName}
                   </h3>
                   <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 mt-0.5">
                     {professor.profession && (
                       <span className="text-brand-accent font-medium truncate max-w-full">{professor.profession}</span>
                     )}
                     {professor.cedula && (
                       <span className="font-mono">C.I {professor.cedula}</span>
                     )}
                   </div>
                   {professor.email && (
                     <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5 min-w-0">
                       <Mail className="w-3 h-3 shrink-0" />
                       <span className="truncate">{professor.email}</span>
                     </div>
                   )}
                 </div>
                 <div className="flex shrink-0 -mr-1">
                   <Button
                       variant="ghost"
                       size="icon"
                       title="Editar profesor"
                       onClick={() => handleOpenDialog(professor)}
                       className="flex-shrink-0 h-8 w-8"
                   >
                    <Edit2 className="w-4 h-4" />
                   </Button>
                   <Button
                     variant="ghost"
                     size="icon"
                     title="Descargar horario del profesor (PDF)"
                     onClick={() => handleExportProfessorPdf(professor)}
                     className="flex-shrink-0 h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                   >
                     <CalendarDays className="w-4 h-4" />
                   </Button>
                   <Button
                     variant="ghost"
                     size="icon"
                     title="Eliminar profesor"
                     onClick={() => {
                       if (window.confirm('¿Estás seguro de que deseas eliminar a este profesor?')) {
                           onDelete(professor.id);
                       }
                     }}
                     className="flex-shrink-0 h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                   >
                     <Trash2 className="w-4 h-4" />
                   </Button>
                 </div>
               </div>
 
               {/* Feature #4: Type badges removed — assignment buttons below remain */}
 
               {/* Subjects List */}
               <div className="border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">
                        Materias ({professor.subjects.length})
                        </span>
                    </div>
                    {professor.subjects.length > 0 && (
                        <button
                            onClick={() => {
                                const newLoad = { ...academicLoad };
                                professor.subjects.forEach((code: string) => {
                                    if (!newLoad[code]) newLoad[code] = {};
                                    if (!newLoad[code].theory) newLoad[code].theory = [];
                                    if (!newLoad[code].lab) newLoad[code].lab = [];
                                    
                                    const t = newLoad[code].theory as string[];
                                    if (!t.includes(professor.id)) newLoad[code].theory = [...t, professor.id];
                                    
                                    const subject = pensum.flatMap((s) => s.subjects).find((s) => s.code === code);
                                    if (subject?.hasLab) {
                                        const l = newLoad[code].lab as string[];
                                        if (!l.includes(professor.id)) newLoad[code].lab = [...l, professor.id];
                                    }
                                });
                                onUpdateLoad(newLoad);
                            }}
                            className="text-[11px] font-bold text-brand-navy hover:text-brand-accent transition-colors underline"
                        >
                            + Asignar Todas
                        </button>
                    )}
                  </div>
                 {professor.subjects.length === 0 ? (
                   <div className="py-5 text-center">
                     <BookOpen className="w-7 h-7 text-gray-300 mx-auto mb-1.5" />
                     <p className="text-xs text-gray-400">Sin materias asignadas todavía</p>
                   </div>
                 ) : (
                 <div className="space-y-0.5 max-h-72 overflow-y-auto custom-scrollbar -mr-1 pr-1">
                   {professor.subjects.map((subjectCode: string) => {
                      const subject = pensum.flatMap((s) => s.subjects).find((s) => s.code === subjectCode);
                      const hasLab = subject?.hasLab;
                      const isTheoryAssigned = academicLoad[subjectCode]?.theory?.includes(professor.id);
                      const isLabAssigned = academicLoad[subjectCode]?.lab?.includes(professor.id);
                      const hasAnyAssignment = isTheoryAssigned || isLabAssigned;
                      const semNum = pensum.find((s) => s.subjects.some((sub) => sub.code === subjectCode))?.number;

                      return (
                     <div
                       key={subjectCode}
                       className={`flex items-center gap-2 rounded-lg px-2 py-2 transition-colors ${
                         hasAnyAssignment ? 'bg-emerald-50/70' : 'hover:bg-gray-50'
                       }`}
                     >
                       <div className="min-w-0 flex-1">
                         <div className="flex items-baseline gap-1.5">
                           <span className="truncate text-sm font-medium text-gray-800" title={`${getSubjectName(subjectCode)} · ${subjectCode}`}>
                               {getSubjectName(subjectCode)}
                           </span>
                           {semNum && (
                             <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-400" title={`Semestre ${semNum}`}>
                               S{semNum}
                             </span>
                           )}
                         </div>
                       </div>

                       {/* Assignment Toggles */}
                       <div className="flex shrink-0 gap-1">
                         <button
                             aria-label={isTheoryAssigned ? `Quitar teoría de ${getSubjectName(subjectCode)}` : `Asignar teoría de ${getSubjectName(subjectCode)}`}
                             title={isTheoryAssigned ? 'Teoría asignada — clic para quitar' : 'Asignar teoría'}
                             onClick={() => {
                                 const newLoad = { ...academicLoad };
                                 if (!newLoad[subjectCode]) newLoad[subjectCode] = {};
                                 if (!newLoad[subjectCode].theory) newLoad[subjectCode].theory = [];
                                 // Toggle Theory
                                 const t = newLoad[subjectCode].theory as string[];
                                 if (t.includes(professor.id)) {
                                     newLoad[subjectCode].theory = t.filter(id => id !== professor.id);
                                 } else {
                                     newLoad[subjectCode].theory = [...t, professor.id];
                                 }
                                 onUpdateLoad(newLoad);
                             }}
                             className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors ${
                                 isTheoryAssigned
                                 ? 'bg-blue-100 text-blue-700 border-blue-300'
                                 : 'bg-white text-gray-400 border-gray-200 hover:bg-blue-50 hover:text-blue-500 hover:border-blue-300'
                             }`}
                         >
                             <BookOpen className="w-3.5 h-3.5" />
                         </button>

                         {hasLab && (
                              <button
                                 aria-label={isLabAssigned ? `Quitar laboratorio de ${getSubjectName(subjectCode)}` : `Asignar laboratorio de ${getSubjectName(subjectCode)}`}
                                 title={isLabAssigned ? 'Laboratorio asignado — clic para quitar' : 'Asignar laboratorio'}
                                 onClick={() => {
                                     const newLoad = { ...academicLoad };
                                     if (!newLoad[subjectCode]) newLoad[subjectCode] = {};
                                     if (!newLoad[subjectCode].lab) newLoad[subjectCode].lab = [];
                                     // Toggle Lab
                                     const l = newLoad[subjectCode].lab as string[];
                                     if (l.includes(professor.id)) {
                                         newLoad[subjectCode].lab = l.filter(id => id !== professor.id);
                                     } else {
                                         newLoad[subjectCode].lab = [...l, professor.id];
                                     }
                                     onUpdateLoad(newLoad);
                                 }}
                                 className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors ${
                                     isLabAssigned
                                     ? 'bg-purple-100 text-purple-700 border-purple-300'
                                     : 'bg-white text-gray-400 border-gray-200 hover:bg-purple-50 hover:text-purple-500 hover:border-purple-300'
                                 }`}
                             >
                                 <Beaker className="w-3.5 h-3.5" />
                             </button>
                         )}
                       </div>
                     </div>
                   )})}
                 </div>
                 )}
               </div>
             </div>
           ))}
         </div>
         ) : (
            // ── List View ──────────────────────────────────
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Profesor</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cédula</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materias</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredProfessors.map(prof => (
                            <tr key={prof.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                         <div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xs mr-3">
                                            {prof.fullName.substring(0,2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-gray-900">{prof.title} {prof.fullName}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                    {prof.cedula || <span className="text-gray-300">-</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {prof.email ? (
                                        <div className="flex items-center gap-1">
                                            <Mail className="w-3 h-3" /> {prof.email}
                                        </div>
                                    ) : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs">
                                    {prof.subjects.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {prof.subjects.map((code: string) => {
                                                const semNum = pensum.find(s => s.subjects.some(sub => sub.code === code))?.number;
                                                const isTheory = academicLoad[code]?.theory?.includes(prof.id);
                                                const isLab = academicLoad[code]?.lab?.includes(prof.id);
                                                return (
                                                    <span
                                                        key={code}
                                                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-2.5 pr-2 py-0.5 text-xs hover:border-gray-300 hover:bg-gray-50 transition-colors"
                                                    >
                                                        <span className="truncate max-w-[140px] font-medium text-gray-700" title={getSubjectName(code)}>
                                                            {getSubjectName(code)}
                                                        </span>
                                                        {(semNum || isTheory || isLab) && (
                                                            <span className="inline-flex items-center gap-1 pl-1.5 border-l border-gray-200">
                                                                {semNum && (
                                                                    <span className="text-[10px] font-semibold tabular-nums text-gray-400" title={`Semestre ${semNum}`}>
                                                                        S{semNum}
                                                                    </span>
                                                                )}
                                                                {isTheory && (
                                                                    <span title="Teoría" className="inline-flex">
                                                                        <BookOpen className="w-3 h-3 text-blue-500" />
                                                                    </span>
                                                                )}
                                                                {isLab && (
                                                                    <span title="Laboratorio" className="inline-flex">
                                                                        <Beaker className="w-3 h-3 text-purple-500" />
                                                                    </span>
                                                                )}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <span className="text-gray-300 italic">Sin materias</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleOpenDialog(prof)}
                                            className="h-8 w-8"
                                        >
                                            <Edit2 className="w-4 h-4 text-blue-600" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title="Descargar horario del profesor (PDF)"
                                            onClick={() => handleExportProfessorPdf(prof)}
                                            className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                        >
                                            <CalendarDays className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                if (window.confirm('¿Estás seguro de que deseas eliminar a este profesor?')) {
                                                    onDelete(prof.id);
                                                }
                                            }}
                                            className="h-8 w-8 text-red-600 hover:text-red-900 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
         )
      )}

      {/* Add/Edit Professor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent title={selectedProfessor ? 'Editar Profesor' : 'Agregar Nuevo Profesor'}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {selectedProfessor
                ? 'Edita la información del profesor.'
                : 'Completa la información para agregar un nuevo profesor.'}
            </p>
            <div className="space-y-4">
              <Input 
                label="Nombre Completo" 
                placeholder="Ej: Juan Pérez" 
                value={formData.fullName || ''}
                onChange={(e) => setFormData({...formData, fullName: e.target.value})}
              />
              <Input 
                label="Cédula" 
                placeholder="V-12345678" 
                value={formData.cedula || ''}
                onChange={(e) => setFormData({...formData, cedula: e.target.value})}
              />
              <Input
                label="Email"
                type="email"
                placeholder="ejemplo@usm.edu.ve"
                value={formData.email || ''}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
              <Input
                label="Profesión"
                placeholder="Ej: Farmacéutico, Químico, Bioanalista..."
                value={formData.profession || ''}
                onChange={(e) => setFormData({...formData, profession: e.target.value})}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título
                </label>
                <select 
                    className="w-full h-10 rounded-lg border border-gray-300 px-3"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value as Professor['title']})}
                >
                  <option value="Prof.">Prof.</option>
                  <option value="Dr.">Dr.</option>
                  <option value="Dra.">Dra.</option>
                  <option value="MSc.">MSc.</option>
                  <option value="Lic.">Lic.</option>
                </select>
              </div>
            </div>
            
            {/* Subject Autocomplete Selector */}
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Materias que imparte
                </label>
                <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                     {/* Selected Tags */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {formData.subjects?.map(code => {
                            const subject = pensum.flatMap(s => s.subjects).find(s => s.code === code);
                            return (
                                <Badge key={code} variant="secondary" className="flex items-center gap-1 bg-white border border-gray-200">
                                    {subject?.name || code}
                                    <button 
                                        onClick={() => setFormData({
                                            ...formData, 
                                            subjects: formData.subjects?.filter(c => c !== code)
                                        })}
                                        className="ml-1 hover:text-red-500"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </Badge>
                            );
                        })}
                    </div>
                    
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        <input 
                            type="text"
                            placeholder="Buscar materia para asignar..."
                            className="w-full pl-8 h-10 rounded-md border border-gray-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={subjectSearch}
                            onChange={(e) => setSubjectSearch(e.target.value)}
                        />
                         {subjectSearch && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                {subjectSuggestions.length > 0 ? (
                                    subjectSuggestions.map((sub, idx) => (
                                        <button
                                            key={`${sub.code}-${idx}`}
                                            type="button"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    subjects: [...(formData.subjects || []), sub.code]
                                                });
                                                setSubjectSearch('');
                                            }}
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex justify-between items-center"
                                        >
                                            <span>{sub.name}</span>
                                            <span className="text-gray-400 font-mono text-xs">{sub.code}</span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-4 py-2 text-sm text-gray-500 italic">No se encontraron materias</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setSelectedProfessor(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave}>
                {selectedProfessor ? 'Guardar Cambios' : 'Agregar Profesor'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showImport && (
        <ImportModal
          kind="professors"
          onClose={() => setShowImport(false)}
          onDone={() => window.location.reload()}
        />
      )}
    </div>
  );
}
