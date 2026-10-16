import { describe, expect, it } from "vitest";
import { databaseErrorMessage, errorMessages } from "./errorMessage";

describe("database error cause chains", () => {
  it("finds the driver message beneath a wrapped Drizzle query error", () => {
    const error = new Error("Failed query", { cause: new Error("This email is already registered.") });
    expect(errorMessages(error)).toEqual(["Failed query", "This email is already registered."]);
    expect(databaseErrorMessage(error)).toBe("This email is already registered.");
  });
});
