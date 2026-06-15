import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Bot, User, Loader2, WifiOff } from 'lucide-react';

interface Msg {
  role: 'user' | 'model';
  text: string;
  offline?: boolean;
}

const GREETING: Msg = {
  role: 'model',
  text: '¡Hola! 👋 Soy el asistente de horarios. Preguntame sobre profesores, materias, o cómo usar la app.',
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = [...messages, { role: 'user', text } as Msg];
    setMessages(history);
    setInput('');
    setLoading(true);
    try {
      if (!window.electronAPI) throw new Error('desktop-only');
      // Enviar la conversación desde el primer mensaje del usuario (Gemini espera empezar en 'user')
      const firstUser = history.findIndex((m) => m.role === 'user');
      const convo = (firstUser >= 0 ? history.slice(firstUser) : history).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      const res = await window.electronAPI.chat.send(convo);
      if ('error' in res) throw new Error(res.error);
      setMessages((prev) => [...prev, { role: 'model', text: res.data.reply, offline: res.data.offline }]);
    } catch (e) {
      const text =
        (e as Error).message === 'desktop-only'
          ? 'El asistente IA está disponible en la app de escritorio (USM Scheduler).'
          : 'No pude responder ahora. Intentá de nuevo en un momento.';
      setMessages((prev) => [...prev, { role: 'model', text }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
          title="Asistente de horarios"
        >
          <MessageCircle className="w-7 h-7" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[370px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-3rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div className="leading-tight">
                <p className="font-semibold text-sm">Asistente de Horarios</p>
                <p className="text-[11px] text-blue-100">USM · Farmacia</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-blue-500" title="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-gray-50 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${
                    m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap max-w-[78%] ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                  }`}
                >
                  {m.offline && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 mb-1 font-medium">
                      <WifiOff className="w-3 h-3" /> Modo local
                    </span>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="px-3 py-2 rounded-2xl bg-white border border-gray-200">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-t border-gray-200 bg-white">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder="Escribe tu pregunta..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
              title="Enviar"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
