# MovieBoxTV VIP Patcher

Reverse engineering and client-side VIP entitlement patching for MovieBoxTV (`com.community.mbox.tv`, v1.1.5.0711.03).

> **Disclaimer:** This is a security research project for educational purposes. Only use on apps you are authorized to analyze.

## Architecture

| Layer | Details |
|-------|---------|
| **Package** | `com.transsion.*`, `com.transsnet.*`, obfuscated `al.*` (Retrofit APIs), `gk.*` (player core) |
| **Min/Target SDK** | 23 / 35, Android TV (leanback) |
| **Player** | Dual-engine — Aliyun VOD (primary) + ExoPlayer/Media3 (secondary) |
| **DRM** | None — content protected by signed, time-limited BFF stream URLs |
| **Auth** | SMS OTP, phone/email password, Google OAuth, QR login |
| **Ads** | Hisavana mediation (splash/interstitial/video/native) |
| **Tracking** | Firebase Analytics + Crashlytics + Athena (Transsion GAID collector) |

### API Gateway Signing

Every BFF request is HMAC-MD5 signed with a secret embedded in the APK manifest:

```
x-tr-signature: <serverTimeMs>|2|<Base64(HMAC-MD5(canonicalString))>
```

**Secrets** (recoverable from `AndroidManifest.xml`):
- `gateway_secret_online` = `76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O`
- `gateway_secret_test` = `Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA`

Verified at runtime with Frida — forged signatures match server-accepted values.

### VIP Decision Logic

```
VipMembershipLevel = loggedIn
    ? (accountPremiumActive ? PREMIUM : FREE)
    : (visitorPremiumActive ? PREMIUM : FREE)
```

VIP state is **purely in-memory** (`StateFlow<Boolean>` initialized `false`). No MMKV, DataStore, or SharedPreferences backing. The only way it becomes `true`:

1. **`TvServiceLocator.refreshVipStateFromServer()`** — calls `GET /wefeed-tv-bff/user/info`, parses `BffGetVipUserInfoData.isVip()` from server response
2. **`TvServiceLocator.q0(boolean)`** — explicit setter (used by other account flows)

Frida trace confirmed at boot:
```
BffGetVipUserInfoData.isVip() -> false | uid=... userType=0 vipExpireAt=0 vipRemainingSeconds=0
vipState.c(isVip= false)
TvServiceLocator.V() -> false
```

## Patches Applied

| Target | Class | Method | Returns |
|--------|-------|--------|---------|
| VIP status | `TvServiceLocator` | `V()` | `true` |
| VIP status | `v` | `a()` | `true` |
| Server isVip | `BffGetVipUserInfoData` | `isVip()` | `Boolean.TRUE` |
| Server isVip | `BffUserInfoData` | `isVip()` | `Boolean.TRUE` |
| Content isVip | `BffSubjectInfo` | `isVip()` | `true` |
| Content isVip | `BffSearchRankSubject` | `isVip()` | `true` |
| Content isVip | `BffOperatingSubject` | `isVip()` | `true` |
| VIP expiry | `BffGetVipUserInfoData` | `getVipExpireAt()` | `"2099-12-31 23:59:59"` |
| VIP expiry | `BffUserInfoData` | `getVipExpireAt()` | `"2099-12-31 23:59:59"` |
| Remaining sec | `BffGetVipUserInfoData` | `getVipRemainingSeconds()` | `"999999999"` |
| Remaining sec | `BffUserInfoData` | `getVipRemainingSeconds()` | `"999999999"` |
| Preview enabled | `DetailPlayerViewModel$f` | `a()` | `false` |
| Preview limit | `DetailPlayerViewModel$f` | `b()` | `0` |
| Preview remaining | `DetailPlayerViewModel$f` | `c()` | `0` |
| Decoder type | `fk/e` | `b()` | `FFMPEG` |

## Quick Start

```bash
# Decompile
apktool d -r -o mbox_dec MovieBoxTv.apk

# Apply patches (edit smali files — see analysis/*.py for patterns)

# Rebuild
apktool b mbox_dec -o mbox_vip.apk

# Sign with debug keystore
apksigner sign --ks debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey mbox_vip.apk

# Install
adb install -r mbox_vip.apk
```

## Frida Runtime Injection

For testing without rebuilding:

```bash
# VIP entitlement trace
frida -U com.community.mbox.tv -l analysis/frida-vip-trace.js

# VIP unlock (session-only, no persistence)
frida -U com.community.mbox.tv -l analysis/frida-vip-unlock.js

# Gateway HMAC signing capture
frida -U com.community.mbox.tv -l analysis/frida-gateway-sign.js
```

## Files

| File | Description |
|------|-------------|
| `analysis/REVERSE_ENGINEERING_REPORT.md` | Full reverse engineering report (250 lines) |
| `analysis/frida-vip-trace.js` | Frida script to trace VIP entitlement method calls |
| `analysis/frida-vip-unlock.js` | Frida script to force VIP at runtime (field-write) |
| `analysis/frida-vip-unlock2-5.js` | Iterations of VIP unlock experiments |
| `analysis/frida-gateway-sign.js` | Frida script to capture HMAC signing flow |
| `analysis/frida-gateway-sign-output*.txt` | Live HMAC values with offline recompute verification |
| `analysis/apply_moviebox_vip_tv.py` | Python script to automate smali patches for TV |
| `analysis/apply_moviebox_vip_emulator.py` | Python script for emulator testing |
| `analysis/run_vip_tv.py` | Runner script for TV deployment |
| `analysis/run_vip_emu.sh` | Shell script for emulator testing |
| `analysis/jadx.log` | JADX decompilation log |

## Obfuscation Layers

| Layer | Packages | Readability |
|-------|----------|-------------|
| App logic | `com.transsion.*`, `com.transsnet.*` | Fully readable |
| Obfuscated | `al.*` (APIs), `gk.*` (player), `ik.*` (tracks) | Single-letter names (renamed in report) |
| SDKs | Various third-party | Left as-is |

## Content API Endpoints

All Retrofit interfaces under `/wefeed-tv-bff/`:

| Interface | Endpoints |
|-----------|-----------|
| `SubjectApi` | `/subject/get`, `/subject/stream-captions`, `/subject/resource`, `/subject/play-info`, `/subject/detail-rec`, `/subject/dub-info`, `/subject/season-info` |
| `SearchApi` | `/search/suggest`, `/search/rank`, `/search/everyone`, `/search/result` |
| `HomeApi` | `/home/*` (home feed) |
| `TabApi` | `/tab/*` (listings) |
| `AccountApi` | `/user/*`, QR login, feedback |
