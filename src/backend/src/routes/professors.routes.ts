import { Router } from 'express';
import { loadProfessors, saveProfessors } from '../storage';
import { Professor, PROFESSORS_DATA } from '../../../shared/src/index';

export const professorsRouter = Router();

professorsRouter.get('/', (_req, res) => {
  try {
    const professors = loadProfessors();
    res.json(professors);
  } catch (err) {
    res.status(500).json({ error: 'Error loading professors' });
  }
});

professorsRouter.post('/', (req, res) => {
  try {
    const professors = loadProfessors();
    const newProf: Professor = {
      id: `prof-${Date.now()}`,
      fullName: req.body.fullName || 'Nuevo Profesor',
      title: req.body.title || 'Prof.',
      email: req.body.email,
      cedula: req.body.cedula,
      subjects: req.body.subjects || [],
      type: req.body.type || 'both',
    };
    professors.push(newProf);
    saveProfessors(professors);
    res.status(201).json(newProf);
  } catch (err) {
    res.status(500).json({ error: 'Error creating professor' });
  }
});

professorsRouter.put('/:id', (req, res) => {
  try {
    const professors = loadProfessors();
    const index = professors.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: 'Professor not found' });
      return;
    }
    professors[index] = { ...professors[index], ...req.body, id: req.params.id };
    saveProfessors(professors);
    res.json(professors[index]);
  } catch (err) {
    res.status(500).json({ error: 'Error updating professor' });
  }
});

professorsRouter.delete('/:id', (req, res) => {
  try {
    let professors = loadProfessors();
    const existed = professors.some((p) => p.id === req.params.id);
    if (!existed) {
      res.status(404).json({ error: 'Professor not found' });
      return;
    }
    professors = professors.filter((p) => p.id !== req.params.id);
    saveProfessors(professors);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting professor' });
  }
});

// Reset professors to defaults
professorsRouter.post('/reset', (_req, res) => {
  try {
    saveProfessors(PROFESSORS_DATA);
    res.json(PROFESSORS_DATA);
  } catch (err) {
    res.status(500).json({ error: 'Error resetting professors' });
  }
});
