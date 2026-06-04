import express from 'express';
import cors from 'cors';
import { professorsRouter } from './routes/professors.routes';
import { subjectsRouter } from './routes/subjects.routes';
import { scheduleRouter } from './routes/schedule.routes';
import { systemRouter } from './routes/system.routes';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Main Entity Routes
app.use('/api/professors', professorsRouter);
app.use('/api/subjects', subjectsRouter);
app.use('/api', scheduleRouter); // mounts /academic-load and /blocks
app.use('/api', systemRouter);   // mounts /logs and /admin/restore

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🚀 Backend API running at http://localhost:${PORT}`);
  console.log('   Endpoints organized by router modules.\n');
});
