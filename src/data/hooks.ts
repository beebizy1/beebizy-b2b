/**
 * The react-query surface every screen uses.
 *
 * One convention throughout: query keys are built by `qk` so invalidation is exact
 * rather than a hopeful `invalidateQueries(["events"])`, and every mutation declares
 * the keys it invalidates next to the write itself.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useData } from "./provider";
import type { DataAdapter } from "./adapter";
import type {
  GuestDraft,
  GuestRegistrationImportDraft,
  GuestPatch,
  AttentionItem,
  AuctionItemDraft,
  AuctionItemPatch,
  BudgetItemDraft,
  BudgetItemPatch,
  Canvas,
  CanvasCard,
  CanvasDraft,
  CanvasPatch,
  ChecklistItemDraft,
  ChecklistItemPatch,
  CheckInStationDraft,
  CheckInStationPatch,
  Event,
  AssignmentSummaryResult,
  EventDraft,
  EventFilter,
  EventHealth,
  EventPatch,
  EventRoi,
  EventVendorDraft,
  EventVendorPatch,
  Floorplan,
  OpenTask,
  ProductFeedbackDraft,
  FloorplanDraft,
  LocationDraft,
  LocationPatch,
  MenuItemDraft,
  MenuItemPatch,
  RaffleItemDraft,
  RaffleItemPatch,
  RegistrationDraft,
  RegistrationDetailsPatch,
  PublicRegistrationDraft,
  RegistrationCheckInPatch,
  RegistrationStatus,
  WalkInRegistrationDraft,
  WorkspaceRole,
  RunOfShowItemDraft,
  RunOfShowItemPatch,
  SponsorshipDraft,
  SponsorshipPatch,
  RfpDraft,
  RfpPatch,
  RfpResponseDraft,
  RfpResponseStatus,
  DepositDraft,
  DepositPatch,
  VendorPaymentPlanDraft,
  VendorPaymentPlanPatch,
  TeamHoursDraft,
  TeamHoursPatch,
  TeamUpdateDraft,
  TemplateContents,
  TemplateDraft,
  TicketTypeDraft,
  TicketTypePatch,
  UserSettings,
  VendorDraft,
  VendorMessageDraft,
  VendorPatch,
  VolunteerShiftDraft,
  VolunteerShiftPatch,
  VolunteerNeedDraft,
  VolunteerNeedPatch,
  PublicVolunteerSignupDraft,
  PublicDonationStatus,
  PublicFloorplanPayload,
  SchoolGrade,
} from "./entities";
import type { PlanningBrief, PlanningPreviewBrief } from "./planner";
import { useAccountExperience } from "@/app/useAccountExperience";
import type { AssistantChatMessage } from "./assistantChat";
import type { VendorEventPacketDraft } from "./vendorEventPackets";

/* ---------------------------------------------------------------- query keys */

export const qk = {
  me: (cacheScope: string) => ["me", cacheScope] as const,
  portfolio: ["analytics", "portfolio"] as const,
  attention: ["analytics", "attention"] as const,
  openTasks: ["analytics", "openTasks"] as const,
  health: (eventIds?: string[]) => ["analytics", "health", eventIds ?? "all"] as const,

  events: ["events"] as const,
  eventList: (filter?: EventFilter) => ["events", "list", filter ?? {}] as const,
  event: (id: string) => ["events", "detail", id] as const,
  eventByToken: (token: string) => ["events", "byToken", token] as const,
  publicRfp: (token: string) => ["rfps", "public", token] as const,

  locations: ["locations"] as const,
  location: (id: string) => ["locations", "detail", id] as const,

  guests: ["guests"] as const,

  registrations: ["registrations"] as const,
  eventRegistrations: (eventId: string) => ["registrations", "byEvent", eventId] as const,
  members: ["members"] as const,
  feedback: (userId: string) => ["feedback", userId] as const,
  feedbackInbox: (userId: string) => ["feedback", "inbox", userId] as const,

  vendors: ["vendors"] as const,
  vendor: (id: string) => ["vendors", "detail", id] as const,
  vendorThread: (vendorId: string) => ["vendors", "thread", vendorId] as const,

  eventVendors: (eventId: string) => ["eventVendors", eventId] as const,
  checkInStations: (eventId: string) => ["checkInStations", eventId] as const,
  checklist: (eventId: string) => ["checklist", eventId] as const,
  runOfShow: (eventId: string) => ["runOfShow", eventId] as const,
  volunteers: (eventId: string) => ["volunteers", eventId] as const,
  volunteerNeeds: (eventId: string) => ["volunteerNeeds", eventId] as const,
  budget: (eventId: string) => ["budget", eventId] as const,
  menu: (eventId: string) => ["menu", eventId] as const,
  moodBoard: (eventId: string) => ["moodBoard", eventId] as const,

  tickets: (eventId: string) => ["tickets", eventId] as const,
  allTickets: ["tickets", "all"] as const,
  ticketOrders: (eventId: string) => ["tickets", eventId, "orders"] as const,
  stripeConnect: ["billing", "stripe-connect"] as const,
  ticketInvitations: (eventId: string) => ["tickets", eventId, "invitations"] as const,
  publicTicketOrder: (shareToken: string, orderId: string) => ["tickets", "public-order", shareToken, orderId] as const,

  auction: (eventId: string) => ["auction", eventId] as const,
  auctionDonors: (eventId: string) => ["auction", eventId, "donors"] as const,
  auctionBidders: (eventId: string) => ["auction", eventId, "bidders"] as const,
  auctionBids: (eventId: string) => ["auction", eventId, "bids"] as const,
  auctionOrders: (eventId: string) => ["auction", eventId, "orders"] as const,
  publicAuction: (token: string) => ["auction", "public", token] as const,
  publicAuctionDonor: (token: string) => ["auction", "donor", token] as const,
  fundraisingProfile: ["fundraising", "profile"] as const,
  auctionCategories: ["fundraising", "categories"] as const,
  itemSubmissions: (eventId: string) => ["fundraising", eventId, "submissions"] as const,
  fundraisingDashboard: (eventId: string) => ["fundraising", eventId, "dashboard"] as const,
  publicItemIntake: (token: string) => ["fundraising", "intake", token] as const,
  publicBidderProfile: (token: string, bidderToken: string) => ["auction", "bidder", token, bidderToken] as const,
  publicBidderBill: (token: string) => ["fundraising", "bill", token] as const,
  publicFundraisingReceipt: (token: string) => ["fundraising", "receipt", token] as const,
  donationCampaigns: (eventId?: string) => ["fundraising", "campaigns", eventId ?? "all"] as const,
  publicDonationCampaign: (token: string) => ["fundraising", "campaign", token] as const,
  publicDonationStatus: (token: string, donationId: string | null) => ["fundraising", "donation", token, donationId] as const,
  publicCertificate: (token: string) => ["fundraising", "certificate", token] as const,
  fundraisingReports: (eventId: string) => ["fundraising", eventId, "reports"] as const,
  raffle: (eventId: string) => ["raffle", eventId] as const,
  raffleTickets: (eventId: string, raffleItemId: string) => ["raffle", eventId, raffleItemId, "tickets"] as const,
  sponsorships: (eventId: string) => ["sponsorships", eventId] as const,
  rfps: (eventId: string) => ["rfps", eventId] as const,
  deposits: (eventId: string) => ["deposits", eventId] as const,
  vendorPaymentPlans: (eventId: string) => ["vendorPaymentPlans", eventId] as const,
  teamHours: (eventId: string) => ["teamHours", eventId] as const,

  templates: ["templates"] as const,
  template: (id: string) => ["templates", "detail", id] as const,

  canvases: ["canvases"] as const,
  canvas: (id: string) => ["canvases", "detail", id] as const,

  settings: ["settings"] as const,
  floorplan: (eventId: string) => ["floorplan", eventId] as const,
  publicFloorplan: (token: string) => ["floorplan", "public", token] as const,
  history: (eventId: string) => ["history", eventId] as const,
  teamUpdates: (eventId: string) => ["teamUpdates", eventId] as const,
  roi: (eventId: string) => ["roi", eventId] as const,
};

