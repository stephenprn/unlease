/**
 * One line per event, readable in `docker logs`: time, level, message, then
 * the details as JSON. Never pass the token or the API key in `fields`.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
export type LogLevel = Level | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
let threshold = ORDER.info;

export function setLogLevel(level: LogLevel): void {
  threshold = ORDER[level];
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack?.split('\n').slice(1, 4).join(' | ') };
  }
  return value;
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const details = fields ? ` ${JSON.stringify(fields, replacer)}` : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${details}\n`;
  (level === 'warn' || level === 'error' ? process.stderr : process.stdout).write(line);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
