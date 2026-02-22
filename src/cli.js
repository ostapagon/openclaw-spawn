import chalk from 'chalk';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync, spawnSync } from 'child_process';
import {
  getInstances,
  getInstance,
  addInstance,
  removeInstance as removeInstanceMetadata,
  getNextPort,
  getNextFreePort,
  getInstanceGatewayToken,
  setInstanceGatewayPort,
  enableBrowserTool,
  enableBrowserTakeover
} from './metadata.js';
import {
  isDockerRunning,
  isDockerInstalled,
  imageExists,
  getContainerStatus,
  createContainer,
  execInContainer,
  stopContainer,
  startContainer,
  removeContainer,
  showLogs,
  buildBaseImage,
  ensureNetwork,
  startVnc,
  startVisibleChrome,
  stopVisibleChrome,
  sleepSync
} from './docker.js';
import * as clack from '@clack/prompts';
import { selectInstance, promptInstanceName, promptFolderMount, wizardConfirm } from './selector.js';

// Management commands handled by openclaw-spawn itself
const MANAGEMENT_COMMANDS = ['list', 'remove', 'stop', 'start', 'logs', 'build', 'cleanup'];

// CLI entry point
export async function cli(args) {
  const command = args[0];

  // init runs its own Docker checks — must come before the global Docker running check
  if (command === 'init') {
    return await initCommand();
  }

  // Check Docker
  if (!isDockerRunning()) {
    console.error(chalk.red('✗ Docker is not running. Please start Docker Desktop.'));
    process.exit(1);
  }
  
  // Management commands
  if (command === 'list') {
    return await listInstances();
  }
  
  if (command === 'remove') {
    const name = args[1];
    if (!name) {
      console.error(chalk.red('✗ Please specify instance name'));
      process.exit(1);
    }
    return await removeInstanceCommand(name);
  }
  
  if (command === 'stop') {
    const name = args[1];
    if (!name) {
      console.error(chalk.red('✗ Please specify instance name'));
      process.exit(1);
    }
    return await stopInstanceCommand(name);
  }
  
  if (command === 'start') {
    const name = args[1];
    if (!name) {
      console.error(chalk.red('✗ Please specify instance name'));
      process.exit(1);
    }
    return await startInstanceCommand(name);
  }
  
  if (command === 'logs') {
    const name = args[1];
    const follow = args.includes('-f') || args.includes('--follow');
    if (!name) {
      console.error(chalk.red('✗ Please specify instance name'));
      process.exit(1);
    }
    return await showLogsCommand(name, follow);
  }
  
  if (command === 'build') {
    return await buildCommand();
  }

  if (command === 'cleanup') {
    return await cleanupCommand();
  }

  if (command === 'browser') {
    if (args[1] === 'stop') {
      return await browserStopCommand(args[2]);
    }
    return await browserCommand(args[1]);
  }
  
  // All other commands: route to OpenClaw in container
  const detach = args.includes('-d') || args.includes('--detach');
  const filteredArgs = args.filter(a => a !== '-d' && a !== '--detach');
  return await proxyOpenClawCommand(filteredArgs, detach);
}

