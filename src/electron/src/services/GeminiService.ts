/**
 * GeminiService — Cliente del asistente IA (Google Gemini) en el proceso main.
 *
 * La API key vive aquí (no en el renderer). Usa el endpoint REST generateContent.
 * Si no hay internet / la llamada falla, el handler IPC cae a una búsqueda local
 * (ver chat/context.ts) → el asistente degrada con elegancia sin conexión.
 */
import https from 'https';
import { ENV } from '../config/env';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export class GeminiService {
  private readonly apiKey = ENV.GEMINI_API_KEY;
  private readonly model = ENV.GEMINI_MODEL || 'gemini-flash-latest';

  isEnabled(): boolean {
    return !!this.apiKey;
  }

  /** Llama a Gemini con un instruction de sistema (contexto) + el historial. */
  chat(messages: ChatMessage[], systemContext: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.apiKey) {
        reject(new Error('Gemini no configurado (falta GEMINI_API_KEY)'));
        return;
      }
      const body = JSON.stringify({
        system_instruction: { parts: [{ text: systemContext }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      });
      const req = https.request(
        {
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/${this.model}:generateContent`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': this.apiKey,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 30000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const parts = json?.candidates?.[0]?.content?.parts;
              const text = Array.isArray(parts)
                ? parts.map((p: { text?: string }) => p.text).filter(Boolean).join('')
                : '';
              if (text) resolve(text);
              else reject(new Error(json?.error?.message || 'Respuesta vacía de Gemini'));
            } catch (e) {
              reject(e instanceof Error ? e : new Error('Error parseando respuesta de Gemini'));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout de Gemini (30s)'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
