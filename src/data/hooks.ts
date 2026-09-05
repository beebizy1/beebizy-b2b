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
  Event,
  EventDraft,
  EventFilter,
  EventHealth,
  EventPatch,
  EventRoi,
  EventVendorDraft,
  EventVendorPatch,
  Floorplan,
  OpenTask,
  FloorplanDraft,
  LocationDraft,
  LocationPatch,
  MenuItemDraft,
  MenuItemPatch,
  RaffleItemDraft,
  RaffleItemPatch,
  RegistrationDraft,
  RegistrationStatus,
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
  TeamHoursDraft,
  TeamHoursPatch,
  TemplateContents,
  TemplateDraft,
  TicketTypeDraft,
  TicketTypePatch,
  UserSettings,
  VendorDraft,
  VendorMessageDraft,
  VendorPatch,
} from "./entities";
import type { PlanningBrief } from "./planner";
import type { AssistantChatMessage } from "./assistantChat";

/* ---------------------------------------------------------------- query keys */

export const qk = {
  me: ["me"] as const,
  portfolio: ["analytics", "portfolio"] as const,
  attention: ["analytics", "attention"] as const,
  openTasks: ["analytics", "openTasks"] as const,
  health: (eventIds?: string[]) => ["analytics", "health", eventIds ?? "all"] as const,

  events: ["events"] as const,
  eventList: (filter?: EventFilter) => ["events", "list", filter ?? {}] as const,
  event: (id: string) => ["events", "detail", id] as const,
  eventByToken: (token: string) => ["events", "byToken", token] as const,

  locations: ["locations"] as const,
  location: (id: string) => ["locations", "detail", id] as const,

  guests: ["guests"] as const,

  registrations: ["registrations"] as const,
  eventRegistrations: (eventId: string) => ["registrations", "byEvent", eventId] as const,

  vendors: ["vendors"] as const,
  vendor: (id: string) => ["vendors", "detail", id] as const,
  vendorThread: (vendorId: string) => ["vendors", "thread", vendorId] as const,

  eventVendors: (eventId: string) => ["eventVendors", eventId] as const,
  checklist: (eventId: string) => ["checklist", eventId] as const,
  runOfShow: (eventId: string) => ["runOfShow", eventId] as const,
  budget: (eventId: string) => ["budget", eventId] as const,
  menu: (eventId: string) => ["menu", eventId] as const,
  moodBoard: (eventId: string) => ["moodBoard", eventId] as const,

  tickets: (eventId: string) => ["tickets", eventId] as const,
  allTickets: ["tickets", "all"] as const,

  auction: (eventId: string) => ["auction", eventId] as const,
  raffle: (eventId: string) => ["raffle", eventId] as const,
  raffleTickets: (eventId: string, raffleItemId: string) => ["raffle", eventId, raffleItemId, "tickets"] as const,
  sponsorships: (eventId: string) => ["sponsorships", eventId] as const,
  rfps: (eventId: string) => ["rfps", eventId] as const,
  deposits: (eventId: string) => ["deposits", eventId] as const,
  teamHours: (eventId: string) => ["teamHours", eventId] as const,

  templates: ["templates"] as const,
  template: (id: string) => ["templates", "detail", id] as const,

  canvases: ["canvases"] as const,
  canvas: (id: string) => ["canvases", "detail", id] as const,

  settings: ["settings"] as const,
  floorplan: (eventId: string) => ["floorplan", eventId] as const,
  history: (eventId: string) => ["history", eventId] as const,
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
  options?: { enabled?: boolean; staleTime?: number },
): UseQueryResult<T, Error> {
  const adapter = useData();
  return useQuery({
    queryKey: key,
    queryFn: () => select(adapter),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 15_000,
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
export function useMe() {
  return useAdapterQuery(qk.me, (a) => a.me(), { staleTime: 60_000 });
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

export function useLoadGoogleSheet() {
  return useAdapterMutation((a, url: string) => a.imports.loadGoogleSheet(url), () => []);
}

/* ------------------------------------------------------------------ analytics */

export function usePortfolio() {
  return useAdapterQuery(qk.portfolio, (a) => a.analytics.portfolio());
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
  return useAdapterQuery(qk.eventList(filter), (a) => a.events.list(filter));
}

export function useEvent(id: string): UseQueryResult<Event | null, Error> {
  return useAdapterQuery(qk.event(id), (a) => a.events.get(id), { enabled: !!id });
}

export function useEventByShareToken(token: string) {
  return useAdapterQuery(qk.eventByToken(token), (a) => a.events.getByShareToken(token), { enabled: !!token });
}

export function useCreateEvent() {
  return useAdapterMutation((a, draft: EventDraft) => a.events.create(draft), () => [...eventDerivedKeys(), qk.locations]);
}

export function useUpdateEvent() {
  return useAdapterMutation(
    (a, vars: { id: string; patch: EventPatch }) => a.events.update(vars.id, vars.patch),
    (vars) => [...eventDerivedKeys(vars.id), qk.locations],
  );
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
  return useAdapterMutation(
    (a, vars: { templateId: string; draft: EventDraft }) => a.events.createFromTemplate(vars.templateId, vars.draft),
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

export function useDeleteRegistration() {
  return useAdapterMutation(
    (a, vars: { id: string; eventId: string }) => a.registrations.remove(vars.id),
    (vars) => [qk.registrations, qk.eventRegistrations(vars.eventId), ...eventDerivedKeys(vars.eventId)],
  );
}

/* -------------------------------------------------------------------- vendors */

export function useVendors() {
  return useAdapterQuery(qk.vendors, (a) => a.vendors.list());
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
  return useAdapterQuery(qk.vendorThread(vendorId), (a) => a.vendorMessages.list(vendorId), { enabled: !!vendorId });
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

/* --------------------------------------------------------------------- budget */

export function useBudget(eventId: string) {
  return useAdapterQuery(qk.budget(eventId), (a) => a.budget.list(eventId), { enabled: !!eventId });
}

export function useEventHistory(eventId: string) {
  return useAdapterQuery(qk.history(eventId), (a) => a.history.list(eventId), { enabled: !!eventId });
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
    (a, vars: { shareToken: string; ticketTypeId: string; name: string; contact: string; quantity: number }) =>
      a.tickets.purchase(vars.shareToken, vars.ticketTypeId, {
        name: vars.name,
        contact: vars.contact,
        quantity: vars.quantity,
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
  return useAdapterQuery(qk.rfps(eventId), (a) => a.rfps.list(eventId), { enabled: !!eventId });
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
