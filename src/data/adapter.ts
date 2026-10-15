/**
 * The single seam between the UI and storage.
 *
 * Two implementations exist:
 *   - `memory`   — in-process store seeded with a realistic portfolio. Runs with no
 *                  credentials, which is what makes the app demoable and testable.
 *   - `postgres` — the real backend: this interface over HTTP to the API, which resolves
 *                  the caller's workspace and queries Neon (see `./http/adapter`).
 *
 * Both satisfy this interface, so no screen knows or cares which one is live. Every
 * method is a plain promise — react-query owns caching, retries and invalidation on
 * top (see `./hooks`).
 */

import type {
  Guest,
  GuestDraft,
  GuestPatch,
  AttentionItem,
  AuctionItem,
  AuctionItemDraft,
  AuctionItemPatch,
  AuctionDonor,
  AuctionDonorDraft,
  AuctionBidder,
  AuctionBid,
  AuctionOrder,
  AuctionPageSettings,
  PublicAuctionPayload,
  PublicAuctionBidResult,
  PublicAuctionDonorPayload,
  PublicBidderProfile,
  FundraisingPledge,
  BudgetItem,
  BudgetItemDraft,
  BudgetItemPatch,
  Canvas,
  CanvasCard,
  CanvasDraft,
  CanvasPatch,
  ChecklistItem,
  ChecklistItemDraft,
  ChecklistItemPatch,
  CheckInStation,
  CheckInStationDraft,
  CheckInStationPatch,
  Deposit,
  DepositDraft,
  DepositPatch,
  VendorPaymentPlan,
  VendorPaymentPlanDraft,
  VendorPaymentPlanPatch,
  Event,
  AssignmentSummaryResult,
  CustomReportRow,
  EventDraft,
  EventFilter,
  EventHealth,
  EventHistoryEntry,
  FeedbackInboxItem,
  FeedbackNotificationOutcome,
  FundraisingDashboard,
  FundraisingBroadcastAudience,
  FundraisingOrganizationProfile,
  ItemSubmission,
  PublicItemIntakePayload,
  PublicItemSubmissionDraft,
  AuctionCategory,
  PublicBidderBill,
  FundraisingReceipt,
  DonationCampaign,
  PublicDonationCampaign,
  DonationCheckoutResult,
  PublicDonationStatus,
  PublicExperienceCertificate,
  FundraisingReports,
  SchoolGrade,
  GuestRegistrationImportDraft,
  MoodBoardImage,
  EventPatch,
  EventRoi,
  EventVendor,
  EventVendorDraft,
  EventVendorPatch,
  Floorplan,
  FloorplanDraft,
  PublicFloorplanPayload,
  Location,
  LocationDraft,
  LocationPatch,
  MenuItem,
  MenuItemDraft,
  MenuItemPatch,
  OpenTask,
  PortfolioSummary,
  ProductFeedback,
  ProductFeedbackDraft,
  PublicEventPayload,
  PublicRegistrationDraft,
  PublicRegistrationResult,
  PublicVolunteerSignupDraft,
  RaffleItem,
  RaffleItemDraft,
  RaffleItemPatch,
  RaffleTicket,
  Rfp,
  RfpDraft,
  RfpInvitation,
  RfpPatch,
  PublicRfpPayload,
  PublicVendorConversation,
  RfpResponse,
  RfpResponseDraft,
  RfpResponseStatus,
  RfpWithResponses,
  TeamHoursEntry,
  TeamHoursDraft,
  TeamHoursPatch,
  TeamUpdate,
  TeamUpdateDraft,
  Registration,
  RegistrationCheckInPatch,
  RegistrationDraft,
  RegistrationDetailsPatch,
  InviteResult,
  WorkspaceMember,
  WorkspaceRole,
  RegistrationStatus,
  RegistrationWithGuest,
  WalkInRegistrationDraft,
  RunOfShowItem,
  RunOfShowItemDraft,
  RunOfShowItemPatch,
  Sponsorship,
  SponsorshipDraft,
  SponsorshipPatch,
  Template,
  TemplateContents,
  TemplateDetail,
  TemplateDraft,
  TicketType,
  TicketCheckoutResult,
  TicketOrder,
  TicketInvitation,
  TicketInvitationBatchResult,
  PublicTicketOrderStatus,
  StripeConnectStatus,
  TicketTypeDraft,
  TicketTypePatch,
  TicketTypeWithEvent,
  UserSettings,
  Vendor,
  VendorDraft,
  VendorMessage,
  VendorMessageDraft,
  VendorPatch,
  VolunteerShift,
  VolunteerShiftDraft,
  VolunteerShiftPatch,
  VolunteerNeed,
  VolunteerNeedDraft,
  VolunteerNeedPatch,
} from "./entities";
import type { BillingInterval, PlanId } from "./plans";
import type { WorkspaceAccessStatus } from "./workspaceAccess";
import type { AccountExperience } from "./accountExperience";
import type { PlanningBrief, PlanningPreviewBrief, PlanningSuggestions } from "./planner";
import type { AssistantChatMessage, AssistantTurn } from "./assistantChat";
import type { VendorEventPacketDraft, VendorEventPacketResult } from "./vendorEventPackets";