/** Every key whose contents can change when one event's records change. */
function eventDerivedKeys(eventId?: string): QueryKey[] {
  const keys: QueryKey[] = [qk.portfolio, qk.attention, qk.openTasks, ["analytics", "health"]];
  if (eventId) keys.push(qk.event(eventId), qk.history(eventId));
  keys.push(qk.events);
  return keys;
}

/* -------------------------------------------------------------------- helpers */

function useAdapterQuery<T>(
  key: QueryKey,
  select: (adapter: DataAdapter) => Promise<T>,
  options?: { enabled?: boolean; staleTime?: number; refetchInterval?: number },
): UseQueryResult<T, Error> {
  const adapter = useData();
  return useQuery({
    queryKey: key,
    queryFn: () => select(adapter),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 15_000,
    refetchInterval: options?.refetchInterval,
  });
}

function useAdapterMutation<TVars, TResult>(
  run: (adapter: DataAdapter, vars: TVars) => Promise<TResult>,
  invalidate: (vars: TVars) => QueryKey[],
): UseMutationResult<TResult, Error, TVars> {
  const adapter = useData();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => run(adapter, vars),
    onSuccess: (_result, vars) => {
      for (const key of invalidate(vars)) queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Who the server thinks you are, and what you may do. The role is authoritative on the
 * server — it is re-checked on every write — so this copy only shapes the UI.
 */
/** `enabled` lets a public page ask only once the visitor is actually signed in. */
export function useMe(options?: { enabled?: boolean }) {
  const { cacheScope } = useData();
  return useAdapterQuery(qk.me(cacheScope), (a) => a.me(), {
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * One turn of the planning conversation.
 *
 * A mutation rather than a query: each turn is a write to the conversation, and the
 * transcript lives in the calling component so a half-finished interview is never cached
 * and replayed at someone who has moved on.
 */
export function useAssistantChat() {
  return useAdapterMutation(
    (a, vars: { eventId: string; messages: AssistantChatMessage[] }) => a.assistant.chat(vars),
    () => [],
  );
}

export function usePlanningSuggestions() {
  return useAdapterMutation((a, brief: PlanningBrief) => a.assistant.plan(brief), () => []);
}

export function usePlanningPreview() {
  return useAdapterMutation((a, brief: PlanningPreviewBrief) => a.assistant.preview(brief), () => []);
}

export function useLoadGoogleSheet() {
  return useAdapterMutation((a, url: string) => a.imports.loadGoogleSheet(url), () => []);
}

/* ------------------------------------------------------------------ analytics */

export function usePortfolio() {
  return useAdapterQuery(qk.portfolio, (a) => a.analytics.portfolio());
}

export function useCustomReport() {
  return useAdapterQuery(["analytics", "custom-report"], (a) => a.analytics.customReport());
}

export function useAttention(): UseQueryResult<AttentionItem[], Error> {
  return useAdapterQuery(qk.attention, (a) => a.analytics.attention());
}

export function useOpenTasks(): UseQueryResult<OpenTask[], Error> {
  return useAdapterQuery(qk.openTasks, (a) => a.analytics.openTasks());
}

export function useEventHealth(eventId: string): UseQueryResult<EventHealth | null, Error> {
  return useAdapterQuery(
    qk.health([eventId]),
    // `?? null` matters: react-query throws "Query data cannot be undefined" if the
    // event has been deleted between the list read and this one.
    async (a) => (await a.analytics.health([eventId]))[0] ?? null,
    { enabled: !!eventId },
  );
}

export function useAllEventHealth(): UseQueryResult<EventHealth[], Error> {
  return useAdapterQuery(qk.health(), (a) => a.analytics.health());
}

/* --------------------------------------------------------------------- events */

export function useEvents(filter?: EventFilter) {
  const { experience } = useAccountExperience();
  const scopedFilter = { ...filter, experience: filter?.experience ?? experience };
  return useAdapterQuery(qk.eventList(scopedFilter), (a) => a.events.list(scopedFilter));
}

export function useEvent(id: string): UseQueryResult<Event | null, Error> {
  return useAdapterQuery(qk.event(id), (a) => a.events.get(id), { enabled: !!id });
}

export function useEventByShareToken(token: string) {
  return useAdapterQuery(qk.eventByToken(token), (a) => a.events.getByShareToken(token), { enabled: !!token });
}

export function useCreateEvent() {
  const { experience } = useAccountExperience();
  return useAdapterMutation(
    (a, draft: EventDraft) => a.events.create({ ...draft, experience: draft.experience ?? experience }),
    () => [...eventDerivedKeys(), qk.locations],
  );
}

export function useUpdateEvent() {
  const adapter = useData();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: EventPatch }) => adapter.events.update(vars.id, vars.patch),
    onSuccess: (updated, vars) => {
      // Publish the returned event immediately so date and workspace changes do not
      // briefly render against stale data while the background refetch completes.
      queryClient.setQueryData(qk.event(vars.id), updated);
      for (const key of [...eventDerivedKeys(vars.id), qk.locations]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useDeleteEvent() {
  return useAdapterMutation(
    (a, vars: { id: string }) => a.events.remove(vars.id),
    () => [...eventDerivedKeys(), qk.locations, qk.registrations, qk.allTickets],
  );
}

export function useShareEvent() {
  return useAdapterMutation((a, vars: { id: string }) => a.events.share(vars.id), (vars) => [qk.event(vars.id)]);
}

export function useCreateEventFromTemplate() {
  const { experience } = useAccountExperience();
  return useAdapterMutation(
    (a, vars: { templateId: string; draft: EventDraft }) =>
      a.events.createFromTemplate(vars.templateId, { ...vars.draft, experience: vars.draft.experience ?? experience }),
    () => [...eventDerivedKeys(), qk.locations],
  );
}

export function useSaveEventAsTemplate() {
  return useAdapterMutation(
    (a, vars: { eventId: string; name: string; description?: string | null }) =>
      a.events.saveAsTemplate(vars.eventId, { name: vars.name, description: vars.description }),
    () => [qk.templates],
  );
}

export function useSendAssignmentSummaries() {
  return useAdapterMutation(
    (a, eventId: string): Promise<AssignmentSummaryResult> => a.events.sendAssignmentSummaries(eventId),
    () => [],
  );
}

/* ------------------------------------------------------------------ locations */

export function useLocations() {
  return useAdapterQuery(qk.locations, (a) => a.locations.list());
}

export function useLocation(id: string) {
  return useAdapterQuery(qk.location(id), (a) => a.locations.get(id), { enabled: !!id });
}

export function useCreateLocation() {
  return useAdapterMutation((a, draft: LocationDraft) => a.locations.create(draft), () => [qk.locations]);
}

export function useUpdateLocation() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: LocationPatch }) => a.locations.update(vars.id, vars.patch),
    (vars) => [qk.locations, qk.location(vars.id), qk.events],
  );
}

export function useDeleteLocation() {
  return useAdapterMutation((a, vars: { id: string }) => a.locations.remove(vars.id), () => [qk.locations]);
}

/* ------------------------------------------------------------------ guests */

export function useGuests() {
  return useAdapterQuery(qk.guests, (a) => a.guests.list());
}

export function useCreateGuest() {
  return useAdapterMutation((a, draft: GuestDraft) => a.guests.create(draft), () => [qk.guests, qk.portfolio]);
}

export function useUpdateGuest() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: GuestPatch }) => a.guests.update(vars.id, vars.patch),
    () => [qk.guests, qk.registrations],
  );
}

