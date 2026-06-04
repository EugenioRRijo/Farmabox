/**
 * ScheduleService — Lógica de dominio para bloques de horario y carga académica.
 */
import type { AcademicLoad, ScheduleBlockData } from '../types';
import type { IStorageService } from './IStorageService';

export class ScheduleService {
  constructor(private readonly storage: IStorageService) {}

  getAcademicLoad(): AcademicLoad {
    return this.storage.loadAcademicLoad();
  }
  saveAcademicLoad(load: AcademicLoad): void {
    this.storage.saveAcademicLoad(load);
  }

  getBlocks(): ScheduleBlockData[] {
    return this.storage.loadScheduleBlocks();
  }
  saveBlocks(blocks: ScheduleBlockData[]): void {
    this.storage.saveScheduleBlocks(blocks);
  }
}
