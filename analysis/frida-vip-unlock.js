// frida-vip-unlock.js
// Forces premium (VIP) for the current app session ONLY.
// The VIP state is an in-memory StateFlow<Boolean> (com.transsion.tvdata.v),
// initialized FALSE and only set TRUE by the server.
//
// SAFETY (Android 12 emulator ART, x86_64):
//   frida's java bridge CRASHES this x86_64 emulator the moment we
//   INVOKE a Java method through it (calling v.c(true), or any
//   .implementation hook). See frida-java-bridge#3700 / frida#1892 /
//   #347 / #3387 — "x86_64 emulator crashes; ARM works; only
//   method calls / .implementation crash, field access is fine."
//   The ExoPlayer:Playb SIGSEGV (fault addr 0xe00) is just the
//   first thread to trip the corrupted JIT/GC frame after frida's
//   bridge performs a method call.
//
//   The VIP state is a Kotlin StateFlow:
//     v.vipStateFlow : StateFlow<Boolean>  (field on class v)
//     -> StateFlowImpl, backing field `_state$volatile` : Object
//     a() reads vipStateFlow.getValue() -> _state$volatile
//   So instead of CALLING c(true) (a method -> crash), we write the
//   `_state$volatile` FIELD of the existing StateFlowImpl directly to
//   Boolean.TRUE. Pure field access — no Java method invoked through
//   frida. The app's own a()/getValue() then returns TRUE naturally.
//
// NOTE: session-only, does NOT affect the server.
//
// Run with the frida CLI (auto-loads the Java bridge):
//   frida -H 127.0.0.1:27061 -p <PID> -l frida-vip-unlock.js

const TAG = "[VIP-UNLOCK]";
function log(...a) { console.log(TAG, ...a); }

Java.perform(function () {
  log("LOADED + Java ready");

  let vClass;
  try {
    vClass = Java.use("com.transsion.tvdata.v");
    log("v class ready (field-write mode)");
  } catch (e) {
    log("v class err: " + e);
    return;
  }

  // Write the StateFlow's backing `_state$volatile` field to Boolean.TRUE.
  // No Java method is invoked through frida -> no emulator crash.
  // Real (R8-obfuscated) runtime field names (from introspection):
  //   v.a  -> static `v` singleton instance
  //   v.b  -> static StateFlow<Boolean> (StateFlowImpl)
  //   StateFlowImpl._state$volatile : Object  (holds the Boolean)
  let boolCls;
  try { boolCls = Java.use("java.lang.Boolean"); }
  catch (e) { log("aux class err: " + e); }

  // use reflection to read the static `b` field (frida's .value handle
  // returns null for obfuscated names; .get(null) works).
  let fB, fState;
  try {
    fB = vClass.class.getDeclaredField("b"); fB.setAccessible(true);
    // _state$volatile lives on StateFlowImpl; grab its Field once we have flow.
  } catch (e) { log("field b err: " + e); }

  function forceTrue() {
    try {
      const flow = fB.get(null);                        // static StateFlowImpl
      if (!flow) { log("force err: flow null"); return; }
      if (!fState) {
        fState = flow.getClass().getDeclaredField("_state$volatile");
        fState.setAccessible(true);
      }
      const TRUE = boolCls.TRUE.value;                // Boolean.TRUE
      // reflectively set the backing field (Field.set is a framework
      // method, not JIT'd app code -> safe on x86_64 emu per #3700).
      fState.set(flow, TRUE);
      log("vipState forced TRUE (field write)");
    } catch (e) {
      log("force err: " + e);
    }
  }

  // Poll from the main thread; re-arming keeps the session VIP.
  function forceLoop() {
    Java.scheduleOnMainThread(function () {
      forceTrue();
      setTimeout(forceLoop, 1000);
    });
  }
  forceLoop();

  log("VIP FORCED ON (session only). Play a video / open VIP screen.");
});
