import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import { inspect } from 'util';
import { env } from '../config/env';

export async function logDevelopmentError(error: unknown, context: string) {
  if (env.nodeEnv !== 'development') return;

  const logPath = path.resolve(process.cwd(), 'logs/dev-errors.log');
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `[${new Date().toISOString()}] ${context}\n${inspect(error, { depth: 5 })}\n\n`,
      'utf8',
    );
  } catch (loggingError) {
    // eslint-disable-next-line no-console
    console.error('Unable to write development error log:', loggingError);
  }
}