export function useDeleteGuest() {
  return useAdapterMutation(
    (a, vars: { id: string }) => a.guests.remove(vars.id),
    () => [qk.guests, qk.registrations, ...eventDerivedKeys()],
  );
}

/* -------------------------------------------------------------- registrations */

export function useRegistrations() {
  return useAdapterQuery(qk.registrations, (a) => a.registrations.list());
}

export function useEventRegistrations(eventId: string) {
  return useAdapterQuery(qk.eventRegistrations(eventId), (a) => a.registrations.listForEvent(eventId), {
    enabled: !!eventId,
  });
}

export function useCreateRegistration() {
  return useAdapterMutation(
    (a, draft: RegistrationDraft) => a.registrations.create(draft),
    (draft) => [qk.registrations, qk.eventRegistrations(draft.eventId), ...eventDerivedKeys(draft.eventId)],
  );
}

export function useImportGuestRegistrations() {
  return useAdapterMutation(
    (a, drafts: GuestRegistrationImportDraft[]) => a.registrations.importGuests(drafts),
    (drafts) => {
      const eventId = drafts[0]?.eventId;
      return eventId
        ? [qk.guests, qk.registrations, qk.eventRegistrations(eventId), ...eventDerivedKeys(eventId)]
        : [qk.guests, qk.registrations];
    },
  );
}

export function usePublicRegistration() {
  return useAdapterMutation(
    (a, vars: { shareToken: string; draft: PublicRegistrationDraft }) =>
      a.registrations.registerPublic(vars.shareToken, vars.draft),
    (vars) => [qk.eventByToken(vars.shareToken), qk.registrations],
  );
}

export function useRegisterWalkIn() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: WalkInRegistrationDraft }) =>
      a.registrations.createWalkIn(vars.eventId, vars.draft),
    (vars) => [qk.guests, qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateRegistrationDetails() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; patch: RegistrationDetailsPatch }) =>
      a.registrations.updateDetails(vars.id, vars.patch),
    (vars) => [qk.guests, qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useSetRegistrationStatus() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; status: RegistrationStatus }) =>
      a.registrations.setStatus(vars.id, vars.status),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useSetRegistrationSegment() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; segment: string | null }) =>
      a.registrations.setSegment(vars.id, vars.segment),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useSetRegistrationOrganization() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; organization: string | null }) =>
      a.registrations.setOrganization(vars.id, vars.organization),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useSetRegistrationCheckIn() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; patch: RegistrationCheckInPatch }) =>
      a.registrations.setCheckIn(vars.id, vars.patch),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useDeleteRegistration() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string }) => a.registrations.remove(vars.id),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* -------------------------------------------------------------------- vendors */

export function useVendors() {
  return useAdapterQuery(qk.vendors, (a) => a.vendors.list(), { refetchInterval: 15_000 });
}

export function useVendor(id: string) {
  return useAdapterQuery(qk.vendor(id), (a) => a.vendors.get(id), { enabled: !!id });
}

export function useCreateVendor() {
  return useAdapterMutation((a, draft: VendorDraft) => a.vendors.create(draft), () => [qk.vendors, qk.portfolio]);
}

export function useUpdateVendor() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: VendorPatch }) => a.vendors.update(vars.id, vars.patch),
    (vars) => [qk.vendors, qk.vendor(vars.id)],
  );
}

export function useDeleteVendor() {
  return useAdapterMutation((a, vars: { id: string }) => a.vendors.remove(vars.id), () => [qk.vendors, qk.portfolio]);
}

export function useVendorThread(vendorId: string) {
  return useAdapterQuery(qk.vendorThread(vendorId), (a) => a.vendorMessages.list(vendorId), { enabled: !!vendorId, refetchInterval: 15_000 });
}

export function usePublicVendorConversation(token: string) {
  return useAdapterQuery(["public-vendor-conversation", token], (a) => a.vendorMessages.getPublic(token), { enabled: !!token, refetchInterval: 15_000 });
}

export function useReplyToVendorConversation() {
  return useAdapterMutation(
    (a, vars: { token: string; content: string }) => a.vendorMessages.replyPublic(vars.token, vars.content),
    (vars) => [["public-vendor-conversation", vars.token]],
  );
}

export function useSendVendorMessage() {
  return useAdapterMutation(
    (a, vars: { vendorId: string; draft: VendorMessageDraft }) => a.vendorMessages.send(vars.vendorId, vars.draft),
    (vars) => [qk.vendorThread(vars.vendorId), qk.vendors, qk.vendor(vars.vendorId)],
  );
}

export function useMarkThreadRead() {
  return useAdapterMutation(
    (a, vars: { vendorId: string }) => a.vendorMessages.markThreadRead(vars.vendorId),
    (vars) => [qk.vendorThread(vars.vendorId), qk.vendors, qk.vendor(vars.vendorId)],
  );
}

/* ------------------------------------------------------------- event vendors */

export function useEventVendors(eventId: string) {
  return useAdapterQuery(qk.eventVendors(eventId), (a) => a.eventVendors.list(eventId), { enabled: !!eventId });
}

export function useAddEventVendor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: EventVendorDraft }) => a.eventVendors.create(vars.eventId, vars.draft),
    (vars) => [qk.eventVendors(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateEventVendor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: EventVendorPatch }) =>
      a.eventVendors.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.eventVendors(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveEventVendor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.eventVendors.remove(vars.eventId, vars.id),
    (vars) => [qk.eventVendors(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useSendVendorEventPacket() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: VendorEventPacketDraft }) => a.vendorEventPackets.send(vars.eventId, vars.draft),
    (vars) => [qk.eventVendors(vars.eventId), qk.history(vars.eventId), qk.vendors],
  );
}

/* ---------------------------------------------------------- check-in stations */

export function useCheckInStations(eventId: string) {
  return useAdapterQuery(qk.checkInStations(eventId), (a) => a.checkInStations.list(eventId), { enabled: !!eventId });
}

export function useAddCheckInStation() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: CheckInStationDraft }) => a.checkInStations.create(vars.eventId, vars.draft),
    (vars) => [qk.checkInStations(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useUpdateCheckInStation() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: CheckInStationPatch }) =>
      a.checkInStations.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.checkInStations(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useRemoveCheckInStation() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.checkInStations.remove(vars.eventId, vars.id),
    (vars) => [qk.checkInStations(vars.eventId), qk.history(vars.eventId)],
  );
}

/* ------------------------------------------------------------------ checklist */

export function useChecklist(eventId: string) {
  return useAdapterQuery(qk.checklist(eventId), (a) => a.checklist.list(eventId), { enabled: !!eventId });
}

