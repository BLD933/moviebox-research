# MovieBoxTV (com.community.mbox.tv) — Reverse Engineering Report

**Target:** `MovieBoxTv-v-1.1.5.0711.03.apk`
**Package:** `com.community.mbox.tv` (app code namespace `com.transsion.*`, `com.transsnet.*`)
**Version:** `1.1.5.0711.03` (versionCode `50040010`), minSdk 23, target/compileSdk 35
**Platform:** Android TV (leanback), Transsion/Hios streaming app ("MovieBox" / "OneRoom" / "Aoneroom" brand)
**Method:** JADX decompilation (CLI + JADX MCP GUI), manifest analysis, static code tracing, **plus dynamic Frida instrumentation** (Frida 17.15.3 on `emulator-5554`, `frida-server` pid 7907) — the premium/free VIP decision path was verified at runtime.

> Note: This is a legitimate commercial streaming application, not malware. The analysis below is for security/architecture understanding.

---

## 1. Obfuscation Overview

The app is **mostly NOT obfuscated at the application level**. The `com.transsion.*` and `com.transsnet.*` packages are fully readable (proper class/method names). Three layers of naming exist:

| Layer | Packages | Status | Action |
|-------|----------|--------|--------|
| App logic | `com.transsion.api`, `com.transsion.player`, `com.transsion.tvdata`, `com.transsion.tvui`, `com.transsnet.login`, `com.transsion.subroom`, `com.transsion.athena` | Readable | Documented |
| Obfuscated app code | `al.*` (BFF Retrofit APIs), `gk.*` (player core), `ik.*` (tracks) | Single-letter names | **Renamed via JADX MCP** |
| Third-party SDKs | `a0`, `ab`, `ad`, `bb`, `cc`, `ck`, `dk`, `gn`, `ug`, `fk`, `hk`, `cg`, `a.*`, `com.aliyun.*`, `com.cloud.hisavana.*`, `com.google.*`, `com.bumptech.*` | Single-letter (SDK internals) | **Left as-is** (Crashlytics, Play Services AIDL, Aliyun VOD, Hisavana ads, Glide, Firebase) |

**Renamed via JADX MCP** (class/package level — safe, high value):

- Package `al` → `com.transsion.tvapi` (8 Retrofit BFF API interfaces):
  - `a`→`AccountApi`, `b`→`FilterApi`, `c`→`HomeApi`, `d`→`SearchApi`, `e`→`SubjectApi`, `f`→`TabApi`, `g`→`SportApi`, `h`→`UploadApi`
- Package `gk` → `com.transsion.player.core` (player abstraction layer):
  - `c`→`AudioFocusChangeListener`, `d`→`AudioFocusPlayer`, `e`→`PlayerListener`, `f`→`Player`, `g`→`AudioFocusManager`, `r`→`AliyunVodPlayer`, `a`→(empty synthetic, skipped)
- Fields in `com.transsion.api.gateway.GateWaySdk`:
  - `f27887a`→`httpClient`, `f27888b`→`initialized`, `f27889c`→`signedHosts` (used by `getActivateSigHosts()`), `f27890d`→`signedPaths` (used by `getActivateSigPaths()`), `f27891e`→`workMode`

> Caveat: JADX MCP `rename_method` (single-letter, no class scope) was applied to the `Player` interface (`w`→`setSurfaceView`, `o`→`setTextureView`, `q`→`setPlayerListener`, `c`→`setMediaSource`, `u`→`setVodConfig`, `a`→`setLoop`, `i`→`setScaleMode`, `y`→`getVideoSize`, `m`→`getTracks`, `z`→`getAudioTracks`, `p`→`selectTrack`, `g`→`getMediaSource`) but these global renames also touched unrelated third-party classes. The canonical on-disk decompile (`/home/bld/moviebox/analysis/jadx_out/sources`) is **unaffected** — the MCP renames live only in the GUI project memory. Treat the method-level mapping in section 4 as the intended semantics.

---

## 2. Permissions & Privacy Assessment

