import inquirer from 'inquirer';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
import path from 'path';
import { existsSync } from 'fs';
import { getInstances } from './metadata.js';
import { getContainerStatus } from './docker.js';

// Lobster accent color — matches openclaw's theme
const accent = (s) => chalk.hex('#FF5A2D')(s);

// Show instance selector
export async function selectInstance(allowAddNew = true) {
  const instances = getInstances();
  const choices = [];
  
  // Add existing instances
  for (const [name, instance] of Object.entries(instances)) {
    const status = getContainerStatus(instance.container);
    const statusIcon = status === 'running' ? '🟢' : status === 'stopped' ? '🔴' : '⚪';
    choices.push({
      name: `${statusIcon} ${name} (port ${instance.port}, ${status})`,
      value: name,
      short: name
    });
  }
  
  // Add "new instance" option
  if (allowAddNew) {
    choices.push({
      name: '➕ Add new instance',
      value: '__new__',
      short: 'New instance'
    });
  }
  
  if (choices.length === 0) {
    return '__new__';
  }
  
  const answer = await inquirer.prompt([{
    type: 'list',
    name: 'instance',
    message: 'Select instance:',
    choices
  }]);
  
  return answer.instance;
}

// Prompt for new instance name
export async function promptInstanceName() {
  const answer = await inquirer.prompt([{
    type: 'input',
    name: 'name',
    message: 'Enter instance name:',
    validate: (input) => {
      if (!input) return 'Name cannot be empty';
      if (!/^[a-z0-9-]+$/.test(input)) return 'Use only lowercase letters, numbers, and hyphens';
      const instances = getInstances();
      if (instances[input]) return 'Instance already exists';
      return true;
    }
  }]);
  
  return answer.name;
}

// Confirm action
export async function confirm(message) {
  const answer = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message,
    default: false
  }]);
  
  return answer.confirmed;
}

// Prompt for a single host→container folder mount entry.
// Returns { host, container, mode } where container is /workspace/<basename>.
export async function promptFolderMount() {
  const { rawPath } = await inquirer.prompt([{
    type: 'input',
    name: 'rawPath',
    message: 'Absolute path to the host folder you want to share:',
    validate: (input) => {
      if (!input.trim()) return 'Path cannot be empty';
      const resolved = path.resolve(input.trim());
      if (!existsSync(resolved)) return `Path does not exist: ${resolved}`;
      return true;
    }
  }]);

  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
    message: 'Access mode inside the container:',
    choices: [
      { name: 'Read/Write  — agent can read and edit files', value: 'rw' },
      { name: 'Read-only   — agent can only read files',     value: 'ro' },
    ],
    default: 'rw'
  }]);

  const resolved = path.resolve(rawPath.trim());
  const folderName = path.basename(resolved);
  return {
    host: resolved,
    container: `/home/node/.openclaw/workspace/user_shared/${folderName}`,
    mode,
  };
}

// Confirm action styled for the init wizard using @clack/prompts
export async function wizardConfirm(message, defaultValue = true) {
  const result = await clack.confirm({ message: accent(message), initialValue: defaultValue });
  if (clack.isCancel(result)) {
    clack.cancel('Setup cancelled.');
    process.exit(0);
  }
  return result;
}
