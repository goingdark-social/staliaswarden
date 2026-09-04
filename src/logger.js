import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = config.logDir
  ? path.resolve(config.logDir)
  : path.join(__dirname, '..', 'logs');
const logFile = path.join(logDir, `app-${new Date().toISOString().split('T')[0]}.log`);

// Probe the log directory once at startup. A read-only or root-owned mount
// (common when the container runs as a non-root user) must not turn every
// single log line into an EACCES stack trace, so file logging is switched off
// after a single warning and the console stays the source of truth.
let fileLoggingEnabled = true;

function disableFileLogging(reason) {
  fileLoggingEnabled = false;
  console.warn(
    `[WARN] File logging disabled — cannot write to ${logDir}: ${reason}. Logging to stdout only. Set LOG_DIR to a writable path to re-enable.`
  );
}

try {
  fs.mkdirSync(logDir, { recursive: true });
  fs.accessSync(logDir, fs.constants.W_OK);
} catch (err) {
  disableFileLogging(err.message);
}

export function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = data
    ? `[${timestamp}] [${level}] ${message}\n${JSON.stringify(data, null, 2)}\n`
    : `[${timestamp}] [${level}] ${message}\n`;

  console.log(logEntry.trim());

  if (!fileLoggingEnabled) return;

  try {
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (err) {
    disableFileLogging(err.message);
  }
}

export { logFile };
