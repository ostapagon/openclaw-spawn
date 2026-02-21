# QuickStart

## First time setup

```bash
git clone https://github.com/ostapagon/openclaw-swarm.git
cd openclaw-swarm
npm install -g .
openclaw-swarm init
```

`init` handles everything automatically:
- Installs Docker if missing (macOS: brew, Linux: apt/yum, Windows: prints download link)
- Builds the base Docker image
- Runs the OpenClaw onboarding wizard (API key, model selection)
- Starts the gateway with browser support ready

## After init

```bash
openclaw-swarm tui        # chat with your agent (browser works out of the box)
openclaw-swarm browser    # open VNC tab to see/control the browser visually
openclaw-swarm dashboard  # open the web control panel
```

## Multiple instances

```bash
openclaw-swarm onboard    # add another instance
openclaw-swarm list       # see all instances
```

## Manual steps (if you prefer)

```bash
openclaw-swarm build      # build Docker image
openclaw-swarm onboard    # create instance + run OpenClaw onboarding
openclaw-swarm gateway -d # start gateway in background (bootstraps Chrome too)
openclaw-swarm tui        # start chatting
```

## Ports (per instance)

- **+0**: Gateway / dashboard
- **+11**: Chrome CDP
- **+20**: noVNC browser view
