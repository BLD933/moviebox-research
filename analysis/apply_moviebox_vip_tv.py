#!/usr/bin/env python3
"""
apply_moviebox_vip_tv.py
=========================
Re-applies the MovieBox VIP unlock on the TV at 192.168.1.7.

Prereqs (already set up):
  - frida-server 17.6.0 running on the TV at 0.0.0.0:27043
    (push fs-17.6.0 -> /data/local/tmp/frida-176, chmod 777, run:
       /data/local/tmp/frida-176 -l 0.0.0.0:27043)
  - this venv has frida 17.6.0: /tmp/opencode/frida176/bin/python
  - MovieBox installed: com.community.mbox.tv

What it does:
  launches MovieBox (if not running) and attaches the VIP-unlock script.
  The hook forces vipState.c(false)->TRUE and TvServiceLocator.V()->true
  for the session only (no persistence, server still gatekeeps streams).

Usage:
  /tmp/opencode/frida176/bin/python apply_moviebox_vip_tv.py
  (Ctrl-C to detach; restart the app to clear.)
"""
import subprocess, time, sys
import frida

TV = "192.168.1.7:27043"
PKG = "com.community.mbox.tv"
SCRIPT = "/home/bld/moviebox/analysis/frida-vip-unlock.js"
ADB = ["adb", "-s", "192.168.1.7:5555"]

def log(*a):
    print("[TV-VIP]", *a)

def ensure_running():
    ps = subprocess.run(ADB + ["shell", "ps", "-A"], capture_output=True, text=True).stdout
    if PKG in ps:
        log("MovieBox already running")
        return
    log("launching MovieBox...")
    subprocess.run(ADB + ["shell", "am", "start", "-n",
                        f"{PKG}/com.transsion.subroom.activity.SplashActivity"])
    time.sleep(7)

def main():
    ensure_running()
    d = frida.get_device_manager().add_remote_device(TV)
    # Resolve pid via adb (frida enumerate can miss it on this TV).
    for attempt in range(10):
        raw = subprocess.run(ADB + ["shell", "ps", "-A"],
                            capture_output=True, text=True).stdout
        for line in raw.splitlines():
            if PKG in line:
                parts = line.split()
                pid = int(parts[1])
                log("found pid", pid)
                break
        if 'pid' in dir():
            break
        time.sleep(1)
    if 'pid' not in dir():
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
    log("VIP unlock ACTIVE (session only). Navigate the app on the TV to trigger.")
    log("Ctrl-C to detach. Restart the app to clear the override.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log("detached.")

if __name__ == "__main__":
    main()