export function useAddChecklistItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: ChecklistItemDraft }) => a.checklist.create(vars.eventId, vars.draft),
    (vars) => [qk.checklist(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateChecklistItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: ChecklistItemPatch }) =>
      a.checklist.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.checklist(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveChecklistItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.checklist.remove(vars.eventId, vars.id),
    (vars) => [qk.checklist(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* ----------------------------------------------------------------- run of show */

export function useRunOfShow(eventId: string) {
  return useAdapterQuery(qk.runOfShow(eventId), (a) => a.runOfShow.list(eventId), { enabled: !!eventId });
}

export function useAddRunOfShowItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: RunOfShowItemDraft }) => a.runOfShow.create(vars.eventId, vars.draft),
    (vars) => [qk.runOfShow(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useUpdateRunOfShowItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: RunOfShowItemPatch }) =>
      a.runOfShow.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.runOfShow(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useRemoveRunOfShowItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.runOfShow.remove(vars.eventId, vars.id),
    (vars) => [qk.runOfShow(vars.eventId), qk.history(vars.eventId)],
  );
}

/* ---------------------------------------------------------------- volunteers */

export function useVolunteerNeeds(eventId: string) {
  return useAdapterQuery(qk.volunteerNeeds(eventId), (a) => a.volunteerNeeds.list(eventId), {
    enabled: !!eventId,
    refetchInterval: 10_000,
  });
}

export function useAddVolunteerNeed() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: VolunteerNeedDraft }) => a.volunteerNeeds.create(vars.eventId, vars.draft),
    (vars) => [qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useUpdateVolunteerNeed() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: VolunteerNeedPatch }) =>
      a.volunteerNeeds.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useRemoveVolunteerNeed() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.volunteerNeeds.remove(vars.eventId, vars.id),
    (vars) => [qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

export function usePublicVolunteerSignup() {
  return useAdapterMutation(
    (a, vars: { shareToken: string; draft: PublicVolunteerSignupDraft }) =>
      a.volunteerNeeds.signupPublic(vars.shareToken, vars.draft),
    (vars) => [qk.eventByToken(vars.shareToken), ["volunteers"], ["volunteerNeeds"]],
  );
}

export function useVolunteers(eventId: string) {
  return useAdapterQuery(qk.volunteers(eventId), (a) => a.volunteers.list(eventId), {
    enabled: !!eventId,
    refetchInterval: 10_000,
  });
}

export function useAddVolunteer() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: VolunteerShiftDraft }) => a.volunteers.create(vars.eventId, vars.draft),
    (vars) => [qk.volunteers(vars.eventId), qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useUpdateVolunteer() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: VolunteerShiftPatch }) =>
      a.volunteers.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.volunteers(vars.eventId), qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useRemoveVolunteer() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.volunteers.remove(vars.eventId, vars.id),
    (vars) => [qk.volunteers(vars.eventId), qk.volunteerNeeds(vars.eventId), qk.history(vars.eventId)],
  );
}

/* --------------------------------------------------------------------- budget */

export function useBudget(eventId: string) {
  return useAdapterQuery(qk.budget(eventId), (a) => a.budget.list(eventId), { enabled: !!eventId });
}

export function useEventHistory(eventId: string) {
  return useAdapterQuery(qk.history(eventId), (a) => a.history.list(eventId), { enabled: !!eventId });
}

export function useTeamUpdates(eventId: string) {
  return useAdapterQuery(qk.teamUpdates(eventId), (a) => a.teamUpdates.list(eventId), {
    enabled: !!eventId,
    staleTime: 0,
    refetchInterval: 10_000,
  });
}

export function usePostTeamUpdate() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: TeamUpdateDraft }) => a.teamUpdates.create(vars.eventId, vars.draft),
    (vars) => [qk.teamUpdates(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useAddBudgetItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: BudgetItemDraft }) => a.budget.create(vars.eventId, vars.draft),
    (vars) => [qk.budget(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateBudgetItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: BudgetItemPatch }) =>
      a.budget.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.budget(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveBudgetItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.budget.remove(vars.eventId, vars.id),
    (vars) => [qk.budget(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* ----------------------------------------------------------------------- menu */

export function useMenu(eventId: string) {
  return useAdapterQuery(qk.menu(eventId), (a) => a.menu.list(eventId), { enabled: !!eventId });
}

export function useAddMenuItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: MenuItemDraft }) => a.menu.create(vars.eventId, vars.draft),
    (vars) => [qk.menu(vars.eventId)],
  );
}

export function useUpdateMenuItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: MenuItemPatch }) => a.menu.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.menu(vars.eventId)],
  );
}

export function useRemoveMenuItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.menu.remove(vars.eventId, vars.id),
    (vars) => [qk.menu(vars.eventId)],
  );
}

/* ----------------------------------------------------------------- mood board */

export function useMoodBoard(eventId: string) {
  return useAdapterQuery(qk.moodBoard(eventId), (a) => a.moodBoard.list(eventId), { enabled: !!eventId });
}

export function useAddMoodBoardImage() {
  return useAdapterMutation(
    (a, vars: { eventId: string; url: string; caption?: string | null }) =>
      a.moodBoard.create(vars.eventId, { url: vars.url, caption: vars.caption }),
    (vars) => [qk.moodBoard(vars.eventId)],
  );
}

export function useRemoveMoodBoardImage() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.moodBoard.remove(vars.eventId, vars.id),
    (vars) => [qk.moodBoard(vars.eventId)],
  );
}

/* -------------------------------------------------------------------- tickets */

export function useTickets(eventId: string) {
  return useAdapterQuery(qk.tickets(eventId), (a) => a.tickets.list(eventId), { enabled: !!eventId });
}

export function useAllTickets() {
  return useAdapterQuery(qk.allTickets, (a) => a.tickets.listAll());
}

export function useStripeConnectStatus() {
  return useAdapterQuery(qk.stripeConnect, (a) => a.billing.connectStatus());
}

export function useStartStripeConnect() {
  return useAdapterMutation(
    (a, returnTo: string | undefined) => a.billing.startConnectOnboarding(returnTo),
    () => [qk.stripeConnect],
  );
}

export function useTicketOrders(eventId: string) {
  return useAdapterQuery(qk.ticketOrders(eventId), (a) => a.tickets.listOrders(eventId), { enabled: !!eventId });
}

export function useRefundTicketOrder() {
  return useAdapterMutation(
    (a, vars: { eventId: string; orderId: string }) => a.tickets.refundOrder(vars.eventId, vars.orderId),
    (vars) => [qk.ticketOrders(vars.eventId), qk.tickets(vars.eventId), qk.allTickets, ...eventDerivedKeys(vars.eventId)],
  );
}

export function useTicketInvitations(eventId: string) {
  return useAdapterQuery(qk.ticketInvitations(eventId), (a) => a.tickets.listInvitations(eventId), { enabled: !!eventId });
}

export function useSendTicketInvitations() {
  return useAdapterMutation(
    (a, vars: { eventId: string; recipients: Array<{ name: string; email: string }>; consentConfirmed: boolean; testOnly?: boolean }) =>
      a.tickets.sendInvitations(vars.eventId, vars.recipients, { consentConfirmed: vars.consentConfirmed, testOnly: vars.testOnly }),
    (vars) => [qk.ticketInvitations(vars.eventId)],
  );
}

export function usePublicTicketOrderStatus(shareToken: string, orderId: string | null) {
  return useAdapterQuery(
    qk.publicTicketOrder(shareToken, orderId ?? "none"),
    (a) => orderId ? a.tickets.getPublicOrderStatus(shareToken, orderId) : Promise.resolve(null),
    { enabled: Boolean(shareToken && orderId), refetchInterval: 2_000 },
  );
}

