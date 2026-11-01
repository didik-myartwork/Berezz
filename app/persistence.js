/** Serializes atomic workspace snapshots and never converts I/O errors to success. */
export class WorkspaceStore {
    path;
    io;
    writeTail = Promise.resolve();
    tempSequence = 0;
    constructor(path, io) {
        this.path = path;
        this.io = io;
    }
    async load(createEmpty, normalize) {
        if (!(await this.io.exists(this.path)))
            return createEmpty();
        try {
            return normalize(JSON.parse(await this.io.read(this.path)));
        }
        catch (cause) {
            const detail = cause instanceof Error ? ` ${cause.message}` : '';
            throw new Error(`Workspace "${this.path}" tidak dapat dibaca.${detail} Berkas asli dipertahankan; perbaiki atau pulihkan sebelum menjalankan Berezz lagi.`, { cause });
        }
    }
    save(value) {
        const snapshot = JSON.stringify(value, null, 1);
        const temp = `${this.path}.${Date.now()}.${++this.tempSequence}.tmp`;
        const write = async () => {
            await this.io.mkdirParent(this.path);
            await this.io.write(temp, snapshot);
            await this.io.rename(temp, this.path);
        };
        const result = this.writeTail.then(write, write);
        // Keep later writes usable after an error while returning this error to its caller.
        this.writeTail = result.catch(() => undefined);
        return result;
    }
}