/** CRUD over an owner-scoped top-level collection. */
export interface OwnedRepository<T, TDraft, TPatch> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(draft: TDraft): Promise<T>;
  update(id: string, patch: TPatch): Promise<T>;
  remove(id: string): Promise<void>;
}

/** CRUD over a subcollection under one event. */
export interface EventScopedRepository<T, TDraft, TPatch> {
  list(eventId: string): Promise<T[]>;
  create(eventId: string, draft: TDraft): Promise<T>;
  update(eventId: string, id: string, patch: TPatch): Promise<T>;
  remove(eventId: string, id: string): Promise<void>;
}

export interface EventsRepository extends Omit<OwnedRepository<Event, EventDraft, EventPatch>, "list"> {
  list(filter?: EventFilter): Promise<Event[]>;
  /** Idempotent: returns the existing token if the event already has one. */
  share(id: string): Promise<{ shareToken: string }>;
  /**
   * Public lookup used by the `/e/:token` page — no auth required, and therefore the
   * only read that returns the agenda and tickets alongside the event: a guest has no
   * session to fetch them with.
   */
  getByShareToken(token: string): Promise<PublicEventPayload | null>;
  createFromTemplate(templateId: string, draft: EventDraft): Promise<Event>;
  saveAsTemplate(eventId: string, draft: Pick<TemplateDraft, "name" | "description">): Promise<Template>;
  /** Sends one current open-work summary per responsible email address. */
  sendAssignmentSummaries(eventId: string): Promise<AssignmentSummaryResult>;
}

export interface RegistrationsRepository {
  list(): Promise<RegistrationWithGuest[]>;
  listForEvent(eventId: string): Promise<RegistrationWithGuest[]>;
  create(draft: RegistrationDraft): Promise<Registration>;
  /** Creates every imported guest and registration as one all-or-nothing operation. */
  importGuests(drafts: GuestRegistrationImportDraft[]): Promise<RegistrationWithGuest[]>;
  /** Public share-link registration. The token identifies the event and workspace. */
  registerPublic(shareToken: string, draft: PublicRegistrationDraft): Promise<PublicRegistrationResult>;
  /** Atomically creates a guest, confirmed registration and arrival record. */
  createWalkIn(eventId: string, draft: WalkInRegistrationDraft): Promise<RegistrationWithGuest>;
  /** Updates the person, RSVP details and original spreadsheet cells as one row. */
  updateDetails(id: string, patch: RegistrationDetailsPatch): Promise<RegistrationWithGuest>;
  setStatus(id: string, status: RegistrationStatus): Promise<Registration>;
  /** Null clears the category. */
  setSegment(id: string, segment: string | null): Promise<Registration>;
  /** Null clears the organization. */
  setOrganization(id: string, organization: string | null): Promise<Registration>;
  /** Records arrival details, or clears the arrival timestamp to undo a check-in. */
  setCheckIn(id: string, patch: RegistrationCheckInPatch): Promise<Registration>;
  remove(id: string): Promise<void>;
}

