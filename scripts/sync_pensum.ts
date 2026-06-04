
import fs from 'fs';
import path from 'path';
import { PENSUM_DATA } from '../src/shared/src/data/pensumData';

const outputPath = path.resolve(__dirname, '../src/backend/data/pensum.json');

fs.writeFileSync(outputPath, JSON.stringify(PENSUM_DATA, null, 2), 'utf-8');
console.log(`Updated pensum.json at ${outputPath}`);
