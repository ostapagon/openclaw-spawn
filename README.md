# OpenClaw Swarm

Docker orchestrator for running multiple [OpenClaw](https://openclaw.ai) instances with browser automation support.

## Installation

```bash
npm install -g openclaw-swarm
```

Or link locally for development:
```bash
git clone https://github.com/yourusername/openclaw-swarm.git
cd openclaw-swarm
npm install
npm link
```

f451c93c-534a-4c84-8822-     │ d8b295 │ operat │ 140.82.    │ just   │        │
│ c039b6c52bd1 

## Quick Start

1. **Build the Docker base image** (first time only):
```bash
openclaw-swarm build
```

2. **Run any OpenClaw command** - it will prompt you to select or create an instance:
```bash
openclaw-swarm onboard
```

3. **Select "Add new instance"** and name it (e.g., `worker1`)

4. **Configure OpenClaw** using the native wizard that appears

5. **Start the gateway**:
```bash
openclaw-swarm gateway
```

6. **Access the dashboard** at `http://localhost:18789`

## Usage

### OpenClaw Commands

Any OpenClaw command automatically shows an instance selector:

```bash
openclaw-swarm onboard              # Run onboarding wizard
openclaw-swarm gateway              # Start gateway
openclaw-swarm tui                  # Open TUI
openclaw-swarm channels status      # Check channels
openclaw-swarm devices list         # List devices
openclaw-swarm devices approve <ID> # Approve a device (pairing)
openclaw-swarm dashboard            # Open dashboard
```

**Device pairing (first-time dashboard):** When you open the dashboard URL you'll see "pairing required". Run `openclaw-swarm devices list`, copy the REQUEST_ID, then `openclaw-swarm devices approve <REQUEST_ID>`. Refresh the browser.

### Management Commands

```bash
openclaw-swarm list                 # List all instances
openclaw-swarm remove worker1       # Remove an instance
openclaw-swarm stop worker1         # Stop an instance
openclaw-swarm start worker1        # Start an instance
openclaw-swarm logs worker1 -f      # Follow logs
openclaw-swarm build                # Build Docker image
openclaw-swarm cleanup              # Remove all containers and reset
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  openclaw-swarm (npm CLI)                           │
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
- Data stored in `~/.openclaw-swarm/instances/`

**Port mapping:** Internal port matches external: each instance is assigned a host port (oc-1 → 18789, oc-2 → 19009, …). We map `host_port:host_port` and set OpenClaw’s `gateway.port` to that port so the URL OpenClaw prints is correct. `openclaw-swarm dashboard` also prints the correct URL with token after the command.

**Starting fresh:** To remove all containers and metadata, run `openclaw-swarm cleanup` or `./cleanup.sh`.


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
$ openclaw-swarm onboard
? Select instance: ➕ Add new instance
? Enter instance name: email-bot
# ... OpenClaw wizard runs ...

# Start gateway on that instance
$ openclaw-swarm gateway
? Select instance: 🟢 email-bot (port 18789, running)
✓ Starting gateway...

# Create another instance
$ openclaw-swarm onboard
? Select instance: ➕ Add new instance
? Enter instance name: scraper

# List all instances
$ openclaw-swarm list
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

- **Metadata:** `~/.openclaw-swarm/instances.json`
- **Instance data:** `~/.openclaw-swarm/instances/<name>/`
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
   openclaw-swarm devices list
   ```
   You'll see output like:
   ```
   REQUEST_ID | STATUS  | AGENT | DEVICE NAME
   abc123     | Pending | main  | Chrome on Mac
   ```

2. **Approve the device:**
   ```bash
   openclaw-swarm devices approve abc123
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
docker rmi openclaw-swarm-base:latest
openclaw-swarm build
```

### Instance won't start
```bash
# Check logs
openclaw-swarm logs instance-name

# Remove and recreate
openclaw-swarm remove instance-name
openclaw-swarm onboard  # Create new one
```

## Development

```bash
# Clone and setup
git clone https://github.com/yourusername/openclaw-swarm.git
cd openclaw-swarm
npm install
npm link

# Make changes to src/
# Test with: openclaw-swarm <command>

# Unlink when done
npm unlink -g openclaw-swarm
```

## License

MIT

## Credits

Built for [OpenClaw](https://openclaw.ai) by the community.
