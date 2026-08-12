/**
 * SuggestionBox — botón flotante (abajo-izquierda) para que cualquier PC reporte un error o
 * pida una mejora. Abre un formulario (tipo + mensaje + nombre opcional) y lo envía a Supabase.
 */
import { useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { submitSuggestion } from '../../services/suggestionsClient';
import { newSuggestion, type SuggestionKind } from '../../../../shared/src/logic/suggestions';

export function SuggestionBox() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SuggestionKind>('error');
  const [body, setBody] = useState('');
  const [author, setAuthor] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await submitSuggestion(newSuggestion(kind, body, author, new Date().toISOString()));
      toast.success('¡Gracias! Tu sugerencia fue enviada.');
      setBody('');
      setAuthor('');
      setKind('error');
      setOpen(false);
    } catch (e) {
      toast.error('No se pudo enviar: ' + (e instanceof Error ? e.message : 'error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Enviar sugerencia"
        className="fixed bottom-4 left-4 z-[900] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700"
      >
        <MessageSquarePlus className="h-4 w-4" /> Sugerencia
      </button>

      {open && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between rounded-t-xl bg-emerald-600 px-5 py-3 text-white">
              <span className="text-base font-bold">Enviar sugerencia</span>
              <button onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex gap-2">
                <button onClick={() => setKind('error')} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${kind === 'error' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300 text-gray-600'}`}>Error</button>
                <button onClick={() => setKind('improvement')} className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold ${kind === 'improvement' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 text-gray-600'}`}>Mejora</button>
              </div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Describe el error o la mejora que necesitas…" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Tu nombre o PC (opcional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button onClick={() => setOpen(false)} className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">Cancelar</button>
              <button onClick={send} disabled={sending || !body.trim()} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
