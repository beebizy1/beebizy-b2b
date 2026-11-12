import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hubspotRequestUri, validHubSpotSignature } from "./hubspotWebhookSignature";

const secret = "fixture-webhook-secret";
const url = "https://beebizy-studio-preview.vercel.app/api/integrations/hubspot/webhook";
const body = '[{"name":"María Elena"}]';
const time = 1_800_000_000_000;
function signed(target = url, raw = body, timestamp = time) {
  const signature = createHmac("sha256", secret).update(`POST${hubspotRequestUri(target)}${raw}${timestamp}`).digest("base64");
  return new Request(target, { method: "POST", headers: { "x-hubspot-signature-v3": signature, "x-hubspot-request-timestamp": String(timestamp) }, body: raw });
}
describe("HubSpot webhook verification", () => {
  it("verifies the exact UTF-8 body and rejects tampering, wrong secrets and wrong URLs", () => {
    expect(validHubSpotSignature(signed(), body, secret, time)).toBe(true);
    expect(validHubSpotSignature(signed(), body + " ", secret, time)).toBe(false);
    expect(validHubSpotSignature(signed(), body, "wrong-secret", time)).toBe(false);
    const request = signed(); expect(validHubSpotSignature(new Request(url + "?extra=value", { method: "POST", headers: request.headers, body }), body, secret, time)).toBe(false);
  });
  it("rejects replayed/future requests and malformed signatures", () => {
    expect(validHubSpotSignature(signed(), body, secret, time + 300_001)).toBe(false);
    expect(validHubSpotSignature(signed(), body, secret, time - 300_001)).toBe(false);
    const request = signed(); request.headers.set("x-hubspot-signature-v3", "malformed");
    expect(validHubSpotSignature(request, body, secret, time)).toBe(false);
  });
  it("reconstructs the public URI behind Vercel's rewrite and follows HubSpot's limited decoding rules", () => {
    const request = signed();
    const rewritten = new Request("https://beebizy-studio-preview.vercel.app/api/router?__path=integrations%2Fhubspot%2Fwebhook", { method: "POST", headers: request.headers, body });
    expect(validHubSpotSignature(rewritten, body, secret, time)).toBe(true);
    const originalPathWithRewrite = new Request(url + "?__path=integrations%2Fhubspot%2Fwebhook", { method: "POST", headers: request.headers, body });
    expect(validHubSpotSignature(originalPathWithRewrite, body, secret, time)).toBe(true);
    expect(hubspotRequestUri(url + "?email=test%40example.com&literal=%26")).toBe(url + "?email=test@example.com&literal=%26");
  });
  it("supports authentic classic CRM notifications without downgrading invalid v3 requests", () => {
    const signature = createHash("sha256").update(secret + body).digest("hex");
    const request = new Request(url, { method: "POST", body, headers: { "x-hubspot-signature-version": "v1", "x-hubspot-signature": signature } });
    expect(validHubSpotSignature(request, body, secret, time)).toBe(true);
    request.headers.set("x-hubspot-signature-v3", "invalid");
    expect(validHubSpotSignature(request, body, secret, time)).toBe(false);
  });
});
