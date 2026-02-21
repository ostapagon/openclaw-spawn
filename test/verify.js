#!/usr/bin/env node

// Quick test script to verify the CLI works
import { execSync } from 'child_process';

console.log('🧪 Testing OpenClaw Swarm CLI\n');

// Test 1: List instances
console.log('1️⃣  Testing list command...');
try {
  execSync('openclaw-swarm list', { stdio: 'inherit' });
  console.log('✅ List command works\n');
} catch (error) {
  console.log('❌ List command failed\n');
}

// Test 2: Check instance status
console.log('2️⃣  Testing instance status...');
try {
  execSync('docker ps | grep openclaw', { stdio: 'inherit' });
  console.log('✅ Container is running\n');
} catch (error) {
  console.log('❌ No containers running\n');
}

// Test 3: Execute simple command in container
console.log('3️⃣  Testing command execution...');
try {
  execSync('docker exec openclaw-oc-1 openclaw --version', { stdio: 'inherit' });
  console.log('✅ Can execute commands in container\n');
} catch (error) {
  console.log('❌ Failed to execute command\n');
}

// Test 4: Check OpenClaw health
console.log('4️⃣  Testing OpenClaw installation...');
try {
  execSync('docker exec openclaw-oc-1 which openclaw', { stdio: 'inherit' });
  console.log('✅ OpenClaw is installed\n');
} catch (error) {
  console.log('❌ OpenClaw not found\n');
}

// Test 5: Check workspace
console.log('5️⃣  Testing workspace access...');
try {
  execSync('docker exec openclaw-oc-1 ls -la /workspace', { stdio: 'inherit' });
  console.log('✅ Workspace is accessible\n');
} catch (error) {
  console.log('❌ Workspace not accessible\n');
}

console.log('\n🎉 CLI tests complete!');
console.log('\nTo test interactive commands manually:');
console.log('  openclaw-swarm onboard    # Run onboarding wizard');
console.log('  openclaw-swarm gateway    # Start gateway');
console.log('  openclaw-swarm tui        # Open TUI');
