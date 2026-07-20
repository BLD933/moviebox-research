// frida-cr-premium-unlock.js
// ---------------------------------------------------------------------------
// CLIENT-ONLY, IN-MEMORY, SESSION-ONLY patch for analysis/education.
//
// Scope (same as the MovieBox frida-vip-unlock.js):
//   - Forces BenefitKt.isPremium / isUltimateFanUser to return true locally.
//   - Forces PlayableAsset.isPremiumOnly() to return false locally.
//   - Does NOT unlock real server-gated streams: the streaming/CDN layer
//     re-checks entitlement against your account on Crunchyroll's servers.
//   - Forges no credentials, no secrets, no network responses.
//   - Lost on app restart.
//
// Attach (app already running):
//   frida -H 127.0.0.1:27042 -n Crunchyroll -l frida-cr-premium-unlock.js
// Spawn:
//   frida -H 127.0.0.1:27042 -f com.crunchyroll.crunchyroid -l frida-cr-premium-unlock.js
// ---------------------------------------------------------------------------

const TAG = "[CR-UNLOCK]";
function log(...a) { console.log(TAG, ...a); }

Java.perform(function () {
  log("loaded — client-only in-memory patch (session-only)");

  // 1) Force single-benefit premium predicate true.
  try {
    const BK = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.BenefitKt");
    BK.isPremium.overload("com.ellation.crunchyroll.api.etp.subscription.model.Benefit")
      .implementation = function (b) {
        log("isPremium(", (b ? b.getBenefit() : "null"), ") -> FORCING true");
        return true;
      };
    log("patched BenefitKt.isPremium -> true");
  } catch (e) { log("isPremium patch err:", e.message); }

  // 2) Force ultimate-fan (list) predicate true.
  try {
    const BK = Java.use("com.ellation.crunchyroll.api.etp.subscription.model.BenefitKt");
    BK.isUltimateFanUser.overload("java.util.List")
      .implementation = function (list) {
        log("isUltimateFanUser(list size=" + (list ? list.size() : 0) + ") -> FORCING true");
        return true;
      };
    log("patched BenefitKt.isUltimateFanUser -> true");
  } catch (e) { log("isUltimateFanUser patch err:", e.message); }

  // 3) Force per-asset premium gate open (local display only).
  try {
    const PA = Java.use("com.ellation.crunchyroll.model.PlayableAsset");
    PA.isPremiumOnly.overload().implementation = function () {
      const real = this.isPremiumOnly();
      log("PlayableAsset.isPremiumOnly() real=", real, "-> FORCING false");
      return false;
    };
    log("patched PlayableAsset.isPremiumOnly -> false");
  } catch (e) { log("isPremiumOnly patch err:", e.message); }

  log("patches installed. UI may now *show* premium state locally; real streams are still server-gated.");
});
