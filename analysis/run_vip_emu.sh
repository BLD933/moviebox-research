#!/system/bin/sh
# run_vip_emu.sh — launch MovieBox on the emulator and apply the frida VIP unlock.
#
# Why not `frida -f` (spawn)? On this emulator, frida spawn hangs
# ("timed out while waiting for app to launch" / VM::AttachCurrentThread
# failed). Attach works fine, so we launch via `am start`, grab the pid,
# then attach. Functionally identical to spawn for our purposes.
#
# Requires: system `frida` 17.15.3 CLI (matches the 17.15.3 server —
#           a version MISMATCH (17.12 client vs 17.15 server) caused the
#           ExoPlayer SIGSEGV: frida-java-bridge GC hooks destabilize ART
#           on this emulator. See frida-java-bridge#387/#323/#3568.)
#           frida server (17.15.3) running as root on emu port 27060,
#           forwarded host:27061 -> emu:27060
#           script: /home/bld/moviebox/analysis/frida-vip-unlock.js
set -e
PKG=com.community.mbox.tv
ACT=com.transsion.subroom.activity.SplashActivity
FRIDA="$(command -v frida)"
HOST=127.0.0.1:27061
SCRIPT=/home/bld/moviebox/analysis/frida-vip-unlock.js
EMU=emulator-5554

echo "[*] force-stop + launch $PKG"
adb -s $EMU shell "am force-stop $PKG" >/dev/null 2>&1 || true
adb -s $EMU shell "am start -n $PKG/$ACT" >/dev/null 2>&1
echo "[*] waiting for process..."
for i in $(seq 1 20); do
  sleep 1
  PID=$(adb -s $EMU shell "ps -A 2>/dev/null | grep -i $PKG" 2>/dev/null | awk '{print $2}' | head -1)
  if [ -n "$PID" ]; then echo "[*] $PKG pid=$PID"; break; fi
done
if [ -z "$PID" ]; then echo "[!] app did not start"; exit 1; fi

echo "[*] attaching frida (auto-loads Java bridge) and installing VIP hooks..."
# Run in foreground so logs are visible; Ctrl-C to detach.
exec "$FRIDA" -H "$HOST" -p "$PID" -l "$SCRIPT"
