import inquirer from 'inquirer';
import * as clack from '@clack/prompts';
import chalk from 'chalk';
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

// Confirm action styled for the init wizard using @clack/prompts
export async function wizardConfirm(message) {
  const result = await clack.confirm({ message: accent(message), initialValue: true });
  if (clack.isCancel(result)) {
    clack.cancel('Setup cancelled.');
    process.exit(0);
  }
  return result;
}
