import { DatabasePromise, DatabaseOpts, SqliteError } from "@tursodatabase/database-common";
import { registerFileAtWorker, unregisterFileAtWorker, ioNotifier } from "@tursodatabase/database-wasm-common";
import { ensureInit } from "./index-webpack.js";

class Database extends DatabasePromise {
    #worker: Worker | null = null;
    #initThreadPool: () => Promise<void>;

    constructor(
        nativeDb: any,
        initThreadPool: () => Promise<void>,
    ) {
        super(
            nativeDb as unknown as any,
            // In-memory databases use MemoryIO which completes I/O synchronously,
            // so there's no OPFS Worker dispatch and the IONotifier would never
            // fire. Use undefined (defaults to no-op) so the step loop retries
            // immediately.
            (nativeDb as any).memory ? undefined : () => ioNotifier.waitForCompletion(),
        );
        this.#initThreadPool = initThreadPool;
    }

    /** connect database and pre-open necessary files in the OPFS */
    override async connect() {
        if (!this.memory) {
            const { worker } = await ensureInit();
            await this.#initThreadPool();
            if (worker == null) {
                throw new Error("panic: MainWorker is not initialized");
            }
            await Promise.all([
                registerFileAtWorker(worker, this.name),
                registerFileAtWorker(worker, `${this.name}-wal`),
            ]);
            this.#worker = worker;
        }
        await super.connect();
    }

    /** close the database and relevant files */
    async close() {
        // Capture name before super.close() — `this.name` is a getter backed
        // by a napi call (this.db.path) that throws once the native db is
        // closed.
        const name = this.name;
        if (name != null && this.#worker != null) {
            await Promise.all([
                unregisterFileAtWorker(this.#worker, name),
                unregisterFileAtWorker(this.#worker, `${name}-wal`),
            ]);
        }
        await super.close();
    }
}

/**
 * Creates a new database connection asynchronously.
 *
 * Init (WASM decode + worker spawn) is deferred to the first call so this
 * entry point is safe to import from a non-async-capable module wrapper —
 * unlike the default entry, which awaits at module top level.
 *
 * @param {string} path - Path to the database file.
 * @param {Object} opts - Options for database behavior.
 * @returns {Promise<Database>} - A promise that resolves to a Database instance.
 */
async function connect(path: string, opts: DatabaseOpts = {}): Promise<Database> {
    const { napiModule } = await ensureInit();
    const NativeDatabase = napiModule.exports.Database;
    const initThreadPool = napiModule.exports.initThreadPool;
    const nativeDb = new NativeDatabase(path, opts);
    const db = new Database(nativeDb, initThreadPool);
    await db.connect();
    return db;
}

export { connect, Database, SqliteError };
