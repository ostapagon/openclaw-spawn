import { execSync, spawn, spawnSync } from 'child_process';
import { getInstanceDir } from './metadata.js';

// Cross-platform synchronous sleep (Atomics.wait works on the Node.js main thread)
export function sleepSync(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(seconds * 1000));
}

// Check if Docker is running
export function isDockerRunning() {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if the docker binary is installed (not necessarily running)
export function isDockerInstalled() {
  try {
    const cmd = process.platform === 'win32' ? 'where docker' : 'which docker';
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Check if our base image already exists (skip rebuild if so)
export function imageExists() {
  try {
    const out = execSync('docker images -q openclaw-spawn-base:latest', { encoding: 'utf8' }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

// Check if container exists
export function containerExists(containerName) {
  try {
    execSync(`docker ps -a --filter name=${containerName} --format '{{.Names}}'`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Get container status
export function getContainerStatus(containerName) {
  try {
    const output = execSync(
      `docker ps -a --filter name=${containerName} --format '{{.Status}}'`,
      { encoding: 'utf8' }
    );
    if (output.includes('Up')) return 'running';
    if (output.includes('Exited')) return 'stopped';
    return 'unknown';
  } catch {
    return 'not-found';
  }
}

// Create and start container
// mounts: array of { host: string, container: string, mode: 'rw'|'ro' }
export function createContainer(name, port, mounts = []) {
  const instanceDir = getInstanceDir(name);
  const containerName = `openclaw-${name}`;

  const args = [
    'run',
    '-d',
    '--name', containerName,
    '-e', 'HOME=/home/node',
    '-e', 'PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright',
    '-p', `${port}:${port}`,
    '-p', `${port + 2}:${port + 2}`,
    '-p', `${port + 11}:18800`,
    '-p', `${port + 20}:6080`,
    '-v', `${instanceDir}/.openclaw:/home/node/.openclaw`,
    '-v', `${instanceDir}/workspace:/workspace`,
    '-v', `/var/run/docker.sock:/var/run/docker.sock`,
  ];

  // User-supplied bind mounts — normalise backslashes for Docker on Windows
  for (const m of mounts) {
    const hostPath = m.host.replace(/\\/g, '/');
    args.push('-v', `${hostPath}:${m.container}${m.mode === 'ro' ? ':ro' : ''}`);
  }

  args.push(
    '--network', 'openclaw-network',
    '--shm-size', '1g',
    'openclaw-spawn-base:latest'
    // No CMD override — Dockerfile CMD runs: Xvfb :99 ... & tail -f /dev/null
  );

  // Use spawnSync with an explicit argv array so paths with spaces are handled correctly
  // on all platforms (execSync + string join breaks on e.g. "C:\Users\John Doe\...").
  const result = spawnSync('docker', args, { stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    console.error('Failed to create container:', result.error?.message ?? `exit code ${result.status}`);
    return false;
  }
  return true;
}

// Execute command in container (interactive)
export function execInContainer(containerName, command, detached = false) {
  if (detached) {
    // Run in background
    const process = spawn('docker', ['exec', '-d', containerName, 'sh', '-c', command], {
      stdio: 'inherit',
      shell: false
    });
    
    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  } else {
    // Run interactively
    const process = spawn('docker', ['exec', '-it', containerName, 'sh', '-c', command], {
      stdio: 'inherit',
      shell: false
    });
    
    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// Stop container
export function stopContainer(containerName) {
  try {
    execSync(`docker stop ${containerName}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Failed to stop container:', error.message);
    return false;
  }
}

// Start container
export function startContainer(containerName) {
  try {
    execSync(`docker start ${containerName}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Failed to start container:', error.message);
    return false;
  }
}

// Remove container
export function removeContainer(containerName) {
  try {
    execSync(`docker rm -f ${containerName}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Failed to remove container:', error.message);
    return false;
  }
}

// Show container logs
export function showLogs(containerName, follow = false) {
  const cmd = follow ? 
    `docker logs -f ${containerName}` : 
    `docker logs ${containerName}`;
  
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('Failed to show logs:', error.message);
    return false;
  }
}

// Build base image
export function buildBaseImage() {
  try {
    execSync('docker build -t openclaw-spawn-base:latest .', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    return true;
  } catch (error) {
    console.error('Failed to build image:', error.message);
    return false;
  }
}

// Start VNC services inside container (x11vnc + websockify/noVNC)
export function startVnc(containerName) {
  try {
    // Start x11vnc if not already running (serves Xvfb display :99 as VNC on port 5900)
    execSync(
      `docker exec -d ${containerName} sh -c "pgrep -x x11vnc > /dev/null || x11vnc -display :99 -forever -nopw -rfbport 5900 -quiet"`,
      { stdio: 'ignore' }
    );
    sleepSync(1);
    // Kill any existing websockify first so we only ever have one instance on port 6080.
    // Use spawnSync with explicit argv — avoids shell interpretation and pkill self-kill issues.
    spawnSync('docker', ['exec', containerName, 'pkill', '-f', 'websockify'], { stdio: 'pipe' });
    sleepSync(0.5);
    spawnSync('docker', ['exec', '-d', containerName, 'websockify', '--web', '/usr/share/novnc', '6080', 'localhost:5900'], { stdio: 'pipe' });
    sleepSync(1);
    return true;
  } catch (error) {
    console.error('Failed to start VNC:', error.message);
    return false;
  }
}

// Start a visible Chrome on the Xvfb display for browser takeover / VNC interaction.
// Uses --disable-gpu for Docker compatibility and --remote-debugging-port so the gateway can attach via CDP.
export function startVisibleChrome(containerName, cdpPort) {
  try {
    // Use a dedicated temp profile to avoid restoring old session tabs.
    // Stale session tabs cause playwright connectOverCDP to hang indefinitely.
    // Extra flags reduce background workers/network activity that can destabilize
    // the CDP WebSocket connection when browsing heavy sites like YouTube.
    execSync(
      `docker exec -d ${containerName} sh -c "/home/node/openclaw-chromium` +
      ` --no-sandbox` +
      ` --disable-gpu` +
      ` --disable-dev-shm-usage` +
      ` --remote-debugging-port=${cdpPort}` +
      ` --user-data-dir=/tmp/openclaw-vnc-profile` +
      ` --no-first-run` +
      ` --no-default-browser-check` +
      ` --disable-background-networking` +
      ` --disable-extensions` +
      ` --metrics-recording-only` +
      ` --safebrowsing-disable-auto-update` +
      ` 2>/dev/null"`,
      { stdio: 'ignore' }
    );
    // Give Chrome 3 seconds to start and expose its CDP port
    sleepSync(3);
    return true;
  } catch (error) {
    console.error('Failed to start Chrome:', error.message);
    return false;
  }
}

// Stop visible Chrome and any orphaned VNC services
export function stopVisibleChrome(containerName) {
  spawnSync('docker', ['exec', containerName, 'pkill', '-f', 'openclaw-chromium'], { stdio: 'pipe' });
  return true;
}

// Create Docker network
export function ensureNetwork() {
  try {
    execSync('docker network inspect openclaw-network', { stdio: 'ignore' });
  } catch {
    try {
      execSync('docker network create openclaw-network', { stdio: 'inherit' });
    } catch (error) {
      console.error('Failed to create network:', error.message);
    }
  }
}
