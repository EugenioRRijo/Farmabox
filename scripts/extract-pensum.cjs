/* Extrae el texto del PDF del pensum usando pdf-parse v2 (clase PDFParse). */
const fs = require('fs');
const path = require('path');

const PDF = path.join(__dirname, '..', 'docs', 'referencias', 'PENSUM 2023-01 (1).pdf');
const OUT = path.join(__dirname, '..', 'docs', 'referencias', 'pensum-extraido.txt');

async function main() {
  const buf = fs.readFileSync(PDF);
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  const result = await parser.getText();
  const text = result.text || '';
  fs.writeFileSync(OUT, text, 'utf-8');
  console.log(`Caracteres: ${text.length}`);
  console.log('Guardado en:', OUT);
}
main().catch((e) => {
  console.error('ERROR:', e && e.stack ? e.stack : e);
  process.exit(1);
});
