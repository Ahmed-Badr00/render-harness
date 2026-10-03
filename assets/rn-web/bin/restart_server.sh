#!/bin/bash
# Restart the react-native-web harness dev server and wait for the first compile. Port: HARNESS_PORT (default 8787).
# One server per port (an Android build on 8788 can run next to iOS on 8787): PID in harness/.devserver.<port>.pid,
# log in harness/devserver.<port>.log. Stops only the server this script started on that port (after checking the PID
# is still that webpack server); if another process holds the port it refuses and names a free port.
H="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${HARNESS_PORT:-8787}"
PIDFILE="$H/.devserver.$PORT.pid"
LOG="$H/devserver.$PORT.log"
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE")
  # Still ours? webpack renames its process title, so check the working directory instead of the command line.
  if lsof -a -p "$OLD" -d cwd -Fn 2>/dev/null | grep -qx "n$H"; then kill "$OLD" && echo "stopped previous harness server $OLD"; sleep 1; fi
  rm -f "$PIDFILE"
fi
HOLDER=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1)
if [ -n "$HOLDER" ]; then
  FREE=$PORT; while lsof -ti tcp:"$FREE" -sTCP:LISTEN >/dev/null 2>&1; do FREE=$((FREE + 1)); done
  echo "port $PORT is used by PID $HOLDER ($(ps -o comm= -p "$HOLDER")), not started by this harness. Not touching it."
  echo "re-run with HARNESS_PORT=$FREE $0"; exit 1
fi
: > "$LOG"
cd "$H"
HARNESS_PORT="$PORT" nohup node --max-old-space-size=12000 ../node_modules/webpack/bin/webpack.js serve --config webpack.config.js > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
for i in $(seq 1 240); do grep -qE "compiled|EADDR|Error:" "$LOG" && break; sleep 3; done
grep -E "compiled|ERROR in|EADDR|Module not found" "$LOG" | head -20
echo "harness: http://localhost:$PORT (server PID $(cat "$PIDFILE"), log $LOG; stop it with: kill \$(cat $PIDFILE))"
