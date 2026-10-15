import { spawn } from 'node:child_process';
import { openSync, closeSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';

function listening(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = result => { if (settled) return; settled = true; socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}

export async function superviseLocalDatabase(env) {
  if (!existsSync('.local/mysql/my.ini')) return () => {};
  let checking = false, stopped = false, nextAttempt = 0;
  async function check() {
    if (stopped || checking || Date.now() < nextAttempt) return;
    checking = true;
    try {
      if (await listening(3308)) return;
      nextAttempt = Date.now() + 15000;
      console.log('Starting the project database on 127.0.0.1:3308…');
      const log = openSync(resolve('.local/mysql-supervisor.log'), 'a');
      let child;
      try {
        child = spawn(env.MYSQL_BINARY || 'C:/xampp/mysql/bin/mysqld.exe', ['--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${resolve('.local/mysql')}`, '--port=3308', '--bind-address=127.0.0.1'], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
      } finally { closeSync(log); }
      child.on('error', error => console.error('Local database failed to start:', error.message));
      child.unref();
      // Wait for startup before serving the frontend. Later checks recover a stopped process.
      for (let attempt = 0; attempt < 40 && !stopped; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 250));
        if (await listening(3308)) { console.log('Project database is listening on port 3308.'); nextAttempt = 0; return; }
      }
      console.error('Project database is unavailable. See .local/mysql-supervisor.log. Retrying shortly.');
    } catch (error) {
      nextAttempt = Date.now() + 15000;
      console.error('Local database supervision:', error.message);
    } finally { checking = false; }
  }
  await check();
  const timer = setInterval(check, 2000);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
