export interface WorkspaceFileIO {
  exists(path: string): boolean | Promise<boolean>;
  read(path: string): Promise<string>;
  mkdirParent(path: string): Promise<void>;
  write(path: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

/** Serializes atomic workspace snapshots and never converts I/O errors to success. */
export class WorkspaceStore<T> {
  private writeTail: Promise<void> = Promise.resolve();
  private tempSequence = 0;

  constructor(private readonly path: string, private readonly io: WorkspaceFileIO) {}

  async load(createEmpty: () => T, normalize: (raw: unknown) => T): Promise<T> {
    if (!(await this.io.exists(this.path))) return createEmpty();

    try {
      return normalize(JSON.parse(await this.io.read(this.path)) as unknown);
    } catch (cause) {
      const detail = cause instanceof Error ? ` ${cause.message}` : '';
      throw new Error(
        `Workspace "${this.path}" tidak dapat dibaca.${detail} Berkas asli dipertahankan; perbaiki atau pulihkan sebelum menjalankan Berezz lagi.`,
        { cause },
      );
    }
  }

  save(value: T): Promise<void> {
    const snapshot = JSON.stringify(value, null, 1);
    const temp = `${this.path}.${Date.now()}.${++this.tempSequence}.tmp`;
    const write = async (): Promise<void> => {
      await this.io.mkdirParent(this.path);
      await this.io.write(temp, snapshot);
      await this.io.rename(temp, this.path);
    };

    const result = this.writeTail.then(write, write);
    // Keep later writes usable after an error while returning this error to its caller.
    this.writeTail = result.catch((): void => {});
    return result;
  }
}
