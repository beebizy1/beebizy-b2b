import { describe, expect, it } from "vitest";
import {
  categoryForTask,
  CHECKLIST_CATEGORIES,
  CHECKLIST_LIBRARY,
  CHECKLIST_PACKAGES,
} from "./checklistLibrary";

describe("checklist library", () => {
  it("has no duplicate task titles", () => {
    const titles = CHECKLIST_LIBRARY.map((task) => task.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("only uses categories the picker offers", () => {
    const allowed = new Set<string>(CHECKLIST_CATEGORIES);
    for (const task of CHECKLIST_LIBRARY) {
      expect(allowed.has(task.category), `${task.title} → ${task.category}`).toBe(true);
    }
  });
});

describe("checklist packages", () => {
  it("have unique ids", () => {
    const ids = CHECKLIST_PACKAGES.map((pkg) => pkg.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reference only tasks that exist in the library", () => {
    const known = new Set(CHECKLIST_LIBRARY.map((task) => task.title));
    for (const pkg of CHECKLIST_PACKAGES) {
      for (const title of pkg.tasks) {
        // A package task with no library entry would be added with no category.
        expect(known.has(title), `${pkg.id} → "${title}"`).toBe(true);
      }
    }
  });

  it("list no task twice within a package", () => {
    for (const pkg of CHECKLIST_PACKAGES) {
      expect(new Set(pkg.tasks).size, pkg.id).toBe(pkg.tasks.length);
    }
  });

  it("are all non-empty", () => {
    for (const pkg of CHECKLIST_PACKAGES) {
      expect(pkg.tasks.length, pkg.id).toBeGreaterThan(0);
    }
  });
});

describe("categoryForTask", () => {
  it("resolves a known title to its library category", () => {
    expect(categoryForTask("Book venue / conference space")).toBe("Venue");
  });

  it("falls back to General for anything not in the library", () => {
    expect(categoryForTask("Feed the office cat")).toBe("General");
  });
});