export interface VolunteerNeedsRepository
  extends EventScopedRepository<VolunteerNeed, VolunteerNeedDraft, VolunteerNeedPatch> {
  /** Claims one open place without exposing existing volunteers to the visitor. */
  signupPublic(shareToken: string, draft: PublicVolunteerSignupDraft): Promise<VolunteerShift>;
}

export interface VendorMessagesRepository {
  list(vendorId: string): Promise<VendorMessage[]>;
  send(vendorId: string, draft: VendorMessageDraft): Promise<VendorMessage>;
  markThreadRead(vendorId: string): Promise<void>;
  getPublic(token: string): Promise<PublicVendorConversation | null>;
  replyPublic(token: string, content: string): Promise<void>;
}

export interface VendorEventPacketsRepository {
  send(eventId: string, draft: VendorEventPacketDraft): Promise<VendorEventPacketResult>;
}

export interface RaffleRepository extends EventScopedRepository<RaffleItem, RaffleItemDraft, RaffleItemPatch> {
  listTickets(eventId: string, raffleItemId: string): Promise<RaffleTicket[]>;
  sellTickets(eventId: string, raffleItemId: string, buyer: { buyerName: string; buyerEmail: string; quantity: number }): Promise<RaffleTicket>;
  /** Picks a winner weighted by ticket quantity and closes the raffle. */
  draw(eventId: string, raffleItemId: string): Promise<RaffleItem>;
}

export interface TicketsRepository extends EventScopedRepository<TicketType, TicketTypeDraft, TicketTypePatch> {
  /** Every ticket type across the portfolio, joined with its event. */
  listAll(): Promise<TicketTypeWithEvent[]>;
  /** Public checkout against a share token. Fails if the allocation is exhausted. */
  purchase(
    shareToken: string,
    ticketTypeId: string,
    buyer: { name: string; contact: string; phone: string; grades?: SchoolGrade[]; quantity: number; guestNames?: string[]; donationAddOnCents?: number; benefitsDeclined?: boolean; autoChargeOptIn?: boolean },
  ): Promise<TicketCheckoutResult>;
  listOrders(eventId: string): Promise<TicketOrder[]>;
  refundOrder(eventId: string, orderId: string): Promise<TicketOrder>;
  listInvitations(eventId: string): Promise<TicketInvitation[]>;
  sendInvitations(
    eventId: string,
    recipients: Array<{ name: string; email: string }>,
    options: { consentConfirmed: boolean; testOnly?: boolean },
  ): Promise<TicketInvitationBatchResult>;
  getPublicOrderStatus(shareToken: string, orderId: string): Promise<PublicTicketOrderStatus | null>;
}

