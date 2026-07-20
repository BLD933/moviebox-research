// frida-gateway-sign.js  (v3 - robust)
// Capture MovieBoxTV gateway request signing. We avoid wrapping okhttp3.Interceptor.intercept
// (obfuscated okhttp3 types make chain.getRequest() unreliable) and instead hook the
// internal signing primitives which are plain app classes:
//   - GatewayInterceptor.doGzipOrSign(okhttp3.w) : builds x-tr-signature header  -> hook to read outgoing header
//   - security.a.a(d algo, String data)          : the HMAC                      -> canonical string + sig
//   - security.c.a(String query)                 : query canonicalizer
//   - GateWaySdk.getSecret()                      : the live secret
// Run: frida -H 127.0.0.1:27042 -f com.community.mbox.tv -l frida-gateway-sign.js

const TAG = "[GW-SIGN]";
function log(...a){ console.log(TAG, ...a); }

Java.perform(function () {
  log("loaded, pid=", Process.id);

  setTimeout(function(){
    Java.perform(function(){
      try {
        const sdk = Java.use("com.transsion.api.gateway.GateWaySdk");
        log("getSecret() =", JSON.stringify(sdk.getSecret()));
        log("getWorkMode() =", sdk.getWorkMode(), "| getHost() =", sdk.getHost());
      } catch (e) { log("getSecret err:", e.message); }
    });
  }, 8000);

  // HMAC primitive (app class, plain types)
  const SecA = Java.use("com.transsion.api.gateway.sercurity.a");
  SecA.a.overload("com.transsion.api.gateway.sercurity.d", "java.lang.String").implementation = function (algo, data) {
    const result = this.a(algo, data);
    log("==== HMAC " + algo.name() + " ====");
    log("canonical-string =\n" + data);
    log("-> sig(base64) = " + result);
    return result;
  };

  // Query canonicalizer
  const SecC = Java.use("com.transsion.api.gateway.sercurity.c");
  SecC.a.overload("java.lang.String").implementation = function (q) {
    const r = this.a(q);
    log("canonicalizeQuery('" + q + "') -> " + r);
    return r;
  };

  // doGzipOrSign: reads request, computes signature, sets header. Hook to capture the OUTGOING header.
  const GI = Java.use("com.transsion.api.gateway.interceptor.GatewayInterceptor");
  // find the right overload (okhttp3.w is the Request type; names obfuscated).
  const overloads = GI.doGzipOrSign.overloads;
  log("doGzipOrSign overloads: " + overloads.map(o => o.argumentTypes.map(a=>a.className).join(",")).join(" | "));
  // hook the existing overload by trying the obfuscated Request type name 'w'
  try {
    GI.doGzipOrSign.overload("okhttp3.w").implementation = function (req) {
      const ret = this.doGzipOrSign(req);
      try {
        // okhttp3.w (Request) -> getHeaders() returns okhttp3.s (Headers) -> get(name)
        const headers = ret.getHeaders();
        const hdr = headers.get("x-tr-signature");
        const path = ret.getUrl() != null ? ret.getUrl().toString() : "(unknown)";
        log("---- signed request: " + path + "  x-tr-signature=" + hdr);
      } catch (e) { log("hdr read err: " + e.message); }
      return ret;
    };
  } catch (e) { log("doGzipOrSign hook err: " + e.message); }

  log("gateway signing hooks installed. Open the app / browse to trigger BFF requests.");
});
