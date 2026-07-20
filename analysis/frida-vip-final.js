const TAG = "[VIP-UNLOCK]";
function log(...a){console.log(TAG,...a);}
Java.perform(function(){
  const Vcls = Java.use("com.transsion.tvdata.v");
  Vcls.c.overload("boolean").implementation = function(i){ return this.c(true); };
  Vcls.a.overload().implementation = function(){ return true; }; // getter forced too
  const tsl = Java.use("com.transsion.tvdata.TvServiceLocator");
  tsl.V.overload().implementation = function(){ return true; };
  tsl.q0.overload("boolean").implementation = function(i){ return this.q0(true); };
  // read the singleton store directly (field f29705a is the object instance)
  try {
    const inst = Vcls.f29705a.value;
    log("store f29705a.a() =", inst.a(), "(forced)");
  } catch(e){ log("f29705a read err:", e.message); }
  log("VIP FORCED ON (session only). Open VIP screen to see PREMIUM.");
});
