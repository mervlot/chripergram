import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { sqlite } = require(path.resolve('dist/config/db.js'));

console.log('SQLite schema initialized and validated.');
sqlite.close();