export function useAddTicketType() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: TicketTypeDraft }) => a.tickets.create(vars.eventId, vars.draft),
    (vars) => [qk.tickets(vars.eventId), qk.allTickets, ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateTicketType() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: TicketTypePatch }) =>
      a.tickets.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.tickets(vars.eventId), qk.allTickets, ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveTicketType() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.tickets.remove(vars.eventId, vars.id),
    (vars) => [qk.tickets(vars.eventId), qk.allTickets, ...eventDerivedKeys(vars.eventId)],
  );
}

export function usePurchaseTickets() {
  return useAdapterMutation(
    (a, vars: { shareToken: string; ticketTypeId: string; name: string; contact: string; phone: string; grades: SchoolGrade[]; quantity: number; guestNames: string[]; donationAddOnCents: number; benefitsDeclined: boolean; autoChargeOptIn: boolean }) =>
      a.tickets.purchase(vars.shareToken, vars.ticketTypeId, {
        name: vars.name,
        contact: vars.contact,
        phone: vars.phone,
        grades: vars.grades,
        quantity: vars.quantity,
        guestNames: vars.guestNames,
        donationAddOnCents: vars.donationAddOnCents,
        benefitsDeclined: vars.benefitsDeclined,
        autoChargeOptIn: vars.autoChargeOptIn,
      }),
    // `["tickets"]` as a prefix, not `qk.allTickets`: the public page reads
    // `qk.tickets(eventId)`, so invalidating only the portfolio key left the buyer
    // looking at a stale "6 left" after their own purchase took it to 4.
    (vars) => [qk.eventByToken(vars.shareToken), ["tickets"], qk.registrations, qk.guests, ...eventDerivedKeys()],
  );
}

/* ---------------------------------------------------------------- fundraising */

export function useAuctionItems(eventId: string) {
  return useAdapterQuery(qk.auction(eventId), (a) => a.auction.list(eventId), { enabled: !!eventId });
}

export function useAuctionDonors(eventId: string) {
  return useAdapterQuery(qk.auctionDonors(eventId), (a) => a.auction.listDonors(eventId), { enabled: !!eventId });
}

export function useAuctionBidders(eventId: string) {
  return useAdapterQuery(qk.auctionBidders(eventId), (a) => a.auction.listBidders(eventId), { enabled: !!eventId, refetchInterval: 10_000 });
}

export function useAuctionBids(eventId: string) {
  return useAdapterQuery(qk.auctionBids(eventId), (a) => a.auction.listBids(eventId), { enabled: !!eventId, refetchInterval: 5_000 });
}

export function useAddAuctionDonor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: Parameters<DataAdapter["auction"]["createDonor"]>[1] }) =>
      a.auction.createDonor(vars.eventId, vars.draft),
    (vars) => [qk.auctionDonors(vars.eventId)],
  );
}

export function useUpdateAuctionDonor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; donorId: string; patch: Parameters<DataAdapter["auction"]["updateDonor"]>[2] }) =>
      a.auction.updateDonor(vars.eventId, vars.donorId, vars.patch),
    (vars) => [qk.auctionDonors(vars.eventId)],
  );
}

export function useRemoveAuctionDonor() {
  return useAdapterMutation(
    (a, vars: { eventId: string; donorId: string }) => a.auction.removeDonor(vars.eventId, vars.donorId),
    (vars) => [qk.auctionDonors(vars.eventId), qk.auction(vars.eventId)],
  );
}

export function useSendAuctionDonorThankYou() {
  return useAdapterMutation(
    (a, vars: { eventId: string; donorId: string }) => a.auction.sendDonorThankYou(vars.eventId, vars.donorId),
    (vars) => [qk.auctionDonors(vars.eventId)],
  );
}

export function useShareAuction() {
  return useAdapterMutation(
    (a, eventId: string) => a.auction.share(eventId),
    (eventId) => [qk.event(eventId), qk.auction(eventId)],
  );
}

export function useUpdateAuctionSettings() {
  return useAdapterMutation(
    (a, vars: { eventId: string; settings: Parameters<DataAdapter["auction"]["updateSettings"]>[1] }) =>
      a.auction.updateSettings(vars.eventId, vars.settings),
    (vars) => [qk.event(vars.eventId), qk.auction(vars.eventId)],
  );
}

export function usePublishAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string; published: boolean }) =>
      a.auction.publishItem(vars.eventId, vars.itemId, vars.published),
    (vars) => [qk.auction(vars.eventId), qk.publicAuction(vars.eventId)],
  );
}

export function useUploadAuctionImage() {
  return useAdapterMutation(
    (a, file: File) => a.auction.uploadImage(file),
    () => [],
  );
}

export function useCloseAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string }) => a.auction.closeItem(vars.eventId, vars.itemId),
    (vars) => [qk.auction(vars.eventId), qk.auctionOrders(vars.eventId), qk.auctionBids(vars.eventId)],
  );
}

export function useOfferAuctionSecondChance() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string }) => a.auction.offerSecondChance(vars.eventId, vars.itemId),
    (vars) => [qk.auction(vars.eventId), qk.auctionOrders(vars.eventId), qk.auctionBids(vars.eventId)],
  );
}

export function useAuctionOrders(eventId: string) {
  return useAdapterQuery(qk.auctionOrders(eventId), (a) => a.auction.listOrders(eventId), { enabled: !!eventId, refetchInterval: 10_000 });
}

export function useRefundAuctionOrder() {
  return useAdapterMutation(
    (a, vars: { eventId: string; orderId: string }) => a.auction.refundOrder(vars.eventId, vars.orderId),
    (vars) => [qk.auctionOrders(vars.eventId), qk.auction(vars.eventId)],
  );
}

export function usePublicAuction(token: string) {
  return useAdapterQuery(qk.publicAuction(token), (a) => a.auction.getPublic(token), { enabled: !!token, refetchInterval: 5_000 });
}

export function useRegisterAuctionBidder() {
  return useAdapterMutation(
    (a, vars: { token: string; draft: Parameters<DataAdapter["auction"]["registerPublic"]>[1] }) =>
      a.auction.registerPublic(vars.token, vars.draft),
    (vars) => [qk.publicAuction(vars.token)],
  );
}

export function usePlaceAuctionBid() {
  return useAdapterMutation(
    (a, vars: { token: string; bidderToken: string; itemId: string; maximumAmountCents: number }) =>
      a.auction.placePublicBid(vars.token, vars.bidderToken, vars.itemId, vars.maximumAmountCents),
    (vars) => [qk.publicAuction(vars.token)],
  );
}

export function usePublicAuctionDonor(token: string) {
  return useAdapterQuery(qk.publicAuctionDonor(token), (a) => a.auction.getPublicDonor(token), { enabled: !!token });
}

export function useUploadPublicAuctionDonorImage() {
  return useAdapterMutation(
    (a, vars: { token: string; file: File }) => a.auction.uploadPublicDonorImage(vars.token, vars.file),
    () => [],
  );
}

export function useSubmitPublicAuctionDonation() {
  return useAdapterMutation(
    (a, vars: { token: string; draft: Parameters<DataAdapter["auction"]["submitPublicDonation"]>[1] }) =>
      a.auction.submitPublicDonation(vars.token, vars.draft),
    (vars) => [qk.publicAuctionDonor(vars.token)],
  );
}

export function useFundraisingOrganizationProfile() {
  return useAdapterQuery(qk.fundraisingProfile, (a) => a.fundraising.getProfile());
}

export function useUpdateFundraisingOrganizationProfile() {
  return useAdapterMutation((a, profile: Parameters<DataAdapter["fundraising"]["updateProfile"]>[0]) => a.fundraising.updateProfile(profile), () => [qk.fundraisingProfile]);
}

