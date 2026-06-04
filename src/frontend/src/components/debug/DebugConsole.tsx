import { useState, useEffect } from 'react';
import { LoggerService, LogEntry } from '@scheduler/shared/src/services/LoggerService';

export function DebugConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Poll for logs every 500ms (simple approach) or we could add an event emitter to LoggerService
    const interval = setInterval(() => {
      setLogs(LoggerService.getLogs());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const clearLogs = () => {
    LoggerService.clearLogs();
    setLogs([]);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg hover:bg-gray-700 z-50 text-sm font-mono"
      >
        🐞 Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-full md:w-1/2 h-1/2 bg-gray-900 shadow-2xl z-50 flex flex-col border-t-4 border-blue-500 rounded-tl-lg">
      <div className="flex justify-between items-center p-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-white font-mono text-sm font-bold">Debug Console</h3>
        <div className="flex gap-2">
            <button onClick={clearLogs} className="text-xs bg-red-900/50 text-red-200 px-2 py-1 rounded hover:bg-red-900">Clear</button>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">Close</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
        {logs.length === 0 && <div className="text-gray-500 italic">No logs...</div>}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2 border-b border-gray-800 pb-1">
            <span className="text-gray-500 whitespace-nowrap">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
            <span className={`font-bold w-12 ${
              log.level === 'ERROR' ? 'text-red-500' :
              log.level === 'WARN' ? 'text-yellow-500' :
              log.level === 'DEBUG' ? 'text-blue-500' : 'text-green-500'
            }`}>{log.level}</span>
            <span className="text-gray-300 flex-1 break-all">
                {log.message}
                {log.context && <span className="text-gray-500 ml-2">({log.context})</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
