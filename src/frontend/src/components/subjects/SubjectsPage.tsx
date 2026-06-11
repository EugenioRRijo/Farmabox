import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ChevronDown, ChevronUp, Beaker, Clock, GraduationCap, Link2, Plus, X, User, Trash2, Edit, CheckSquare, Square, LayoutGrid, List as ListIcon, Search, Upload } from 'lucide-react';
import * as BackendService from '../../services/BackendService';
import { ImportModal } from '@/components/common/ImportModal';
import { Badge } from '@/components/ui/Badge';
import { normalizeText } from '@/lib/utils';
import { Professor, PensumSubject, Semester } from '../../../../shared/src/index';

import { useAppData } from '../../context/AppDataContext';

export function SubjectsPage() {
  const { pensum, professors, handleAddSubject: onAddSubject, handleUpdateSubject } = useAppData();
  const [expandedSemesters, setExpandedSemesters] = useState<Set<number>>(new Set([1]));
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [viewMode, setViewModeState] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('subjects-view') as 'grid' | 'list') || 'list',
  );
  const setViewMode = (m: 'grid' | 'list') => {
    localStorage.setItem('subjects-view', m);
    setViewModeState(m);
  };
  
  // State for Professor Assignment Modal
  const [isProfModalOpen, setIsProfModalOpen] = useState(false);
  const [selectedSubjectforProf, setSelectedSubjectforProf] = useState<string | null>(null);
  const [selectedProfIds, setSelectedProfIds] = useState<string[]>([]);
  // Snapshot of professors already assigned when the modal opens — used to keep them
  // pinned at the top of the list (stable order, doesn't reshuffle while toggling).
  const [initialAssignedProfIds, setInitialAssignedProfIds] = useState<string[]>([]);
  const [profSearch, setProfSearch] = useState('');

  // State for Prerequisite Autocomplete
  const [prereqSearch, setPrereqSearch] = useState('');

  // State for Editing Subject Hours (Feature #6)
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ hoursTheory: 0, hoursLab: 0, labNumber: '' });
  
  // Handlers
  const handleDeleteSubject = async (code: string) => {
      // Find subject name before deleting
      const subjectName = pensum.flatMap(s => s.subjects).find(s => s.code === code)?.name || code;
      if (!confirm(`¿Estás seguro de eliminar la materia ${code}? Esta acción no se puede deshacer.`)) return;
      
      try {
          await BackendService.deleteSubject(code);
          await BackendService.createLog('Eliminar Materia', `Se eliminó la materia ${subjectName} (${code})`);
          // Since delete is fully refreshing state, we can keep reload or simulate locally.
          // Better to reload for delete, or implement handleDeleteSubject in context.
          // We will stick to reload for delete as it is less frequent.
          window.location.reload(); 
      } catch (err) {
          alert('Error al eliminar materia');
          console.error(err);
      }
  };

  const openProfModal = (subjectCode: string) => {
      setSelectedSubjectforProf(subjectCode);
      const currentProfs = professors.filter(p => p.subjects.includes(subjectCode)).map(p => p.id);
      setSelectedProfIds(currentProfs);
      setInitialAssignedProfIds(currentProfs);
      setProfSearch('');
      setIsProfModalOpen(true);
  };

  const handleSaveProfessors = async () => {
      if (!selectedSubjectforProf) return;
      try {
          await BackendService.updateSubjectProfessors(selectedSubjectforProf, selectedProfIds);
          const subjectName = pensum.flatMap(s => s.subjects).find(s => s.code === selectedSubjectforProf)?.name || selectedSubjectforProf;
          const profNames = professors.filter(p => selectedProfIds.includes(p.id)).map(p => p.fullName).join(', ');
          await BackendService.createLog('Asignar Profesores', `Se asignaron los profesores [${profNames}] a la materia ${subjectName} (${selectedSubjectforProf})`);
          setIsProfModalOpen(false);
          // Wait briefly, reload
          window.location.reload();
      } catch (err) {
          alert('Error al guardar profesores');
          console.error(err);
      }
  };

  const toggleProfSelection = (profId: string) => {
      setSelectedProfIds(prev => 
          prev.includes(profId) 
          ? prev.filter(id => id !== profId) 
          : [...prev, profId]
      );
  };
  
  const handleStartEdit = (subject: PensumSubject) => {
      setEditingSubject(subject.code);
      setEditForm({ hoursTheory: subject.hoursTheory, hoursLab: subject.hoursLab, labNumber: subject.labNumber || '' });
  };

  const handleSaveEdit = async (code: string) => {
      try {
          await handleUpdateSubject(code, { 
              hoursTheory: editForm.hoursTheory, 
              hoursLab: editForm.hoursLab,
              labNumber: editForm.labNumber 
          });
          setEditingSubject(null);
      } catch (err) {
          alert('Error al actualizar materia');
          console.error(err);
      }
  };
  
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    credits: 0,
    hoursTheory: 0,
    hoursLab: 0,
    hasLab: false,
    labNumber: '',
    semester: 1,
    prerequisites: [] as string[]
  });

  // Get all unique subjects for the filter dropdown
  const allSubjects = React.useMemo(() => {
    return pensum.flatMap(s => s.subjects).sort((a, b) => a.name.localeCompare(b.name));
  }, [pensum]);

  const toggleSemester = (semesterNumber: number) => {
    setExpandedSemesters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(semesterNumber)) {
        newSet.delete(semesterNumber);
      } else {
        newSet.add(semesterNumber);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedSemesters(new Set(pensum.map((s) => s.number)));
  };

  const collapseAll = () => {
    setExpandedSemesters(new Set());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onAddSubject) {
        onAddSubject({
            ...formData
        });
        setIsModalOpen(false);
        // Reset form
        setFormData({
            name: '',
            code: '',
            credits: 0,
            hoursTheory: 0,
            hoursLab: 0,
            hasLab: false,
            labNumber: '',
            semester: 1,
            prerequisites: []
        });
        setPrereqSearch('');
    }
  };


  const filteredData = pensum.map((semester: Semester) => ({
    ...semester,
    subjects: semester.subjects.filter(
      (subject: PensumSubject) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
          subject.name.toLowerCase().includes(query) ||
          subject.code.toLowerCase().includes(query)
        );
      }
    ),
  })).filter((semester) => semester.subjects.length > 0);

  // Prerequisite Autocomplete Suggestions
  const prereqSuggestions = allSubjects.filter(
    s => s.name.toLowerCase().includes(prereqSearch.toLowerCase()) ||
         s.code.toLowerCase().includes(prereqSearch.toLowerCase())
  ).filter(s => !formData.prerequisites.includes(s.code)); // Exclude already selected

  // Professor Modal: filter by search + pin originally-assigned professors at the top
  const visibleProfessors = React.useMemo(() => {
    const q = normalizeText(profSearch.trim());
    const matches = professors.filter(p => {
      if (!q) return true;
      return (
        normalizeText(p.fullName).includes(q) ||
        normalizeText(p.email).includes(q) ||
        normalizeText(p.profession).includes(q) ||
        normalizeText(p.title).includes(q)
      );
    });
    return matches.sort((a, b) => {
      const aAssigned = initialAssignedProfIds.includes(a.id) ? 0 : 1;
      const bAssigned = initialAssignedProfIds.includes(b.id) ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [professors, profSearch, initialAssignedProfIds]);

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-blue-600" />
              Materias del Pensum
            </h1>
            <p className="text-gray-600 mt-2">
              Facultad de Farmacia - Universidad Santa María
            </p>
          </div>
          <div className="flex gap-2">
            <button
                onClick={() => setShowImport(true)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
            >
                <Upload className="w-4 h-4" />
                Importar
            </button>
            <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
            >
                <Plus className="w-4 h-4" />
                Agregar Materia
            </button>
            {viewMode === 'grid' && (
                <>
                <button
                    onClick={expandAll}
                    className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                    Expandir Todo
                </button>
                <button
                    onClick={collapseAll}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                    Colapsar Todo
                </button>
                </>
            )}
          </div>
        </div>

        {/* Search and View Toggle */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar materia por nombre o código..."
                        className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            
            {/* View Toggles */}
            <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-all ${
                        viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Vista de Cuadrícula"
                >
                    <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md transition-all ${
                        viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
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
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Materias</p>
              <p className="text-2xl font-bold text-blue-900">
                {pensum.reduce((sum, s) => sum + s.subjects.length, 0)}
              </p>
            </div>
            <BookOpen className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Semestres</p>
              <p className="text-2xl font-bold text-green-900">{pensum.length}</p>
            </div>
            <GraduationCap className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Con Laboratorio</p>
              <p className="text-2xl font-bold text-purple-900">
                {pensum.reduce(
                  (sum, s) => sum + s.subjects.filter((sub: PensumSubject) => sub.hasLab).length,
                  0
                )}
              </p>
            </div>
            <Beaker className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-orange-600 font-medium">Créditos Totales</p>
              <p className="text-2xl font-bold text-orange-900">
                {pensum.reduce(
                  (sum, s) => sum + s.subjects.reduce((acc: number, sub: PensumSubject) => acc + sub.credits, 0),
                  0
                )}
              </p>
            </div>
            <Clock className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {filteredData.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-600">
              No se encontraron materias con los filtros seleccionados
            </p>
            <p className="text-sm text-gray-400 mt-2">Intenta limpiar los filtros</p>
          </div>
        ) : (
            viewMode === 'grid' ? (
                // ── Grid View ──────────────────────────────────
                filteredData.map((semester) => (
                    <SemesterCard
                    key={semester.number}
                    semester={semester}
                    isExpanded={expandedSemesters.has(semester.number)}
                    onToggle={() => toggleSemester(semester.number)}
                    professors={professors}
                    onDelete={handleDeleteSubject}
                    onEditProfessors={openProfModal}
                    editingSubject={editingSubject}
                    editForm={editForm}
                    onStartEdit={handleStartEdit}
                    onUpdateEditForm={setEditForm}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingSubject(null)}
                    />
                ))
            ) : (
                // ── List View ──────────────────────────────────
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Materia</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sem</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UC</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horas</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prelaciones</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredData.flatMap((sem: Semester) => sem.subjects.map((sub: PensumSubject) => (
                                <tr key={sub.code} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">{sub.code}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sub.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sem.number}°</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sub.credits}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {editingSubject === sub.code ? (
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="number" min="0" className="w-12 p-1 border rounded text-xs" 
                                                    value={editForm.hoursTheory} 
                                                    onChange={e => setEditForm({...editForm, hoursTheory: Number(e.target.value)})}
                                                />T
                                                {sub.hasLab && (
                                                    <>
                                                        <input 
                                                            type="number" min="0" className="w-12 p-1 border rounded text-xs" 
                                                            value={editForm.hoursLab} 
                                                            onChange={e => setEditForm({...editForm, hoursLab: Number(e.target.value)})}
                                                        />L
                                                        <input 
                                                            type="text" className="w-16 p-1 border rounded text-xs" 
                                                            placeholder="Salón"
                                                            value={editForm.labNumber} 
                                                            onChange={e => setEditForm({...editForm, labNumber: e.target.value})}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                {sub.hoursTheory}h T + {sub.hoursLab}h L
                                                {sub.labNumber && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Lab {sub.labNumber}</span>}
                                            </>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {sub.prerequisites.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {sub.prerequisites.map((p: string) => (
                                                    <span key={p} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                        {p}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end gap-2">
                                            {editingSubject === sub.code ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(sub.code)} className="text-green-600 hover:text-green-900" title="Guardar">
                                                        <CheckSquare className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setEditingSubject(null)} className="text-gray-500 hover:text-gray-700" title="Cancelar">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => handleStartEdit(sub)} className="text-blue-600 hover:text-blue-900" title="Editar Horas">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => openProfModal(sub.code)}
                                                className="text-blue-600 hover:text-blue-900"
                                                title="Asignar Profesores"
                                            >
                                                <User className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteSubject(sub.code)}
                                                className="text-red-600 hover:text-red-900"
                                                title="Eliminar Materia"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                </div>
            )
        )}
      </div>

      {/* Add Subject Modal */}
      {isModalOpen && createPortal((
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
                <button 
                    onClick={() => setIsModalOpen(false)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <X className="w-6 h-6" />
                </button>
                
                <h2 className="text-xl font-bold mb-4 text-gray-900">Agregar Nueva Materia</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                        <input 
                            type="text" 
                            required
                            className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                        <input 
                            type="text" 
                            required
                            className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={formData.code}
                            onChange={e => setFormData({...formData, code: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unidades Crédito</label>
                            <input 
                                type="number" 
                                min="0"
                                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                value={formData.credits}
                                onChange={e => setFormData({...formData, credits: parseInt(e.target.value) || 0})}
                            />
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Semestre</label>
                            <select 
                                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                value={formData.semester}
                                onChange={e => setFormData({...formData, semester: parseInt(e.target.value)})}
                            >
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                    <option key={n} value={n}>Semestre {n}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Horas Teóricas</label>
                            <input 
                                type="number" 
                                min="0"
                                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                value={formData.hoursTheory}
                                onChange={e => setFormData({...formData, hoursTheory: parseInt(e.target.value) || 0})}
                            />
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Horas Laboratorio</label>
                            <input 
                                type="number" 
                                min="0"
                                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                value={formData.hoursLab}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    setFormData({...formData, hoursLab: val, hasLab: val > 0});
                                }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Salón de Laboratorio</label>
                            <input 
                                type="text" 
                                placeholder="Ej: 104"
                                className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                value={formData.labNumber}
                                disabled={!formData.hasLab}
                                onChange={e => setFormData({...formData, labNumber: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Prerequisites Autocomplete */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Prelaciones (Requisitos)</label>
                        <div className="border border-gray-300 rounded-lg p-2 bg-gray-50">
                            {/* Selected Tags */}
                            <div className="flex flex-wrap gap-2 mb-2">
                                {formData.prerequisites.map(code => {
                                    const sub = allSubjects.find(s => s.code === code);
                                    return (
                                        <span key={code} className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-blue-100 text-blue-700">
                                            {sub?.name || code}
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({
                                                    ...prev,
                                                    prerequisites: prev.prerequisites.filter(p => p !== code)
                                                }))}
                                                className="ml-1 text-blue-500 hover:text-blue-900 focus:outline-none"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>

                            {/* Search Input */}
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar materia por nombre o código..."
                                    className="w-full pl-8 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                    value={prereqSearch}
                                    onChange={(e) => setPrereqSearch(e.target.value)}
                                />
                                {prereqSearch && (
                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                        {prereqSuggestions.length > 0 ? (
                                            prereqSuggestions.map(sub => (
                                                <button
                                                    key={sub.code}
                                                    type="button"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            prerequisites: [...prev.prerequisites, sub.code]
                                                        }));
                                                        setPrereqSearch('');
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
                        <p className="text-xs text-gray-500 mt-1">Busca y selecciona las materias que se deben aprobar antes.</p>
                    </div>
                    
                    <button 
                        type="submit"
                        className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors mt-4"
                    >
                        Guardar Materia
                    </button>
                </form>
            </div>
        </div>
      ), document.body)}

      {/* Professor Management Modal (Reuse existing logic) */}
      {isProfModalOpen && createPortal((
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 relative max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold text-gray-900">Asignar Profesores</h2>
                      <button onClick={() => setIsProfModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">
                      Selecciona los profesores que imparten la materia <strong className="text-gray-900">{selectedSubjectforProf}</strong>.
                  </p>

                  {/* Search box */}
                  <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                          type="text"
                          autoFocus
                          value={profSearch}
                          onChange={(e) => setProfSearch(e.target.value)}
                          placeholder="Buscar profesor por nombre, profesión o email..."
                          className="w-full px-4 py-2 pl-9 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 transition-colors hover:border-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                      {profSearch && (
                          <button
                              onClick={() => setProfSearch('')}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                              <X className="w-4 h-4" />
                          </button>
                      )}
                  </div>

                  <div className="overflow-y-auto flex-1 border border-gray-200 rounded-md p-2 space-y-1">
                      {visibleProfessors.length === 0 ? (
                          <div className="py-8 text-center text-sm text-gray-500 italic">
                              No se encontraron profesores
                          </div>
                      ) : (
                          visibleProfessors.map((prof, index) => {
                              const isSelected = selectedProfIds.includes(prof.id);
                              const wasAssigned = initialAssignedProfIds.includes(prof.id);
                              // Insert a divider between the pinned (assigned) group and the rest.
                              const prev = visibleProfessors[index - 1];
                              const showDivider =
                                  !profSearch &&
                                  prev &&
                                  initialAssignedProfIds.includes(prev.id) &&
                                  !wasAssigned;
                              return (
                                  <React.Fragment key={prof.id}>
                                      {showDivider && (
                                          <div className="flex items-center gap-2 px-1 pt-3 pb-1">
                                              <div className="h-px flex-1 bg-gray-300" />
                                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Otros profesores</span>
                                              <div className="h-px flex-1 bg-gray-300" />
                                          </div>
                                      )}
                                      <div
                                          onClick={() => toggleProfSelection(prof.id)}
                                          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border border-blue-400' : 'hover:bg-gray-100 border border-transparent'}`}
                                      >
                                          {isSelected ? (
                                              <CheckSquare className="w-5 h-5 text-blue-700 flex-shrink-0" />
                                          ) : (
                                              <Square className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                          )}
                                          <div className="min-w-0">
                                              <div className={`font-medium flex items-center gap-2 ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                                                  <span className="truncate">{prof.title} {prof.fullName}</span>
                                                  {wasAssigned && (
                                                      <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-600 text-white">Asignado</span>
                                                  )}
                                              </div>
                                              <div className={`text-xs truncate ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>{prof.profession || prof.email || 'Sin información'}</div>
                                          </div>
                                      </div>
                                  </React.Fragment>
                              );
                          })
                      )}
                  </div>

                  <div className="mt-4 flex gap-2 justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">
                          <span className="text-blue-700 font-bold">{selectedProfIds.length}</span> {selectedProfIds.length === 1 ? 'profesor seleccionado' : 'profesores seleccionados'}
                      </span>
                      <div className="flex gap-2">
                      <button
                          onClick={() => setIsProfModalOpen(false)}
                          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg font-medium"
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={handleSaveProfessors}
                          className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
                      >
                          Guardar Asignación
                      </button>
                      </div>
                  </div>
              </div>
          </div>
      ), document.body)}

      {showImport && (
        <ImportModal kind="subjects" onClose={() => setShowImport(false)} onDone={() => window.location.reload()} />
      )}

    </div>
  );
}

interface SemesterCardProps {
  semester: { number: number; subjects: PensumSubject[] };
  isExpanded: boolean;
  onToggle: () => void;
  professors: Professor[];
  onDelete: (code: string) => void;
  onEditProfessors: (code: string) => void;
  editingSubject: string | null;
  editForm: { hoursTheory: number, hoursLab: number, labNumber: string };
  onStartEdit: (subject: PensumSubject) => void;
  onUpdateEditForm: (form: { hoursTheory: number, hoursLab: number, labNumber: string }) => void;
  onSaveEdit: (code: string) => void;
  onCancelEdit: () => void;
}

function SemesterCard({ 
  semester, isExpanded, onToggle, professors, onDelete, onEditProfessors,
  editingSubject, editForm, onStartEdit, onUpdateEditForm, onSaveEdit, onCancelEdit
}: SemesterCardProps) {
  const totalCredits = semester.subjects.reduce((sum, sub) => sum + sub.credits, 0);
  const withLab = semester.subjects.filter((sub) => sub.hasLab).length;

  return (
    <motion.div
      initial={false}
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
    >
      {/* Semester Header */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
            {semester.number}
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              Semestre {semester.number}°
            </h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span>{semester.subjects.length} materias</span>
              <span>•</span>
              <span>{totalCredits} créditos</span>
              {withLab > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Beaker className="w-4 h-4" />
                    {withLab} con lab
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{semester.subjects.length} materias</Badge>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Subjects List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {semester.subjects.map((subject, index) => {
                  const subjectProfessors = professors.filter(p => p.subjects.includes(subject.code));
                  
                  return (
                  <motion.div
                    key={subject.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 text-sm leading-tight flex-1">
                        {subject.name}
                      </h4>
                      <Badge variant="default" className="ml-2 flex-shrink-0">
                        {subject.credits} UC
                      </Badge>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex gap-2 mb-2 justify-end">
                        {editingSubject === subject.code ? (
                            <>
                                <button onClick={() => onSaveEdit(subject.code)} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Guardar">
                                    <CheckSquare className="w-4 h-4" />
                                </button>
                                <button onClick={onCancelEdit} className="p-1 text-gray-500 hover:bg-gray-50 rounded" title="Cancelar">
                                    <X className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <button onClick={() => onStartEdit(subject)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Editar Horas">
                                <Edit className="w-4 h-4" />
                            </button>
                        )}
                        <button 
                            onClick={() => onEditProfessors(subject.code)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Asignar Profesores"
                        >
                            <User className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => onDelete(subject.code)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Eliminar Materia"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2 mt-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="font-mono font-medium">{subject.code}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                         {editingSubject === subject.code ? (
                            <div className="flex gap-2 items-center">
                                        <input type="number" min="0" className="w-12 p-1 border rounded text-xs" value={editForm.hoursTheory} onChange={e => onUpdateEditForm({...editForm, hoursTheory: Number(e.target.value)})} /> T
                                        {subject.hasLab && (
                                            <>
                                                + <input type="number" min="0" className="w-12 p-1 border rounded text-xs" value={editForm.hoursLab} onChange={e => onUpdateEditForm({...editForm, hoursLab: Number(e.target.value)})} /> L
                                                <input type="text" className="w-16 p-1 border rounded text-xs ml-1" placeholder="Salón" value={editForm.labNumber} onChange={e => onUpdateEditForm({...editForm, labNumber: e.target.value})} />
                                            </>
                                        )}
                            </div>
                         ) : (
                            <>
                                <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {subject.hoursTheory}h teórica
                                </span>
                                {subject.hasLab && (
                                <span className="flex items-center gap-1">
                                    <Beaker className="w-3 h-3" />
                                    {subject.hoursLab}h lab
                                    {subject.labNumber && (
                                        <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] font-medium">#{subject.labNumber}</span>
                                    )}
                                </span>
                                )}
                            </>
                         )}
                      </div>
                      {subject.prerequisites.length > 0 && (
                        <div className="flex items-start gap-1 text-xs text-orange-600 mt-2 pt-2 border-t border-gray-100">
                          <Link2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>
                            Prelación: {subject.prerequisites.join(', ')}
                          </span>
                        </div>
                      )}

                       {/* Professors Section */}
                       <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                                <User className="w-3 h-3" />
                                <span className="font-medium">Profesores:</span>
                            </div>
                            {subjectProfessors.length > 0 ? (
                                <ul className="text-xs text-gray-600 space-y-0.5 pl-4 list-disc">
                                    {subjectProfessors.map(p => (
                                        <li key={p.id}>{p.title} {p.fullName}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-400 italic pl-4">Sin profesor asignado</p>
                            )}
                       </div>
                    </div>
                  </motion.div>
                )})}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
