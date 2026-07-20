const TAG = "[VIP-UNLOCK]";
function log(...a){console.log(TAG,...a);}
Java.perform(function(){
  const v = Java.use("com.transsion.tvdata.v");
  v.c.overload("boolean").implementation = function(i){ return this.c(true); };
  const tsl = Java.use("com.transsion.tvdata.TvServiceLocator");
  tsl.V.overload().implementation = function(){ return true; };
  tsl.q0.overload("boolean").implementation = function(i){ return this.q0(true); };
  // Z() reads TvServiceLocator.V() — proves the forced getter value downstream
  const vm = Java.use("com.transsion.tvui.viewmodel.VipPayViewModel");
  vm.Z.overload().implementation = function(){
    const ret = this.Z();
    try {
      log("Z() -> TvServiceLocator.V()=", tsl.f29633a.V(),
          "| visitorPremiumActive=", this.visitorPremiumActive,
          "| pendingTransfer=", this.pendingVisitorPremiumForTransferOnLogin);
    } catch(e){ log("Z read err", e.message); }
    return ret;
  };
  log("VIP FORCED ON. The V() getter now returns true globally.");
  // Also directly prove the global getter value right now:
  log("immediate check TvServiceLocator.V() =", tsl.f29633a.V());
});
