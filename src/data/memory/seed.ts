/**
 * Demo portfolio for the in-memory adapter.
 *
 * Dates are always computed relative to "now", so the demo never rots into a screen
 * full of events from 2026. The data is deliberately uneven — an event six days out
 * with unconfirmed catering, a gala with fundraising in flight, a cancelled roadshow,
 * two completed events with ROI — because a seed where everything is green proves
 * nothing about the UI.
 *
 * This is demo data and the UI labels it as such (see `DemoBanner`). It is never
 * written to Firestore.
 */

import type {
  Attendee,
  AuctionItem,
  BudgetItem,
  ChecklistItem,
  Event,
  EventInspiration,
  EventVendor,
  EventRoi,
  Location,
  MenuItem,
  RaffleItem,
  RaffleTicket,
  Registration,
  RunOfShowItem,
  Sponsorship,
  Template,
  TemplateContents,
  TicketType,
  UserSettings,
  Vendor,
  VendorMessage,
} from "../entities";
import { DEFAULT_USER_SETTINGS } from "../entities";

export interface MemoryDb {
  events: Event[];
  locations: Location[];
  attendees: Attendee[];
  registrations: Registration[];
  vendors: Vendor[];
  vendorMessages: VendorMessage[];
  eventVendors: EventVendor[];
  checklist: ChecklistItem[];
  runOfShow: RunOfShowItem[];
  budget: BudgetItem[];
  menu: MenuItem[];
  inspirations: EventInspiration[];
  tickets: TicketType[];
  auction: AuctionItem[];
  raffle: RaffleItem[];
  raffleTickets: RaffleTicket[];
  sponsorships: Sponsorship[];
  templates: (Template & TemplateContents)[];
  roi: EventRoi[];
  settings: UserSettings;
}

export const DEMO_OWNER_ID = "demo-owner";

/** Dollars → cents, for readability in the literals below. */
const usd = (dollars: number): number => Math.round(dollars * 100);

function at(dayOffset: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString();
}

