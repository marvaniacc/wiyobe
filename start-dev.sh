#!/bin/bash
# Double-fork daemon launcher to fully detach the dev server from the shell.
cd /home/z/my-project
pkill -f "next dev" 2>/dev/null
sleep 1

# First fork
(
  # Second fork
  (
    exec env NODE_OPTIONS="--max-old-space-size=768" bun run dev > /home/z/my-project/dev.log 2>&1
  ) &
) &
exit 0
