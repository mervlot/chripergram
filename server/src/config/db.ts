import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createSqliteModels } from './sqlite-model';
import { initializeSchema, modelTables } from './sqlite-schema';

const dataDir = path.resolve(process.env.SQLITE_DATA_DIR ?? path.join(process.cwd(), 'data'));
const databasePath = path.resolve(process.env.SQLITE_PATH ?? path.join(dataDir, 'social-network.db'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const globalForDb = globalThis as typeof globalThis & { sqliteDb?: DatabaseSync };
export const sqlite = globalForDb.sqliteDb ?? new DatabaseSync(databasePath);
if (process.env.NODE_ENV !== 'production') globalForDb.sqliteDb = sqlite;

initializeSchema(sqlite);

export const db = createSqliteModels(sqlite, modelTables);
