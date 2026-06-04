import { Router } from 'express';
import { loadAcademicLoad, saveAcademicLoad, loadScheduleBlocks, saveScheduleBlocks, loadCourseInfo, saveCourseInfo } from '../storage';

export const scheduleRouter = Router();

scheduleRouter.get('/academic-load', (_req, res) => {
  try {
    const load = loadAcademicLoad();
    res.json(load);
  } catch (err) {
    res.status(500).json({ error: 'Error loading academic load' });
  }
});

scheduleRouter.put('/academic-load', (req, res) => {
  try {
    saveAcademicLoad(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving academic load' });
  }
});

scheduleRouter.get('/schedule-blocks', (_req, res) => {
  try {
    const blocks = loadScheduleBlocks();
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: 'Error loading schedule blocks' });
  }
});

scheduleRouter.put('/schedule-blocks', (req, res) => {
  try {
    saveScheduleBlocks(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving schedule blocks' });
  }
});

scheduleRouter.get('/course-info', (_req, res) => {
  try {
    const info = loadCourseInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: 'Error loading course info' });
  }
});

scheduleRouter.put('/course-info', (req, res) => {
  try {
    saveCourseInfo(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error saving course info' });
  }
});