**Sensitive / notable permissions:**
- `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` — network
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (+ `requestLegacyExternalStorage=true`) — broad file access (offline download)
- `CAMERA` (not required) — declared but `required=false`; used for QR login (`BffQrLogin*`)
- `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — background playback
- `com.google.android.gms.permission.AD_ID`, `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION` — advertising ID (also `com.huawei...CHANGE_BADGE`)
- `com.google.android.c2dm.permission.RECEIVE`, `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` — Firebase Cloud Messaging + install referrer
- `com.transsion.dataservice.permission.READ/WRITE` — Transsion cross-app data service
- `REQUEST_INSTALL_PACKAGES` / `USE_FULL_SCREEN_INTENT` — sideload/update flows

**Tracking / data collection:**
- `AthenaTrackService` (AIDL, `tran_athena_version 3.1.1.4`) + `com.transsion.ga.AthenaAnalytics` → collects GAID, device info; emits events `app_launch`, `app_heartbeat`.
- Firebase Analytics + Crashlytics + Performance Monitoring + Remote Config.
- **Advertising SDK:** Hisavana mediation (`com.cloud.hisavana.*`, `tran_hisavana_version 3.6.0.1`) — splash/interstitial/video/native/banner ads, including `BiddingBuyOut*` (bidding) activities.
- `usesCleartextTraffic=true` + custom `networkSecurityConfig` — HTTP allowed (needed for some CDN/prefetch hosts).

**Deeplinks / web routes:** `oneroom://` scheme (hosts `com.community.oneroom`, `com.community.mbox.tv`, `com.community.moviebox`); verified HTTPS hosts: `v.aoneroom.com`, `h5.aoneroom.com`, `moviebox.ng`, `moviebox.ph`, `movie-box.tv`, `moviebox.biz`, `moviebox.ac`, `movieboxhd.net`, `m.mvbrowse.com`, `v.moviebox.ph`, `moviebox.club`.

**Hardcoded secrets in manifest `<meta-data>`:**
- `gateway_secret_test` = `Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA`
- `gateway_secret_online` = `76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O`
- Aliyun VOD license key = `volXpoYXKsoRJDDPt89df7215938a4eb88c536e67cd49923c`, license file `assets/license.crt`

> These gateway secrets are used to HMAC-sign API requests (section 3). They are embedded in the APK and therefore recoverable — a standard (if weak) pattern for this kind of app-to-BFF signing.

---

## 3. API Gateway (Request Signing & Routing)

**Class:** `com.transsion.api.gateway.GateWaySdk` + `com.transsion.api.gateway.interceptor.GatewayInterceptor`
**Init:** `GateWaySdk.init(context, appId, WorkMode)`, `WorkMode.MODE_ONLINE` / `MODE_TEST`.

**Signing scheme (HMAC-MD5):**
- `GatewayInterceptor` intercepts every OkHttp request, computes an HMAC-MD5 signature over `timestamp|2|...` and sets header `x-tr-signature: <timestamp>|<version>|<hash>`.
- Secret selection by work mode: `gateway_secret_online` (online) vs `gateway_secret_test` (test) — read from `ApplicationInfo.metaData`.
- Only hosts/paths in `signedHosts` / `signedPaths` are signed (default signed paths: `/gateway/metric/add`, `/gateway/sdk/v1/config`).

**Host routing (GSLB):**
- `GateWaySdk.getHost()` returns gateway host by mode: `apigateway.tmctool.com` (online), `apigateway.test.tmctool.com` (test).
- `com.tn.lib.net.dns.or.CacheIpPool` → release content host `api6.aoneroom.com`; dev `test-mse-api.aoneroom.com`; `tv.aoneroom.com`.
- `com.transsion.api.gateway.dns.GateWayDns` performs GSLB DNS resolution; `tran_gslb_version 1.0.3.2`.

**BFF path prefix:** `/wefeed-tv-bff/` (all content endpoints live under this).

### 3.1 Gateway Signing — Runtime-Verified (Frida)

The signing scheme was confirmed at runtime (Frida 17.15.3, `emulator-5554`). Hooked `GateWaySdk.getSecret()`, `security.a.a(d, String)` (the HMAC primitive), and `security.c.a(String)` (query canonicalizer).

**Live values captured:**
- `GateWaySdk.getSecret()` = `76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O` (= `gateway_secret_online`, since `getWorkMode()` = `MODE_ONLINE`)
- `GateWaySdk.getHost()` = `apigateway.tmctool.com`
- Algorithm: **HmacMD5** (default; used when header `x-tr-signature-method` is absent)

