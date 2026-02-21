# QuickStart

## First time setup

```bash
git clone https://github.com/ostapagon/openclaw-spawn.git
cd openclaw-spawn
npm install -g .
openclaw-spawn init
```

`init` handles everything automatically:
- Installs Docker if missing (macOS: brew, Linux: apt/yum, Windows: prints download link)
- Builds the base Docker image
- Runs the OpenClaw onboarding wizard (API key, model selection)
- Starts the gateway with browser support ready

## After init

```bash
openclaw-spawn tui        # chat with your agent (browser works out of the box)
openclaw-spawn browser    # open VNC tab to see/control the browser visually
openclaw-spawn dashboard  # open the web control panel
```

## Multiple instances

```bash
openclaw-spawn onboard    # add another instance
openclaw-spawn list       # see all instances
```

## Manual steps (if you prefer)

```bash
openclaw-spawn build      # build Docker image
openclaw-spawn onboard    # create instance + run OpenClaw onboarding
openclaw-spawn gateway -d # start gateway in background (bootstraps Chrome too)
openclaw-spawn tui        # start chatting
```

## Ports (per instance)

- **+0**: Gateway / dashboard
- **+11**: Chrome CDP
- **+20**: noVNC browser view
