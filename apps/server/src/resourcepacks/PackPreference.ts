import { readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../httpError';

/** Installation-level preference: shared across browser profiles, ports and server restarts. */
export class PackPreference {
  private readonly file: string;

  constructor(directory: string) {
    this.file = join(directory, '.preview-settings.json');
  }

  read(): string | null {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new HttpError(500, '无法读取已保存的材质包选择。');
    }
    try {
      const data = JSON.parse(text) as { selectedPackId?: unknown };
      if (
        typeof data.selectedPackId !== 'string' ||
        !data.selectedPackId ||
        data.selectedPackId.length > 128
      )
        throw new Error('Invalid selection');
      return data.selectedPackId;
    } catch {
      throw new HttpError(500, '材质包选择配置损坏；未覆盖原文件。');
    }
  }

  save(selectedPackId: string): void {
    if (this.read() === selectedPackId) return;
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, selectedPackId }, null, 2), {
        flag: 'wx',
      });
      renameSync(temporary, this.file);
    } catch {
      throw new HttpError(500, '无法保存材质包选择；请检查材质包目录是否可写。');
    } finally {
      try {
        unlinkSync(temporary);
      } catch {
        /* Renamed successfully, or no temporary file was created. */
      }
    }
  }
}
