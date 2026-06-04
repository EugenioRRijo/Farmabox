/**
 * Script to extract subject/professor data from Horarios 2026-01.docx
 * Parses the XML structure of the DOCX to find the summary tables
 */
const AdmZip = require('adm-zip');
const path = require('path');

const docxPath = path.join(__dirname, '..', 'Horarios 2026-01.docx');
const zip = new AdmZip(docxPath);
const xml = zip.readAsText('word/document.xml');

// Parse all tables from the document
function extractTables(xml) {
  const tables = [];
  const tableRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let tableMatch;
  
  while ((tableMatch = tableRegex.exec(xml)) !== null) {
    const rows = [];
    const rowRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableMatch[0])) !== null) {
      const cells = [];
      const cellRegex = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowMatch[0])) !== null) {
        let cellText = '';
        const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let textMatch;
        while ((textMatch = textRegex.exec(cellMatch[0])) !== null) {
          cellText += textMatch[1];
        }
        cells.push(cellText.trim());
      }
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

const tables = extractTables(xml);

// Find summary tables (they start with "Código" header)
console.log('=== EXTRACTED SUBJECT DATA FROM HORARIOS 2026-01.docx ===\n');

let currentSemester = '';
let subjectCount = 0;

for (const table of tables) {
  // Check if this is a summary table
  const headerRow = table[0];
  if (!headerRow) continue;
  
  const isHeaderTable = headerRow.some(cell => 
    cell.includes('Código') || cell.includes('Cátedra')
  );
  
  // Check for semester header in preceding text
  for (const row of table) {
    const text = row.join(' ');
    const semMatch = text.match(/SEMESTRE\s+(\d+)/i);
    if (semMatch) {
      currentSemester = semMatch[1];
    }
  }
  
  if (!isHeaderTable) continue;
  
  console.log(`--- Semester Table ---`);
  
  // Process data rows (skip header)
  for (let i = 0; i < table.length; i++) {
    const row = table[i];
    if (row.length < 3) continue;
    
    // Skip the header row
    if (row[0] === 'Código' || row[0] === 'C\u00f3digo') continue;
    
    // Check if first cell looks like a code
    const code = row[0];
    if (!code || !code.match(/^330/)) continue;
    
    subjectCount++;
    const subject = row[1] || '';
    const profTheory = row[2] || '';
    const profPractice = row[3] || '';
    const labNum = row[4] || '';
    const prereq = row[5] || '';
    
    console.log(`CODE: ${code}`);
    console.log(`  Subject: ${subject}`);
    if (profTheory) console.log(`  Theory: ${profTheory}`);
    if (profPractice) console.log(`  Practice: ${profPractice}`);
    if (labNum) console.log(`  Lab#: ${labNum}`);
    if (prereq) console.log(`  Prereq: ${prereq}`);
    console.log('');
  }
}

console.log(`\nTotal subjects found: ${subjectCount}`);