export interface AuctionRepository extends EventScopedRepository<AuctionItem, AuctionItemDraft, AuctionItemPatch> {
  listDonors(eventId: string): Promise<AuctionDonor[]>;
  createDonor(eventId: string, draft: AuctionDonorDraft): Promise<AuctionDonor>;
  updateDonor(eventId: string, donorId: string, patch: Partial<AuctionDonorDraft>): Promise<AuctionDonor>;
  removeDonor(eventId: string, donorId: string): Promise<void>;
  sendDonorThankYou(eventId: string, donorId: string): Promise<AuctionDonor>;
  share(eventId: string): Promise<{ auctionPublicToken: string }>;
  updateSettings(eventId: string, settings: AuctionPageSettings): Promise<AuctionPageSettings>;
  publishItem(eventId: string, itemId: string, published: boolean): Promise<AuctionItem>;
  listBidders(eventId: string): Promise<AuctionBidder[]>;
  listBids(eventId: string): Promise<AuctionBid[]>;
  getPublic(token: string): Promise<PublicAuctionPayload | null>;
  registerPublic(
    token: string,
    draft: { name: string; email: string; phone: string; participantType: "gala" | "remote"; grades?: string[]; autoChargeOptIn?: boolean },
  ): Promise<AuctionBidder>;
  placePublicBid(
    token: string,
    bidderToken: string,
    itemId: string,
    maximumAmountCents: number,
  ): Promise<PublicAuctionBidResult>;
  uploadImage(file: File): Promise<string>;
  getPublicDonor(token: string): Promise<PublicAuctionDonorPayload | null>;
  uploadPublicDonorImage(token: string, file: File): Promise<string>;
  submitPublicDonation(token: string, draft: {
    title: string;
    description: string;
    imageUrl: string;
    category: string;
    restrictions?: string | null;
    expiresAt?: string | null;
    fairMarketValueCents: number;
    deliveryDetails: string;
    recognitionPreference?: string | null;
  }): Promise<PublicAuctionDonorPayload>;
  closeItem(eventId: string, itemId: string): Promise<{ status: "closed-no-bids" | "winner-notified"; paymentUrl: string | null }>;
  offerSecondChance(eventId: string, itemId: string): Promise<{ status: "winner-notified"; paymentUrl: string | null }>;
  listOrders(eventId: string): Promise<AuctionOrder[]>;
  refundOrder(eventId: string, orderId: string): Promise<AuctionOrder>;
  getBidderProfile(token: string, bidderToken: string): Promise<PublicBidderProfile | null>;
  setupBidderWallet(token: string, bidderToken: string): Promise<{ url: string }>;
  setWatch(token: string, bidderToken: string, itemId: string, watched: boolean): Promise<{ watched: boolean }>;
  createPledge(token: string, bidderToken: string, amountCents: number, channel: "in_room" | "remote"): Promise<FundraisingPledge>;
  buyNow(token: string, bidderToken: string, itemId: string): Promise<{ won: true; amountCents: number }>;
}

/**
 * RFPs and their replies.
 *
 * `list` returns each RFP with its responses already attached, because the tab has no
 * view that shows an RFP without them and a per-RFP fetch would be N+1 for nothing.
 */
export interface RfpsRepository extends EventScopedRepository<Rfp, RfpDraft, RfpPatch> {
  list(eventId: string): Promise<RfpWithResponses[]>;
  addResponse(eventId: string, rfpId: string, draft: RfpResponseDraft): Promise<RfpResponse>;
  setResponseStatus(eventId: string, rfpId: string, responseId: string, status: RfpResponseStatus): Promise<RfpResponse>;
  removeResponse(eventId: string, rfpId: string, responseId: string): Promise<void>;
  inviteVendor(eventId: string, rfpId: string, vendorId: string): Promise<RfpInvitation>;
  getPublic(token: string): Promise<PublicRfpPayload | null>;
  respondPublic(token: string, draft: RfpResponseDraft): Promise<RfpResponse>;
}