export function useAuctionCategories() {
  return useAdapterQuery(qk.auctionCategories, (a) => a.fundraising.listCategories());
}

export function useCreateAuctionCategory() {
  return useAdapterMutation((a, name: string) => a.fundraising.createCategory(name), () => [qk.auctionCategories]);
}

export function useItemSubmissions(eventId: string) {
  return useAdapterQuery(qk.itemSubmissions(eventId), (a) => a.fundraising.listSubmissions(eventId), { enabled: !!eventId, refetchInterval: 10_000 });
}

export function useUpdateItemSubmission() {
  return useAdapterMutation(
    (a, vars: { eventId: string; submissionId: string; patch: Parameters<DataAdapter["fundraising"]["updateSubmission"]>[2] }) => a.fundraising.updateSubmission(vars.eventId, vars.submissionId, vars.patch),
    (vars) => [qk.itemSubmissions(vars.eventId), qk.auction(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function useFundraisingDashboard(eventId: string) {
  return useAdapterQuery(qk.fundraisingDashboard(eventId), (a) => a.fundraising.dashboard(eventId), { enabled: !!eventId, refetchInterval: 10_000 });
}

export function useExtendAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string; minutes: number; notify?: boolean }) => a.fundraising.extendItem(vars.eventId, vars.itemId, vars.minutes, vars.notify),
    (vars) => [qk.auction(vars.eventId), qk.publicAuction(vars.eventId)],
  );
}

