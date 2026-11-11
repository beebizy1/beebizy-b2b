import { z } from "zod";

export const registrationGuestDraftKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
export const registrationGuestDraftSchema = z.object({
  values: z.record(z.string().max(200), z.string().max(10_000)).refine(value => Object.keys(value).length <= 125 && JSON.stringify(value).length <= 100_000, "Guest draft is too large."),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  discarded: z.boolean(),
});
export type RegistrationGuestDraft = z.infer<typeof registrationGuestDraftSchema>;
export interface RegistrationGuestDraftRepository {
  get(eventId: string, key: string): Promise<RegistrationGuestDraft | null>;
  save(eventId: string, key: string, draft: RegistrationGuestDraft): Promise<RegistrationGuestDraft>;
}
export interface GuestDraftState extends RegistrationGuestDraft { message: string; remote: RegistrationGuestDraft | null }
function sameValues(a: Record<string, string>, b: Record<string, string>) {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && b[key] === value);
}

/** Backs up edits privately. Only the form's explicit submit changes registrations. */
export class RegistrationGuestDraftRecovery {
  state: GuestDraftState;
  private listener: (state: GuestDraftState) => void = () => {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private active = true;
  private generation = 0;
  private attempts = 0;
  private deviceFailed = false;
  constructor(private repo: RegistrationGuestDraftRepository, private eventId: string, private draftKey: string, private storageKey: string, private storage: Pick<Storage, "getItem" | "setItem">, private demo: boolean, private initial: Record<string, string>) {
    this.state = { values: { ...initial }, revision: 0, discarded: true, message: "", remote: null };
    try {
      const raw = storage.getItem(storageKey);
      const cached = raw ? registrationGuestDraftSchema.parse(JSON.parse(raw)) : null;
      if (cached) Object.assign(this.state, cached.discarded ? { revision: cached.revision } : cached, { message: cached.discarded ? "" : "Recovered unfinished guest details from this device." });
    } catch { this.deviceFailed = true; this.state.message = "Device recovery unavailable. Keep this form open."; }
  }
  private emit() { this.listener({ ...this.state }); }
  private snapshot(): RegistrationGuestDraft { return { values: { ...this.state.values }, revision: this.state.revision, discarded: this.state.discarded }; }
  private backup() {
    try { this.storage.setItem(this.storageKey, JSON.stringify(this.snapshot())); this.deviceFailed = false; }
    catch { this.deviceFailed = true; this.state.message = "Device backup failed. Keep this form open until Beebizy confirms saving."; }
  }
  async start(listener: (state: GuestDraftState) => void) {
    const generation = ++this.generation; this.active = true; this.listener = listener; this.emit();
    try {
      const remote = await this.repo.get(this.eventId, this.draftKey);
      if (generation !== this.generation) return;
      if (remote && remote.revision > this.state.revision) {
        if (!this.state.discarded) { this.state.remote = remote; this.state.message = "Another device has a newer draft. Choose which copy to keep."; }
        else { Object.assign(this.state, remote.discarded ? { revision: remote.revision } : remote); this.state.message = remote.discarded ? "" : "Recovered unfinished guest details saved to Beebizy."; this.backup(); }
      }
    } catch { if (generation !== this.generation) return; this.state.message = "Server recovery unavailable. This device copy is preserved."; }
    this.emit(); if (!this.state.discarded && !this.state.remote) this.schedule();
  }
  private schedule(delay = 600) { clearTimeout(this.timer); if (this.active) this.timer = setTimeout(() => { void this.flush(); }, delay); }
  setValues(value: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) {
    this.state.values = typeof value === "function" ? value(this.state.values) : value;
    this.state.revision = Math.max(Date.now(), this.state.revision + 1);
    this.state.discarded = false; this.attempts = 0;
    this.state.message = this.demo ? "Draft backed up on this device." : "Saving private draft…";
    this.backup(); this.emit(); if (!this.state.remote) this.schedule();
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.inFlight || !this.state.revision || this.state.remote) return this.inFlight ?? Promise.resolve();
    this.inFlight = (async () => {
      try {
        let sent = 0;
        while (sent !== this.state.revision) {
          const draft = this.snapshot(); sent = draft.revision;
          const saved = await this.repo.save(this.eventId, this.draftKey, draft);
          if (saved.revision > draft.revision || (saved.revision === draft.revision && (saved.discarded !== draft.discarded || !sameValues(saved.values, draft.values)))) { this.state.remote = saved; this.state.message = "Another device has a different draft. Choose which copy to keep."; break; }
          this.attempts = 0;
          if (sent === this.state.revision) this.state.message = draft.discarded ? "" : this.demo ? "Draft backed up on this device." : "Draft saved to Beebizy. Submit to apply these details.";
        }
      } catch {
        this.state.message = this.deviceFailed ? "Draft saving failed. Keep this form open." : "Device copy saved. Server saving failed; retrying.";
        if (this.attempts < 2) { this.attempts++; this.schedule(this.attempts * 2000); }
      } finally { this.emit(); }
    })();
    try { await this.inFlight; } finally { this.inFlight = null; }
  }
  complete(expected: Record<string, string>, reset = this.initial) {
    if (!sameValues(expected, this.state.values)) return;
    this.state.values = { ...reset }; this.state.revision = Math.max(Date.now(), this.state.revision + 1, (this.state.remote?.revision ?? 0) + 1);
    this.state.discarded = true; this.state.remote = null; this.state.message = "";
    this.backup(); this.emit(); this.schedule(0);
  }
  resolve(useRemote: boolean) {
    const remote = this.state.remote;
    if (!remote) return;
    if (useRemote) Object.assign(this.state, remote.discarded ? { values: { ...this.initial }, revision: remote.revision, discarded: true } : remote);
    else this.state.revision = Math.max(Date.now(), this.state.revision + 1, remote.revision + 1);
    this.state.remote = null; this.state.message = "Recovered guest draft."; this.backup(); this.emit(); this.schedule(0);
  }
  stop() { this.active = false; ++this.generation; clearTimeout(this.timer); this.listener = () => {}; void this.flush(); }
}