export interface TemplatesRepository {
  list(): Promise<Template[]>;
  get(id: string): Promise<TemplateDetail | null>;
  create(draft: TemplateDraft): Promise<Template>;
  update(id: string, patch: Partial<TemplateDraft>): Promise<Template>;
  /**
   * Replaces the template's contents wholesale. A template is edited as a document
   * rather than row by row, so one atomic write keeps the counts and the items from
   * ever disagreeing.
   */
  replaceContents(id: string, contents: TemplateContents): Promise<TemplateDetail>;
  remove(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<UserSettings>;
  update(patch: Partial<UserSettings>): Promise<UserSettings>;
}

export interface CanvasesRepository extends OwnedRepository<Canvas, CanvasDraft, CanvasPatch> {
  /** Replaces a board's cards wholesale — a board is edited as one document. */
  replaceCards(id: string, cards: CanvasCard[]): Promise<Canvas>;
}

export interface FloorplanRepository {
  /** Every room on the event, oldest first, so tab order is stable across reloads. */
  list(eventId: string): Promise<Floorplan[]>;
  create(eventId: string, draft: FloorplanDraft): Promise<Floorplan>;
  save(id: string, draft: FloorplanDraft): Promise<Floorplan>;
  /** Creates or reuses a public token scoped to one floorplan only. */
  share(eventId: string, id: string): Promise<{ shareToken: string }>;
  getPublic(shareToken: string): Promise<PublicFloorplanPayload | null>;
  remove(id: string): Promise<void>;
}

export interface EventHistoryRepository {
  /** Newest first. History is append-only and never writable from the browser. */
  list(eventId: string): Promise<EventHistoryEntry[]>;
}

export interface TeamUpdatesRepository {
  list(eventId: string): Promise<TeamUpdate[]>;
  create(eventId: string, draft: TeamUpdateDraft): Promise<TeamUpdate>;
}

export interface RoiRepository {
  get(eventId: string): Promise<EventRoi | null>;
  save(eventId: string, roi: Omit<EventRoi, "eventId" | "updatedAt">): Promise<EventRoi>;
}

/**
 * Aggregate reads live behind the adapter on purpose.
 *
 * The old dashboard issued one Firestore query per event to sum budget lines — fifty
 * events meant fifty round trips before the page could paint. Asking the adapter for
 * the answer instead lets each backend fetch it the efficient way: the memory adapter
 * computes it locally, and the Firestore adapter uses one collection-group query per
 * subcollection regardless of how many events there are.
 */
export interface AnalyticsRepository {
  portfolio(): Promise<PortfolioSummary>;
  /** Health for the given events, or every event when omitted. */
  health(eventIds?: string[]): Promise<EventHealth[]>;
  /** Ranked "what needs me today" worklist across the whole portfolio. */
  attention(): Promise<AttentionItem[]>;
  /**
   * Every incomplete checklist item across live events, overdue first. Aggregated here
   * rather than by looping `checklist.list(eventId)` — that loop is the N+1 the old
   * dashboard shipped.
   */
  openTasks(): Promise<OpenTask[]>;
  /** Enterprise-only event-level dataset used for filters and CSV export. */
  customReport(): Promise<CustomReportRow[]>;
}

export interface PlanningAssistantRepository {
  /** Returns a proposal only. Applying any part of it is a separate, explicit write. */
  plan(brief: PlanningBrief): Promise<PlanningSuggestions>;
  /** Previews a plan for an event that has not been created yet. */
  preview(brief: PlanningPreviewBrief): Promise<PlanningSuggestions>;
  /**
   * One turn of the planning conversation. The transcript is sent whole rather than held
   * server-side, so a reload or a second tab resumes the same conversation.
   */
  chat(input: { eventId: string; messages: AssistantChatMessage[] }): Promise<AssistantTurn>;
}

export interface SpreadsheetImportsRepository {
  /** Reads one public Google Sheets tab through the authenticated server proxy. */
  loadGoogleSheet(url: string): Promise<{ name: string; csv: string }>;
}

export interface MembersRepository {
  list(): Promise<WorkspaceMember[]>;
  /** Grants a seat to someone who has never signed in, and emails them a sign-in link. */
  invite(email: string, role: WorkspaceRole, eventId?: string | null): Promise<InviteResult>;
  revokeInvite(email: string): Promise<void>;
  setRole(userId: string, role: WorkspaceRole): Promise<WorkspaceMember>;
  remove(userId: string): Promise<void>;
}

export interface FeedbackRepository {
  /** Feedback belongs to the signed-in user, newest first. */
  list(): Promise<ProductFeedback[]>;
  /** Cross-workspace inbox. The API permits only approved Beebizy operators. */
  listInbox(): Promise<FeedbackInboxItem[]>;
  create(draft: ProductFeedbackDraft): Promise<ProductFeedback>;
  /** Operator-only delivery or redelivery to the monitored Beebizy inbox. */
  notify(id: string): Promise<FeedbackNotificationOutcome>;
}

export interface BillingRepository {
  checkout(interval: BillingInterval): Promise<{ url: string }>;
  portal(): Promise<{ url: string }>;
  connectStatus(): Promise<StripeConnectStatus>;
  startConnectOnboarding(returnTo?: string): Promise<StripeConnectStatus>;
}

export interface FundraisingRepository {
  getProfile(): Promise<FundraisingOrganizationProfile>;
  updateProfile(profile: FundraisingOrganizationProfile): Promise<FundraisingOrganizationProfile>;
  listCategories(): Promise<AuctionCategory[]>;
  createCategory(name: string): Promise<AuctionCategory>;
  listSubmissions(eventId: string): Promise<ItemSubmission[]>;
  updateSubmission(eventId: string, submissionId: string, patch: { status: ItemSubmission["status"]; requestedChanges?: string | null }): Promise<ItemSubmission>;
  dashboard(eventId: string): Promise<FundraisingDashboard>;
  extendItem(eventId: string, itemId: string, minutes: number, notify?: boolean): Promise<{ closesAt: string; extensionMinutes: number }>;
  extendItems(eventId: string, itemIds: string[], minutes: number, notify?: boolean): Promise<{ extended: number }>;
  reopenItem(eventId: string, itemId: string, minutes: number): Promise<{ closesAt: string; status: "open" }>;
  getPublicIntake(auctionToken: string, priorDonorToken?: string | null): Promise<PublicItemIntakePayload | null>;
  submitPublicItem(auctionToken: string, draft: PublicItemSubmissionDraft): Promise<PublicItemIntakePayload>;
  uploadPublicItemImage(auctionToken: string, file: File): Promise<string>;
  reinvitePastDonors(eventId: string): Promise<{ sent: number; failed: number }>;
  mergeItems(eventId: string, itemIds: string[], title: string): Promise<{ packageItemId: string }>;
  buildBills(eventId: string): Promise<{ created: number; bills: PublicBidderBill[] }>;
  sendBills(eventId: string): Promise<{ sent: number; autoCharged: number; failed: number }>;
  refundBill(eventId: string, billId: string): Promise<PublicBidderBill>;
  getPublicBill(token: string): Promise<PublicBidderBill | null>;
  payPublicBill(token: string, coverFees: boolean): Promise<{ url: string }>;
  getPublicReceipt(token: string): Promise<{ receipt: FundraisingReceipt; organization: { legalName: string; ein: string; orgType: string }; eventTitle: string | null } | null>;
  listCampaigns(eventId?: string): Promise<DonationCampaign[]>;
  createCampaign(draft: { eventId?: string | null; title: string; description?: string | null; goalCents?: number | null; suggestedAmountsCents?: number[]; designations?: string[]; defaultDesignation?: string | null }): Promise<DonationCampaign>;
  getPublicCampaign(token: string): Promise<PublicDonationCampaign | null>;
  createDonationCheckout(token: string, draft: {
    donorName: string;
    donorEmail: string;
    amountCents: number;
    frequency: "one-time" | "monthly";
    designation?: string | null;
    tributeType?: "honor" | "memory" | null;
    tributeName?: string | null;
    tributeNotifyEmail?: string | null;
    anonymous?: boolean;
    employer?: string | null;
    coverFees?: boolean;
    grades?: SchoolGrade[];
  }): Promise<DonationCheckoutResult>;
  getDonationStatus(token: string, donationId: string): Promise<PublicDonationStatus | null>;
  getPublicCertificate(token: string): Promise<PublicExperienceCertificate | null>;
  previewBroadcast(eventId: string, draft: { audience: FundraisingBroadcastAudience; itemIds: string[] }): Promise<{ recipients: number }>;
  sendBroadcast(eventId: string, draft: { audience: FundraisingBroadcastAudience; itemIds: string[]; channels: string[]; message: string }): Promise<{ recipients: number; sent: number; failed: number }>;
  recordLiveSale(eventId: string, itemId: string, paddleNumbers: number[], amountCents: number): Promise<{ winners: number }>;
  undoLiveSale(eventId: string, itemId: string): Promise<{ reopened: true }>;
  reports(eventId: string): Promise<FundraisingReports>;
  sendYearEndStatements(taxYear: number): Promise<{ sent: number; failed: number }>;
}

/** Identity and authorization as the server sees them. */
export interface Identity {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member";
  canReviewFeedback: boolean;
  /** Presentation profile selected from the verified account, never from client input. */
  experience: AccountExperience;
  /** Whether this verified account may preview another customer's presentation. */
  canSwitchExperience: boolean;
  /** Present only for a collaborator whose seat is restricted to one event. */
  eventScope: { id: string; title: string } | null;
  access: {
    status: WorkspaceAccessStatus;
    plan: PlanId | null;
    betaStartedAt: string;
    betaEndsAt: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    billingPortalAvailable?: boolean;
  };
}

export interface DataAdapter {
  readonly kind: "memory" | "postgres";
  /** Stable identity used to isolate authenticated query caches. */
  readonly cacheScope: string;
  /** Who the caller is and what they may do. The API re-checks this on every write. */
  me(): Promise<Identity>;
  events: EventsRepository;
  locations: OwnedRepository<Location, LocationDraft, LocationPatch>;
  guests: OwnedRepository<Guest, GuestDraft, GuestPatch>;
  registrations: RegistrationsRepository;
  checkInStations: EventScopedRepository<CheckInStation, CheckInStationDraft, CheckInStationPatch>;
  vendors: OwnedRepository<Vendor, VendorDraft, VendorPatch>;
  vendorMessages: VendorMessagesRepository;
  vendorEventPackets: VendorEventPacketsRepository;
  eventVendors: EventScopedRepository<EventVendor, EventVendorDraft, EventVendorPatch>;
  checklist: EventScopedRepository<ChecklistItem, ChecklistItemDraft, ChecklistItemPatch>;
  runOfShow: EventScopedRepository<RunOfShowItem, RunOfShowItemDraft, RunOfShowItemPatch>;
  volunteerNeeds: VolunteerNeedsRepository;
  volunteers: EventScopedRepository<VolunteerShift, VolunteerShiftDraft, VolunteerShiftPatch>;
  budget: EventScopedRepository<BudgetItem, BudgetItemDraft, BudgetItemPatch>;
  menu: EventScopedRepository<MenuItem, MenuItemDraft, MenuItemPatch>;
  moodBoard: EventScopedRepository<MoodBoardImage, { url: string; caption?: string | null }, { caption?: string | null; sortOrder?: number }>;
  tickets: TicketsRepository;
  auction: AuctionRepository;
  raffle: RaffleRepository;
  sponsorships: EventScopedRepository<Sponsorship, SponsorshipDraft, SponsorshipPatch>;
  rfps: RfpsRepository;
  deposits: EventScopedRepository<Deposit, DepositDraft, DepositPatch>;
  vendorPaymentPlans: EventScopedRepository<VendorPaymentPlan, VendorPaymentPlanDraft, VendorPaymentPlanPatch>;
  teamHours: EventScopedRepository<TeamHoursEntry, TeamHoursDraft, TeamHoursPatch>;
  templates: TemplatesRepository;
  canvases: CanvasesRepository;
  settings: SettingsRepository;
  floorplan: FloorplanRepository;
  members: MembersRepository;
  feedback: FeedbackRepository;
  billing: BillingRepository;
  fundraising: FundraisingRepository;
  history: EventHistoryRepository;
  teamUpdates: TeamUpdatesRepository;
  roi: RoiRepository;
  analytics: AnalyticsRepository;
  assistant: PlanningAssistantRepository;
  imports: SpreadsheetImportsRepository;
}

/** Thrown by adapters so the UI can render a specific, non-generic message. */
export class DataError extends Error {
  constructor(
    readonly code: "not-found" | "unauthenticated" | "permission-denied" | "conflict" | "unavailable" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "DataError";
  }

  /** Retrying these is pointless — react-query uses this to skip backoff. */
  get isRetryable(): boolean {
    return this.code === "unavailable";
  }
}

export function isDataError(error: unknown): error is DataError {
  return error instanceof DataError;
}
