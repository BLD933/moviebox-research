const TAG = "[VIP-UNLOCK]";
function log(...a){console.log(TAG,...a);}
Java.perform(function(){
  const v = Java.use("com.transsion.tvdata.v");
  v.c.overload("boolean").implementation = function(i){ return this.c(true); };
  const tsl = Java.use("com.transsion.tvdata.TvServiceLocator");
  tsl.V.overload().implementation = function(){ return true; };
  tsl.q0.overload("boolean").implementation = function(i){ return this.q0(true); };
  const c = Java.use("com.transsion.tvui.viewmodel.VipPayViewModel");
  c.f0.overload("boolean","boolean").implementation = function(a,b){
    const ret = this.f0(a,b);
    try {
      const lvl = this._uiState.value().getMembershipLevel();
      log("f0 -> membershipLevel =", lvl, "| currentLoggedIn=", this.currentLoggedIn,
          "visitorPremiumActive=", this.visitorPremiumActive, "accountPremiumActive=", this.accountPremiumActive);
    } catch(e){ log("read err", e.message); }
    return ret;
  };
  log("VIP FORCED ON + confirm hook installed. Open the VIP screen.");
});
