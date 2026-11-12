import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationGuestDraftRecovery, registrationGuestDraftSchema, type RegistrationGuestDraft, type RegistrationGuestDraftRepository } from "./registrationGuestDraft";

const running: RegistrationGuestDraftRecovery[] = [];
const device = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } }; };
function repository(): RegistrationGuestDraftRepository {
  const map = new Map<string, RegistrationGuestDraft>();
  return {
    async get(event, key) { return structuredClone(map.get(`${event}:${key}`) ?? null); },
    async save(event, key, draft) { const scope = `${event}:${key}`; const current = map.get(scope); if (!current || current.revision < draft.revision) map.set(scope, structuredClone(draft)); return structuredClone(map.get(scope)!); },
  };
}
function editor(repo: RegistrationGuestDraftRepository, storage = device(), event = "event-1", key = "add-guest", user = "user-1") {
  const item = new RegistrationGuestDraftRecovery(repo, event, key, `${user}:${event}:${key}`, storage, false, { firstName: "", lastName: "" });
  running.push(item); return item;
}
afterEach(() => { running.forEach(item => item.stop()); running.length = 0; vi.restoreAllMocks(); });

describe("private organizer guest drafts", () => {
  it("clears an earlier recovery warning when a restarted editor successfully reads an empty server draft", async () => {
    const repo = repository(); const get = vi.spyOn(repo, "get").mockRejectedValueOnce(new Error("Session not ready"));
    const item = editor(repo); await item.start(() => {}); expect(item.state.message).toContain("Server recovery unavailable");
    item.stop(); get.mockResolvedValueOnce(null); await item.start(() => {});
    expect(item.state.message).toBe(""); expect(item.state.discarded).toBe(true);
  });
  it("recovers both names and all custom fields after refresh without submitting a registration", async () => {
    const repo = repository(); const storage = device(); const first = editor(repo, storage); await first.start(() => {});
    const values = { firstName: "María Elena ", lastName: "de la Cruz-Taylor", contact: "qa@example.invalid", segment: "General", organization: "School", status: "pending", "T-shirt size": "M", Notes: "Unfinished\nnotes " };
    first.setValues(values); await first.flush(); first.stop();
    const refreshed = editor(repo, storage); await refreshed.start(() => {});
    expect(refreshed.state.values).toEqual(values);
    expect((await repo.get("event-1", "add-guest"))?.values).toEqual(values);
    expect(registrationGuestDraftSchema.safeParse(await repo.get("event-1", "add-guest")).success).toBe(true);
    expect(editor(repository(), storage, "event-1", "add-guest", "other-user").state.values.firstName).toBe("");
    expect(editor(repository(), storage, "other-event").state.values.firstName).toBe("");
  });
  it("sends the latest edit after a slow earlier save finishes", async () => {
    const repo = repository(); const save = repo.save;
    let release!: () => void; let calls = 0;
    repo.save = async (...args) => { if (++calls === 1) await new Promise<void>(resolve => { release = resolve; }); return save(...args); };
    const item = editor(repo); await item.start(() => {});
    item.setValues({ firstName: "First", lastName: "Draft" }); const pending = item.flush();
    item.setValues({ firstName: "Newest", lastName: "Draft" }); release(); await pending;
    expect((await repo.get("event-1", "add-guest"))?.values.firstName).toBe("Newest");
  });
  it("uses a tombstone so a delayed save cannot restore a completed guest entry", async () => {
    const repo = repository(); const storage = device(); const item = editor(repo, storage); await item.start(() => {});
    item.setValues({ firstName: "Carlin", lastName: "Putman" }); await item.flush(); const old = await repo.get("event-1", "add-guest");
    item.complete(item.state.values); await item.flush(); await repo.save("event-1", "add-guest", old!);
    expect((await repo.get("event-1", "add-guest"))?.discarded).toBe(true);
    expect(editor(repo, storage).state.values).toEqual({ firstName: "", lastName: "" });
  });
  it("keeps the device copy when the server fails and retains newer edits when an earlier submit finishes", async () => {
    const storage = device(); const repo = repository(); repo.save = async () => { throw new Error("Offline"); };
    const item = editor(repo, storage); await item.start(() => {});
    const submitted = { firstName: "Old", lastName: "Draft" }; item.setValues(submitted);
    item.setValues({ firstName: "New", lastName: "Draft" }); item.complete(submitted); await item.flush();
    expect(item.state.discarded).toBe(false); expect(item.state.message).toContain("Device copy saved");
    expect(editor(repository(), storage).state.values.firstName).toBe("New");
  });
  it("asks before replacing a device draft with a newer server draft", async () => {
    const repo = repository(); const storage = device(); const deviceDraft = editor(repo, storage);
    deviceDraft.setValues({ firstName: "Device", lastName: "Copy" }); deviceDraft.stop();
    const remote = { values: { firstName: "Server", lastName: "Copy" }, revision: Date.now() + 10, discarded: false };
    await repo.save("event-1", "add-guest", remote);
    const next = editor(repo, storage); await next.start(() => {});
    expect(next.state.values.firstName).toBe("Device"); expect(next.state.remote?.values.firstName).toBe("Server");
    next.resolve(true); expect(next.state.values.firstName).toBe("Server");
  });
  it("detects simultaneous device edits with the same timestamp instead of claiming both were saved", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const repo = repository(); const first = editor(repo); const second = editor(repo);
    await first.start(() => {}); await second.start(() => {});
    first.setValues({ firstName: "First", lastName: "Device" }); second.setValues({ firstName: "Second", lastName: "Device" });
    await first.flush(); await second.flush();
    expect(second.state.values.firstName).toBe("Second"); expect(second.state.remote?.values.firstName).toBe("First");
  });
});
