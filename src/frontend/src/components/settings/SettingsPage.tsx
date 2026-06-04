import { useState, useRef, useEffect } from 'react';
import { Database, Save, RotateCcw, Upload, ShieldAlert, Monitor, Moon, Sun, Calendar, Minimize2, Type, Zap, Mail, GraduationCap, User, Cloud, FolderInput, HardDrive } from 'lucide-react';
import * as BackendService from '../../services/BackendService';
import { useSettings } from '@/context/SettingsContext';

type Tab = 'general' | 'data' | 'contact' | 'storage';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isResetting, setIsResetting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    theme,
    toggleTheme,
    compact,
    setCompact,
    academicPeriod,
    setAcademicPeriod,
    fontScale,
    setFontScale,
    reduceMotion,
    setReduceMotion,
    resetSettings,
  } = useSettings();

  const [storage, setStorage] = useState<BackendService.StorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);

  useEffect(() => {
    if (!BackendService.isStorageConfigAvailable()) return;
    BackendService.getStorageInfo()
      .then(setStorage)
      .catch(() => {});
  }, []);

  // ── Handlers ─────────────────────────────────────────

  const handleUseSharedFolder = async () => {
    try {
      setStorageBusy(true);
      const { path } = await BackendService.pickSharedFolder();
      if (!path) return;
      await BackendService.setSharedDir(path);
      setStorage({ mode: 'shared', sharedDir: path });
      alert('Carpeta compartida configurada. Reiniciá la app para aplicar el cambio.');
    } catch (e) {
      console.error('Error setting shared folder:', e);
      alert('No se pudo configurar la carpeta compartida.');
    } finally {
      setStorageBusy(false);
    }
  };

  const handleUseCloud = async () => {
    try {
      setStorageBusy(true);
      await BackendService.setSharedDir(null);
      setStorage({ mode: 'cloud', sharedDir: null });
      alert('Volviste a la nube (Supabase). Reiniciá la app para aplicar el cambio.');
    } catch (e) {
      console.error('Error switching to cloud:', e);
      alert('No se pudo cambiar el modo de almacenamiento.');
    } finally {
      setStorageBusy(false);
    }
  };

  const handleResetProfessors = async () => {
    if (!window.confirm('¿Estás seguro de que deseas restablecer la lista de profesores? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setIsResetting(true);
      await BackendService.resetProfessors();
      alert('Profesores restablecidos correctamente. Por favor recarga la página.');
      window.location.reload();
    } catch (error) {
      console.error('Error resetting professors:', error);
      alert('Error al restablecer profesores.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const [profs, subs, load, blocks] = await Promise.all([
        BackendService.getProfessors(),
        BackendService.getSubjects(),
        BackendService.getAcademicLoad(),
        BackendService.getScheduleBlocks(),
      ]);

      const backupData: BackendService.BackupData = {
        professors: profs,
        pensum: subs,
        academicLoad: load,
        scheduleBlocks: blocks,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_horarios_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting backup:', error);
      alert('Error al crear copia de seguridad.');
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!window.confirm('ADVERTENCIA: Esta acción SOBREESCRIBIRÁ todos los datos actuales (Profesores, Materias, Horarios). ¿Estás seguro de continuar?')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setIsRestoring(true);
        const data = JSON.parse(e.target?.result as string);
        await BackendService.restoreData(data);
        alert('Sistema restaurado correctamente. La página se recargará.');
        window.location.reload();
      } catch (error) {
        console.error('Error restoring backup:', error);
        alert('Error al restaurar el sistema. Verifica que el archivo sea válido.');
      } finally {
        setIsRestoring(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ── Render Helpers ───────────────────────────────────

  const TabButton = ({ id, label, icon: Icon }: { id: Tab; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        activeTab === id
          ? 'bg-blue-50 text-blue-700'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-2">Personaliza la aplicación y gestiona tus datos.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <TabButton id="general" label="General" icon={Monitor} />
        <TabButton id="data" label="Gestión de Datos" icon={Database} />
        <TabButton id="storage" label="Almacenamiento" icon={Cloud} />
        <TabButton id="contact" label="Contacto" icon={Mail} />
      </div>

      {/* Content */}
      <div className="grid gap-6">
        
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            {/* Apariencia */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Monitor className="w-5 h-5 text-gray-500" />
                Apariencia
              </h2>

              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? (
                    <Moon className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Sun className="w-5 h-5 text-amber-500" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">Tema {theme === 'dark' ? 'oscuro' : 'claro'}</p>
                    <p className="text-sm text-gray-500">Cambia entre modo claro y oscuro.</p>
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  role="switch"
                  aria-checked={theme === 'dark'}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Minimize2 className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Modo compacto</p>
                    <p className="text-sm text-gray-500">Reduce espaciados para ver más en pantalla.</p>
                  </div>
                </div>
                <button
                  onClick={() => setCompact(!compact)}
                  role="switch"
                  aria-checked={compact}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    compact ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      compact ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Tamaño del texto */}
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Type className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Tamaño del texto</p>
                    <p className="text-sm text-gray-500">Agranda toda la interfaz para leer más cómodo.</p>
                  </div>
                </div>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(
                    [
                      ['normal', 'A'],
                      ['large', 'A+'],
                      ['xlarge', 'A++'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      onClick={() => setFontScale(val)}
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        fontScale === val
                          ? 'bg-white text-blue-700 shadow-sm font-semibold'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reducir animaciones */}
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-900">Reducir animaciones</p>
                    <p className="text-sm text-gray-500">Menos movimiento; ayuda en equipos lentos.</p>
                  </div>
                </div>
                <button
                  onClick={() => setReduceMotion(!reduceMotion)}
                  role="switch"
                  aria-checked={reduceMotion}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    reduceMotion ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      reduceMotion ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Período académico */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                Período académico
              </h2>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-900">Período activo</p>
                  <p className="text-sm text-gray-500">Etiqueta del semestre en curso (ej. 2026-01).</p>
                </div>
                <input
                  value={academicPeriod}
                  onChange={(e) => setAcademicPeriod(e.target.value)}
                  placeholder="2026-01"
                  className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Restablecer preferencias */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-gray-900">Restablecer preferencias</p>
                  <p className="text-sm text-gray-500">
                    Vuelve tema, tamaño del texto, animaciones, modo compacto y período a los valores por defecto.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('¿Restablecer todas las preferencias a los valores por defecto?')) {
                      resetSettings();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restablecer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STORAGE TAB */}
        {activeTab === 'storage' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
                {storage?.mode === 'shared' ? (
                  <HardDrive className="w-5 h-5 text-blue-600" />
                ) : (
                  <Cloud className="w-5 h-5 text-blue-600" />
                )}
                Almacenamiento de datos
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Dónde se guardan y comparten los datos entre computadoras.
              </p>

              {!BackendService.isStorageConfigAvailable() ? (
                <p className="text-sm text-gray-500">Disponible solo en la app de escritorio.</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-200 p-4 mb-4">
                    {storage?.mode === 'shared' ? (
                      <div className="flex items-start gap-3">
                        <HardDrive className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">Carpeta compartida (red local)</p>
                          <p className="text-sm text-gray-500 break-all">{storage.sharedDir}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <Cloud className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">Nube (Supabase)</p>
                          <p className="text-sm text-gray-500">
                            Los datos se guardan en internet; las PCs se sincronizan online.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleUseSharedFolder}
                      disabled={storageBusy}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <FolderInput className="w-4 h-4" />
                      Elegir carpeta compartida…
                    </button>
                    {storage?.mode === 'shared' && (
                      <button
                        onClick={handleUseCloud}
                        disabled={storageBusy}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Cloud className="w-4 h-4" />
                        Volver a la nube
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-5 border-t border-gray-100 pt-4">
                    Usá una carpeta compartida (ej. <span className="font-mono">{'\\\\PC\\Farmabox'}</span> o
                    una unidad de red <span className="font-mono">{'Z:\\'}</span>) si las PCs están en la
                    misma red local. Los cambios se aplican al <strong>reiniciar</strong> la app.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Eugenio Rijo
              </h2>
              <p className="text-sm text-gray-600 flex items-center gap-2 mb-5">
                <GraduationCap className="w-4 h-4 text-gray-400 flex-shrink-0" />
                Estudiante de Ingeniería de Sistemas — Universidad Santa María (USM)
              </p>
              <a
                href="mailto:eugerijo@gmail.com"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <Mail className="w-4 h-4" />
                eugerijo@gmail.com
              </a>
              <p className="text-xs text-gray-400 mt-6 border-t border-gray-100 pt-4">
                Farmabox — Sistema de Gestión de Horarios, desarrollado como Servicio Comunitario para la
                Facultad de Farmacia, Universidad Santa María.
              </p>
            </div>
          </div>
        )}


        {/* DATA TAB */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-gray-500" />
                    Copias de Seguridad
                </h2>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-4 border-b border-gray-100">
                        <div>
                            <p className="font-medium text-gray-900">Exportar Copia de Seguridad</p>
                            <p className="text-sm text-gray-500">Descarga todos los datos (Profesores, Materias, Horarios) en un archivo JSON.</p>
                        </div>
                        <button
                            onClick={handleExportBackup}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            Exportar Datos
                        </button>
                    </div>

                    <div className="flex items-center justify-between py-4">
                        <div>
                            <p className="font-medium text-gray-900">Restaurar Copia de Seguridad</p>
                            <p className="text-sm text-gray-500">Sube un archivo de respaldo para restaurar el sistema completo.</p>
                        </div>
                        <div className="relative">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleRestoreBackup}
                                accept=".json"
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isRestoring}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Upload className="w-4 h-4" />
                                {isRestoring ? 'Restaurando...' : 'Importar Datos'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-red-100 shadow-sm p-6">
                <h2 className="text-xl font-semibold text-red-700 mb-4 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" />
                    Zona de Peligro
                </h2>
                
                <div className="flex items-center justify-between py-4">
                    <div>
                        <p className="font-medium text-gray-900">Restablecer Profesores</p>
                        <p className="text-sm text-gray-500">Vuelve a la lista original de profesores predeterminados.</p>
                    </div>
                    <button
                        onClick={handleResetProfessors}
                        disabled={isResetting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                    >
                        <RotateCcw className="w-4 h-4" />
                        {isResetting ? 'Restableciendo...' : 'Restablecer Fábrica'}
                    </button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
