# OpenClaw Swarm

Docker orchestrator for running multiple [OpenClaw](https://openclaw.ai) instances with browser automation support.

## Installation

```bash
npm install -g openclaw-spawn
```

Or link locally for development:
```bash
git clone https://github.com/yourusername/openclaw-spawn.git
cd openclaw-spawn
npm install
npm link
```

f451c93c-534a-4c84-8822-     │ d8b295 │ operat │ 140.82.    │ just   │        │
│ c039b6c52bd1 

## Quick Start

1. **Build the Docker base image** (first time only):
```bash
openclaw-spawn build
```

2. **Run any OpenClaw command** - it will prompt you to select or create an instance:
```bash
openclaw-spawn onboard
```

3. **Select "Add new instance"** and name it (e.g., `worker1`)

4. **Configure OpenClaw** using the native wizard that appears

5. **Start the gateway**:
```bash
openclaw-spawn gateway
```

6. **Access the dashboard** at `http://localhost:18789`

## Usage

### OpenClaw Commands

Any OpenClaw command automatically shows an instance selector:

```bash
openclaw-spawn onboard              # Run onboarding wizard
openclaw-spawn gateway              # Start gateway
openclaw-spawn tui                  # Open TUI
openclaw-spawn channels status      # Check channels
openclaw-spawn devices list         # List devices
openclaw-spawn devices approve <ID> # Approve a device (pairing)
openclaw-spawn dashboard            # Open dashboard
```

**Device pairing (first-time dashboard):** When you open the dashboard URL you'll see "pairing required". Run `openclaw-spawn devices list`, copy the REQUEST_ID, then `openclaw-spawn devices approve <REQUEST_ID>`. Refresh the browser.

### Management Commands

```bash
openclaw-spawn list                 # List all instances
openclaw-spawn remove worker1       # Remove an instance
openclaw-spawn stop worker1         # Stop an instance
openclaw-spawn start worker1        # Start an instance
openclaw-spawn logs worker1 -f      # Follow logs
openclaw-spawn build                # Build Docker image
openclaw-spawn cleanup              # Remove all containers and reset
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  openclaw-spawn (npm CLI)                           │
│  - Manages instance metadata                        │
│  - Shows interactive selector                       │
│  - Routes commands to containers                    │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
┌───▼────────┐          ┌───────▼───────┐
│ worker1    │          │ worker2       │
│ Container  │          │ Container     │
│            │          │               │
│ OpenClaw   │          │ OpenClaw      │
│ + Chromium │          │ + Chromium    │
│            │          │               │
│ Port 18789 │          │ Port 19001    │
└────────────┘          └───────────────┘
```

- Each instance runs in its own Docker container
- Containers have OpenClaw installed from npm
- Chromium included for browser automation
- Isolated configuration and workspace per instance
- Data stored in `~/.openclaw-spawn/instances/`

**Port mapping:** Internal port matches external: each instance is assigned a host port (oc-1 → 18789, oc-2 → 19009, …). We map `host_port:host_port` and set OpenClaw’s `gateway.port` to that port so the URL OpenClaw prints is correct. `openclaw-spawn dashboard` also prints the correct URL with token after the command.

**Starting fresh:** To remove all containers and metadata, run `openclaw-spawn cleanup` or `./cleanup.sh`.


## Features

- **Simple UX** - Just run commands, select or create instances
- **Native OpenClaw** - Uses official OpenClaw wizards and tools
- **Browser support** - Chromium included for automation
- **Multi-instance** - Run many OpenClaw instances in parallel
- **Isolated** - Each instance has separate config and workspace
- **No Docker knowledge needed** - CLI abstracts all Docker commands

## Example Workflow

```bash
# Create and configure first instance
$ openclaw-spawn onboard
? Select instance: ➕ Add new instance
? Enter instance name: email-bot
# ... OpenClaw wizard runs ...

# Start gateway on that instance
$ openclaw-spawn gateway
? Select instance: 🟢 email-bot (port 18789, running)
✓ Starting gateway...

# Create another instance
$ openclaw-spawn onboard
? Select instance: ➕ Add new instance
? Enter instance name: scraper

# List all instances
$ openclaw-spawn list
📋 OpenClaw Instances:

🟢 email-bot
  Port: 18789
  Status: running
  Container: openclaw-email-bot
  
🟢 scraper
  Port: 19001
  Status: running
  Container: openclaw-scraper
```

## Data Storage

- **Metadata:** `~/.openclaw-spawn/instances.json`
- **Instance data:** `~/.openclaw-spawn/instances/<name>/`
  - `.openclaw/` - OpenClaw configuration
  - `workspace/` - Instance workspace files

## Requirements

- Docker Desktop
- Node.js 18+
- macOS, Linux, or Windows with WSL2

## Troubleshooting

### "Pairing required" when opening the dashboard
OpenClaw requires device pairing for security. When you first open the dashboard, you'll see "disconnected (1008): pairing required".

**Steps to approve your browser:**

1. **List pending devices:**
   ```bash
   openclaw-spawn devices list
   ```
   You'll see output like:
   ```
   REQUEST_ID | STATUS  | AGENT | DEVICE NAME
   abc123     | Pending | main  | Chrome on Mac
   ```

2. **Approve the device:**
   ```bash
   openclaw-spawn devices approve abc123
   ```
   (Use the REQUEST_ID from the first column)

3. **Refresh the dashboard** - it should now connect successfully!

**Note:** You only need to do this once per browser/device. The approval persists.

### Docker not running
```
✗ Docker is not running. Please start Docker Desktop.
```
→ Start Docker Desktop and try again

### Build fails
```bash
# Clean and rebuild
docker rmi openclaw-spawn-base:latest
openclaw-spawn build
```

### Instance won't start
```bash
# Check logs
openclaw-spawn logs instance-name

# Remove and recreate
openclaw-spawn remove instance-name
openclaw-spawn onboard  # Create new one
```

## Development

```bash
# Clone and setup
git clone https://github.com/yourusername/openclaw-spawn.git
cd openclaw-spawn
npm install
npm link

# Make changes to src/
# Test with: openclaw-spawn <command>

# Unlink when done
npm unlink -g openclaw-spawn
```

## License

MIT

## Credits

Built for [OpenClaw](https://openclaw.ai) by the community.
