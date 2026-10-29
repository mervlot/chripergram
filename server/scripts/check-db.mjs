import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { expectedPrimaryKeys, modelTables, requiredColumns } = require('../dist/config/sqlite-schema.js');
const dataDir = path.resolve(process.env.SQLITE_DATA_DIR ?? path.join(process.cwd(), 'data'));
const databasePath = path.resolve(process.env.SQLITE_PATH ?? path.join(dataDir, 'social-network.db'));

if (!fs.existsSync(databasePath)) {
  throw new Error(`SQLite database does not exist: ${databasePath}. Run "npm run db:init" first.`);
}

const sqlite = new DatabaseSync(databasePath, { readOnly: true });
try {
  const tables = new Set(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );

  for (const table of Object.values(modelTables)) {
    if (!tables.has(table)) throw new Error(`Missing SQLite table "${table}"`);
  }

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const info = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
    const actual = new Map(info.map((column) => [column.name, column]));
    for (const [name, definition] of Object.entries(columns)) {
      const column = actual.get(name);
      if (!column) throw new Error(`Missing SQLite column "${table}.${name}"`);
      const expectedType = definition.split(/\s+/)[0].toUpperCase();
      if (column.type.toUpperCase() !== expectedType) {
        throw new Error(`Type mismatch at ${table}.${name}: expected ${expectedType}, found ${column.type || '(none)'}`);
      }

      const allowedStorageTypes = {
        INTEGER: "('integer')",
        REAL: "('integer', 'real')",
        TEXT: "('text')",
        BLOB: "('blob')",
      }[expectedType];
      if (!allowedStorageTypes) continue;
      const invalid = sqlite.prepare(
        `SELECT 1 FROM "${table}" WHERE "${name}" IS NOT NULL AND typeof("${name}") NOT IN ${allowedStorageTypes} LIMIT 1`,
      ).get();
      if (invalid) throw new Error(`Invalid stored value type in ${table}.${name} (expected ${expectedType})`);
    }
  }

  for (const [table, expected] of Object.entries(expectedPrimaryKeys)) {
    const actual = sqlite.prepare(`PRAGMA table_info("${table}")`).all()
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Primary key mismatch in ${table}: expected [${expected}], found [${actual}]`);
    }
  }

  const integrity = sqlite.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
  }
  const tableCount = Object.keys(modelTables).length;
  console.log(`SQLite schema and stored-value checks passed (${tableCount} tables): ${databasePath}`);
} finally {
  sqlite.close();
}