export function buildSeed(): MemoryDb {
  /* ------------------------------------------------------------- locations */

  const locations: Location[] = [
    {
      id: "loc-moscone",
      ownerId: DEMO_OWNER_ID,
      name: "Moscone Center West",
      corporationName: "Northwind Systems",
      address: "800 Howard St",
      city: "San Francisco",
      state: "CA",
      country: "USA",
      phone: "+1 415 974 4000",
      eventCount: 2,
      createdAt: at(-400),
    },
    {
      id: "loc-foundry",
      ownerId: DEMO_OWNER_ID,
      name: "The Foundry Loft",
      corporationName: "Northwind Systems",
      address: "42 Wythe Ave",
      city: "Brooklyn",
      state: "NY",
      country: "USA",
      phone: "+1 718 555 0142",
      eventCount: 2,
      createdAt: at(-380),
    },
    {
      id: "loc-cascade",
      ownerId: DEMO_OWNER_ID,
      name: "Cascade Retreat Lodge",
      corporationName: "Northwind Systems",
      address: "17500 Century Dr",
      city: "Bend",
      state: "OR",
      country: "USA",
      phone: "+1 541 555 0177",
      eventCount: 2,
      createdAt: at(-300),
    },
    {
      id: "loc-hq",
      ownerId: DEMO_OWNER_ID,
      name: "Northwind HQ — Assembly Hall",
      corporationName: "Northwind Systems",
      address: "1 Northwind Way",
      city: "Seattle",
      state: "WA",
      country: "USA",
      phone: "+1 206 555 0100",
      eventCount: 3,
      createdAt: at(-500),
    },
  ];

  const locationById = new Map(locations.map((l) => [l.id, l]));

  /* ---------------------------------------------------------------- events */

  const eventSeeds: Array<{
    id: string;
    title: string;
    description: string;
    dayOffset: number;
    hour: number;
    durationDays?: number;
    locationId: string;
    capacity: number | null;
    status: Event["status"];
    category: string;
    shared?: boolean;
  }> = [
    {
      id: "evt-cab",
      title: "Customer Advisory Board — Spring",
      description:
        "Twenty-four strategic customers, one room, two days of roadmap feedback. Chatham House rules; no recording.",
      dayOffset: 2,
      hour: 9,
      durationDays: 1,
      locationId: "loc-foundry",
      capacity: 24,
      status: "published",
      category: "Conference",
    },
    {
      id: "evt-skickoff",
      title: "Global Sales Kickoff",
      description:
        "Full field org, three days. Day one strategy, day two enablement tracks, day three partner showcase and awards dinner.",
      dayOffset: 6,
      hour: 8,
      durationDays: 3,
      locationId: "loc-moscone",
      capacity: 450,
      status: "published",
      category: "Summit",
      shared: true,
    },
    {
      id: "evt-atlas",
      title: "Atlas Launch — Press & Analyst Day",
      description:
        "Launch moment for Atlas. Press briefing at 10, analyst deep-dive at 13:00, hands-on demo stations all afternoon.",
      dayOffset: 19,
      hour: 10,
      locationId: "loc-foundry",
      capacity: 180,
      status: "published",
      category: "Product Launch",
      shared: true,
    },
    {
      id: "evt-eng-offsite",
      title: "Platform Engineering Offsite",
      description: "Sixty engineers, three days, one architecture decision that has been deferred four times.",
      dayOffset: 41,
      hour: 9,
      durationDays: 3,
      locationId: "loc-cascade",
      capacity: 60,
      status: "draft",
      category: "Offsite",
    },
    {
      id: "evt-gala",
      title: "Annual Partner Gala & Fundraiser",
      description:
        "Black tie. Silent auction opens at reception, live auction after dinner, raffle draw before the closing remarks.",
      dayOffset: 75,
      hour: 18,
      locationId: "loc-moscone",
      capacity: 300,
      status: "published",
      category: "Gala",
      shared: true,
    },
    {
      id: "evt-support-offsite",
      title: "Support Team Offsite",
      description: "Placeholder while we decide between Bend and a city option.",
      dayOffset: 120,
      hour: 9,
      durationDays: 2,
      locationId: "loc-cascade",
      capacity: null,
      status: "draft",
      category: "Offsite",
    },
    {
      id: "evt-townhall",
      title: "All-Hands Town Hall",
      description: "Company-wide, hybrid. In-room capacity 800, remote unlimited.",
      dayOffset: -35,
      hour: 10,
      locationId: "loc-hq",
      capacity: 800,
      status: "completed",
      category: "Town Hall",
    },
    {
      id: "evt-training",
      title: "Design Systems Training — Cohort 4",
      description: "Two-day workshop for product designers and front-end engineers.",
      dayOffset: -70,
      hour: 9,
      durationDays: 2,
      locationId: "loc-hq",
      capacity: 40,
      status: "completed",
      category: "Training",
    },
    {
      id: "evt-roadshow",
      title: "West Coast Roadshow — Seattle",
      description: "Cancelled: venue double-booked and the backup could not hold the date.",
      dayOffset: -12,
      hour: 17,
      locationId: "loc-hq",
      capacity: 120,
      status: "cancelled",
      category: "Roadshow",
    },
  ];

  const events: Event[] = eventSeeds.map((seed) => {
    const location = locationById.get(seed.locationId) ?? null;
    return {
      id: seed.id,
      ownerId: DEMO_OWNER_ID,
      title: seed.title,
      description: seed.description,
      date: at(seed.dayOffset, seed.hour),
      endDate: seed.durationDays ? at(seed.dayOffset + seed.durationDays, 17) : null,
      location: location ? `${location.name}, ${location.city}` : null,
      locationId: seed.locationId,
      locationRecord: location,
      capacity: seed.capacity,
      status: seed.status,
      category: seed.category,
      imageUrl: null,
      registrationCount: 0,
      shareToken: seed.shared ? `demo-${seed.id}` : null,
      createdAt: at(seed.dayOffset - 90),
      updatedAt: at(-2, 14),
    };
  });

  /* -------------------------------------------------------------- attendees */

  const attendeeSeeds: Array<[string, string, string | null]> = [
    ["Priya Raghunathan", "priya.r@meridianhealth.com", "VP Ops — advisory board chair"],
    ["Daniel Okonkwo", "d.okonkwo@lattice-bio.com", null],
    ["Sofia Marchetti", "sofia@vellumdesign.studio", "Requested vegetarian"],
    ["Marcus Lindqvist", "m.lindqvist@nordkraft.se", "Flying in from Stockholm"],
    ["Yuki Tanabe", "y.tanabe@sakura-logistics.jp", null],
    ["Amara Bello", "amara.bello@fieldstone.co", "Accessibility: step-free access"],
    ["Tomás Herrera", "therrera@puertoworks.mx", null],
    ["Nina Kowalski", "nina@brightloop.io", "Speaker — panel 2"],
    ["Reuben Castellanos", "reuben@castellanos-cpa.com", null],
    ["Fatima Al-Rashid", "f.alrashid@gulfstream-partners.ae", "Gluten free"],
    ["Ivan Petrov", "ipetrov@volnaanalytics.com", null],
    ["Grace Oyelaran", "grace@harborlight.org", "Nonprofit rate"],
    ["Lucas Brandt", "lucas.brandt@keystone-mfg.de", null],
    ["Meera Iyer", "meera@quantwell.in", "Speaker — keynote"],
    ["Oliver Ashworth", "o.ashworth@thameside.co.uk", null],
    ["Camille Dubois", "camille@atelier-nord.fr", "Dairy free"],
    ["Jamal Whitfield", "jwhitfield@cascadecapital.com", null],
    ["Hannah Sørensen", "hannah@fjordtech.no", null],
    ["Diego Ferreira", "diego@amazoniafoods.br", "Interpreter requested"],
    ["Aisha Nurse", "aisha.nurse@bridgewater-ed.org", null],
    ["Wei Chen", "wei.chen@lianhe-group.cn", null],
    ["Rosalind Achebe", "r.achebe@sunbeltenergy.com", "Board observer"],
    ["Felix Hartmann", "felix@hartmann-audio.at", null],
    ["Naomi Bergstrom", "naomi@northstarvc.com", "Investor"],
    ["Kwame Mensah", "kwame@accralabs.gh", null],
    ["Elena Vasquez", "elena@puebloartsfund.org", "Nut allergy"],
  ];

  const attendees: Attendee[] = attendeeSeeds.map(([name, contact, notes], i) => ({
    id: `att-${i + 1}`,
    ownerId: DEMO_OWNER_ID,
    name,
    contact,
    notes,
    createdAt: at(-200 + i * 4),
  }));

  /* ----------------------------------------------------------- registrations */

  const registrations: Registration[] = [];
  let regSeq = 0;
  const register = (eventId: string, attendeeIndexes: number[], status: Registration["status"], dayOffset: number) => {
    const event = events.find((e) => e.id === eventId)!;
    for (const index of attendeeIndexes) {
      regSeq += 1;
      registrations.push({
        id: `reg-${regSeq}`,
        ownerId: DEMO_OWNER_ID,
        eventId,
        eventTitle: event.title,
        attendeeId: attendees[index]!.id,
        status,
        registeredAt: at(dayOffset, 11, regSeq % 60),
        createdAt: at(dayOffset, 11, regSeq % 60),
      });
    }
  };

  register("evt-cab", [0, 1, 2, 3, 4, 5, 6, 7, 9, 13], "confirmed", -21);
  register("evt-cab", [10, 14], "pending", -4);
  register("evt-skickoff", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17], "confirmed", -30);
  register("evt-skickoff", [18, 19, 20, 21, 22], "pending", -3);
  register("evt-atlas", [7, 13, 15, 16, 17, 18, 23], "confirmed", -14);
  register("evt-atlas", [24, 25], "pending", -1);
  register("evt-gala", [0, 2, 5, 9, 11, 21, 23, 25], "confirmed", -20);
  register("evt-gala", [1, 3], "pending", -2);
  register("evt-townhall", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "confirmed", -60);
  register("evt-training", [2, 5, 8, 12, 15, 19], "confirmed", -95);
  register("evt-roadshow", [4, 8, 12], "cancelled", -40);

  for (const event of events) {
    event.registrationCount = registrations.filter((r) => r.eventId === event.id && r.status !== "cancelled").length;
  }

  /* --------------------------------------------------------------- vendors */

  const vendors: Vendor[] = [
    {
      id: "ven-apex",
      ownerId: DEMO_OWNER_ID,
      name: "Apex AV & Sound",
      category: "AV & Tech",
      description: "Full-service AV: line arrays, LED walls, multi-camera capture, hybrid streaming.",
      contactEmail: "bookings@apexav.com",
      contactPhone: "+1 415 555 0188",
      website: "https://apexav.example.com",
      logoUrl: null,
      rating: 4.8,
      city: "San Francisco",
      state: "CA",
      country: "USA",
      lastMessage: "Rig list confirmed for both ballrooms. Load-in 6am Thursday.",
      lastMessageAt: at(-1, 16, 12),
      lastDirection: "inbound",
      unreadCount: 1,
      createdAt: at(-260),
    },
    {
      id: "ven-goldengate",
      ownerId: DEMO_OWNER_ID,
      name: "Golden Gate Catering",
      category: "Catering",
      description: "Plated service, cocktail receptions, full dietary tracking. 800 covers max.",
      contactEmail: "events@ggcatering.com",
      contactPhone: "+1 415 555 0121",
      website: "https://ggcatering.example.com",
      logoUrl: null,
      rating: 4.6,
      city: "San Francisco",
      state: "CA",
      country: "USA",
      lastMessage: "Still waiting on your final headcount before we can lock the menu — can you confirm today?",
      lastMessageAt: at(-2, 9, 30),
      lastDirection: "inbound",
      unreadCount: 2,
      createdAt: at(-255),
    },
    {
      id: "ven-lumen",
      ownerId: DEMO_OWNER_ID,
      name: "Lumen Studio",
      category: "Photography",
      description: "Event photography and same-day highlight reels.",
      contactEmail: "hello@lumenstudio.co",
      contactPhone: "+1 503 555 0164",
      website: "https://lumenstudio.example.com",
      logoUrl: null,
      rating: 4.9,
      city: "Portland",
      state: "OR",
      country: "USA",
      lastMessage: "Sending the shot list over tomorrow.",
      lastMessageAt: at(-6, 13, 5),
      lastDirection: "outbound",
      unreadCount: 0,
      createdAt: at(-190),
    },
    {
      id: "ven-bloom",
      ownerId: DEMO_OWNER_ID,
      name: "Bloom & Birch",
      category: "Decor",
      description: "Florals, staging, and table design. Sustainable sourcing.",
      contactEmail: "studio@bloomandbirch.com",
      contactPhone: "+1 510 555 0139",
      website: null,
      logoUrl: null,
      rating: 4.4,
      city: "Oakland",
      state: "CA",
      country: "USA",
      lastMessage: null,
      lastMessageAt: null,
      lastDirection: null,
      unreadCount: 0,
      createdAt: at(-150),
    },
    {
      id: "ven-northgate",
      ownerId: DEMO_OWNER_ID,
      name: "Northgate Transport",
      category: "Transport",
      description: "Shuttle fleet and VIP ground transport, 4–55 seats.",
      contactEmail: "dispatch@northgatetransport.com",
      contactPhone: "+1 206 555 0155",
      website: null,
      logoUrl: null,
      rating: 4.1,
      city: "Seattle",
      state: "WA",
      country: "USA",
      lastMessage: "Two 24-seat coaches held for the offsite. Deposit due in 10 days.",
      lastMessageAt: at(-9, 10, 45),
      lastDirection: "inbound",
      unreadCount: 0,
      createdAt: at(-140),
    },
    {
      id: "ven-ovation",
      ownerId: DEMO_OWNER_ID,
      name: "Ovation Event Staffing",
      category: "Staffing",
      description: "Registration desk, ushers, bar staff. Background-checked.",
      contactEmail: "staffing@ovationevents.com",
      contactPhone: "+1 415 555 0173",
      website: null,
      logoUrl: null,
      rating: 4.3,
      city: "San Francisco",
      state: "CA",
      country: "USA",
      lastMessage: null,
      lastMessageAt: null,
      lastDirection: null,
      unreadCount: 0,
      createdAt: at(-120),
    },
    {
      id: "ven-inkwell",
      ownerId: DEMO_OWNER_ID,
      name: "Inkwell Press",
      category: "Print",
      description: "Signage, badges, programmes. 48-hour turnaround.",
      contactEmail: "orders@inkwellpress.com",
      contactPhone: "+1 718 555 0198",
      website: null,
      logoUrl: null,
      rating: 4.0,
      city: "Brooklyn",
      state: "NY",
      country: "USA",
      lastMessage: "Badge proofs attached — approve by Friday to hold the print slot.",
      lastMessageAt: at(-3, 15, 20),
      lastDirection: "inbound",
      unreadCount: 1,
      createdAt: at(-110),
    },
    {
      id: "ven-cascade-venue",
      ownerId: DEMO_OWNER_ID,
      name: "Cascade Lodge Events",
      category: "Venue",
      description: "Retreat venue with 40 rooms, two meeting halls, full board.",
      contactEmail: "groups@cascadelodge.com",
      contactPhone: "+1 541 555 0177",
      website: null,
      logoUrl: null,
      rating: 4.7,
      city: "Bend",
      state: "OR",
      country: "USA",
      lastMessage: null,
      lastMessageAt: null,
      lastDirection: null,
      unreadCount: 0,
      createdAt: at(-100),
    },
  ];

  const vendorMessages: VendorMessage[] = [
    {
      id: "vm-1",
      vendorId: "ven-goldengate",
      eventId: "evt-skickoff",
      direction: "outbound",
      senderName: "You",
      subject: "Sales Kickoff — catering brief",
      content:
        "Hi team — attaching the brief for Sales Kickoff. Three days, roughly 450 attendees, awards dinner on night three. Can you hold the date?",
      isRead: true,
      createdAt: at(-16, 11, 5),
    },
    {
      id: "vm-2",
      vendorId: "ven-goldengate",
      eventId: "evt-skickoff",
      direction: "inbound",
      senderName: "Golden Gate Catering",
      subject: "Re: Sales Kickoff — catering brief",
      content: "Date is held. We need a final headcount two weeks out to lock the menu and staffing.",
      isRead: false,
      createdAt: at(-14, 9, 15),
    },
    {
      id: "vm-3",
      vendorId: "ven-goldengate",
      eventId: "evt-skickoff",
      direction: "inbound",
      senderName: "Golden Gate Catering",
      subject: "Re: Sales Kickoff — catering brief",
      content: "Still waiting on your final headcount before we can lock the menu — can you confirm today?",
      isRead: false,
      createdAt: at(-2, 9, 30),
    },
    {
      id: "vm-4",
      vendorId: "ven-apex",
      eventId: "evt-skickoff",
      direction: "outbound",
      senderName: "You",
      subject: "Ballroom AV",
      content: "Need main-stage AV plus a second breakout room with hybrid streaming. Rig list when you can.",
      isRead: true,
      createdAt: at(-12, 14, 0),
    },
    {
      id: "vm-5",
      vendorId: "ven-apex",
      eventId: "evt-skickoff",
      direction: "inbound",
      senderName: "Apex AV & Sound",
      subject: "Re: Ballroom AV",
      content: "Rig list confirmed for both ballrooms. Load-in 6am Thursday.",
      isRead: false,
      createdAt: at(-1, 16, 12),
    },
    {
      id: "vm-6",
      vendorId: "ven-inkwell",
      eventId: "evt-atlas",
      direction: "inbound",
      senderName: "Inkwell Press",
      subject: "Badge proofs",
      content: "Badge proofs attached — approve by Friday to hold the print slot.",
      isRead: false,
      createdAt: at(-3, 15, 20),
    },
    {
      id: "vm-7",
      vendorId: "ven-northgate",
      eventId: "evt-eng-offsite",
      direction: "inbound",
      senderName: "Northgate Transport",
      subject: "Offsite shuttles",
      content: "Two 24-seat coaches held for the offsite. Deposit due in 10 days.",
      isRead: true,
      createdAt: at(-9, 10, 45),
    },
    {
      id: "vm-8",
      vendorId: "ven-lumen",
      eventId: "evt-gala",
      direction: "outbound",
      senderName: "You",
      subject: "Gala coverage",
      content: "Sending the shot list over tomorrow.",
      isRead: true,
      createdAt: at(-6, 13, 5),
    },
  ];

  /* ---------------------------------------------------------- event vendors */

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  let evSeq = 0;
  const bookVendor = (
    eventId: string,
    vendorId: string,
    status: EventVendor["status"],
    feeCents: number | null,
    notes: string | null,
  ): EventVendor => {
    evSeq += 1;
    return {
      id: `ev-${evSeq}`,
      eventId,
      vendorId,
      notes,
      status,
      feeCents,
      vendor: vendorById.get(vendorId) ?? null,
      createdAt: at(-30 + evSeq),
    };
  };

  const eventVendors: EventVendor[] = [
    bookVendor("evt-skickoff", "ven-apex", "confirmed", usd(28500), "Main stage + breakout, hybrid stream, load-in 6am Thu."),
    bookVendor("evt-skickoff", "ven-goldengate", "pending", usd(41200), "Awaiting final headcount before menu lock."),
    bookVendor("evt-skickoff", "ven-lumen", "confirmed", usd(6800), "Two shooters, same-day reel for the awards dinner."),
    bookVendor("evt-skickoff", "ven-ovation", "confirmed", usd(9400), "12 staff: registration, ushers, bar."),
    bookVendor("evt-skickoff", "ven-inkwell", "pending", usd(3100), "450 badges, wayfinding, programme."),
    bookVendor("evt-cab", "ven-goldengate", "confirmed", usd(4800), "Breakfast, lunch, afternoon break. 3 dietary flags."),
    bookVendor("evt-cab", "ven-apex", "confirmed", usd(2200), "Single room, recording explicitly disabled."),
    bookVendor("evt-atlas", "ven-apex", "confirmed", usd(15600), "Press room + demo stations, 6 screens."),
    bookVendor("evt-atlas", "ven-lumen", "confirmed", usd(5200), "Product shots + press headshots."),
    bookVendor("evt-atlas", "ven-inkwell", "pending", usd(2400), "Press kits and demo station signage."),
    bookVendor("evt-atlas", "ven-goldengate", "pending", usd(7900), "Cocktail reception, 180 guests."),
    bookVendor("evt-gala", "ven-goldengate", "confirmed", usd(64000), "Plated dinner, 300 covers, 2 vegan tables."),
    bookVendor("evt-gala", "ven-bloom", "confirmed", usd(18500), "30 centrepieces, stage florals, entry installation."),
    bookVendor("evt-gala", "ven-apex", "confirmed", usd(22000), "Live auction sound, projection, lighting states."),
    bookVendor("evt-gala", "ven-ovation", "pending", usd(14800), "24 staff including auction runners."),
    bookVendor("evt-eng-offsite", "ven-cascade-venue", "confirmed", usd(52000), "40 rooms, full board, 2 halls, 3 nights."),
    bookVendor("evt-eng-offsite", "ven-northgate", "pending", usd(6400), "Two 24-seat coaches, deposit due."),
    bookVendor("evt-townhall", "ven-apex", "confirmed", usd(11200), "Hybrid stream to 2,400 remote."),
    bookVendor("evt-training", "ven-goldengate", "confirmed", usd(2600), "Lunch and breaks, both days."),
  ];

  /* ------------------------------------------------------------- checklists */

  let clSeq = 0;
  const check = (
    eventId: string,
    title: string,
    category: string,
    completed: boolean,
    dueDayOffset: number | null,
    assignedTo: string | null,
    description: string | null = null,
  ): ChecklistItem => {
    clSeq += 1;
    return {
      id: `cl-${clSeq}`,
      eventId,
      title,
      description,
      completed,
      dueDate: dueDayOffset === null ? null : at(dueDayOffset, 17),
      assignedTo,
      category,
      sortOrder: clSeq,
      createdAt: at(-40),
    };
  };

  const checklist: ChecklistItem[] = [
    // Sales Kickoff — six days out, catering and print still open.
    check("evt-skickoff", "Contract signed with venue", "Venue", true, -30, "Dana Whitfield"),
    check("evt-skickoff", "Confirm final headcount with catering", "Catering", false, -1, "Dana Whitfield", "Golden Gate needs this to lock the menu. Two messages unanswered."),
    check("evt-skickoff", "Approve badge proofs", "Print", false, 1, "Sam Ortiz"),
    check("evt-skickoff", "AV rig walkthrough", "AV", true, -3, "Sam Ortiz"),
    check("evt-skickoff", "Publish agenda to attendees", "Marketing", true, -7, "Lena Park"),
    check("evt-skickoff", "Brief awards dinner MC", "Programme", false, 3, "Lena Park"),
    check("evt-skickoff", "Confirm shuttle schedule from hotels", "Logistics", false, 2, "Dana Whitfield"),
    check("evt-skickoff", "Load speaker decks into stage machine", "AV", false, 4, "Sam Ortiz"),
    check("evt-skickoff", "Print run-of-show for stage managers", "Print", false, 4, null),

    // Customer Advisory Board — two days out, nearly ready.
    check("evt-cab", "Send pre-read to all 24 attendees", "Marketing", true, -7, "Lena Park"),
    check("evt-cab", "Confirm dietary requirements with catering", "Catering", true, -3, "Dana Whitfield"),
    check("evt-cab", "Set up room — U-shape, 24 seats", "Logistics", false, 1, "Dana Whitfield"),
    check("evt-cab", "Print name cards and agendas", "Print", false, 1, null),
    check("evt-cab", "Confirm recording is disabled", "AV", true, -2, "Sam Ortiz", "Chatham House rules — explicitly confirmed with Apex."),

    // Atlas Launch.
    check("evt-atlas", "Lock press list", "Marketing", true, -12, "Lena Park"),
    check("evt-atlas", "Embargo brief to analysts", "Marketing", true, -8, "Lena Park"),
    check("evt-atlas", "Demo stations dry run", "AV", false, 12, "Sam Ortiz"),
    check("evt-atlas", "Confirm cocktail reception headcount", "Catering", false, 10, "Dana Whitfield"),
    check("evt-atlas", "Press kit print approval", "Print", false, 8, null),
    check("evt-atlas", "Spokesperson media training", "Programme", false, 14, "Lena Park"),

    // Engineering offsite — draft, mostly open.
    check("evt-eng-offsite", "Hold rooms at Cascade Lodge", "Venue", true, -20, "Dana Whitfield"),
    check("evt-eng-offsite", "Pay coach deposit", "Logistics", false, 9, "Dana Whitfield"),
    check("evt-eng-offsite", "Collect session proposals", "Programme", false, 20, "Priya Raghunathan"),
    check("evt-eng-offsite", "Decide architecture decision agenda slot", "Programme", false, 25, null),

    // Gala.
    check("evt-gala", "Confirm gold-tier sponsors", "Sponsorship", true, -25, "Naomi Bergstrom"),
    check("evt-gala", "Source silent auction items", "Fundraising", false, 40, "Grace Oyelaran"),
    check("evt-gala", "Licence for raffle draw", "Compliance", false, 30, "Reuben Castellanos", "State gaming permit — 30 day lead time."),
    check("evt-gala", "Table plan with 2 vegan tables", "Catering", false, 55, "Dana Whitfield"),
    check("evt-gala", "Brief auction runners", "Staffing", false, 70, null),

    // Completed events.
    check("evt-townhall", "Hybrid stream test", "AV", true, -40, "Sam Ortiz"),
    check("evt-townhall", "Publish recording internally", "Marketing", true, -33, "Lena Park"),
    check("evt-training", "Ship workbooks", "Logistics", true, -75, "Dana Whitfield"),
    check("evt-training", "Collect feedback survey", "Marketing", true, -68, "Lena Park"),
  ];

  /* ------------------------------------------------------------ run of show */

  let rosSeq = 0;
  const cue = (
    eventId: string,
    startTime: string,
    duration: number | null,
    title: string,
    responsible: string | null,
    description: string | null = null,
  ): RunOfShowItem => {
    rosSeq += 1;
    return {
      id: `ros-${rosSeq}`,
      eventId,
      startTime,
      duration,
      title,
      description,
      responsible,
      sortOrder: rosSeq,
      createdAt: at(-25),
    };
  };

  const runOfShow: RunOfShowItem[] = [
    cue("evt-skickoff", "06:00", 120, "AV load-in and stage build", "Apex AV"),
    cue("evt-skickoff", "08:00", 45, "Registration opens, coffee service", "Ovation Staffing"),
    cue("evt-skickoff", "08:45", 15, "Room open, walk-in music", "Sam Ortiz"),
    cue("evt-skickoff", "09:00", 30, "CEO welcome and year in review", "Lena Park"),
    cue("evt-skickoff", "09:30", 45, "Strategy keynote — Meera Iyer", "Lena Park", "Deck loaded on stage machine, presenter view on confidence monitor."),
    cue("evt-skickoff", "10:15", 30, "Break", null),
    cue("evt-skickoff", "10:45", 75, "Enablement track breakouts (3 rooms)", "Dana Whitfield"),
    cue("evt-skickoff", "12:00", 60, "Lunch", "Golden Gate Catering"),
    cue("evt-skickoff", "13:00", 90, "Partner showcase floor", "Lena Park"),
    cue("evt-skickoff", "18:30", 30, "Awards dinner reception", "Golden Gate Catering"),
    cue("evt-skickoff", "19:00", 120, "Awards dinner and presentation", "Lena Park"),

    cue("evt-cab", "08:30", 30, "Arrival breakfast", "Golden Gate Catering"),
    cue("evt-cab", "09:00", 15, "Welcome and Chatham House framing", "Priya Raghunathan"),
    cue("evt-cab", "09:15", 90, "Roadmap walkthrough", "Meera Iyer"),
    cue("evt-cab", "10:45", 20, "Break", null),
    cue("evt-cab", "11:05", 85, "Feedback round-robin", "Priya Raghunathan"),
    cue("evt-cab", "12:30", 60, "Working lunch", "Golden Gate Catering"),
    cue("evt-cab", "13:30", 90, "Prioritisation exercise", "Meera Iyer"),
    cue("evt-cab", "15:00", 30, "Close and next steps", "Priya Raghunathan"),

    cue("evt-gala", "17:00", 60, "Vendor load-in, florals, auction display", "Bloom & Birch"),
    cue("evt-gala", "18:00", 60, "Reception, silent auction opens", "Ovation Staffing"),
    cue("evt-gala", "19:00", 75, "Dinner service", "Golden Gate Catering"),
    cue("evt-gala", "20:15", 10, "Chair's remarks", "Naomi Bergstrom"),
    cue("evt-gala", "20:25", 35, "Live auction", "Grace Oyelaran", "Five lots. Runners staged at both wings."),
    cue("evt-gala", "21:00", 15, "Raffle draw", "Reuben Castellanos"),
    cue("evt-gala", "21:15", 10, "Closing remarks", "Naomi Bergstrom"),
  ];

  /* ---------------------------------------------------------------- budget */

  let bSeq = 0;
  const line = (
    eventId: string,
    name: string,
    category: string,
    type: BudgetItem["type"],
    estimated: number,
    actual: number | null,
    notes: string | null = null,
  ): BudgetItem => {
    bSeq += 1;
    return {
      id: `bud-${bSeq}`,
      eventId,
      name,
      category,
      type,
      estimatedCents: usd(estimated),
      actualCents: actual === null ? null : usd(actual),
      notes,
      sortOrder: bSeq,
      createdAt: at(-35),
    };
  };

  const budget: BudgetItem[] = [
    line("evt-skickoff", "Venue rental — 3 days", "Venue", "expense", 96000, 96000),
    line("evt-skickoff", "AV production", "AV", "expense", 28500, 28500),
    line("evt-skickoff", "Catering", "Catering", "expense", 41200, null, "Not invoiced — menu unlocked."),
    line("evt-skickoff", "Photography", "Photography", "expense", 6800, 6800),
    line("evt-skickoff", "Staffing", "Staffing", "expense", 9400, 9400),
    line("evt-skickoff", "Print and signage", "Print", "expense", 3100, null),
    line("evt-skickoff", "Travel subsidy — field org", "Travel", "expense", 74000, 68400, "Under: fewer international attendees than modelled."),
    line("evt-skickoff", "Internal budget allocation", "Funding", "revenue", 240000, 240000),
    line("evt-skickoff", "Partner showcase fees", "Sponsorship", "revenue", 45000, 38000),

    line("evt-cab", "Venue — Foundry Loft", "Venue", "expense", 8500, 8500),
    line("evt-cab", "Catering", "Catering", "expense", 4800, 4800),
    line("evt-cab", "AV", "AV", "expense", 2200, 2200),
    line("evt-cab", "Attendee travel reimbursement", "Travel", "expense", 22000, 14600, "Six of 24 claimed so far."),
    line("evt-cab", "Product marketing budget", "Funding", "revenue", 40000, 40000),

    line("evt-atlas", "Venue", "Venue", "expense", 12000, 12000),
    line("evt-atlas", "AV and demo stations", "AV", "expense", 15600, null),
    line("evt-atlas", "Catering — reception", "Catering", "expense", 7900, null),
    line("evt-atlas", "Photography", "Photography", "expense", 5200, null),
    line("evt-atlas", "Press kits", "Print", "expense", 2400, null),
    line("evt-atlas", "Launch marketing budget", "Funding", "revenue", 60000, 60000),

    line("evt-eng-offsite", "Lodge — rooms and board", "Venue", "expense", 52000, null),
    line("evt-eng-offsite", "Coach transport", "Travel", "expense", 6400, null),
    line("evt-eng-offsite", "Facilitator", "Programme", "expense", 4500, null),
    line("evt-eng-offsite", "Engineering budget allocation", "Funding", "revenue", 70000, null),

    line("evt-gala", "Venue and ballroom", "Venue", "expense", 38000, null),
    line("evt-gala", "Catering — 300 covers", "Catering", "expense", 64000, null),
    line("evt-gala", "Florals and decor", "Decor", "expense", 18500, 9250, "50% deposit paid."),
    line("evt-gala", "AV and lighting", "AV", "expense", 22000, null),
    line("evt-gala", "Staffing", "Staffing", "expense", 14800, null),
    line("evt-gala", "Ticket revenue", "Tickets", "revenue", 165000, null),
    line("evt-gala", "Sponsorships", "Sponsorship", "revenue", 210000, 145000),
    line("evt-gala", "Auction and raffle", "Fundraising", "revenue", 120000, null),

    line("evt-townhall", "AV and hybrid stream", "AV", "expense", 11200, 11200),
    line("evt-townhall", "Catering", "Catering", "expense", 9800, 10450, "Over: added a second coffee station."),
    line("evt-townhall", "Internal allocation", "Funding", "revenue", 25000, 25000),

    line("evt-training", "Facilitator — 2 days", "Programme", "expense", 8000, 8000),
    line("evt-training", "Catering", "Catering", "expense", 2600, 2600),
    line("evt-training", "Workbooks", "Print", "expense", 1200, 980),
    line("evt-training", "Course fees", "Tickets", "revenue", 24000, 22800),
  ];

  /* ---------------------------------------------------------------- tickets */

  let tSeq = 0;
  const ticket = (
    eventId: string,
    name: string,
    price: number,
    total: number,
    sold: number,
    isActive: boolean,
    description: string | null = null,
  ): TicketType => {
    tSeq += 1;
    return {
      id: `tt-${tSeq}`,
      eventId,
      name,
      description,
      priceCents: usd(price),
      quantityTotal: total,
      quantitySold: sold,
      isActive,
      sortOrder: tSeq,
      createdAt: at(-45),
      updatedAt: at(-2),
    };
  };

  const tickets: TicketType[] = [
    ticket("evt-gala", "Individual seat", 450, 180, 138, true, "One seat at a shared table of ten."),
    ticket("evt-gala", "Table of ten", 4200, 20, 14, true, "Full table, name recognition in the programme."),
    ticket("evt-gala", "Patron seat", 1200, 40, 22, true, "Premium seating, reception with the board."),
    ticket("evt-gala", "Young professional", 175, 60, 31, true, "Under 35. Limited allocation."),
    ticket("evt-atlas", "Press pass", 0, 60, 41, true, "Credentialed media only."),
    ticket("evt-atlas", "Analyst pass", 0, 40, 28, true),
    ticket("evt-atlas", "Partner pass", 250, 80, 34, true),
    ticket("evt-skickoff", "Field org seat", 0, 450, 383, false, "Internal — allocated, not sold."),
  ];

  /* ------------------------------------------------------------ fundraising */

  const auction: AuctionItem[] = [
    {
      id: "auc-1",
      eventId: "evt-gala",
      title: "Napa Valley weekend for six",
      description: "Two nights at a private estate, winery tour and tasting for six guests.",
      imageUrl: null,
      startingBidCents: usd(2500),
      currentBidCents: usd(4100),
      fairMarketValueCents: usd(6000),
      winnerName: null,
      donorName: "Cascade Capital",
      paymentMethod: null,
      paymentLink: null,
      paymentReceivedAt: null,
      status: "open",
      auctionType: "silent",
      lotNumber: 1,
      createdAt: at(-30),
    },
    {
      id: "auc-2",
      eventId: "evt-gala",
      title: "Signed first-edition print collection",
      description: "Six signed prints from the Atelier Nord archive.",
      imageUrl: null,
      startingBidCents: usd(800),
      currentBidCents: usd(1450),
      fairMarketValueCents: usd(2200),
      winnerName: null,
      donorName: "Atelier Nord",
      paymentMethod: null,
      paymentLink: null,
      paymentReceivedAt: null,
      status: "open",
      auctionType: "silent",
      lotNumber: 2,
      createdAt: at(-30),
    },
    {
      id: "auc-3",
      eventId: "evt-gala",
      title: "Chef's table for eight",
      description: "Private dinner prepared by the Golden Gate executive chef, at your home.",
      imageUrl: null,
      startingBidCents: usd(1500),
      currentBidCents: usd(2300),
      fairMarketValueCents: usd(3500),
      winnerName: null,
      donorName: "Golden Gate Catering",
      paymentMethod: null,
      paymentLink: null,
      paymentReceivedAt: null,
      status: "open",
      auctionType: "silent",
      lotNumber: 3,
      createdAt: at(-28),
    },
    {
      id: "auc-4",
      eventId: "evt-gala",
      title: "Board seat for a day",
      description: "Shadow the chair through a full board meeting and strategy lunch.",
      imageUrl: null,
      startingBidCents: usd(5000),
      currentBidCents: null,
      fairMarketValueCents: null,
      winnerName: null,
      donorName: "Northwind Systems",
      paymentMethod: null,
      paymentLink: null,
      paymentReceivedAt: null,
      status: "open",
      auctionType: "live",
      lotNumber: 4,
      createdAt: at(-20),
    },
    {
      id: "auc-5",
      eventId: "evt-gala",
      title: "Iceland photography expedition",
      description: "Seven days shooting the south coast with Lumen Studio. Two places.",
      imageUrl: null,
      startingBidCents: usd(9000),
      currentBidCents: null,
      fairMarketValueCents: usd(14000),
      winnerName: null,
      donorName: "Lumen Studio",
      paymentMethod: null,
      paymentLink: null,
      paymentReceivedAt: null,
      status: "open",
      auctionType: "live",
      lotNumber: 5,
      createdAt: at(-18),
    },
  ];

  const raffle: RaffleItem[] = [
    {
      id: "raf-1",
      eventId: "evt-gala",
      name: "Electric bike",
      description: "City e-bike with two-year service plan.",
      imageUrl: null,
      ticketPriceCents: usd(50),
      totalTickets: 400,
      soldTickets: 236,
      winnerName: null,
      winnerEmail: null,
      winnerTicketId: null,
      drawnAt: null,
      status: "open",
      createdAt: at(-26),
    },
    {
      id: "raf-2",
      eventId: "evt-gala",
      name: "Restaurant year pass",
      description: "One dinner a month for a year at a rotating list of partner restaurants.",
      imageUrl: null,
      ticketPriceCents: usd(75),
      totalTickets: 250,
      soldTickets: 118,
      winnerName: null,
      winnerEmail: null,
      winnerTicketId: null,
      drawnAt: null,
      status: "open",
      createdAt: at(-24),
    },
  ];

  const raffleTickets: RaffleTicket[] = [
    { id: "rt-1", raffleItemId: "raf-1", eventId: "evt-gala", buyerName: "Priya Raghunathan", buyerEmail: "priya.r@meridianhealth.com", quantity: 10, createdAt: at(-18, 12) },
    { id: "rt-2", raffleItemId: "raf-1", eventId: "evt-gala", buyerName: "Jamal Whitfield", buyerEmail: "jwhitfield@cascadecapital.com", quantity: 20, createdAt: at(-16, 15) },
    { id: "rt-3", raffleItemId: "raf-1", eventId: "evt-gala", buyerName: "Grace Oyelaran", buyerEmail: "grace@harborlight.org", quantity: 6, createdAt: at(-12, 9) },
    { id: "rt-4", raffleItemId: "raf-2", eventId: "evt-gala", buyerName: "Camille Dubois", buyerEmail: "camille@atelier-nord.fr", quantity: 8, createdAt: at(-11, 17) },
    { id: "rt-5", raffleItemId: "raf-2", eventId: "evt-gala", buyerName: "Naomi Bergstrom", buyerEmail: "naomi@northstarvc.com", quantity: 12, createdAt: at(-9, 10) },
  ];

  const sponsorships: Sponsorship[] = [
    {
      id: "spo-1",
      eventId: "evt-gala",
      companyName: "Cascade Capital",
      tier: "gold",
      amountCents: usd(75000),
      logoUrl: null,
      contactEmail: "jwhitfield@cascadecapital.com",
      contactName: "Jamal Whitfield",
      notes: "Stage naming, full-page programme, ten seats.",
      status: "confirmed",
      createdAt: at(-60),
    },
    {
      id: "spo-2",
      eventId: "evt-gala",
      companyName: "Northstar Ventures",
      tier: "gold",
      amountCents: usd(70000),
      logoUrl: null,
      contactEmail: "naomi@northstarvc.com",
      contactName: "Naomi Bergstrom",
      notes: "Reception naming, ten seats.",
      status: "confirmed",
      createdAt: at(-58),
    },
    {
      id: "spo-3",
      eventId: "evt-gala",
      companyName: "Meridian Health",
      tier: "silver",
      amountCents: usd(35000),
      logoUrl: null,
      contactEmail: "priya.r@meridianhealth.com",
      contactName: "Priya Raghunathan",
      notes: "Half-page programme, six seats.",
      status: "pending",
      createdAt: at(-40),
    },
    {
      id: "spo-4",
      eventId: "evt-gala",
      companyName: "Fieldstone & Co",
      tier: "bronze",
      amountCents: usd(15000),
      logoUrl: null,
      contactEmail: "amara.bello@fieldstone.co",
      contactName: "Amara Bello",
      notes: "Logo placement, four seats.",
      status: "pending",
      createdAt: at(-30),
    },
    {
      id: "spo-5",
      eventId: "evt-skickoff",
      companyName: "Apex AV & Sound",
      tier: "custom",
      amountCents: usd(20000),
      logoUrl: null,
      contactEmail: "bookings@apexav.com",
      contactName: "Apex AV",
      notes: "In-kind: partner showcase booth in exchange for fee reduction.",
      status: "confirmed",
      createdAt: at(-45),
    },
  ];

  /* ------------------------------------------------------------------- menu */

  let mSeq = 0;
  const dish = (
    eventId: string,
    name: string,
    course: string,
    dietaryTags: string[],
    serves: number | null,
    price: number | null,
    description: string | null = null,
  ): MenuItem => {
    mSeq += 1;
    return {
      id: `menu-${mSeq}`,
      eventId,
      name,
      description,
      course,
      dietaryTags,
      priceCents: price === null ? null : usd(price),
      serves,
      notes: null,
      sortOrder: mSeq,
      createdAt: at(-20),
    };
  };

  const menu: MenuItem[] = [
    dish("evt-gala", "Chilled heirloom tomato with basil oil", "Starter", ["vegan", "gluten-free"], 300, 18),
    dish("evt-gala", "Seared scallop, pea purée", "Starter", ["pescatarian"], 240, 24),
    dish("evt-gala", "Braised short rib, celeriac", "Main", [], 210, 46),
    dish("evt-gala", "King oyster mushroom steak", "Main", ["vegan"], 60, 38, "Two dedicated vegan tables."),
    dish("evt-gala", "Dark chocolate crémeux", "Dessert", ["gluten-free"], 300, 16),
    dish("evt-gala", "Petit fours", "Dessert", ["nut-free"], 300, 9, "Nut-free kitchen — one attendee with a nut allergy."),
    dish("evt-cab", "Breakfast pastries and fruit", "Breakfast", ["vegetarian"], 24, null),
    dish("evt-cab", "Grain bowls with three protein options", "Lunch", ["gluten-free", "vegan option"], 24, null, "One dairy-free, one gluten-free, one vegetarian flag."),
  ];

  /* ----------------------------------------------------------- inspiration */

  const inspirations: EventInspiration[] = [
    { id: "insp-1", eventId: "evt-gala", url: "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200", caption: "Table setting direction — low florals, warm brass", sortOrder: 1, createdAt: at(-22) },
    { id: "insp-2", eventId: "evt-gala", url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=1200", caption: "Entry installation reference", sortOrder: 2, createdAt: at(-22) },
    { id: "insp-3", eventId: "evt-gala", url: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200", caption: "Lighting state for the live auction", sortOrder: 3, createdAt: at(-21) },
    { id: "insp-4", eventId: "evt-eng-offsite", url: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=1200", caption: "Breakout room layout — movable walls", sortOrder: 1, createdAt: at(-15) },
  ];

  /* -------------------------------------------------------------- templates */

  const templateChecklist = (titles: Array<[string, string]>) =>
    titles.map(([title, category], i) => ({
      id: `tcl-${title.slice(0, 6)}-${i}`,
      title,
      description: null,
      completed: false,
      dueDate: null,
      assignedTo: null,
      category,
      sortOrder: i + 1,
      createdAt: at(-365),
    }));

  const templates: (Template & TemplateContents)[] = [
    {
      id: "tpl-summit",
      ownerId: DEMO_OWNER_ID,
      name: "Multi-day summit playbook",
      description: "Everything a 300+ attendee, multi-day summit needs. Built from three years of kickoffs.",
      category: "Summit",
      defaultCapacity: 400,
      checklistCount: 9,
      runOfShowCount: 6,
      budgetCount: 6,
      createdAt: at(-365),
      checklistItems: templateChecklist([
        ["Sign venue contract", "Venue"],
        ["Confirm catering headcount", "Catering"],
        ["AV rig walkthrough", "AV"],
        ["Publish agenda", "Marketing"],
        ["Badge and signage print approval", "Print"],
        ["Shuttle schedule", "Logistics"],
        ["Speaker deck collection", "Programme"],
        ["Staffing brief", "Staffing"],
        ["Post-event survey scheduled", "Marketing"],
      ]),
      runOfShowItems: [
        { id: "tros-1", startTime: "06:00", duration: 120, title: "AV load-in", description: null, responsible: "AV vendor", sortOrder: 1, createdAt: at(-365) },
        { id: "tros-2", startTime: "08:00", duration: 60, title: "Registration opens", description: null, responsible: "Staffing", sortOrder: 2, createdAt: at(-365) },
        { id: "tros-3", startTime: "09:00", duration: 30, title: "Welcome", description: null, responsible: "Host", sortOrder: 3, createdAt: at(-365) },
        { id: "tros-4", startTime: "09:30", duration: 45, title: "Keynote", description: null, responsible: "Programme", sortOrder: 4, createdAt: at(-365) },
        { id: "tros-5", startTime: "12:00", duration: 60, title: "Lunch", description: null, responsible: "Catering", sortOrder: 5, createdAt: at(-365) },
        { id: "tros-6", startTime: "17:00", duration: 60, title: "Close and teardown", description: null, responsible: "AV vendor", sortOrder: 6, createdAt: at(-365) },
      ],
      budgetItems: [
        { id: "tbud-1", name: "Venue rental", category: "Venue", type: "expense", estimatedCents: usd(90000), actualCents: null, notes: null, sortOrder: 1, createdAt: at(-365) },
        { id: "tbud-2", name: "AV production", category: "AV", type: "expense", estimatedCents: usd(28000), actualCents: null, notes: null, sortOrder: 2, createdAt: at(-365) },
        { id: "tbud-3", name: "Catering", category: "Catering", type: "expense", estimatedCents: usd(40000), actualCents: null, notes: null, sortOrder: 3, createdAt: at(-365) },
        { id: "tbud-4", name: "Print and signage", category: "Print", type: "expense", estimatedCents: usd(3000), actualCents: null, notes: null, sortOrder: 4, createdAt: at(-365) },
        { id: "tbud-5", name: "Staffing", category: "Staffing", type: "expense", estimatedCents: usd(9000), actualCents: null, notes: null, sortOrder: 5, createdAt: at(-365) },
        { id: "tbud-6", name: "Internal allocation", category: "Funding", type: "revenue", estimatedCents: usd(220000), actualCents: null, notes: null, sortOrder: 6, createdAt: at(-365) },
      ],
    },
    {
      id: "tpl-offsite",
      ownerId: DEMO_OWNER_ID,
      name: "Team offsite starter",
      description: "Lightweight plan for a 20–60 person offsite. Two days, one venue, no AV crew.",
      category: "Offsite",
      defaultCapacity: 60,
      checklistCount: 6,
      runOfShowCount: 0,
      budgetCount: 4,
      createdAt: at(-300),
      checklistItems: templateChecklist([
        ["Hold rooms", "Venue"],
        ["Book transport", "Logistics"],
        ["Collect session proposals", "Programme"],
        ["Dietary requirements survey", "Catering"],
        ["Share pre-read", "Marketing"],
        ["Book facilitator", "Programme"],
      ]),
      runOfShowItems: [],
      budgetItems: [
        { id: "tbud-o1", name: "Venue and board", category: "Venue", type: "expense", estimatedCents: usd(50000), actualCents: null, notes: null, sortOrder: 1, createdAt: at(-300) },
        { id: "tbud-o2", name: "Transport", category: "Travel", type: "expense", estimatedCents: usd(6000), actualCents: null, notes: null, sortOrder: 2, createdAt: at(-300) },
        { id: "tbud-o3", name: "Facilitator", category: "Programme", type: "expense", estimatedCents: usd(4500), actualCents: null, notes: null, sortOrder: 3, createdAt: at(-300) },
        { id: "tbud-o4", name: "Team budget", category: "Funding", type: "revenue", estimatedCents: usd(70000), actualCents: null, notes: null, sortOrder: 4, createdAt: at(-300) },
      ],
    },
    {
      id: "tpl-gala",
      ownerId: DEMO_OWNER_ID,
      name: "Fundraising gala",
      description: "Ticketed dinner with silent auction, live auction and raffle. Includes the compliance steps people forget.",
      category: "Gala",
      defaultCapacity: 300,
      checklistCount: 7,
      runOfShowCount: 0,
      budgetCount: 5,
      createdAt: at(-280),
      checklistItems: templateChecklist([
        ["Confirm sponsor tiers", "Sponsorship"],
        ["Source auction items", "Fundraising"],
        ["Raffle licence application", "Compliance"],
        ["Table plan with dietary zones", "Catering"],
        ["Brief auction runners", "Staffing"],
        ["Payment collection process agreed", "Fundraising"],
        ["Thank-you and receipt run", "Fundraising"],
      ]),
      runOfShowItems: [],
      budgetItems: [
        { id: "tbud-g1", name: "Venue", category: "Venue", type: "expense", estimatedCents: usd(35000), actualCents: null, notes: null, sortOrder: 1, createdAt: at(-280) },
        { id: "tbud-g2", name: "Catering", category: "Catering", type: "expense", estimatedCents: usd(60000), actualCents: null, notes: null, sortOrder: 2, createdAt: at(-280) },
        { id: "tbud-g3", name: "Decor", category: "Decor", type: "expense", estimatedCents: usd(18000), actualCents: null, notes: null, sortOrder: 3, createdAt: at(-280) },
        { id: "tbud-g4", name: "Ticket revenue", category: "Tickets", type: "revenue", estimatedCents: usd(160000), actualCents: null, notes: null, sortOrder: 4, createdAt: at(-280) },
        { id: "tbud-g5", name: "Sponsorships", category: "Sponsorship", type: "revenue", estimatedCents: usd(200000), actualCents: null, notes: null, sortOrder: 5, createdAt: at(-280) },
      ],
    },
  ];

  /* -------------------------------------------------------------------- roi */

  const roi: EventRoi[] = [
    {
      eventId: "evt-townhall",
      eventCostCents: usd(21650),
      unitsSold: 0,
      avgItemPriceCents: 0,
      notes: "Internal event — measured on attendance (742 in room, 2,410 remote) rather than revenue.",
      updatedAt: at(-30),
    },
    {
      eventId: "evt-training",
      eventCostCents: usd(11580),
      unitsSold: 38,
      avgItemPriceCents: usd(600),
      notes: "38 of 40 seats filled. Two no-shows carried to cohort 5.",
      updatedAt: at(-65),
    },
  ];

  return {
    events,
    locations,
    attendees,
    registrations,
    vendors,
    vendorMessages,
    eventVendors,
    checklist,
    runOfShow,
    budget,
    menu,
    inspirations,
    tickets,
    auction,
    raffle,
    raffleTickets,
    sponsorships,
    templates,
    roi,
    settings: { ...DEFAULT_USER_SETTINGS },
  };
}
