import { spawn, execSync } from 'child_process';

console.log(`
  ══════════════════════════════════════════════════════════════════
  🏛️  STARTING ARABIC LANGUAGE LAB SUITE (AMU) — FULL STACK
  📡  Backend API Server + Frontend Client (Single Command)
  ══════════════════════════════════════════════════════════════════
`);

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// Automatically clear any orphaned process clinging to port 5000 or 5173
function freePort(port) {
  if (!isWin) return;
  try {
    const stdout = execSync(`netstat -ano | findstr :${port}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (line.includes('LISTENING')) {
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== `${process.pid}`) {
          console.log(`🧹 Freeing port ${port} (cleaning up PID ${pid})...`);
          try {
            execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
          } catch (_) {}
        }
      }
    }
  } catch (_) {
    // Port is already free
  }
}

freePort(5000);
freePort(5173);

const server = spawn(npmCmd, ['--prefix', 'server', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
});

const client = spawn(npmCmd, ['--prefix', 'client', 'run', 'dev', '--', '--host'], {
  stdio: 'inherit',
  shell: true,
});

function killProcessTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (isWin) {
      execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_) {}
}

let isCleaningUp = false;
function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\n🛑 Shutting down Arabic Lab dev processes...');
  killProcessTree(server);
  killProcessTree(client);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
