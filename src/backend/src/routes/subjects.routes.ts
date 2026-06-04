import { Router } from 'express';
import { loadPensum, savePensum, loadProfessors, saveProfessors } from '../storage';
// Imports removed as they were unused

export const subjectsRouter = Router();

subjectsRouter.get('/', (_req, res) => {
  try {
    const pensum = loadPensum();
    res.json(pensum);
  } catch (err) {
    res.status(500).json({ error: 'Error loading subjects' });
  }
});

subjectsRouter.post('/', (req, res) => {
  try {
    const pensum = loadPensum();
    const { semester, ...subjectData } = req.body;
    const semesterNum = Number(semester);

    let targetSemester = pensum.find((s) => s.number === semesterNum);
    if (!targetSemester) {
      targetSemester = { number: semesterNum, subjects: [] };
      pensum.push(targetSemester);
      pensum.sort((a, b) => a.number - b.number);
    }

    // Check duplicate code
    const allCodes = pensum.flatMap((s) => s.subjects.map((sub) => sub.code));
    if (allCodes.includes(subjectData.code)) {
      res.status(400).json({ error: `Subject with code ${subjectData.code} already exists` });
      return;
    }

    const newSubject = {
      code: subjectData.code,
      name: subjectData.name,
      credits: subjectData.credits || 3,
      hasLab: subjectData.hasLab || false,
      hoursTheory: subjectData.hoursTheory || 0,
      hoursLab: subjectData.hoursLab || 0,
      prerequisites: subjectData.prerequisites || [],
    };

    const sem = pensum.find((s) => s.number === semesterNum)!;
    sem.subjects.push(newSubject);
    savePensum(pensum);
    res.status(201).json(newSubject);
  } catch (err) {
    res.status(500).json({ error: 'Error adding subject' });
  }
});

// Delete a subject
subjectsRouter.delete('/:code', (req, res) => {
  try {
    const code = req.params.code;
    let pensum = loadPensum();
    let found = false;

    pensum = pensum.map(sem => {
      const initialLength = sem.subjects.length;
      sem.subjects = sem.subjects.filter(s => s.code !== code);
      if (sem.subjects.length < initialLength) found = true;
      return sem;
    });

    if (!found) {
      res.status(404).json({ error: 'Subject not found' });
      return;
    }

    savePensum(pensum);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error deleting subject' });
  }
});

// Update a subject
subjectsRouter.put('/:code', (req, res) => {
  try {
    const code = req.params.code;
    const updateData = req.body;
    let pensum = loadPensum();
    let found = false;
    let updatedSubject = null;

    pensum = pensum.map(sem => {
      sem.subjects = sem.subjects.map(s => {
        if (s.code === code) {
          found = true;
          updatedSubject = { ...s, ...updateData, code }; // don't override code
          return updatedSubject;
        }
        return s;
      });
      return sem;
    });

    if (!found) {
      res.status(404).json({ error: 'Subject not found' });
      return;
    }

    savePensum(pensum);
    res.json(updatedSubject);
  } catch (err) {
    res.status(500).json({ error: 'Error updating subject' });
  }
});

// Update professors for a subject
subjectsRouter.put('/:code/professors', (req, res) => {
  try {
    const { professorIds } = req.body as { professorIds: string[] };
    const subjectCode = req.params.code;
    const professors = loadProfessors();

    professors.forEach((p) => {
      p.subjects = p.subjects.filter((s) => s !== subjectCode);
    });

    for (const profId of professorIds) {
      const prof = professors.find((p) => p.id === profId);
      if (prof && !prof.subjects.includes(subjectCode)) {
        prof.subjects.push(subjectCode);
      }
    }

    saveProfessors(professors);
    res.json({ success: true, professors });
  } catch (err) {
    res.status(500).json({ error: 'Error updating subject professors' });
  }
});
