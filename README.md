# MovieBoxTV VIP Patcher

Reverse engineering and client-side VIP entitlement patching for MovieBoxTV Android app.

> **Disclaimer:** This is a security research project for educational purposes. Only use on apps you are authorized to analyze.

## Overview

Complete workflow to force VIP/premium features client-side in MovieBoxTV (`com.community.mbox.tv`) by patching the decompiled APK. No server compromise needed — all patches intercept the app's own VIP verification at the local level.

## What's Patched

| Target | File | Method |
|--------|------|--------|
| VIP status | `TvServiceLocator.V()` | Returns `true` |
| VIP status | `v.a()` | Returns `true` |
| Server isVip | `BffGetVipUserInfoData.isVip()` | Returns `Boolean.TRUE` |
| Server isVip | `BffUserInfoData.isVip()` | Returns `Boolean.TRUE` |
| Content isVip | `BffSubjectInfo.isVip()` | Returns `true` |
| Content isVip | `BffSearchRankSubject.isVip()` | Returns `true` |
| Content isVip | `BffOperatingSubject.isVip()` | Returns `true` |
| VIP expiry | `BffGetVipUserInfoData.getVipExpireAt()` | Returns `"2099-12-31"` |
| VIP expiry | `BffUserInfoData.getVipExpireAt()` | Returns `"2099-12-31"` |
| Remaining seconds | `BffGetVipUserInfoData.getVipRemainingSeconds()` | Returns `"999999999"` |
| Remaining seconds | `BffUserInfoData.getVipRemainingSeconds()` | Returns `"999999999"` |
| Preview timer enabled | `DetailPlayerViewModel$f.a()` | Returns `false` |
| Preview timer limit | `DetailPlayerViewModel$f.b()` | Returns `0` |
| Preview timer remaining | `DetailPlayerViewModel$f.c()` | Returns `0` |
| Decoder type | `fk/e.b()` | Returns `FFMPEG` |

## Files

| File | Description |
|------|-------------|
| `analysis/frida-vip-trace.js` | Frida script to trace VIP entitlement method calls |
| `analysis/frida-vip-unlock.js` | Frida script to force VIP at runtime |
| `analysis/frida-gateway-sign.js` | Frida script to extract gateway HMAC signing |
| `analysis/apply_moviebox_vip_tv.py` | Python script to apply smali patches for TV |
| `analysis/apply_moviebox_vip_emulator.py` | Python script for emulator testing |
| `analysis/run_vip_tv.py` | Runner script for TV deployment |
| `analysis/run_vip_emu.sh` | Shell script for emulator testing |
| `analysis/REVERSE_ENGINEERING_REPORT.md` | Full reverse engineering analysis |
| `analysis/jadx.log` | JADX decompilation log |

## Quick Start

```bash
# Decompile
apktool d -r -o mbox_dec MovieBoxTv.apk

# Apply patches (modify smali files — see analysis/apply_*.py)

# Rebuild
apktool b mbox_dec -o mbox_vip.apk

# Sign
apksigner sign --ks debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey mbox_vip.apk

# Install
adb install -r mbox_vip.apk
```

## Frida Runtime Injection

For testing without rebuilding:

```bash
# Start MovieBox, then attach Frida
frida -U com.community.mbox.tv -l analysis/frida-vip-unlock.js
```
