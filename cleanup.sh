#!/bin/bash

# Cleanup script - removes all openclaw-swarm containers and metadata
# Run this to start fresh

echo "🧹 Cleaning up OpenClaw Swarm..."

# Stop and remove all openclaw-* containers
echo "Stopping containers..."
docker ps -a --filter "name=openclaw-" --format "{{.Names}}" | xargs -r docker stop 2>/dev/null
echo "Removing containers..."
docker ps -a --filter "name=openclaw-" --format "{{.Names}}" | xargs -r docker rm 2>/dev/null

# Clear all instance config (keeps directory structure)
echo "Clearing instance configs..."
if [ -d ~/.openclaw-swarm/instances ]; then
  find ~/.openclaw-swarm/instances -mindepth 2 -type f -delete 2>/dev/null
  find ~/.openclaw-swarm/instances -mindepth 2 -type d -empty -delete 2>/dev/null
fi

# Remove metadata
echo "Clearing metadata..."
rm -f ~/.openclaw-swarm/instances.json
echo '{"instances":{},"nextPort":18789}' > ~/.openclaw-swarm/instances.json

# Uncomment to delete all instance directories entirely
# echo "Removing instance data..."
# rm -rf ~/.openclaw-swarm/instances/*

echo "✅ Cleanup complete! Re-add instances with: openclaw-swarm onboard"
