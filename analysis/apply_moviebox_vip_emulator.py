#!/usr/bin/env python3
"""
apply_moviebox_vip_emulator.py
==============================
Re-applies the MovieBox VIP unlock on the emulator (emulator-5554).

Prereqs:
  - frida-server running on the emulator (loopback :27042)
  - adb forward set:  adb -s emulator-5554 forward tcp:27044 tcp:27042
  - this venv has frida 17.6.0: /tmp/opencode/frida176/bin/python
  - MovieBox installed: com.community.mbox.tv

Usage:
  adb -s emulator-5554 forward tcp:27044 tcp:27042
  /tmp/opencode/frida176/bin/python -u apply_moviebox_vip_emulator.py
  (Ctrl-C to detach; restart the app to clear.)
"""
import subprocess, time, sys
import frida

EMU = "127.0.0.1:27044"
PKG = "com.community.mbox.tv"
SCRIPT = "/home/bld/moviebox/analysis/frida-vip-unlock.js"
ADB = ["adb", "-s", "emulator-5554"]

def log(*a):
    print("[EMU-VIP]", *a)

def ensure_running():
    raw = subprocess.run(ADB + ["shell", "ps", "-A"], capture_output=True, text=True, timeout=15).stdout
    if PKG in raw:
        log("MovieBox already running")
        return
    log("launching MovieBox...")
    subprocess.run(ADB + ["shell", "am", "start", "-n",
                        f"{PKG}/com.transsion.subroom.activity.SplashActivity"])
    time.sleep(7)

def main():
    ensure_running()
    d = frida.get_device_manager().add_remote_device(EMU)
    pid = None
    for _ in range(10):
        raw = subprocess.run(ADB + ["shell", "ps", "-A"], capture_output=True, text=True, timeout=15).stdout
        for line in raw.splitlines():
            if PKG in line:
                pid = int(line.split()[1])
                break
        if pid:
            break
        time.sleep(1)
    if pid is None:
        log("MovieBox pid not found; launch manually then retry.")
        sys.exit(1)
    log("attaching to pid", pid)
    sess = d.attach(pid)
    code = open(SCRIPT).read()
    sc = sess.create_script(code)
    def on(msg, data):
        p = msg.get("payload")
        if isinstance(p, dict) and p.get("type") == "log":
            print("[VIP]", p.get("payload"))
        else:
            print("[MSG]", msg)
    sc.on("message", on)
    sc.load()
    log("VIP unlock ACTIVE (session only). Navigate the app to trigger.")
    log("Ctrl-C to detach. Restart the app to clear the override.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("detached.")

if __name__ == "__main__":
    main()