// Smart first-time setup wizard
async function initCommand() {
  clack.intro(chalk.bold.hex('#FF5A2D')('🦞 OpenClaw Spawn — Setup Wizard'));

  // ── Step 1: Docker installed? ─────────────────────────────────────────────
  console.log(chalk.bold('\nStep 1/5  Check Docker is installed'));
  if (!isDockerInstalled()) {
    const hasBrew = process.platform === 'darwin'
      ? (() => { try { execSync('which brew', { stdio: 'ignore' }); return true; } catch { return false; } })()
      : true;
    const installMsg = process.platform === 'darwin' && !hasBrew
      ? 'Install Homebrew + Docker Desktop now?'
      : 'Install Docker now?';
    console.log(chalk.yellow('  Docker not found.'));
    const installDocker = await wizardConfirm(installMsg);
    if (!installDocker) {
      clack.outro(chalk.yellow('Install Docker manually and re-run: openclaw-spawn init'));
      process.exit(0);
    }
    console.log(chalk.dim('  Installing Docker...\n'));
    try {
      if (process.platform === 'darwin') {
        // Install Homebrew if missing
        if (!hasBrew) {
          console.log(chalk.dim('  Installing Homebrew...'));
          execSync('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', { stdio: 'inherit' });
          // Add Homebrew to PATH for this process (Apple Silicon: /opt/homebrew, Intel: /usr/local)
          for (const p of ['/opt/homebrew/bin', '/usr/local/bin']) {
            if (!process.env.PATH?.includes(p)) process.env.PATH = `${p}:${process.env.PATH}`;
          }
          console.log(chalk.green('  ✓ Homebrew installed\n'));
        }
        execSync('brew install --cask docker-desktop', { stdio: 'inherit' });
      } else if (process.platform === 'linux') {
        // Detect package manager
        const hasPkg = (cmd) => { try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; } };
        if (hasPkg('apt-get')) {
          execSync('sudo apt-get update && sudo apt-get install -y docker.io', { stdio: 'inherit' });
        } else if (hasPkg('dnf')) {
          execSync('sudo dnf install -y docker', { stdio: 'inherit' });
        } else if (hasPkg('yum')) {
          execSync('sudo yum install -y docker', { stdio: 'inherit' });
        } else if (hasPkg('pacman')) {
          execSync('sudo pacman -Sy --noconfirm docker', { stdio: 'inherit' });
        } else if (hasPkg('zypper')) {
          execSync('sudo zypper install -y docker', { stdio: 'inherit' });
        } else {
          console.error(chalk.red('  ✗ No supported package manager found (apt, dnf, yum, pacman, zypper).'));
          console.log(chalk.yellow('  Install Docker manually: https://docs.docker.com/engine/install/'));
          process.exit(1);
        }
        execSync('sudo systemctl start docker && sudo systemctl enable docker', { stdio: 'inherit' });
        // Add current user to docker group so sudo isn't needed
        try { execSync(`sudo usermod -aG docker ${process.env.USER || process.env.LOGNAME}`, { stdio: 'ignore' }); } catch {}
        console.log(chalk.dim('  Note: log out and back in (or run `newgrp docker`) for group change to take effect.'));
      } else if (process.platform === 'win32') {
        // Try winget (built into Windows 10/11)
        const hasWinget = (() => { try { execSync('winget --version', { stdio: 'ignore', shell: 'cmd.exe' }); return true; } catch { return false; } })();
        if (hasWinget) {
          console.log(chalk.dim('  Installing Docker Desktop via winget...\n'));
          execSync('winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements', { stdio: 'inherit', shell: 'cmd.exe' });
          console.log(chalk.yellow('\n  Docker Desktop installed. Please restart your machine, then re-run: openclaw-spawn init'));
          process.exit(0);
        } else {
          console.log(chalk.yellow('  Download Docker Desktop: https://docs.docker.com/desktop/windows/'));
          console.log(chalk.yellow('  Then re-run: openclaw-spawn init\n'));
          process.exit(1);
        }
      }
      console.log(chalk.green('  ✓ Docker installed\n'));
    } catch (err) {
      console.error(chalk.red(`  ✗ Failed to install Docker: ${err.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.green('  ✓ Docker is installed\n'));
  }

  // ── Step 2: Docker running? ───────────────────────────────────────────────
  console.log(chalk.bold('Step 2/5  Check Docker is running'));
  if (!isDockerRunning()) {
    console.log(chalk.yellow('  Docker is not running. Starting it...'));
    if (process.platform === 'darwin') {
      try { execSync('open -a Docker', { stdio: 'ignore' }); } catch {}
    } else if (process.platform === 'linux') {
      try { execSync('sudo systemctl start docker', { stdio: 'ignore' }); } catch {}
    } else if (process.platform === 'win32') {
      const dockerPaths = [
        `${process.env.ProgramFiles}\\Docker\\Docker\\Docker Desktop.exe`,
        `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`,
        'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
      ];
      const dockerExe = dockerPaths.find(p => {
        try { execSync(`if exist "${p}" echo yes`, { stdio: 'pipe', shell: 'cmd.exe' }); return true; } catch { return false; }
      }) ?? dockerPaths[2];
      try { execSync(`start "" "${dockerExe}"`, { stdio: 'ignore', shell: 'cmd.exe' }); } catch {}
    }
    // Poll until Docker is ready (up to 60s)
    let ready = false;
    for (let i = 0; i < 20; i++) {
      if (isDockerRunning()) { ready = true; break; }
      process.stdout.write(chalk.dim(`  Waiting for Docker to start... ${(i + 1) * 3}s\r`));
      await new Promise(r => setTimeout(r, 3000));
    }
    if (!ready) {
      console.error(chalk.red('\n  ✗ Docker did not start within 60s. Please start it manually and re-run init.'));
      process.exit(1);
    }
    process.stdout.write('\n');
  }
  console.log(chalk.green('  ✓ Docker is running\n'));

  // ── Step 3: Base image built? ─────────────────────────────────────────────
  console.log(chalk.bold('Step 3/5  Build base Docker image'));
  if (imageExists()) {
    console.log(chalk.green('  ✓ Image already built, skipping\n'));
  } else {
    const buildImage = await wizardConfirm('Build the base Docker image now? (takes a few minutes the first time)');
    if (!buildImage) {
      clack.outro(chalk.yellow('Skipped. Run: openclaw-spawn build'));
      process.exit(0);
    }
    console.log(chalk.dim('  Building openclaw-spawn-base:latest...\n'));
    const ok = buildBaseImage();
    if (!ok) {
      console.error(chalk.red('  ✗ Image build failed'));
      process.exit(1);
    }
    console.log(chalk.green('  ✓ Image built\n'));
  }

  // ── Step 4: Onboard new instance ─────────────────────────────────────────
  console.log(chalk.bold('Step 4/5  Set up OpenClaw instance'));
  const setupInstance = await wizardConfirm('Create and onboard a new OpenClaw instance now?');
  if (!setupInstance) {
    clack.outro(chalk.yellow('Skipped. Run: openclaw-spawn onboard'));
    process.exit(0);
  }
  ensureNetwork();
  console.log(chalk.dim('  Running OpenClaw onboarding wizard...\n'));
  const instanceName = await promptInstanceName();

  // Optional: share host folders with the agent
  const mounts = [];
  const wantMount = await wizardConfirm('Mount a host folder so the agent can access your files?');
  if (wantMount) {
    if (process.platform === 'darwin') {
      console.log(chalk.dim(
        '\n  Note: if the path is outside /Users, add it to Docker Desktop\'s file sharing list.\n' +
        '  (Docker Desktop → Settings → Resources → File Sharing)\n'
      ));
    }
    let addAnother = true;
    while (addAnother) {
      const mount = await promptFolderMount();
      mounts.push(mount);
      const modeLabel = mount.mode === 'ro' ? 'read-only' : 'read/write';
      console.log(chalk.green(`  ✓ ${mount.host}  →  ${mount.container}  (${modeLabel})`));
      addAnother = await wizardConfirm('Add another folder?', false);
    }
  }

  const port = await getNextFreePort();
  console.log(chalk.blue(`\n  Creating instance ${instanceName} on port ${port}...`));
  addInstance(instanceName, port, mounts);
  const created = createContainer(instanceName, port, mounts);
  if (!created) {
    console.error(chalk.red('  ✗ Failed to create container'));
    removeInstanceMetadata(instanceName);
    process.exit(1);
  }
  const instance = getInstance(instanceName);
  await execInContainer(instance.container, 'openclaw onboard', false);
  setInstanceGatewayPort(instanceName, instance.port);
  enableBrowserTool(instanceName);

  console.log(chalk.green(`\n  ✓ Instance ${instanceName} ready\n`));

  // ── Step 5: Start gateway ─────────────────────────────────────────────────
  console.log(chalk.bold('Step 5/5  Start gateway'));
  const startGateway = await wizardConfirm('Start the OpenClaw gateway now?');
  if (!startGateway) {
    clack.outro(chalk.green.bold('✓ OpenClaw Spawn is ready! Run: openclaw-spawn gateway'));
    process.exit(0);
  }
  const inst = getInstance(instanceName);

  // Bootstrap Chrome then start gateway
  stopVisibleChrome(inst.container);
  startVisibleChrome(inst.container, 18800);
  enableBrowserTakeover(instanceName);
  setInstanceGatewayPort(instanceName, inst.port);
  await execInContainer(inst.container, 'openclaw gateway --bind lan', true);
  sleepSync(2);
  console.log(chalk.green('  ✓ Gateway started\n'));

  // ── Done ──────────────────────────────────────────────────────────────────
  clack.outro(chalk.green.bold('✓ OpenClaw Spawn is ready!'));
  console.log(chalk.blue('Next steps:'));
  console.log(chalk.cyan(`  openclaw-spawn tui`) + chalk.dim('              # chat with your agent'));
  console.log(chalk.cyan(`  openclaw-spawn browser`) + chalk.dim('          # open VNC to see/control the browser'));
  console.log(chalk.cyan(`  openclaw-spawn dashboard`) + chalk.dim('        # open the web dashboard\n'));
}

// Show help
function showHelp() {
  console.log(`
${chalk.blue.bold('OpenClaw Spawn')} - Docker orchestrator for multiple OpenClaw instances

${chalk.yellow('Usage:')}
  openclaw-spawn <command> [options]

${chalk.yellow('OpenClaw Commands:')} (auto-selects instance)
  onboard              Run OpenClaw onboarding wizard
  gateway [-d]         Start OpenClaw gateway (-d for background)
  tui                  Open OpenClaw TUI
  channels             Manage channels
  devices              Manage devices
  dashboard            Open dashboard
  ...                  Any other OpenClaw command

${chalk.yellow('Setup:')}
  init                 First-time setup wizard (installs Docker, builds image, onboards)

${chalk.yellow('Management Commands:')}
  list                 List all instances
  remove <name>        Stop and remove instance
  stop <name>          Stop instance
  start <name>         Start instance
  logs <name> [-f]     Show instance logs
  build                Build Docker base image
  cleanup              Remove all containers and reset metadata
  browser [name]       Open VNC tab to see/control the agent's browser
  browser stop [name]  Close VNC view (agent browser keeps running)

${chalk.yellow('Examples:')}
  openclaw-spawn onboard              # Select instance and run onboard
  openclaw-spawn gateway -d           # Select instance and start gateway
  openclaw-spawn list                 # List all instances
  openclaw-spawn logs worker1 -f      # Follow logs for worker1
`);
}

// Proxy OpenClaw command
async function proxyOpenClawCommand(args, detach = false) {
  let command = args.length > 0 ? args.join(' ') : 'onboard';
  
  // Select or create instance
  const selected = await selectInstance(true);
  
  let instanceName;
  if (selected === '__new__') {
    instanceName = await promptInstanceName();
    const port = await getNextFreePort();
    
    console.log(chalk.blue(`\n📦 Creating instance ${instanceName} on port ${port}...`));
    
    // Ensure network exists
    ensureNetwork();
    
    // Add to metadata
    addInstance(instanceName, port);
    
    // Create container
    const created = createContainer(instanceName, port);
    if (!created) {
      console.error(chalk.red('✗ Failed to create container'));
      removeInstanceMetadata(instanceName);
      process.exit(1);
    }
    
    console.log(chalk.green(`✓ Created instance ${instanceName}`));
  } else {
    instanceName = selected;
    const instance = getInstance(instanceName);
    
    // Check if container is running
    const status = getContainerStatus(instance.container);
    if (status === 'stopped') {
      console.log(chalk.yellow(`⚠ Instance ${instanceName} is stopped. Starting...`));
      startContainer(instance.container);
    } else if (status === 'not-found') {
      console.log(chalk.yellow(`⚠ Container not found. Recreating...`));
      createContainer(instanceName, instance.port, instance.mounts ?? []);
    }
  }
  
  // Execute OpenClaw command
  const instance = getInstance(instanceName);

  // Ensure gateway port in config matches host port
  // Add --bind lan for gateway commands (required for Docker containers)
  if (command.startsWith('gateway')) {
    setInstanceGatewayPort(instanceName, instance.port);
    // Add --bind lan if not already present (gateway must bind to 0.0.0.0 in container)
    if (!command.includes('--bind')) {
      command = command.replace(/^gateway/, 'gateway --bind lan');
    }
  }

  // When starting gateway in background: bootstrap Chrome first so the browser tool
  // is ready the moment the gateway comes up — no separate `browser` command needed.
  // CDP port is always 18800 inside the container (mapped to host port+11 externally).
  if (command.startsWith('gateway') && detach) {
    stopVisibleChrome(instance.container);
    startVisibleChrome(instance.container, 18800);
    enableBrowserTakeover(instanceName);
  }

  if (detach) {
    console.log(chalk.blue(`\n🦞 Starting in background: openclaw ${command}`));
    console.log(chalk.dim(`Container: ${instance.container}\n`));
    
    try {
      await execInContainer(instance.container, `openclaw ${command}`, true);
      console.log(chalk.green(`✓ Command started in background`));
      console.log(chalk.dim(`View logs: openclaw-spawn logs ${instanceName} -f`));
    } catch (error) {
      console.error(chalk.red(`\n✗ Command failed: ${error.message}`));
      process.exit(1);
    }
  } else {
    console.log(chalk.blue(`\n🦞 Running: openclaw ${command}`));
    console.log(chalk.dim(`Container: ${instance.container}\n`));
    
    try {
      await execInContainer(instance.container, `openclaw ${command}`, false);
      if (command === 'onboard') {
        setInstanceGatewayPort(instanceName, instance.port);
        enableBrowserTool(instanceName);
      }
      if (command.startsWith('dashboard')) {
        const token = getInstanceGatewayToken(instanceName);
        const url = token
          ? `http://localhost:${instance.port}/#token=${token}`
          : `http://localhost:${instance.port}/`;
        console.log(chalk.blue(`\n📌 Instance ${instanceName} → open on your machine:`));
        console.log(chalk.cyan(`   ${url}`));
      }
    } catch (error) {
      console.error(chalk.red(`\n✗ Command failed: ${error.message}`));
      process.exit(1);
    }
  }
}

