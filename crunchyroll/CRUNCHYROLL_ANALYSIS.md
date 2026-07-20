# Crunchyroll (com.crunchyroll.crunchyroid) — Premium / Entitlement Analysis

**Target:** pulled from `emulator-5554` (`adb pull` of base.apk + splits). Version `3.113.0` (versionCode 1160), minSdk 26, targetSdk 35. Multi-dex (base + splits), heavily obfuscated app code (single-letter packages `a`, `a0`, …) with a readable `com.ellation.crunchyroll.*` namespace for the real business logic.

> Legitimate commercial streaming app. Analysis for architecture/security understanding.

## How premium is decided (static RE)

**Entitlement is a server-returned list of `Benefit` strings**, not a client boolean:

- `com.ellation.crunchyroll.api.etp.subscription.model.Benefit` — holds a `benefit` String. Constants: `cr_bento`, `cr_manga`, `offline_viewing`, and (the premium ones) **`cr_premium`**, **`cr_premium_plus`**.
- `BenefitKt.isPremium(Benefit)` → `benefit == "cr_premium"`.
- `BenefitKt.isUltimateFanUser(List<Benefit>)` → has `cr_premium` **AND** `cr_premium_plus`.
- BFF endpoints (`SubscriptionProcessorService`):
  - `GET /subs/v1/accounts/{account_uuid}/subscriptions/state`
  - `GET /subs/v1/subscriptions/{account_id}/benefits` → `ApiCollection<Benefit>`
  - `GET /subs/v2/products`
- The live, observable entitlement source is `q90.i.c().getUserBenefitsChangeMonitor()` (`w90.c`, an obfuscated `UserBenefitsChangeMonitor`) — the equivalent of MovieBox's `TvServiceLocator.V()`. The whole UI observes this monitor.
- **Per-asset gate:** `PlayableAsset.isPremiumOnly()` / `Episode.isPremiumOnly()` — the *content* carries its own premium flag from the server. Playback/upsell code checks this to decide whether to show an upsell or play.

## Is there a local tamper surface?

- No client boolean is the source of truth; the benefit **list** comes from the server and is tied to the **logged-in account**.
- The emulator install here has **no logged-in session**, so `getUserBenefits` never fires at runtime (confirmed: no cached account token in shared_prefs; benefits are not persisted in the Braze analytics prefs).
- This means: to observe or alter live premium state you would need a logged-in account (server-side entitlement). There is no local MMKV/flag to flip that grants real premium, consistent with a server-authoritative model.

## Runtime verification

Frida hooks were installed successfully against the running app (`frida -H 127.0.0.1:27042 -n Crunchyroll`):
- `BenefitKt.isPremium`, `BenefitKt.isUltimateFanUser`, `Benefit.getBenefit`, `PlayableAsset.isPremiumOnly`, `SubscriptionProcessorService.getUserBenefits` / `getSubscriptionStatus`.
- Hooks loaded cleanly, but **no entitlement calls fired** because the app is not logged in (no benefits to evaluate). Reproducing MovieBox-style runtime proof requires a live account session.

**Conclusion:** Crunchyroll uses the same *server-authoritative, client-cache* pattern as MovieBox — premium = server says your account has `cr_premium`/`cr_premium_plus` benefits; the client only caches/observes that. Crunchyroll's version is more robust: entitlement is account-bound benefit strings (not a single in-memory boolean), content carries its own `isPremiumOnly` gate, and there is no recoverable static signing secret bundled in the obvious way (it uses standard auth/session tokens, not a hardcoded HMAC key like MovieBox's `gateway_secret_online`).

## Runtime verification (logged-in account, frida)

Attached in spawn mode (`frida -H 127.0.0.1:27042 -f com.crunchyroll.crunchyroid -l frida-cr-premium-trace.js`). Hooks: `Benefit.<init>(String,String)`, `Benefit.getBenefit`, `BenefitKt.isPremium`, `BenefitKt.isUltimateFanUser`, `PlayableAsset.isPremiumOnly`, `SubscriptionProcessorService.getUserBenefits`/`getSubscriptionStatus`.

Observed on cold start with the **emulator's logged-in (free) account**:

```
[CR-PREMIUM] hooked Benefit.<init>(String,String)
[CR-PREMIUM] isUltimateFanUser -> false benefits= []
[CR-PREMIUM] isUltimateFanUser -> false benefits= []
```

- `getUserBenefits` BFF was reached on startup.
- Server response deserialized **zero** `Benefit` objects → `NEW Benefit(...)` never fired → benefit list `[]`.
- `BenefitKt.isUltimateFanUser([])` → `false`, `isPremium` → `false`.

This is the runtime proof (mirrors MovieBox §6.1): the client's premium decision comes entirely from the **server-returned benefit list bound to the logged-in account**. With a premium account you would instead see `NEW Benefit(benefit="cr_premium", ...)` and a non-empty list feeding `isUltimateFanUser`. There is **no local flag to flip** — entitlement is account-bound and server-authoritative.

**Artifacts:** `frida-cr-premium-trace.js` (+ `cr-premium-final.txt` runtime log).

## Comparison: MovieBox vs Crunchyroll

| Aspect | MovieBoxTV | Crunchyroll |
|---|---|---|
| Premium source of truth | Server BFF `isVip` boolean | Server `List<Benefit>` strings (`cr_premium`, …) |
| Client state | In-memory `StateFlow<Boolean>` (no persistence) | `UserBenefitsChangeMonitor` (observable, account-bound) |
| Per-content gate | membership level | `PlayableAsset.isPremiumOnly()` |
| Request auth | **Static HMAC secret in APK** (`gateway_secret_online`) — forgeable | Standard session/auth tokens (no obvious static shared key) |
| Architecture maturity | Simple, single boolean | Tiered benefits (premium / ultimate fan / manga / bento / offline) |
| Local tamper surface | None (server-authoritative) | None (server-authoritative, account-bound) |

Both validate premium **server-side** and only cache client-side. Crunchyroll is the more secure implementation (no leaked signing secret, account-bound benefits).
