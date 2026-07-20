// frida-cr-premium-trace.js
// Trace Crunchyroll (com.crunchyroll.crunchyroid) premium/entitlement logic at runtime.
//
// Static RE showed:
//   - Entitlement = server-returned List<Benefit> (strings like "cr_premium", "cr_premium_plus",
//     "offline_viewing", "cr_manga", "cr_bento").
//   - BenefitKt.isPremium(Benefit)  -> benefit == "cr_premium"
//   - BenefitKt.isUltimateFanUser(List<Benefit>) -> has cr_premium AND cr_premium_plus
//   - SubscriptionProcessorService.getUserBenefits / getSubscriptionStatus -> BFF calls
//   - PlayableAsset.isPremiumOnly() -> per-asset server gate
//
// Attach (not spawn, app already running):
//   frida -H 127.0.0.1:27042 -n Crunchyroll -l frida-cr-premium-trace.js
// Or spawn:
//   frida -H 127.0.0.1:27042 -f com.crunchyroll.crunchyroid -l frida-cr-premium-trace.js

const TAG = "[CR-PREMIUM]";
function log(...a){ console.log(TAG, ...a); }

Java.perform(function () {
  log("loaded");

  // 1) The entitlement predicate on a single benefit.
  try {
    const BK = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.BenefitKt");
    BK.isPremium.overload("com.ellation.crunchyroll.api.etp.subscription.model.Benefit").implementation = function (b) {
      const r = this.isPremium(b);
      log("BenefitKt.isPremium(", b.getBenefit(), ") ->", r);
      return r;
    };
    BK.isUltimateFanUser.overload("java.util.List").implementation = function (list) {
      const r = this.isUltimateFanUser(list);
      log("BenefitKt.isUltimateFanUser(list size=" + (list ? list.size() : 0) + ") ->", r);
      return r;
    };
    log("hooked BenefitKt");
  } catch (e) { log("BenefitKt hook err:", e.message); }

   // 2) Raw benefit string getter — log every benefit string the app ever reads.
   try {
     const B = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.Benefit");
     B.getBenefit.overload().implementation = function () {
       const r = this.getBenefit();
       log("Benefit.getBenefit() ->", JSON.stringify(r));
       return r;
     };
     log("hooked Benefit.getBenefit");
   } catch (e) { log("Benefit hook err:", e.message); }

   // 2c) Benefit constructor — captures every server-returned benefit string on parse.
   try {
     const Bctor = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.Benefit");
     Bctor.$init.overload("java.lang.String", "java.lang.String").implementation = function (benefit, source) {
       log("NEW Benefit(benefit=", JSON.stringify(benefit), ", source=", JSON.stringify(source), ")");
       return this.$init(benefit, source);
     };
     log("hooked Benefit.<init>(String,String)");
   } catch (e) { log("Benefit ctor hook err:", e.message); }

   // 2b) isUltimateFanUser / isPremium — enumerate the benefit list contents.
   try {
     const BK = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.BenefitKt");
     const Bcls = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.Benefit");
     const dumpList = function (list) {
       if (!list) return "null";
       const parts = [];
       const it = list.iterator();
       while (it.hasNext()) {
         const b = it.next();
         try { parts.push(b.getBenefit()); } catch (e) { parts.push("<err>"); }
       }
       return "[" + parts.join(",") + "]";
     };
     // re-bind isUltimateFanUser to also dump contents
     BK.isUltimateFanUser.overload("java.util.List").implementation = function (list) {
       const r = this.isUltimateFanUser(list);
       log("isUltimateFanUser ->", r, "benefits=", dumpList(list));
       return r;
     };
     log("hooked isUltimateFanUser(dump)");
   } catch (e) { log("isUltimateFanUser dump err:", e.message); }

  // 3) Per-asset gate.
  try {
    const PA = Java.use("com.ellation.crunchyroll.model.PlayableAsset");
    PA.isPremiumOnly.overload().implementation = function () {
      const r = this.isPremiumOnly();
      return r;
    };
    log("hooked PlayableAsset.isPremiumOnly");
  } catch (e) { log("PlayableAsset hook err:", e.message); }

  // 4) The subscription BFF calls (suspend functions -> overload with Continuation).
  try {
    const SPS = Java.use("com.ellation.crunchyroll.api.etp.subscription.SubscriptionProcessorService");
    SPS.getUserBenefits.overloads.forEach(function (o) {
      try {
        o.implementation = function () {
          log("getUserBenefits() called (benefits BFF)");
          return o.apply(this, arguments);
        };
        log("hooked getUserBenefits(" + o.argumentTypes.map(a=>a.className).join(",") + ")");
      } catch (e) {}
    });
    SPS.getSubscriptionStatus.overloads.forEach(function (o) {
      try {
        o.implementation = function () {
          log("getSubscriptionStatus() called (state BFF)");
          return o.apply(this, arguments);
        };
        log("hooked getSubscriptionStatus");
      } catch (e) {}
    });
  } catch (e) { log("SubscriptionProcessorService hook err:", e.message); }

  log("hooks installed. Trigger: open profile, play an episode, or pull-to-refresh.");
});
