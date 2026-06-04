import { Router } from 'express';
import { loadLogs, saveLogs, LogEntry, saveProfessors, savePensum, saveAcademicLoad, saveScheduleBlocks } from '../storage';

export const systemRouter = Router();

systemRouter.get('/logs', (_req, res) => {
  try {
    const logs = loadLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Error loading logs' });
  }
});

systemRouter.post('/logs', (req, res) => {
  try {
    const logs = loadLogs();
    const newLog: LogEntry = {
      id: `log-${Date.now()}`,
      action: req.body.action,
      details: req.body.details,
      timestamp: new Date().toISOString(),
    };
    logs.unshift(newLog);
    saveLogs(logs);
    res.status(201).json(newLog);
  } catch (err) {
    res.status(500).json({ error: 'Error creating log' });
  }
});

systemRouter.post('/admin/restore', (req, res) => {
  try {
    const { professors, pensum, academicLoad, scheduleBlocks } = req.body;

    if (professors) saveProfessors(professors);
    if (pensum) savePensum(pensum);
    if (academicLoad) saveAcademicLoad(academicLoad);
    if (scheduleBlocks) saveScheduleBlocks(scheduleBlocks);

    const logs = loadLogs();
    logs.unshift({
      id: `log-${Date.now()}`,
      action: 'Restauración de Sistema',
      details: 'Se ha restaurado una copia de seguridad completa del sistema.',
      timestamp: new Date().toISOString(),
    });
    saveLogs(logs);

    res.json({ success: true, message: 'System restored successfully' });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Error restoring system data' });
  }
});
