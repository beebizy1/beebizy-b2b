import { normalizeRegistrationPage, type RegistrationPageSettings } from "./registrationPage";
import { registrationDesignDraftSchema, type RegistrationDesignDraft, type RegistrationDesignDraftRepository } from "./registrationDesignDraft";

export interface RegistrationDesignState extends RegistrationDesignDraft { message: string; remote: RegistrationDesignDraft | null; deviceFailed: boolean }
type StoragePort = Pick<Storage, "getItem" | "setItem">;
type Change<T> = T | ((value: T) => T);

/** Private draft autosave; publishing remains a separate explicit organizer action. */
export class RegistrationDesignRecovery {
  state: RegistrationDesignState;
  private listener: (state: RegistrationDesignState) => void = () => {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = true;
  private inFlight: Promise<void> | null = null;
  private attempts = 0;
  private generation = 0;
  constructor(private repo: RegistrationDesignDraftRepository, private eventId: string, private key: string, private storage: StoragePort, private demo: boolean, initial: unknown) {
    const page = normalizeRegistrationPage(initial);
    this.state = { page, guestTypesInput: page.registrationTypes.join(", "), revision: 0, discarded: true, message: "Draft recovery ready", remote: null, deviceFailed: false };
    try {
      const raw = this.storage.getItem(key);
      const local = raw ? registrationDesignDraftSchema.parse(JSON.parse(raw)) : null;
      if (local) this.state = { ...this.state, ...(local.discarded ? { revision: local.revision } : local), message: local.discarded ? "Published design loaded" : "Recovered draft from this device" };
    } catch { this.state.deviceFailed = true; this.state.message = "Device recovery unavailable. Keep this page open."; }
  }
  private emit() { this.listener({ ...this.state }); }
  private snapshot(): RegistrationDesignDraft { const { page, guestTypesInput, revision, discarded } = this.state; return { page, guestTypesInput, revision, discarded }; }
  private backup() {
    try { this.storage.setItem(this.key, JSON.stringify(this.snapshot())); this.state.deviceFailed = false; }
    catch { this.state.deviceFailed = true; this.state.message = "Device backup failed. Keep this page open until Beebizy confirms saving."; }
  }
  async start(listener: (state: RegistrationDesignState) => void) {
    const generation = ++this.generation; this.active = true; this.listener = listener; this.emit();
    try {
      const remote = await this.repo.get(this.eventId);
      if (generation !== this.generation) return;
      if (remote && remote.revision > this.state.revision) {
        if (!this.state.discarded) { this.state.remote = remote; this.state.message = "Another device has a newer draft. Your device copy is preserved."; }
        else { Object.assign(this.state, remote.discarded ? { revision: remote.revision } : remote); this.state.message = remote.discarded ? "Published design loaded" : "Recovered draft saved to Beebizy"; this.backup(); }
      }
    } catch { this.state.message = "Server recovery unavailable. This device copy is preserved; saving will retry."; }
    this.emit();
    if (!this.state.discarded && !this.state.remote) this.schedule();
  }
  private schedule(delay = 600) {
    clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => { void this.flush(); }, delay);
  }
  private change() {
    this.state.revision = Math.max(Date.now(), this.state.revision + 1);
    this.state.discarded = false; this.attempts = 0;
    this.state.message = this.demo ? "Draft backed up on this device" : "Saving draft to Beebizy…";
    this.backup(); this.emit(); if (!this.state.remote) this.schedule();
  }
  setPage(value: Change<RegistrationPageSettings>) { this.state.page = typeof value === "function" ? value(this.state.page) : value; this.change(); }
  setGuestTypes(value: Change<string>) { this.state.guestTypesInput = typeof value === "function" ? value(this.state.guestTypesInput) : value; this.change(); }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inFlight || !this.state.revision || this.state.remote) return this.inFlight ?? Promise.resolve();
    this.inFlight = (async () => {
      try {
        let sent = 0;
        while (sent !== this.state.revision) {
          const draft = this.snapshot(); sent = draft.revision;
          const saved = await this.repo.save(this.eventId, draft);
          if (saved.revision > draft.revision) { this.state.remote = saved; this.state.message = "Another device has a newer draft. Your device copy is preserved."; break; }
          this.attempts = 0;
          if (sent === this.state.revision) this.state.message = this.demo ? "Draft backed up on this device" : draft.discarded ? "Published design saved" : "Draft saved to Beebizy. Choose Save invitation to publish it.";
        }
      } catch {
        this.state.message = this.state.deviceFailed ? "Draft saving failed. Keep this page open." : "Device copy saved. Server saving failed; retrying.";
        if (this.attempts < 2) { this.attempts += 1; this.schedule(this.attempts * 2000); }
      } finally { this.emit(); }
    })();
    try { await this.inFlight; } finally { this.inFlight = null; }
  }
  markPublished(published: RegistrationPageSettings) {
    const current = normalizeRegistrationPage({ ...this.state.page, registrationTypes: this.state.guestTypesInput.split(",") });
    if (JSON.stringify(current) !== JSON.stringify(published)) return;
    this.state.revision = Math.max(Date.now(), this.state.revision + 1, (this.state.remote?.revision ?? 0) + 1);
    this.state.discarded = true; this.state.remote = null;
    this.backup(); this.emit(); this.schedule(0);
  }
  useServerDraft() {
    const remote = this.state.remote;
    if (!remote) return;
    Object.assign(this.state, remote);
    this.state.remote = null; this.state.message = "Recovered server draft"; this.backup(); this.emit();
  }
  stop() { this.active = false; ++this.generation; clearTimeout(this.timer); this.listener = () => {}; }
}
