FROM node:22-bookworm

# Install system dependencies for browser automation and VNC remote access
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ca-certificates \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    && rm -rf /var/lib/apt/lists/*

# Install OpenClaw from npm
RUN npm install -g openclaw@latest

# Install Playwright and Chromium with full system dependencies as root
RUN npx playwright install chromium --with-deps

# Create node user directories first
RUN mkdir -p /home/node/.cache/ms-playwright /home/node/.openclaw /workspace

# Copy browsers to node user location
RUN cp -r /root/.cache/ms-playwright/* /home/node/.cache/ms-playwright/ 2>/dev/null || true

# Set proper ownership before switching to node user
RUN chown -R node:node /home/node/.cache /home/node/.openclaw /workspace

# Create stable symlink for OpenClaw browser.executablePath
# Playwright >= 1.41 renamed chrome-linux → chrome-linux64; find the binary dynamically.
RUN CHROMIUM_DIR=$(ls -d /home/node/.cache/ms-playwright/chromium-* 2>/dev/null | head -1) && \
    if [ -n "$CHROMIUM_DIR" ]; then \
        CHROME_BIN=$(find "$CHROMIUM_DIR" -maxdepth 3 -name "chrome" -type f 2>/dev/null | head -1) && \
        if [ -n "$CHROME_BIN" ]; then \
            ln -sf "$CHROME_BIN" /home/node/openclaw-chromium && \
            chown -h node:node /home/node/openclaw-chromium; \
        fi; \
    fi

# Verify Chromium is accessible and executable
RUN su - node -c "test -x /home/node/openclaw-chromium || echo 'Warning: Chromium not found or not executable'"

USER node
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
ENV HOME=/home/node
ENV DISPLAY=:99

WORKDIR /workspace
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x900x24 -ac +extension GLX +render -noreset & tail -f /dev/null"]