// Open live browser view via noVNC.
// Instead of asking the gateway to launch Chrome (which has Playwright/GPU issues in Docker non-headless),
// we launch Chrome ourselves on the Xvfb display and set attachOnly:true so the gateway just attaches
// to our already-running Chrome via CDP. Both the agent and the user share the same browser session.
async function browserCommand(name) {
  let instanceName = name;

  if (!instanceName) {
    const selected = await selectInstance(false);
    if (!selected || selected === '__new__') {
      console.error(chalk.red('✗ No instance selected'));
      process.exit(1);
    }
    instanceName = selected;
  }

  const instance = getInstance(instanceName);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${instanceName} not found`));
    process.exit(1);
  }

  // Ensure container is running
  const status = getContainerStatus(instance.container);
  if (status === 'stopped') {
    console.log(chalk.yellow(`⚠ Instance ${instanceName} is stopped. Starting...`));
    startContainer(instance.container);
  } else if (status === 'not-found') {
    console.error(chalk.red(`✗ Container not found. Run: openclaw-spawn start ${instanceName}`));
    process.exit(1);
  }

  // Check Xvfb is available — only present in containers built with the new image
  let xvfbAvailable = false;
  try {
    const check = execSync(
      `docker exec ${instance.container} sh -c "command -v Xvfb > /dev/null 2>&1 && echo yes || echo no"`,
      { encoding: 'utf8' }
    ).trim();
    xvfbAvailable = check === 'yes';
  } catch {}

  if (!xvfbAvailable) {
    console.error(chalk.red('\n✗ This container was built without VNC support.'));
    console.error(chalk.yellow('  Rebuild the image and recreate the container:'));
    console.error(chalk.dim(`\n    openclaw-spawn build`));
    console.error(chalk.dim(`    openclaw-spawn cleanup`));
    console.error(chalk.dim(`    openclaw-spawn onboard\n`));
    process.exit(1);
  }

  console.log(chalk.blue(`\n🖥  Starting browser view for ${instanceName}...`));

  // Chrome is already running (started by `gateway -d`). Just attach VNC services to the display.
  console.log(chalk.dim('  Starting VNC services...'));
  startVnc(instance.container);

  const vncUrl = `http://localhost:${instance.port + 20}/vnc.html?autoconnect=true&reconnect=true`;

  console.log(chalk.green(`\n✓ Browser view ready!`));
  console.log(chalk.blue(`\n📌 Instance ${instanceName} → open on your machine:`));
  console.log(chalk.cyan(`   ${vncUrl}`));
  console.log(chalk.dim(`\n   You and the agent share the same Chrome session.`));
  console.log(chalk.dim(`   Log in, solve captchas, or fill credentials — the agent picks it up automatically.`));
  console.log(chalk.dim(`\n   When done: openclaw-spawn browser stop ${instanceName}\n`));

  // Auto-open VNC tab
  // On Windows, `start "url"` treats the first quoted arg as the window title and opens a terminal.
  // The fix is `start "" "url"` — empty string as title, then the URL.
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${vncUrl}"`, { stdio: 'ignore', shell: true });
    } else if (process.platform === 'darwin') {
      execSync(`open "${vncUrl}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${vncUrl}"`, { stdio: 'ignore' });
    }
  } catch {}
}

