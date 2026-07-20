const TAG = "[VIP-UNLOCK]";
function log(...a){console.log(TAG,...a);}
Java.perform(function(){
  const v = Java.use("com.transsion.tvdata.v");
  v.c.overload("boolean").implementation = function(i){ return this.c(true); };
  const tsl = Java.use("com.transsion.tvdata.TvServiceLocator");
  tsl.V.overload().implementation = function(){ return true; };
  tsl.q0.overload("boolean").implementation = function(i){ return this.q0(true); };
  // Use a fresh TvServiceLocator instance to read the forced getter (it's a singleton object)
  const vm = Java.use("com.transsion.tvui.viewmodel.VipPayViewModel");
  vm.Z.overload().implementation = function(){
    const ret = this.Z();
    try {
      // TvServiceLocator is an object singleton; getInstance via a ViewModel field if present,
      // otherwise just confirm via the global getter we overrode:
      log("Z() ran. Forced V() returns", tsl.V());
    } catch(e){ log("Z read err", e.message); }
    return ret;
  };
  log("VIP FORCED ON. Forced V() returns:", tsl.V());
});
