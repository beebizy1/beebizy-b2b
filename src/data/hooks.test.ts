import { describe, expect, it } from "vitest";
import { qk } from "./hooks";

describe("authenticated query keys", () => {
  it("scopes identity and the private feedback inbox to the signed-in user", () => {
    expect(qk.me("user_laila")).not.toEqual(qk.me("user_pilot"));
    expect(qk.feedbackInbox("user_laila")).not.toEqual(qk.feedbackInbox("user_pilot"));
  });
});
