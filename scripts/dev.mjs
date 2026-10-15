import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, loadEnv } from 'vite';
import { superviseLocalDatabase } from './local-database.mjs';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8080';
let backend, frontend;
// Keep the project's own database available even if a local service restart stops it.
const stopDatabaseSupervisor = await superviseLocalDatabase(env);
if (target === 'http://127.0.0.1:8080') {
  let existing = false;
  try {
    const response = await fetch(`${target}/api/index.php?action=session`, { signal: AbortSignal.timeout(1500) });
    if (response.headers.get('X-Stillmotion') !== '1') throw new Error('Port 8080 is occupied by another application. Set API_PROXY_TARGET to your PHP server.');
    existing = true;
  } catch (error) { if (error.message.startsWith('Port 8080')) throw error; }
  if (!existing) {
    const temporary = resolve('storage/.tmp'); mkdirSync(temporary, { recursive: true });
    const php = env.PHP_BINARY || (process.platform === 'win32' && existsSync('C:/xampp/php/php.exe') ? 'C:/xampp/php/php.exe' : 'php');
    backend = spawn(php, ['-d', 'upload_max_filesize=100M', '-d', 'post_max_size=115M', '-d', 'max_execution_time=180', '-d', 'max_input_time=180', '-d', 'display_errors=0', '-d', `session.save_path=${temporary}`, '-d', `upload_tmp_dir=${temporary}`, '-S', '127.0.0.1:8080', '-t', process.cwd()], { stdio: 'inherit', windowsHide: true });
    backend.on('error', error => { console.error('Could not start PHP:', error.message); process.exitCode = 1; frontend?.close(); });
    backend.on('exit', code => { if (code) { console.error(`PHP stopped with exit code ${code}.`); process.exitCode = 1; frontend?.close(); } });
  }
}
const args = process.argv.slice(2), portIndex = args.indexOf('--port');
try {
  frontend = await createServer({ server: { host: '0.0.0.0', ...(portIndex >= 0 ? { port: Number(args[portIndex + 1]) } : {}), strictPort: args.includes('--strictPort') } });
  await frontend.listen(); frontend.printUrls();
} catch (error) { stopDatabaseSupervisor(); backend?.kill(); throw error; }
let stopping = false;
async function stop() { if (stopping) return; stopping = true; stopDatabaseSupervisor(); backend?.kill(); await frontend?.close(); process.exit(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', () => { stopDatabaseSupervisor(); backend?.kill(); });
