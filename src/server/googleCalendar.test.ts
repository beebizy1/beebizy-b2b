import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../data/entities";

vi.mock("./db", () => ({ db: {} }));
vi.mock("./repos", () => ({ events: { update: vi.fn() } }));

const {
  buildGoogleEventPayload,
  googleEventPatch,
  openToken,
  readOAuthState,
  sealToken,
  signOAuthState,
} = await import("./googleCalendar");

const key = Buffer.alloc(32, 7).toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Google Calendar token protection", () => {
  it("round-trips a refresh token without storing it as plaintext", () => {
    const sealed = sealToken("refresh-token-value", key);
    expect(sealed).not.toContain("refresh-token-value");
    expect(openToken(sealed, key)).toBe("refresh-token-value");
  });

  it("rejects a modified encrypted token", () => {
    const sealed = sealToken("refresh-token-value", key);
    const parts = sealed.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => openToken(parts.join("."), key)).toThrow();
  });
});

describe("Google OAuth state", () => {
  const state = {
    workspaceId: "workspace-1",
    userId: "user-1",
    nonce: "16bb9ae8-6892-4eb7-a2f9-39f9d5acdd84",
    expiresAt: 2_000,
  };

  it("round-trips a signed state and rejects replay after expiry", () => {
    const signed = signOAuthState(state, key);
    expect(readOAuthState(signed, key, 1_999)).toEqual(state);
    expect(() => readOAuthState(signed, key, 2_001)).toThrow("expired");
  });

  it("rejects a modified state", () => {
    const signed = signOAuthState(state, key);
    expect(() => readOAuthState(`${signed.slice(0, -1)}x`, key, 1_000)).toThrow("invalid");
  });
});

describe("Google event mapping", () => {
  const event = {
    id: "event-1",
    ownerId: "workspace-1",
    title: "Annual Gala",
    description: "Welcome",
    date: "2027-05-12T01:00:00.000Z",
    endDate: "2027-05-12T04:00:00.000Z",
    timeZone: "America/Los_Angeles",
    location: "Santa Clara, CA",
    createdAt: "2026-11-05T20:00:00.000Z",
  } as Event;

  it("marks Google events with private Beebizy ownership metadata", () => {
    expect(buildGoogleEventPayload(event)).toMatchObject({
      summary: "Annual Gala",
      location: "Santa Clara, CA",
      start: { dateTime: event.date, timeZone: event.timeZone },
      end: { dateTime: event.endDate, timeZone: event.timeZone },
      extendedProperties: {
        private: {
          beebizy: "true",
          beebizyEventId: "event-1",
          beebizyWorkspaceId: "workspace-1",
        },
      },
    });
  });

  it("maps only linked Google event fields back into a Beebizy patch", () => {
    expect(googleEventPatch({
      id: "google-1",
      summary: "Annual Gala Updated",
      description: "New details",
      location: "San Jose, CA",
      start: { dateTime: "2027-05-12T02:00:00.000Z", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2027-05-12T05:00:00.000Z" },
    })).toEqual({
      title: "Annual Gala Updated",
      description: "New details",
      location: "San Jose, CA",
      date: "2027-05-12T02:00:00.000Z",
      endDate: "2027-05-12T05:00:00.000Z",
      timeZone: "America/Los_Angeles",
    });
  });
});
