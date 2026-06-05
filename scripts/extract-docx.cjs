/* Extrae el texto de un .docx (ZIP → word/document.xml) preservando tablas. */
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const DOCX = path.join(__dirname, '..', 'docs', 'referencias', 'Horarios 2026-01.docx');
const OUT = path.join(__dirname, '..', 'docs', 'referencias', 'horarios-extraido.txt');

const zip = new AdmZip(DOCX);
let xml = zip.readAsText('word/document.xml');

let text = xml
  .replace(/<w:tab\/?>/g, '\t')
  .replace(/<w:br\/?>/g, '\n')
  .replace(/<\/w:p>/g, '\n') // fin de párrafo
  .replace(/<\/w:tc>/g, ' | ') // fin de celda
  .replace(/<\/w:tr>/g, '\n=ROW=\n') // fin de fila de tabla
  .replace(/<[^>]+>/g, ''); // quitar el resto de tags

text = text
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(OUT, text, 'utf-8');
console.log(`Caracteres: ${text.length}`);
console.log('Guardado en:', OUT);
