import { LoggerService } from '@scheduler/shared/src/services/LoggerService';

export function ErrorPlayground() {
  const triggerInfo = () => {
    LoggerService.info('User clicked info button', 'ErrorPlayground');
  };

  const triggerWarning = () => {
    LoggerService.warn('Potential performance issue detected', 'ErrorPlayground', { latency: 450 });
  };

  const triggerError = () => {
    try {
      throw new Error("Simulated Crash!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      LoggerService.error('Caught simulated exception', 'ErrorPlayground', { error: msg });
    }
  };

  const simulateApiFailure = async () => {
    LoggerService.info('Starting API call...', 'API');
    setTimeout(() => {
        LoggerService.error('API Endpoint /api/schedule/save failed', 'API', { status: 500, statusText: 'Internal Server Error' });
    }, 1000);
  };

  return (
    <div className="p-4 border-2 border-dashed border-red-200 rounded-lg bg-red-50 mb-8">
      <h3 className="text-lg font-bold text-red-800 mb-2">⚠ Zona de Pruebas de Errores</h3>
      <p className="text-sm text-gray-600 mb-4">
        Utiliza estos botones para simular fallos y verificar que el Debugger los capture correctamente.
      </p>
      
      <div className="flex flex-wrap gap-3">
        <button onClick={triggerInfo} className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm">
            Log Info
        </button>
        <button onClick={triggerWarning} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm">
            Simulate Warning
        </button>
        <button onClick={triggerError} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">
            Simulate Crash
        </button>
        <button onClick={simulateApiFailure} className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm">
            Mock API Failure
        </button>
      </div>
    </div>
  );
}