export function useExtendAuctionItems() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemIds: string[]; minutes: number; notify?: boolean }) => a.fundraising.extendItems(vars.eventId, vars.itemIds, vars.minutes, vars.notify),
    (vars) => [qk.auction(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function useReopenAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string; minutes: number }) => a.fundraising.reopenItem(vars.eventId, vars.itemId, vars.minutes),
    (vars) => [qk.auction(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function usePublicItemIntake(token: string) {
  const priorDonorToken = new URLSearchParams(window.location.search).get("prior");
  return useAdapterQuery([...qk.publicItemIntake(token), priorDonorToken ?? "new"], (a) => a.fundraising.getPublicIntake(token, priorDonorToken), { enabled: !!token });
}

export function useSubmitPublicItem() {
  return useAdapterMutation(
    (a, vars: { token: string; draft: Parameters<DataAdapter["fundraising"]["submitPublicItem"]>[1] }) => a.fundraising.submitPublicItem(vars.token, vars.draft),
    (vars) => [qk.publicItemIntake(vars.token)],
  );
}

export function useUploadPublicItemImage() {
  return useAdapterMutation(
    (a, vars: { token: string; file: File }) => a.fundraising.uploadPublicItemImage(vars.token, vars.file),
    () => [],
  );
}

export function useReinvitePastItemDonors() {
  return useAdapterMutation(
    (a, eventId: string) => a.fundraising.reinvitePastDonors(eventId),
    () => [],
  );
}

export function useMergeAuctionItems() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemIds: string[]; title: string }) => a.fundraising.mergeItems(vars.eventId, vars.itemIds, vars.title),
    (vars) => [qk.itemSubmissions(vars.eventId), qk.auction(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function usePublicBidderProfile(token: string, bidderToken: string | null) {
  return useAdapterQuery(
    qk.publicBidderProfile(token, bidderToken ?? "none"),
    (a) => bidderToken ? a.auction.getBidderProfile(token, bidderToken) : Promise.resolve(null),
    { enabled: Boolean(token && bidderToken), refetchInterval: 5_000 },
  );
}

export function useSetupBidderWallet() {
  return useAdapterMutation(
    (a, vars: { token: string; bidderToken: string }) => a.auction.setupBidderWallet(vars.token, vars.bidderToken),
    (vars) => [qk.publicBidderProfile(vars.token, vars.bidderToken)],
  );
}

export function useSetAuctionWatch() {
  return useAdapterMutation(
    (a, vars: { token: string; bidderToken: string; itemId: string; watched: boolean }) => a.auction.setWatch(vars.token, vars.bidderToken, vars.itemId, vars.watched),
    (vars) => [qk.publicBidderProfile(vars.token, vars.bidderToken), qk.publicAuction(vars.token)],
  );
}

export function useCreateFundraisingPledge() {
  return useAdapterMutation(
    (a, vars: { token: string; bidderToken: string; amountCents: number; channel: "in_room" | "remote" }) => a.auction.createPledge(vars.token, vars.bidderToken, vars.amountCents, vars.channel),
    (vars) => [qk.publicBidderProfile(vars.token, vars.bidderToken)],
  );
}

export function useBuyNowAuctionItem() {
  return useAdapterMutation(
    (a, vars: { token: string; bidderToken: string; itemId: string }) => a.auction.buyNow(vars.token, vars.bidderToken, vars.itemId),
    (vars) => [qk.publicAuction(vars.token), qk.publicBidderProfile(vars.token, vars.bidderToken)],
  );
}

export function useBuildBidderBills() {
  return useAdapterMutation(
    (a, eventId: string) => a.fundraising.buildBills(eventId),
    (eventId) => [qk.fundraisingDashboard(eventId), qk.auctionOrders(eventId)],
  );
}

export function useSendBidderBills() {
  return useAdapterMutation(
    (a, eventId: string) => a.fundraising.sendBills(eventId),
    (eventId) => [qk.fundraisingDashboard(eventId), qk.auctionOrders(eventId)],
  );
}

export function useRefundBidderBill() {
  return useAdapterMutation(
    (a, vars: { eventId: string; billId: string }) => a.fundraising.refundBill(vars.eventId, vars.billId),
    (vars) => [qk.fundraisingDashboard(vars.eventId), qk.fundraisingReports(vars.eventId)],
  );
}

export function usePublicBidderBill(token: string) {
  return useAdapterQuery(qk.publicBidderBill(token), (a) => a.fundraising.getPublicBill(token), { enabled: !!token, refetchInterval: 3_000 });
}

export function usePayPublicBidderBill() {
  return useAdapterMutation(
    (a, vars: { token: string; coverFees: boolean }) => a.fundraising.payPublicBill(vars.token, vars.coverFees),
    (vars) => [qk.publicBidderBill(vars.token)],
  );
}

export function usePublicFundraisingReceipt(token: string) {
  return useAdapterQuery(qk.publicFundraisingReceipt(token), (a) => a.fundraising.getPublicReceipt(token), { enabled: !!token });
}

export function useDonationCampaigns(eventId?: string) {
  return useAdapterQuery(qk.donationCampaigns(eventId), (a) => a.fundraising.listCampaigns(eventId));
}

export function useCreateDonationCampaign() {
  return useAdapterMutation(
    (a, draft: Parameters<DataAdapter["fundraising"]["createCampaign"]>[0]) => a.fundraising.createCampaign(draft),
    (draft) => [qk.donationCampaigns(draft.eventId ?? undefined)],
  );
}

export function usePublicDonationCampaign(token: string) {
  return useAdapterQuery(qk.publicDonationCampaign(token), (a) => a.fundraising.getPublicCampaign(token), { enabled: !!token, refetchInterval: 10_000 });
}

export function useCreateDonationCheckout() {
  return useAdapterMutation(
    (a, vars: { token: string; draft: Parameters<DataAdapter["fundraising"]["createDonationCheckout"]>[1] }) => a.fundraising.createDonationCheckout(vars.token, vars.draft),
    (vars) => [qk.publicDonationCampaign(vars.token)],
  );
}

export function usePublicDonationStatus(token: string, donationId: string | null) {
  return useAdapterQuery<PublicDonationStatus | null>(
    qk.publicDonationStatus(token, donationId),
    (a) => a.fundraising.getDonationStatus(token, donationId!),
    { enabled: !!token && !!donationId, refetchInterval: 2_000 },
  );
}

export function usePublicExperienceCertificate(token: string) {
  return useAdapterQuery(qk.publicCertificate(token), (a) => a.fundraising.getPublicCertificate(token), { enabled: !!token });
}

export function usePreviewFundraisingBroadcast() {
  return useAdapterMutation(
    (a, vars: { eventId: string; audience: import("./entities").FundraisingBroadcastAudience; itemIds: string[] }) => a.fundraising.previewBroadcast(vars.eventId, { audience: vars.audience, itemIds: vars.itemIds }),
    () => [],
  );
}

export function useSendFundraisingBroadcast() {
  return useAdapterMutation(
    (a, vars: { eventId: string; audience: import("./entities").FundraisingBroadcastAudience; itemIds: string[]; channels: string[]; message: string }) => a.fundraising.sendBroadcast(vars.eventId, { audience: vars.audience, itemIds: vars.itemIds, channels: vars.channels, message: vars.message }),
    (vars) => [qk.fundraisingDashboard(vars.eventId)],
  );
}

export function useRecordLiveAuctionSale() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string; paddleNumbers: number[]; amountCents: number }) => a.fundraising.recordLiveSale(vars.eventId, vars.itemId, vars.paddleNumbers, vars.amountCents),
    (vars) => [qk.auction(vars.eventId), qk.auctionOrders(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function useUndoLiveAuctionSale() {
  return useAdapterMutation(
    (a, vars: { eventId: string; itemId: string }) => a.fundraising.undoLiveSale(vars.eventId, vars.itemId),
    (vars) => [qk.auction(vars.eventId), qk.auctionOrders(vars.eventId), qk.fundraisingDashboard(vars.eventId)],
  );
}

export function useFundraisingReports(eventId: string) {
  return useAdapterQuery(qk.fundraisingReports(eventId), (a) => a.fundraising.reports(eventId), { enabled: !!eventId, refetchInterval: 15_000 });
}

export function useSendYearEndStatements() {
  return useAdapterMutation(
    (a, taxYear: number) => a.fundraising.sendYearEndStatements(taxYear),
    () => [],
  );
}

export function useAddAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: AuctionItemDraft }) => a.auction.create(vars.eventId, vars.draft),
    (vars) => [qk.auction(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: AuctionItemPatch }) =>
      a.auction.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.auction(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveAuctionItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.auction.remove(vars.eventId, vars.id),
    (vars) => [qk.auction(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRaffleItems(eventId: string) {
  return useAdapterQuery(qk.raffle(eventId), (a) => a.raffle.list(eventId), { enabled: !!eventId });
}

export function useAddRaffleItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: RaffleItemDraft }) => a.raffle.create(vars.eventId, vars.draft),
    (vars) => [qk.raffle(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateRaffleItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: RaffleItemPatch }) =>
      a.raffle.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.raffle(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveRaffleItem() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.raffle.remove(vars.eventId, vars.id),
    (vars) => [qk.raffle(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRaffleTickets(eventId: string, raffleItemId: string) {
  return useAdapterQuery(
    qk.raffleTickets(eventId, raffleItemId),
    (a) => a.raffle.listTickets(eventId, raffleItemId),
    { enabled: !!eventId && !!raffleItemId },
  );
}

export function useSellRaffleTickets() {
  return useAdapterMutation(
    (a, vars: { eventId: string; raffleItemId: string; buyerName: string; buyerEmail: string; quantity: number }) =>
      a.raffle.sellTickets(vars.eventId, vars.raffleItemId, {
        buyerName: vars.buyerName,
        buyerEmail: vars.buyerEmail,
        quantity: vars.quantity,
      }),
    (vars) => [
      qk.raffle(vars.eventId),
      qk.raffleTickets(vars.eventId, vars.raffleItemId),
      ...eventDerivedKeys(vars.eventId),
    ],
  );
}

export function useDrawRaffle() {
  return useAdapterMutation(
    (a, vars: { eventId: string; raffleItemId: string }) => a.raffle.draw(vars.eventId, vars.raffleItemId),
    (vars) => [qk.raffle(vars.eventId), qk.raffleTickets(vars.eventId, vars.raffleItemId)],
  );
}

export function useSponsorships(eventId: string) {
  return useAdapterQuery(qk.sponsorships(eventId), (a) => a.sponsorships.list(eventId), { enabled: !!eventId });
}

export function useAddSponsorship() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: SponsorshipDraft }) => a.sponsorships.create(vars.eventId, vars.draft),
    (vars) => [qk.sponsorships(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateSponsorship() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: SponsorshipPatch }) =>
      a.sponsorships.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.sponsorships(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveSponsorship() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.sponsorships.remove(vars.eventId, vars.id),
    (vars) => [qk.sponsorships(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* ---------------------------------------------------------------------- rfps */

export function useRfps(eventId: string) {
  return useAdapterQuery(qk.rfps(eventId), (a) => a.rfps.list(eventId), { enabled: !!eventId, refetchInterval: 15_000 });
}

export function useAddRfp() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: RfpDraft }) => a.rfps.create(vars.eventId, vars.draft),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useUpdateRfp() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: RfpPatch }) => a.rfps.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useRemoveRfp() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.rfps.remove(vars.eventId, vars.id),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useAddRfpResponse() {
  return useAdapterMutation(
    (a, vars: { eventId: string; rfpId: string; draft: RfpResponseDraft }) =>
      a.rfps.addResponse(vars.eventId, vars.rfpId, vars.draft),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useSetRfpResponseStatus() {
  return useAdapterMutation(
    (a, vars: { eventId: string; rfpId: string; responseId: string; status: RfpResponseStatus }) =>
      a.rfps.setResponseStatus(vars.eventId, vars.rfpId, vars.responseId, vars.status),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useRemoveRfpResponse() {
  return useAdapterMutation(
    (a, vars: { eventId: string; rfpId: string; responseId: string }) =>
      a.rfps.removeResponse(vars.eventId, vars.rfpId, vars.responseId),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function useInviteVendorToRfp() {
  return useAdapterMutation(
    (a, vars: { eventId: string; rfpId: string; vendorId: string }) =>
      a.rfps.inviteVendor(vars.eventId, vars.rfpId, vars.vendorId),
    (vars) => [qk.rfps(vars.eventId)],
  );
}

export function usePublicRfp(token: string) {
  return useAdapterQuery(qk.publicRfp(token), (a) => a.rfps.getPublic(token), { enabled: !!token });
}

export function useSubmitPublicRfp() {
  return useAdapterMutation(
    (a, vars: { token: string; draft: RfpResponseDraft }) => a.rfps.respondPublic(vars.token, vars.draft),
    (vars) => [qk.publicRfp(vars.token)],
  );
}

/* ------------------------------------------------------------------ deposits */

export function useDeposits(eventId: string) {
  return useAdapterQuery(qk.deposits(eventId), (a) => a.deposits.list(eventId), { enabled: !!eventId });
}

export function useAddDeposit() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: DepositDraft }) => a.deposits.create(vars.eventId, vars.draft),
    (vars) => [qk.deposits(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateDeposit() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: DepositPatch }) =>
      a.deposits.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.deposits(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveDeposit() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.deposits.remove(vars.eventId, vars.id),
    (vars) => [qk.deposits(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useVendorPaymentPlans(eventId: string) {
  return useAdapterQuery(
    qk.vendorPaymentPlans(eventId),
    (a) => a.vendorPaymentPlans.list(eventId),
    { enabled: !!eventId },
  );
}

export function useAddVendorPaymentPlan() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: VendorPaymentPlanDraft }) =>
      a.vendorPaymentPlans.create(vars.eventId, vars.draft),
    (vars) => [qk.vendorPaymentPlans(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useUpdateVendorPaymentPlan() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: VendorPaymentPlanPatch }) =>
      a.vendorPaymentPlans.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.vendorPaymentPlans(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

export function useRemoveVendorPaymentPlan() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.vendorPaymentPlans.remove(vars.eventId, vars.id),
    (vars) => [qk.vendorPaymentPlans(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* ---------------------------------------------------------------- team hours */

export function useTeamHours(eventId: string) {
  return useAdapterQuery(qk.teamHours(eventId), (a) => a.teamHours.list(eventId), { enabled: !!eventId });
}

export function useAddTeamHours() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: TeamHoursDraft }) => a.teamHours.create(vars.eventId, vars.draft),
    (vars) => [qk.teamHours(vars.eventId)],
  );
}

export function useUpdateTeamHours() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string; patch: TeamHoursPatch }) =>
      a.teamHours.update(vars.eventId, vars.id, vars.patch),
    (vars) => [qk.teamHours(vars.eventId)],
  );
}

export function useRemoveTeamHours() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.teamHours.remove(vars.eventId, vars.id),
    (vars) => [qk.teamHours(vars.eventId)],
  );
}

