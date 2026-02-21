import os from 'os';
import path from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const SWARM_DIR = path.join(os.homedir(), '.openclaw-swarm');
const METADATA_FILE = path.join(SWARM_DIR, 'instances.json');
const INSTANCES_DIR = path.join(SWARM_DIR, 'instances');

// Ensure directories exist
export function ensureDirectories() {
  if (!existsSync(SWARM_DIR)) {
    mkdirSync(SWARM_DIR, { recursive: true });
  }
  if (!existsSync(INSTANCES_DIR)) {
    mkdirSync(INSTANCES_DIR, { recursive: true });
  }
  if (!existsSync(METADATA_FILE)) {
    writeFileSync(METADATA_FILE, JSON.stringify({ instances: {}, nextPort: 18789 }, null, 2));
  }
}

// Read metadata
export function readMetadata() {
  ensureDirectories();
  return JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
}

// Write metadata
export function writeMetadata(data) {
  ensureDirectories();
  writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2));
}

// Get all instances
export function getInstances() {
  const data = readMetadata();
  return data.instances;
}

// Get instance by name
export function getInstance(name) {
  const instances = getInstances();
  return instances[name];
}

// Add instance
export function addInstance(name, port) {
  const data = readMetadata();
  data.instances[name] = {
    container: `openclaw-${name}`,
    port,
    created: new Date().toISOString(),
    status: 'created'
  };
  data.nextPort = port + 220;
  writeMetadata(data);
  
  // Create instance directories
  const instanceDir = path.join(INSTANCES_DIR, name);
  mkdirSync(path.join(instanceDir, '.openclaw'), { recursive: true });
  mkdirSync(path.join(instanceDir, 'workspace'), { recursive: true });
  
  return data.instances[name];
}

// Remove instance
export function removeInstance(name) {
  const data = readMetadata();
  if (name === '__all__') {
    // Special case for cleanup: reset everything
    data.instances = {};
    data.nextPort = 18789;
  } else {
    delete data.instances[name];
  }
  writeMetadata(data);
}

// Get next available port
export function getNextPort() {
  const data = readMetadata();
  return data.nextPort;
}

// Get instance directory
export function getInstanceDir(name) {
  return path.join(INSTANCES_DIR, name);
}

// Read gateway auth token from instance's openclaw.json (for dashboard URL)
export function getInstanceGatewayToken(name) {
  const configPath = path.join(INSTANCES_DIR, name, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config?.gateway?.auth?.token ?? null;
  } catch {
    return null;
  }
}

// Set gateway.port in instance's openclaw.json so internal port matches host port
export function setInstanceGatewayPort(name, port) {
  const configPath = path.join(INSTANCES_DIR, name, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.gateway) config.gateway = {};
    config.gateway.port = port;
    // Don't set bind - let CLI flag --bind lan override for gateway process only
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // ignore
  }
}

// Enable browser takeover mode: we launch Chrome ourselves on Xvfb, gateway attaches via CDP.
// Sets attachOnly:true so the gateway never tries to launch Chrome itself (avoids Playwright launch issues in Docker).
// headless stays false for bookkeeping but is irrelevant when attachOnly:true.
export function enableBrowserTakeover(name) {
  const configPath = path.join(INSTANCES_DIR, name, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.browser) return;
    config.browser.attachOnly = true;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // ignore
  }
}

// Restore normal headless mode — undo browser takeover
export function disableBrowserTakeover(name) {
  const configPath = path.join(INSTANCES_DIR, name, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.browser) return;
    config.browser.attachOnly = false;
    config.browser.headless = true;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // ignore
  }
}

// Enable browser tool with managed Chromium (openclaw profile, CDP port 18800)
export function enableBrowserTool(name) {
  const configPath = path.join(INSTANCES_DIR, name, '.openclaw', 'openclaw.json');
  if (!existsSync(configPath)) return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!config.browser) config.browser = {};
    config.browser.enabled = true;
    config.browser.defaultProfile = 'openclaw';
    config.browser.headless = true;        // Required for Docker/headless environments
    config.browser.noSandbox = true;       // Required for Docker (Chrome sandbox needs kernel features)
    config.browser.executablePath = '/home/node/openclaw-chromium';
    if (!config.browser.profiles) config.browser.profiles = {};
    config.browser.profiles.openclaw = { cdpPort: 18800, color: '#FF4500' };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // ignore
  }
}
