const TAG = "[VIP-UNLOCK]";
function log(...a){console.log(TAG,...a);}
Java.perform(function(){
  const v = Java.use("com.transsion.tvdata.v");
  // Force setter TRUE
  v.c.overload("boolean").implementation = function(i){ return this.c(true); };
  // Observe getter (this proves the in-memory StateFlow now holds true)
  v.a.overload().implementation = function(){
    const r = this.a();
    return r;
  };
  const tsl = Java.use("com.transsion.tvdata.TvServiceLocator");
  tsl.V.overload().implementation = function(){ return true; };
  tsl.q0.overload("boolean").implementation = function(i){ return this.q0(true); };
  log("VIP FORCED ON (session only).");
});
// After a few seconds, read the singleton store value via a spawned instance read using the static field.
setTimeout(function(){
  Java.perform(function(){
    try {
      const v = Java.use("com.transsion.tvdata.v");
      // v.f29705a is the singleton (field name from decompiled source)
      const inst = v.f29705a.value; // try field accessor
      log("store value via f29705a =", inst.a());
    } catch(e1){
      try {
        const inst = v.f29705a;
        log("store value =", inst.a());
      } catch(e2){ log("read store err:", e2.message); }
    }
  });
}, 6000);