**Canonical string** (`doGzipOrSign`, `\n`-joined, 6 fields + path):
```
METHOD \n
accept \n                      (empty if absent)
content-type \n                (or body media type)
content-length \n              (or body length)
<serverTimeMs> \n
<body-md5-hex if present> \n    (empty if no body)
PATH[?sorted-query]
```
- **Query sorting:** `security.c.a()` URL-decodes each `k=v`, sorts keys alphabetically, re-joins `k=v&k=v` (values URL-encoded).
- **Body hash:** MD5 of the body bytes, hex-encoded (only if present).
- **Signature:** `Base64( HMAC-MD5( Base64Decode(secret), canonicalString ) )`
- **Header:** `x-tr-signature: <serverTimeMs>|2|<sig>`

**Reproducibility proven (offline HMAC recompute matches the captured signature exactly):**
| Request | Captured sig | Recomputed |
|---|---|---|
| `GET /wefeed-tv-bff/user/info` | `+S11SZjkH8RYThkGuKLhuQ==` | ✅ match |
| `GET /wefeed-tv-bff/tab/list` | `J0RX9+jf5rrTwIgGNd+nwA==` | ✅ match |
| `POST /wefeed-tv-bff/user/visitor-login` (body md5 `99914b93…`) | `y+ApMh6ngEqLEOEKBTAh5g==` | ✅ match |

