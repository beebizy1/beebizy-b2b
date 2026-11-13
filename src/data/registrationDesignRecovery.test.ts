import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_REGISTRATION_PAGE, normalizeRegistrationPage } from "./registrationPage";
import { registrationDesignDraftSchema, type RegistrationDesignDraft, type RegistrationDesignDraftRepository } from "./registrationDesignDraft";
import { RegistrationDesignRecovery } from "./registrationDesignRecovery";

const running: RegistrationDesignRecovery[] = [];
const device = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
function repository() {
  const drafts = new Map<string, RegistrationDesignDraft>();
  const repo: RegistrationDesignDraftRepository = {
    async get(id) { return structuredClone(drafts.get(id) ?? null); },
    async save(id, draft) { const current = drafts.get(id); if (!current || current.revision < draft.revision) drafts.set(id, structuredClone(draft)); return structuredClone(drafts.get(id)!); },
  };
  return repo;
}
function editor(repo: RegistrationDesignDraftRepository, storage = device(), event = "event-1", user = "user-1") {
  const recovery = new RegistrationDesignRecovery(repo, event, `${user}:${event}`, storage, false, DEFAULT_REGISTRATION_PAGE);
  running.push(recovery); return recovery;
}
afterEach(() => { running.forEach(item => item.stop()); running.length = 0; });

describe("invitation draft persistence", () => {
  it("keeps question audiences in device recovery while the server is unavailable", async () => {
    const repo = repository(); repo.save = async () => { throw new Error("Offline"); };
    const storage = device(); const first = editor(repo, storage); await first.start(() => {});
    first.setPage(current => ({ ...current, questions: [{ id: "guest", label: "Guest meal", type: "text", required: true, options: [], audience: "guests" }] }));
    await first.flush(); first.stop();
    expect(first.state.message).toContain("Device copy saved");
    expect(editor(repository(), storage).state.page.questions[0]?.audience).toBe("guests");
  });
  it("keeps guest limits in a private server draft and safely reads older cached designs", async () => {
    const repo = repository(); const first = editor(repo); await first.start(() => {});
    first.setPage(current => ({ ...current, maxAdditionalGuests: 3 })); await first.flush();
    const refreshed = editor(repo); await refreshed.start(() => {}); expect(refreshed.state.page.maxAdditionalGuests).toBe(3);
    const oldPage = Object.fromEntries(Object.entries(DEFAULT_REGISTRATION_PAGE).filter(([key]) => key !== "maxAdditionalGuests"));
    expect(registrationDesignDraftSchema.parse({ page: oldPage, guestTypesInput: "General", revision: 1, discarded: false }).page.maxAdditionalGuests).toBe(0);
  });
  it("recovers every field, separate artwork and unfinished custom questions before publishing", async () => {
    const repo = repository(); const storage = device(); const first = editor(repo, storage);
    await first.start(() => {});
    first.setPage({ ...first.state.page, welcomeMessage: "First paragraph.\n\nSecond paragraph. ", footerImageSource: "custom", footerImageUrl: "https://example.com/bottom.png", questions: [{ id: "shirt", label: "", type: "select", required: true, options: ["S", "M", ""], audience: "guests" }], infoPages: [{ id: "room", title: "", navLabel: "Room", body: "Pending hotel details" }] });
    first.setGuestTypes("Guest, Family"); first.stop();
    const restored = editor(repo, storage); await restored.start(() => {}); await restored.flush();
    const saved = await repo.get("event-1");
    expect(saved?.page).toEqual(first.state.page);
    expect(saved?.guestTypesInput).toBe("Guest, Family");
    expect(saved?.page.questions[0].options).toEqual(["S", "M", ""]);
    expect(registrationDesignDraftSchema.parse(saved).page.questions[0]?.audience).toBe("guests");
    expect(registrationDesignDraftSchema.safeParse(saved).success).toBe(true);
    expect(saved?.discarded).toBe(false);
  });
  it("keeps newer work when an earlier save returns late", async () => {
    const repo = repository(); const save = repo.save;
    let release!: () => void;
    let calls = 0;
    repo.save = async (...args) => { ++calls; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); return save(...args); };
    const recovery = editor(repo); await recovery.start(() => {});
    recovery.setPage(current => ({ ...current, headline: "First" }));
    const writing = recovery.flush();
    recovery.setPage(current => ({ ...current, headline: "Newest" }));
    release(); await writing;
    expect((await repo.get("event-1"))?.page.headline).toBe("Newest");
    expect(recovery.state.page.headline).toBe("Newest");
  });
  it("uses tombstones so delayed autosaves cannot resurrect a published draft", async () => {
    const repo = repository(); const storage = device(); const recovery = editor(repo, storage); await recovery.start(() => {});
    recovery.setPage(current => ({ ...current, headline: "Ready to publish" })); await recovery.flush();
    const old = await repo.get("event-1");
    recovery.markPublished(normalizeRegistrationPage(recovery.state.page)); await recovery.flush();
    await repo.save("event-1", old!);
    expect((await repo.get("event-1"))?.discarded).toBe(true);
    const restored = editor(repo, storage); await restored.start(() => {});
    expect(restored.state.discarded).toBe(true);
  });
  it("preserves device work when the server fails and isolates local user keys", async () => {
    const storage = device(); const repo = repository(); repo.save = async () => { throw new Error("Offline"); };
    const recovery = editor(repo, storage); await recovery.start(() => {});
    recovery.setPage(current => ({ ...current, headline: "Offline work" })); await recovery.flush();
    expect(recovery.state.message).toContain("Device copy saved");
    expect(editor(repository(), storage).state.page.headline).toBe("Offline work");
    expect(editor(repository(), storage, "event-1", "other-user").state.page.headline).toBe("");
  });
  it("never exposes private draft metadata on the public settings object", () => {
    const page = normalizeRegistrationPage({ ...DEFAULT_REGISTRATION_PAGE, _editorDrafts: { privateUser: { page: { welcomeMessage: "PRIVATE DRAFT" } } } });
    expect(JSON.stringify(page)).not.toContain("PRIVATE DRAFT");
  });
});