// Restore normal headless mode — stop visible Chrome, re-enable headless, restart gateway
async function browserStopCommand(name) {
  let instanceName = name;

  if (!instanceName) {
    const selected = await selectInstance(false);
    if (!selected || selected === '__new__') {
      console.error(chalk.red('✗ No instance selected'));
      process.exit(1);
    }
    instanceName = selected;
  }

  const instance = getInstance(instanceName);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${instanceName} not found`));
    process.exit(1);
  }

  console.log(chalk.blue(`\n🔄 Stopping VNC view for ${instanceName}...`));

  // Stop VNC services only — Chrome and gateway keep running so the agent can still use the browser
  spawnSync('docker', ['exec', instance.container, 'pkill', '-f', 'websockify'], { stdio: 'pipe' });
  spawnSync('docker', ['exec', instance.container, 'pkill', '-x', 'x11vnc'], { stdio: 'pipe' });

  console.log(chalk.green(`\n✓ VNC stopped. Agent browser tool is still active.`));
}

// List instances
async function listInstances() {
  const instances = getInstances();
  
  if (Object.keys(instances).length === 0) {
    console.log(chalk.yellow('No instances found. Run a command to create one!'));
    return;
  }
  
  console.log(chalk.blue.bold('\n📋 OpenClaw Instances:\n'));
  
  for (const [name, instance] of Object.entries(instances)) {
    const status = getContainerStatus(instance.container);
    const statusIcon = status === 'running' ? '🟢' : status === 'stopped' ? '🔴' : '⚪';
    const statusColor = status === 'running' ? chalk.green : status === 'stopped' ? chalk.red : chalk.gray;
    
    console.log(`${statusIcon} ${chalk.bold(name)}`);
    console.log(`  Port: ${instance.port}`);
    console.log(`  Status: ${statusColor(status)}`);
    console.log(`  Container: ${instance.container}`);
    console.log(`  Created: ${new Date(instance.created).toLocaleString()}`);
    if (status === 'running') {
      console.log(`  Browser: ${chalk.cyan(`http://localhost:${instance.port + 20}/vnc.html?autoconnect=true`)}`);
    }
    console.log();
  }
}

// Remove instance
async function removeInstanceCommand(name) {
  const instance = getInstance(name);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${name} not found`));
    process.exit(1);
  }
  
  const confirmed = await wizardConfirm(`Remove instance ${name}? This will delete all data.`);
  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'));
    return;
  }
  
  console.log(chalk.blue(`Removing instance ${name}...`));
  removeContainer(instance.container);
  removeInstanceMetadata(name);
  console.log(chalk.green(`✓ Removed instance ${name}`));
}

