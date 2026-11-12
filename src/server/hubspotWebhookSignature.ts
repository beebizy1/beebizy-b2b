import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hubspotRequestUri(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (["/api/router", "/api/integrations/hubspot/webhook"].includes(url.pathname) && url.searchParams.get("__path") === "integrations/hubspot/webhook") {
    url.pathname = "/api/integrations/hubspot/webhook"; url.searchParams.delete("__path");
  }
  return url.toString().replace(/%(3A|2F|3F|40|21|24|27|28|29|2A|2C|3B)/gi, value => decodeURIComponent(value));
}
export function validHubSpotSignature(request: Request, body: string, secret: string, now = Date.now()): boolean {
  const v3 = request.headers.get("x-hubspot-signature-v3");
  if (v3) {
    const rawTime = request.headers.get("x-hubspot-request-timestamp") ?? "";
    const time = Number(rawTime);
    if (!/^\d{10,16}$/.test(rawTime) || !Number.isSafeInteger(time) || Math.abs(now - time) > 300_000 || !/^[A-Za-z0-9+/]{43}=$/.test(v3)) return false;
    const expected = createHmac("sha256", secret).update(`${request.method.toUpperCase()}${hubspotRequestUri(request.url)}${body}${rawTime}`, "utf8").digest();
    const actual = Buffer.from(v3, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  // Classic CRM subscriptions also deliver v1 signatures. Never downgrade an invalid v3.
  const legacy = request.headers.get("x-hubspot-signature") ?? "";
  if (request.headers.get("x-hubspot-signature-version") !== "v1" || !/^[a-f\d]{64}$/i.test(legacy)) return false;
  const expected = createHash("sha256").update(secret + body, "utf8").digest();
  const actual = Buffer.from(legacy, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
