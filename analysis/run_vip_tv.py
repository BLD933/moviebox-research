import frida, sys, time

HOST = "127.0.0.1:27061"
SCRIPT = "/home/bld/moviebox/analysis/frida-vip-unlock.js"

def on_message(msg, data):
    if msg["type"] == "send":
        print("[SEND]", msg["payload"])
    elif msg["type"] == "error":
        print("[ERROR]", msg["description"])

def main():
    with open(SCRIPT) as f:
        code = f.read()
    mgr = frida.get_device_manager()
    dev = mgr.add_remote_device(HOST)
    if len(sys.argv) > 1:
        pid = int(sys.argv[1])
    else:
        procs = dev.enumerate_processes()
        pids = [p.pid for p in procs if "community.mbox.tv" == p.name]
        if not pids:
            pids = [p.pid for p in procs if "mbox" in p.name.lower()]
        if not pids:
            print("MovieBox not running")
            sys.exit(1)
        pid = pids[0]
    print("attaching to pid", pid)
    session = dev.attach(pid)
    script = session.create_script(code)
    script.on("message", on_message)
    try:
        script.load()
    except Exception as e:
        print("LOAD ERROR:", e)
        sys.exit(1)
    print("=== script loaded, running (Ctrl-C to stop) ===")
    try:
        # keep frida's reactor pumping while we wait
        import frida as _f
        _f.get_device_manager()  # ensure manager alive
        # block on stdin so background threads keep running
        import sys as _s
        _s.stdin.read()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print("RUN ERROR:", e)

if __name__ == "__main__":
    main()