// Stop instance
async function stopInstanceCommand(name) {
  const instance = getInstance(name);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${name} not found`));
    process.exit(1);
  }
  
  console.log(chalk.blue(`Stopping instance ${name}...`));
  stopContainer(instance.container);
  console.log(chalk.green(`✓ Stopped instance ${name}`));
}

// Start instance
async function startInstanceCommand(name) {
  const instance = getInstance(name);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${name} not found`));
    process.exit(1);
  }
  
  console.log(chalk.blue(`Starting instance ${name}...`));
  startContainer(instance.container);
  console.log(chalk.green(`✓ Started instance ${name}`));
}

// Show logs
async function showLogsCommand(name, follow) {
  const instance = getInstance(name);
  if (!instance) {
    console.error(chalk.red(`✗ Instance ${name} not found`));
    process.exit(1);
  }
  
  showLogs(instance.container, follow);
}

// Build base image
async function buildCommand() {
  console.log(chalk.blue('Building Docker base image...'));
  console.log(chalk.dim('This may take a few minutes on first build.\n'));
  
  const success = buildBaseImage();
  if (success) {
    console.log(chalk.green('\n✓ Build complete!'));
  } else {
    console.error(chalk.red('\n✗ Build failed'));
    process.exit(1);
  }
}

// Cleanup - remove all containers and reset metadata
async function cleanupCommand() {
  const confirmed = await wizardConfirm('Remove all OpenClaw instances and reset metadata?');
  if (!confirmed) {
    console.log(chalk.yellow('Cancelled'));
    return;
  }

  console.log(chalk.blue('🧹 Cleaning up OpenClaw Spawn...\n'));

  // Get all instances
  const instances = getInstances();
  const instanceNames = Object.keys(instances);

  if (instanceNames.length > 0) {
    console.log(chalk.dim('Stopping and removing containers...'));
    for (const name of instanceNames) {
      const instance = instances[name];
      const status = getContainerStatus(instance.container);
      if (status === 'running') {
        stopContainer(instance.container);
      }
      if (status !== 'not-found') {
        removeContainer(instance.container);
      }
    }
  }

  // Clear instance configs (but keep directory structure)
  console.log(chalk.dim('Clearing instance configs...'));
  const instancesDir = path.join(os.homedir(), '.openclaw-spawn', 'instances');
  try {
    if (fs.existsSync(instancesDir)) {
      for (const instance of fs.readdirSync(instancesDir)) {
        const instancePath = path.join(instancesDir, instance);
        if (fs.statSync(instancePath).isDirectory()) {
          fs.rmSync(instancePath, { recursive: true, force: true });
          fs.mkdirSync(instancePath, { recursive: true });
        }
      }
    }
  } catch {
    // Ignore errors (directory might not exist)
  }

  // Reset metadata
  console.log(chalk.dim('Clearing metadata...'));
  removeInstanceMetadata('__all__');  // Will clear in metadata module
  
  console.log(chalk.green('\n✅ Cleanup complete! Re-add instances with: openclaw-spawn onboard'));
}