/* ------------------------------------------------------------------ templates */

export function useTemplates() {
  return useAdapterQuery(qk.templates, (a) => a.templates.list());
}

export function useTemplate(id: string) {
  return useAdapterQuery(qk.template(id), (a) => a.templates.get(id), { enabled: !!id });
}

export function useCreateTemplate() {
  return useAdapterMutation((a, draft: TemplateDraft) => a.templates.create(draft), () => [qk.templates]);
}

export function useUpdateTemplate() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: Partial<TemplateDraft> }) => a.templates.update(vars.id, vars.patch),
    (vars) => [qk.templates, qk.template(vars.id)],
  );
}

export function useReplaceTemplateContents() {
  return useAdapterMutation(
    (a, vars: { id: string; contents: TemplateContents }) => a.templates.replaceContents(vars.id, vars.contents),
    (vars) => [qk.templates, qk.template(vars.id)],
  );
}

export function useDeleteTemplate() {
  return useAdapterMutation((a, vars: { id: string }) => a.templates.remove(vars.id), () => [qk.templates]);
}

/* -------------------------------------------------------------------- boards */

export function useCanvases(): UseQueryResult<Canvas[], Error> {
  return useAdapterQuery(qk.canvases, (a) => a.canvases.list());
}

export function useCanvas(id: string): UseQueryResult<Canvas | null, Error> {
  return useAdapterQuery(qk.canvas(id), (a) => a.canvases.get(id), { enabled: !!id });
}

export function useCreateCanvas() {
  return useAdapterMutation((a, draft: CanvasDraft) => a.canvases.create(draft), () => [qk.canvases]);
}

export function useUpdateCanvas() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: CanvasPatch }) => a.canvases.update(vars.id, vars.patch),
    (vars) => [qk.canvases, qk.canvas(vars.id)],
  );
}

export function useReplaceCanvasCards() {
  return useAdapterMutation(
    (a, vars: { id: string; cards: CanvasCard[] }) => a.canvases.replaceCards(vars.id, vars.cards),
    (vars) => [qk.canvases, qk.canvas(vars.id)],
  );
}

export function useDeleteCanvas() {
  return useAdapterMutation((a, vars: { id: string }) => a.canvases.remove(vars.id), () => [qk.canvases]);
}

/* ------------------------------------------------------------ settings & roi */

export function useSettings() {
  return useAdapterQuery(qk.settings, (a) => a.settings.get(), { staleTime: Number.POSITIVE_INFINITY });
}

export function useUpdateSettings() {
  return useAdapterMutation((a, patch: Partial<UserSettings>) => a.settings.update(patch), () => [qk.settings]);
}

export function useMembers() {
  return useAdapterQuery(qk.members, (a) => a.members.list());
}

export function useInviteMember() {
  return useAdapterMutation(
    (a, vars: { email: string; role: WorkspaceRole; eventId?: string | null }) =>
      a.members.invite(vars.email, vars.role, vars.eventId),
    () => [qk.members],
  );
}

export function useRevokeInvite() {
  return useAdapterMutation((a, vars: { email: string }) => a.members.revokeInvite(vars.email), () => [qk.members]);
}

export function useSetMemberRole() {
  return useAdapterMutation(
    (a, vars: { userId: string; role: WorkspaceRole }) => a.members.setRole(vars.userId, vars.role),
    () => [qk.members],
  );
}

export function useRemoveMember() {
  return useAdapterMutation((a, vars: { userId: string }) => a.members.remove(vars.userId), () => [qk.members]);
}

export function useFeedback(userId: string) {
  return useAdapterQuery(qk.feedback(userId), (a) => a.feedback.list());
}

export function useSubmitFeedback(userId: string) {
  return useAdapterMutation(
    (a, draft: ProductFeedbackDraft) => a.feedback.create(draft),
    () => [qk.feedback(userId)],
  );
}

export function useFeedbackInbox(userId: string, enabled: boolean) {
  return useAdapterQuery(qk.feedbackInbox(userId), (a) => a.feedback.listInbox(), { enabled });
}

export function useNotifyFeedback() {
  return useAdapterMutation((a, id: string) => a.feedback.notify(id), () => []);
}

export function useFloorplans(eventId: string): UseQueryResult<Floorplan[], Error> {
  return useAdapterQuery(qk.floorplan(eventId), (a) => a.floorplan.list(eventId), { enabled: !!eventId });
}

export function useCreateFloorplan() {
  return useAdapterMutation(
    (a, vars: { eventId: string; draft: FloorplanDraft }) => a.floorplan.create(vars.eventId, vars.draft),
    (vars) => [qk.floorplan(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useSaveFloorplan() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string; draft: FloorplanDraft }) => a.floorplan.save(vars.id, vars.draft),
    (vars) => [qk.floorplan(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useShareFloorplan() {
  return useAdapterMutation(
    (a, vars: { eventId: string; id: string }) => a.floorplan.share(vars.eventId, vars.id),
    () => [],
  );
}

export function usePublicFloorplan(token: string): UseQueryResult<PublicFloorplanPayload | null, Error> {
  return useAdapterQuery(qk.publicFloorplan(token), (a) => a.floorplan.getPublic(token), { enabled: !!token });
}

export function useDeleteFloorplan() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string }) => a.floorplan.remove(vars.id),
    (vars) => [qk.floorplan(vars.eventId), qk.history(vars.eventId)],
  );
}

export function useEventRoi(eventId: string): UseQueryResult<EventRoi | null, Error> {
  return useAdapterQuery(qk.roi(eventId), (a) => a.roi.get(eventId), { enabled: !!eventId });
}

export function useSaveEventRoi() {
  return useAdapterMutation(
    (a, vars: { eventId: string; roi: Omit<EventRoi, "eventId" | "updatedAt"> }) =>
      a.roi.save(vars.eventId, vars.roi),
    (vars) => [qk.roi(vars.eventId)],
  );
}
