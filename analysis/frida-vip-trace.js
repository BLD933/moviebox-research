// frida-vip-trace.js
// Trace how MovieBoxTV decides premium (free) vs premium.
// Run: frida -H emulator-5554 -f com.community.mbox.tv -l frida-vip-trace.js

const TAG = "[VIP-TRACE]";
function log(...a) { console.log(TAG, ...a); }
function hook(cls, name, fn) {
  try { fn(Java.use(cls)); }
  catch (e) { log("HOOK FAIL", cls, name, e.message); }
}

Java.perform(function () {
  log("script loaded, pid=", Process.id);

  // 1) In-memory VIP state store setter — the ONLY path that flips premium to true.
  hook("com.transsion.tvdata.v", "v.c", (c) => {
    c.c.overload("boolean").implementation = function (isVip) {
      log("vipState.c(isVip=", isVip, ")  <-- premium state SET (server-driven)");
      return this.c(isVip);
    };
  });

  // 2) Global premium getter read all over the UI.
  hook("com.transsion.tvdata.TvServiceLocator", "V", (c) => {
    c.V.overload().implementation = function () {
      const v = this.V();
      log("TvServiceLocator.V() ->", v);
      return v;
    };
  });

  // 3) Alternate setter q0(boolean).
  hook("com.transsion.tvdata.TvServiceLocator", "q0", (c) => {
    c.q0.overload("boolean").implementation = function (isVip) {
      log("TvServiceLocator.q0(isVip=", isVip, ")");
      return this.q0(isVip);
    };
  });

  // 4) Raw BFF server field.
  hook("com.transsion.tvdata.bean.BffGetVipUserInfoData", "isVip", (c) => {
    c.isVip.overload().implementation = function () {
      const v = this.isVip();
      log("BffGetVipUserInfoData.isVip() ->", v,
          "| uid=", this.getUid(), "userType=", this.getUserType(),
          "vipExpireAt=", this.getVipExpireAt(), "vipRemainingSeconds=", this.getVipRemainingSeconds());
      return v;
    };
  });

  // 5) The VIP repository network call -> capture endpoint + request.
  hook("cl.u", "a", (c) => {
    c.a.overload().implementation = function () {
      log("VipRepository.a() network call to BFF /vip (refreshVipStateFromServer)");
      return this.a();
    };
  });

  // 6) The decision function: FREE vs PREMIUM.
  hook("com.transsion.tvui.viewmodel.VipPayViewModel", "f0", (c) => {
    c.f0.overload("boolean", "boolean").implementation = function (a, b) {
      log("VipPayViewModel.f0() currentLoggedIn=", this.currentLoggedIn,
          "visitorPremiumActive=", this.visitorPremiumActive,
          "accountPremiumActive=", this.accountPremiumActive);
      const ret = this.f0(a, b);
      try {
        log("   -> membershipLevel =", this._uiState.value().getMembershipLevel());
      } catch (e) { log("   (uiState read skip:", e.message, ")"); }
      return ret;
    };
  });

  log("hooks installed. Open the VIP / Settings screen, or log in, to trigger.");
});