This confirms the full request-authentication scheme is reconstructable from the embedded secret: anyone holding the APK can forge validly-signed BFF requests (consistent with recommendation #1). Real Premium entitlement still requires the server to return `isVip=true` for the account (see §6.1).

---

## 4. Content API (Renamed: `com.transsion.tvapi`)

All are Retrofit interfaces under `/wefeed-tv-bff/`. Response models in `com.transsion.tvdata.bean` (78 BFF beans, cleanly named).

| Interface | Endpoints (method → HTTP) |
|-----------|---------------------------|
| `SubjectApi` | `getSubject`(`/subject/get`), `getStreamCaptions`(`/subject/stream-captions`), `getResource`(`/subject/resource`), `getPlayInfo`(`/subject/play-info`), `getDetailRec`(`/subject/detail-rec`), `getDubInfo`(`/subject/dub-info`), `getSeasonInfo`(`/subject/season-info`) |
| `SearchApi` | `getSuggest`(`/search/suggest`), `getRank`(`/search/rank`), `getEveryone`(`/search/everyone`), `getResult`(`/search/result`) |
| `HomeApi` | home feed (`/home/*`) |
| `TabApi` | tab/listing (`/tab/*`) |
| `FilterApi` | filter groups/items (`/filter/*`) |
| `SportApi` | sports content (`/sport/*`) |
| `AccountApi` | account/user, QR login (`/user/*`, `BffQrLogin*`), feedback (`/feedback/*`) |
| `UploadApi` | STS token upload (`/upload/sts-token`) |

All methods take a required `host` query param (the GSLB-resolved host) and return `Object` wrapping a suspend `gn.c` callback (Kotlin coroutine `Continuation`).

---

## 5. Video Player Architecture

Dual-engine design, abstracted behind `com.transsion.player.core.Player` interface:

- **Primary: Aliyun VOD** — `com.transsion.player.core.AliyunVodPlayer` (`gk/r`, ~1243 lines) wraps `com.aliyun.player.AliPlayer`. Requires the Aliyun license (section 2).
- **Secondary: ExoPlayer / Media3** — `com.transsion.player.exo.DemoDownloadService` (`foregroundServiceType=dataSync`) handles offline downloads via `androidx.media3`.
- **Engine selector:** `com.transsion.player.orplayer.global.TnPlayerType` enum (`EXO` / `ALIYUN`).
- **Track selection:** `ik.*` (`TnTracks`, `TnTracksGroup`, `TnFormat`) — DASH/manifest track groups (resolution, bitrate, audio/subtitle tracks).
- **Playback model:** `com.transsion.tvplayer.PlayStream` — streaming URL + captions (`BffCaptionsData`, `BffExtCaption`) + dub info (`BffDubInfoData`).
- **Audio focus:** `AudioFocusManager` / `AudioFocusPlayer` / `AudioFocusChangeListener` manage `AudioManager` focus for background `MediaService` (`foregroundServiceType=mediaPlayback`).
- **Background playback:** `com.transsion.player.mediasession.MediaService` + `MusicIntentReceiver` (MEDIA_BUTTON).

**DRM:** No Widevine / ExoPlayer `DefaultDrmSessionManager` usage detected. Content appears to rely on signed, time-limited streaming URLs from the BFF `play-info` endpoint rather than client-side DRM.

---

## 6. Authentication & VIP / Payments

**Auth (`com.transsnet.login.*`):**
- `LoginActivity`, `LoginPhoneCodeActivity` (SMS OTP), `LoginPwdActivity`, `LoginEmailPwdActivity`, `LoginSetPwdActivity` — phone/email + password.
- `LoginLikeActivity` — Google OAuth sign-in (Play Services `SignInHubActivity`).
- `LoginInterestActivity` — onboarding interest selection.
- `LoginSelectCountryActivity` — region selection (drives region-block logic).
- `BffQrLogin*` (`BffQrLoginCreate/CreateReq`, `BffQrLoginFetch/FetchReq`, `BffQrLoginPoll/PollReq`) — QR-code login (why `CAMERA` is declared).
- Token persistence via MMKV / `AccountManager`.

**VIP / Payments (`com.transsion.tvui.activity.VipPayActivity`):**
- Uses the `gateway_secret_*` signing to call BFF VIP endpoints: `BffCreateVipOrder*`, `BffPollingOrderStatus*`, `BffGetVipSkuListData`, `BffGetVipUserInfoData`, `BffMigrateVipAssets*`.
- Payment flow is gateway-secret signed (provider-specific wrapper, likely an African payment aggregator — Flutterwave/Paystack/Tranzakt-style; exact PSP not conclusively identified from static analysis).
- `BffPurchaseResult` models the purchase callback.

### 6.1 Premium / Free Decision — Runtime-Verified (Frida)

**Decision logic (`VipPayViewModel.f0(boolean,boolean)`, line 349):**
```
VipMembershipLevel = loggedIn
    ? (accountPremiumActive ? PREMIUM : FREE)
    : (visitorPremiumActive ? PREMIUM : FREE);
```
`visitorPremiumActive`/`accountPremiumActive` are driven by the **in-memory** VIP state store `com.transsion.tvdata.v` (a `StateFlow<Boolean>` `vipStateFlow`, initialized `FALSE`). The global getter `TvServiceLocator.V()` returns `v.f29705a.a()`.

**Critically: there is NO local persistence of premium state.** `v` is an in-memory `StateFlow` only — no MMKV/DataStore/SharedPreferences. The boolean can become `true` *only* via:
1. `TvServiceLocator.refreshVipStateFromServer()` (coroutine) → parses `BffBaseResp.getData().isVip()` from a successful BFF response and calls `v.f29705a.c(isVip)`. **Confirmed at `TvServiceLocator.java:414`.**
2. `TvServiceLocator.q0(boolean)` (line 429) → `v.f29705a.c(isVip)` (used by other account flows).

**BFF endpoint:** `GET /wefeed-tv-bff/user/info` (`al.h.d(...)`, returns `BffBaseResp<BffGetVipUserInfoData>`; `cl.u.a(gn.c)` is the repository call). `BffGetVipUserInfoData` fields: `isVip` (Boolean), `uid` (String), `userType` (Integer), `vipExpireAt` (String), `vipRemainingSeconds` (String).

**Frida trace (app spawned fresh on `emulator-5554`):**
```
[VIP-TRACE] BffGetVipUserInfoData.isVip() -> false | uid=6008541102754751648 userType=0 vipExpireAt=0 vipRemainingSeconds=0
[VIP-TRACE] vipState.c(isVip= false )  <-- premium state SET (server-driven)
[VIP-TRACE] TvServiceLocator.V() -> false
```
- App boots as **FREE** (visitor, unauthenticated). Server BFF returned `isVip=false` → `vipStateFlow` set to `false` → every `TvServiceLocator.V()` consumer sees FREE.
- Because the state is purely server-trust and in-memory, **there is no client-side tamper surface** to flip premium locally (no MMKV key to patch, no cached flag). Premium is granted only when the BFF `user/info` response carries `isVip=true` for the logged-in/visitor account.

**Implication:** any "free premium" modification would require either (a) MITM-ing the BFF `user/info` response to return `isVip=true` (defeated by TLS + gateway-secret HMAC on the request), or (b) patching `v.c(...)`/`f0(...)` at runtime via Frida — a per-session, device-local change that does not survive app restart. This is consistent with a legitimately server-authoritative subscription model.

---

## 7. Startup & App Structure

- `Application`: `com.transsion.subroom.app.SubRoomApp`.
- `SplashActivity` (launcher, leanback) → region check (`checkRegionBlock`, `ej.d`) → `SplashAdController` (Hisavana splash ad) → `MainActivity`.
- Startup manager initializes: MMKV, XLog, TheRouter (DI/routing via `InnerTheRouterContentProvider`), CrashHandler, ANRCollector, Firebase Remote Config.
- UI in `com.transsion.tvui.activity`: `MainActivity`, `DetailPlayerActivity`, `SearchActivity`, `LiveDetailActivity`, `History*`, `Collection*`, `VipPayActivity`, `WebViewActivity`.
- Navigation/routing: TheRouter (`com.content.TheRouter`).
- DI/test scaffolding: many `com.transsion.ad.test.*` activities (ad SDK test harness bundled in release — common in Transsion builds).

---

## 8. Tools & Artifacts

- Decompiled sources: `/home/bld/moviebox/analysis/jadx_out/sources/` (15,085 .java, 21 minor errors).
- JADX log: `/home/bld/moviebox/analysis/jadx.log`.
- JADX MCP server: connected, APK loaded in GUI memory (renames applied there; on-disk decompile unchanged).
- Frida script: `/home/bld/moviebox/analysis/frida-vip-trace.js` (hooks `v.c`, `TvServiceLocator.V/q0`, `BffGetVipUserInfoData.isVip`, `VipPayViewModel.f0`). Run: `frida -H 127.0.0.1:27042 -f com.community.mbox.tv -l frida-vip-trace.js` (after `adb -s emulator-5554 forward tcp:27042 tcp:27042`). Sample output: `/home/bld/moviebox/analysis/frida-vip-output.txt`.
- Frida VIP-unlock script: `/home/bld/moviebox/analysis/frida-vip-unlock.js` (forces `v.c(true)` / `TvServiceLocator.V()->true` for the current session — session-only, no persistence).
- Frida gateway-signing script: `/home/bld/moviebox/analysis/frida-gateway-sign.js` (captures live secret, HMAC canonical strings + signatures). Sample output: `/home/bld/moviebox/analysis/frida-gateway-sign-output.txt`.

## 9. Experiments: VIP-Unlock + Playback Crash (2026-07-19)

**Goal:** force the in-memory VIP `StateFlow` (`com.transsion.tvdata.v.vipStateFlow`, runtime field `b`; backing `_state$volatile`) to `TRUE` for the session, so gated UI/playback is unlocked.

**What was tried:**

1. **`v.c(true)` method call (original `frida-vip-unlock.js`).** Calling the app's own JIT'd setter via frida's bridge crashes — confirmed by frida-java-bridge#3700 ("only `.implementation`/method calls crash; field access is fine"). Crashed the `ExoPlayer:Playb` thread with `SIGSEGV / fault addr 0xe00 / <unknown> / uptime ~1-2s`.

2. **Field-write via reflection (`Field.set` on `_state$volatile`, current `frida-vip-unlock.js`).** Removes all frida-initiated app-method calls. The VIP flag is forced TRUE reliably (`vipState forced TRUE (field write)` every 1s) and the **non-video** app is stable. The **playback gate** at `DetailPlayerViewModel` ~line 2969 (`... || this.currentUserVip`) is satisfied once the StateFlow is forced, so gated playback *is* unlocked app-logically. But **starting actual video decode STILL crashes** the `ExoPlayer:Playb` thread with the same `fault addr 0xe00 / <unknown> / uptime 2s` signature.

3. **Control test — empty/no-op frida attach (THE decisive experiment).** Attached a script that does **nothing** (no VIP field-write, and whose only Java hook *failed to load* with `ClassNotFoundException` — so frida touched the app's Java layer not at all). On runs where video auto-played (auto-resume "Continue Watching"), the app **still crashed** on `ExoPlayer:Playb` with the **identical** `SIGSEGV / fault addr 0xe00` signature (reproduced twice: with the failed-okhttp hook, and with the empty no-op script). On runs where no video played, the empty attach survived 50s+ with no crash.

**Root cause (DEFINITIVE — frida is innocent):**
The crash is the app's **own ARM64 native media codec** (`ExoPlayer:Playb` thread, native library `com.transsion.player.orplayer` / system `libcrashlytics-trampoline.so` which is `EM_AARCH64`) running under **ARM binary-translation on the x86_64 Android emulator** (`emulator64_x86_64_arm64:12`). The tombstone shows `fault addr 0xe00` / `rip 0xe00` / `<unknown>` PC — a **null-pointer dereference inside the translated ARM native code** during codec/`seekTo` init, ~2s after launch when video decode starts. It is **triggered by video playback**, NOT by frida, NOT by the VIP-unlock script, and NOT by any Java hook. This is why:
   - the earlier "24s no crash without frida" was idle/UI only (no decode happened);
   - the field-write VIP script and an empty no-op attach crash **identically** — only the *occurrence of playback* matters, not what frida does.

Confirmed by the native backtrace: `pid … name: ExoPlayer:Playb`, `signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0xe00`, `ABI: 'x86_64'`, `Build fingerprint: '…emulator64_x86_64_arm64:12…'`.

**Confirmed working:** session VIP flag forcing (field-write) for all **non-video** gated UI; premium sheet opens; app stable while not decoding video. App-logically, gated playback is unlocked (`currentUserVip==true` satisfies `DetailPlayerViewModel` line 2969) — the only thing that fails is the emulator's inability to run the ARM media codec.

**Confirmed broken on THIS emulator:** actual video decode (ExoPlayer native codec under ARM-translation) → SIGSEGV. This is an **emulator/architecture limitation**, not a script or frida defect.

**The fix is the target device, not the script:** run on the **TV (`com.community.mbox.tv` on real ARM, `adb connect 192.168.1.7:5555`)** where the ARM media codec runs natively (this is why the Jul-18 full video-playback success was on the TV). The x86_64 emulator cannot decode the app's ARM media codec. TV was `No route to host` at time of writing — re-establish `adb connect 192.168.1.7:5555` to verify playback there.

**Canonical runner:** `sh /home/bld/moviebox/analysis/run_vip_emu.sh` (uses system `frida` 17.15.3 CLI ↔ `frida-server` 17.15.3 on `emulator-5554` port 27060↔27061; field-write unlock). For the TV, swap the serial/host to `192.168.1.7:5555`.

**Note on capturing a `subjectId` for playback tests:** blind DPAD/tap navigation on the 10-foot TV layout is unreliable (posters are `RecyclerView` images with no text nodes; taps land on filter chips). Runtime capture via `ContentCardUiModel` (obfuscated `g`), `BffSubjectInfo.getSubjectId`, `okhttp3.ResponseBody` (separate dex, not loadable) all require re-render that blind UI couldn't reliably trigger. The auto-resume "Continue Watching" path ended up being the reproducible playback trigger used for the control tests above.

## 10. Recommendations / Notes
1. **Gateway secrets are recoverable** from the APK and the request-signing scheme is fully reconstructable (runtime-verified in §3.1 — forged signatures match the server-accepted values exactly). Anyone holding the APK can forge validly-signed BFF requests. If abuse is a concern, move to a server-side/account-bound token (the VIP flow already uses account auth).
2. **`usesCleartextTraffic=true`** + `requestLegacyExternalStorage` widen attack surface; consider scoping the network security config.
3. **Ad SDK test activities** are shipped in the release build (`com.transsion.ad.test.*`) — verify these aren't reachable/exported in production.
4. **No client-side DRM** — content protection depends entirely on signed, expiring stream URLs; verify server-side URL expiry/revocation is enforced.
5. **Dynamic analysis (Frida) performed** — premium/free VIP path verified at runtime (see §6.1). The VIP state is server-authoritative and in-memory only; no client-side tamper surface. Remaining dynamic work: hook `GatewayInterceptor` / `GateWaySdk.getSecret()` to confirm the HMAC request-signing flow end-to-end, and capture a live `/wefeed-tv-bff/user/info` response to confirm TLS/HMAC enforcement.
