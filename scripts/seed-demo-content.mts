/**
 * Seeds demo-ready content into a live workspace.
 *
 * Two things a fresh workspace has no way to show: a guest list, and templates. This
 * inserts both, so Registrations, Analytics, capacity bars and the Templates screen all
 * have something real behind them.
 *
 * Everything it writes is tagged with a marker in a text column, so `--undo` removes
 * exactly what this script added and nothing else. It never updates or deletes existing
 * rows, and it never touches events, locations or vendors.
 *
 *   npx tsx scripts/seed-demo-content.mts --workspace ws_xxx [--dry-run]
 *   npx tsx scripts/seed-demo-content.mts --workspace ws_xxx --undo
 *
 * `--bootstrap-user user_xxx` provisions a workspace first, for someone who has a Clerk
 * account but has never signed in and so has no workspace yet. It creates exactly the
 * rows the API would create on their first request, plus demo events, so their first
 * sign-in lands on a populated workspace rather than an empty one.
 */

import { neon } from "@neondatabase/serverless";
import { CHECKLIST_LIBRARY, CHECKLIST_PACKAGES } from "../src/data/checklistLibrary";

const MARKER = "[seed:demo-content]";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const bootstrapUser = value("bootstrap-user");
const dryRun = flag("dry-run");
const undo = flag("undo");

if (!value("workspace") && !bootstrapUser) {
  console.error("Missing --workspace ws_xxx (or --bootstrap-user user_xxx)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL!);
const rid = (prefix: string) =>
  `${prefix}_${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;

/**
 * Events a fresh workspace needs before registrations have anywhere to attach. Offsets
 * are days from today, so the set always straddles past and future and the dashboard's
 * next-30-days panel is never empty.
 */
const BOOTSTRAP_EVENTS: Array<[string, string, number, number | null, string, string]> = [
  ["Annual Partner Gala & Fundraiser", "Gala", 74, 300, "published", "Black tie. Silent auction at reception, live auction after dinner."],
  ["Global Sales Kickoff", "Summit", 6, 450, "published", "Two-day kickoff with breakouts and an evening reception."],
  ["Customer Advisory Board — Spring", "Conference", 2, 24, "published", "Half-day session with the advisory board."],
  ["Product Launch — Press & Analyst Day", "Product Launch", 19, 180, "published", "Demos, briefings and a media room."],
  ["Design Systems Training — Cohort 4", "Training", -65, 40, "completed", "Two-day practitioner training."],
];

/* ---------------------------------------------------------------------- people */

/**
 * Plausible business names rather than Jane Doe, because these appear on a screen in
 * front of an audience and placeholder names read as an unfinished product.
 */
const PEOPLE: Array<[string, string, string | null]> = [
  ["Priya Raghunathan", "priya.r@meridianhealth.com", "VP Ops — advisory board chair"],
  ["Daniel Okonkwo", "d.okonkwo@lattice-bio.com", null],
  ["Sofia Marchetti", "sofia@vellumdesign.studio", "Requested vegetarian"],
  ["Marcus Lindqvist", "m.lindqvist@nordkraft.se", "Flying in from Stockholm"],
  ["Yuki Tanabe", "y.tanabe@sakura-logistics.jp", null],
  ["Amara Bello", "amara.bello@fieldstone.co", "Accessibility: step-free access"],
  ["Tomás Herrera", "therrera@puertoworks.mx", null],
  ["Nina Kowalski", "nina@brightloop.io", "Speaker — panel 2"],
  ["Grace Oyelaran", "grace@harborline.com", null],
  ["Felix Hartmann", "f.hartmann@altbau-partners.de", "Dietary: no shellfish"],
  ["Rosalind Achebe", "r.achebe@cadenceanalytics.com", null],
  ["Wei Chen", "wei.chen@pinnacle-mfg.com", "Table host"],
  ["Aisha Nurse", "aisha@northstarvc.com", null],
  ["Diego Ferreira", "diego.f@solariscap.br", "Sponsor contact"],
  ["Hannah Sørensen", "hannah@fjordworks.dk", null],
  ["Jamal Whitfield", "jwhitfield@cascadecapital.com", "Gold sponsor — stage naming"],
  ["Camille Dubois", "camille@atelier-nord.fr", "Donating an auction lot"],
  ["Meera Iyer", "meera.iyer@kalyanhealth.in", null],
  ["Oliver Ashworth", "o.ashworth@thamesbridge.co.uk", "Plus one"],
  ["Elena Vasquez", "elena@puntoverde.es", null],
  ["Kwame Mensah", "kwame@accralabs.gh", "First-time attendee"],
  ["Naomi Bergstrom", "naomi@northstarvc.com", "Reception naming sponsor"],
  ["Ivan Petrov", "ivan.p@volnastudios.com", null],
  ["Fatima Al-Rashid", "fatima@gulfstream-partners.ae", "VIP — seat near stage"],
  ["Lucas Moreau", "lucas@bellecour.fr", null],
  ["Sanjay Kapoor", "sanjay@indusventure.in", "Panel moderator"],
  ["Bridget Kelly", "bridget@shannonworks.ie", null],
  ["Tobias Reinhardt", "tobias@hanseatic-gmbh.de", "Dietary: vegan"],
];

/* ------------------------------------------------------------------- templates */

/** Cue sheets keyed to the kind of event, so a template is useful the moment it loads. */
const RUN_OF_SHOW: Record<string, Array<[string, number, string, string | null]>> = {
  gala: [
    ["15:00", 120, "Venue access and load-in", "Logistics"],
    ["17:00", 60, "AV check and rehearsal", "AV lead"],
    ["18:00", 60, "Registration and drinks reception", "Front of house"],
    ["19:00", 15, "Guests seated, welcome remarks", "Host"],
    ["19:15", 75, "Dinner service", "Catering"],
    ["20:30", 30, "Live auction", "Auctioneer"],
    ["21:00", 15, "Raffle draw", "Host"],
    ["21:15", 15, "Closing remarks and thanks", "Host"],
    ["21:30", 90, "Carriages and teardown", "Logistics"],
  ],
  conference: [
    ["07:00", 60, "Venue setup and AV check", "AV lead"],
    ["08:00", 60, "Vendor load-in", "Logistics"],
    ["09:00", 30, "Registration opens", "Front of house"],
    ["09:30", 30, "Welcome networking coffee", "Front of house"],
    ["10:00", 60, "Opening keynote", "Host"],
    ["11:30", 60, "Breakout sessions", "Programme"],
    ["12:30", 60, "Lunch service", "Catering"],
    ["14:00", 90, "Afternoon sessions", "Programme"],
    ["16:00", 60, "Panel discussion", "Host"],
    ["17:00", 90, "Cocktail reception", "Catering"],
    ["18:30", 60, "Event close and teardown", "Logistics"],
  ],
  workshop: [
    ["08:30", 30, "Room setup and materials out", "Facilitator"],
    ["09:00", 30, "Arrivals and coffee", "Front of house"],
    ["09:30", 90, "Session one", "Facilitator"],
    ["11:00", 15, "Break", null],
    ["11:15", 105, "Session two", "Facilitator"],
    ["13:00", 45, "Lunch", "Catering"],
    ["13:45", 90, "Working groups", "Facilitator"],
    ["15:15", 45, "Playback and next steps", "Facilitator"],
    ["16:00", 30, "Teardown", "Logistics"],
  ],
};

/** Percentage splits, applied to the template's default budget. */
const BUDGET_SPLIT: Record<string, Array<[string, string, number]>> = {
  gala: [
    ["Venue and ballroom", "Venue", 24],
    ["Catering and bar", "Catering", 30],
    ["AV and staging", "AV", 14],
    ["Florals and decor", "Decor", 10],
    ["Entertainment", "Entertainment", 8],
    ["Photography", "Photography", 5],
    ["Print and signage", "Print", 4],
    ["Staffing", "Staffing", 5],
  ],
  conference: [
    ["Venue hire", "Venue", 30],
    ["Catering", "Catering", 26],
    ["AV and technology", "AV", 18],
    ["Speaker fees and travel", "Programme", 12],
    ["Badges and print", "Print", 6],
    ["Photography and video", "Photography", 4],
    ["Staffing", "Staffing", 4],
  ],
  workshop: [
    ["Room hire", "Venue", 34],
    ["Catering", "Catering", 30],
    ["AV and equipment", "AV", 16],
    ["Materials and print", "Print", 12],
    ["Facilitation", "Staffing", 8],
  ],
};

interface TemplateSpec {
  name: string;
  description: string;
  category: string;
  capacity: number;
  budget: number;
  packageId: string;
  shape: keyof typeof RUN_OF_SHOW;
}

const TEMPLATES: TemplateSpec[] = [
  {
    name: "Nonprofit Gala & Fundraiser",
    description: "Black-tie dinner with silent auction, live auction and a raffle draw.",
    category: "Gala",
    capacity: 300,
    budget: 120_000,
    packageId: "nonprofit_fundraiser",
    shape: "gala",
  },
  {
    name: "Corporate Conference",
    description: "Full-day summit with keynote, breakouts and an evening reception.",
    category: "Conference",
    capacity: 450,
    budget: 180_000,
    packageId: "corporate_conference",
    shape: "conference",
  },
  {
    name: "Product Launch",
    description: "Press and analyst day with demos, briefings and a media room.",
    category: "Product Launch",
    capacity: 180,
    budget: 95_000,
    packageId: "product_launch",
    shape: "conference",
  },
  {
    name: "Workshop / Training Day",
    description: "Single-room training day with catering and printed materials.",
    category: "Training",
    capacity: 40,
    budget: 14_000,
    packageId: "workshop_training",
    shape: "workshop",
  },
  {
    name: "Team Offsite",
    description: "Away day with activities, lunch and a facilitated retro.",
    category: "Offsite",
    capacity: 60,
    budget: 22_000,
    packageId: "team_building",
    shape: "workshop",
  },
];

function categoryFor(title: string): string {
  return CHECKLIST_LIBRARY.find((task) => task.title === title)?.category ?? "General";
}

function buildContents(spec: TemplateSpec) {
  const now = new Date().toISOString();
  const pkg = CHECKLIST_PACKAGES.find((p) => p.id === spec.packageId);
  if (!pkg) throw new Error(`Unknown checklist package: ${spec.packageId}`);

  return {
    checklistItems: pkg.tasks.map((title, i) => ({
      id: rid("tci"),
      title,
      description: null,
      completed: false,
      dueDate: null,
      assignedTo: null,
      category: categoryFor(title),
      sortOrder: i + 1,
      createdAt: now,
    })),
    runOfShowItems: RUN_OF_SHOW[spec.shape]!.map(([startTime, duration, title, responsible], i) => ({
      id: rid("trs"),
      startTime,
      duration,
      title,
      description: null,
      responsible,
      sortOrder: i + 1,
      createdAt: now,
    })),
    budgetItems: BUDGET_SPLIT[spec.shape]!.map(([name, category, pct], i) => ({
      id: rid("tbi"),
      name,
      category,
      type: "expense" as const,
      estimatedCents: Math.round(spec.budget * (pct / 100)) * 100,
      actualCents: null,
      notes: null,
      sortOrder: i + 1,
      createdAt: now,
    })),
  };
}

/* ------------------------------------------------------------------------ run */

if (undo) {
  const workspaceId = value("workspace")!;
  // Registrations cascade from both events and guests, so they need no separate sweep.
  const e = await sql`delete from events    where workspace_id = ${workspaceId} and description like ${"%" + MARKER} returning id`;
  const g = await sql`delete from guests    where workspace_id = ${workspaceId} and notes       like ${"%" + MARKER} returning id`;
  const t = await sql`delete from templates where workspace_id = ${workspaceId} and description like ${"%" + MARKER} returning id`;
  console.log(`Removed ${e.length} events, ${g.length} guests and ${t.length} templates. Registrations cascaded.`);
  process.exit(0);
}

let workspaceId = value("workspace");

if (bootstrapUser || flag("with-events")) {
  const [existing] = bootstrapUser
    ? await sql`select workspace_id from workspace_members where user_id = ${bootstrapUser} limit 1`
    : [{ workspace_id: value("workspace")! }];

  if (existing) {
    workspaceId = (existing as { workspace_id: string }).workspace_id;
    console.log(`${bootstrapUser} already owns ${workspaceId} — seeding that instead of creating another.`);
  } else {
    workspaceId = rid("ws");
    // Exactly what resolveWorkspace() writes on a first request, defaults and all.
    await sql`insert into workspaces (id, name) values (${workspaceId}, ${"My workspace"})`;
    await sql`insert into workspace_members (workspace_id, user_id, role)
              values (${workspaceId}, ${bootstrapUser}, ${"owner"})`;
    console.log(`Provisioned ${workspaceId} for ${bootstrapUser}.`);
  }

  const [{ n }] = (await sql`
    select count(*)::int as n from events where workspace_id = ${workspaceId}
    and description like ${"%" + MARKER}`) as Array<{ n: number }>;
  if (n === 0) {
    for (const [title, category, dayOffset, capacity, status, description] of BOOTSTRAP_EVENTS) {
      await sql`
        insert into events (id, workspace_id, title, description, category, status, capacity, starts_at)
        values (${rid("evt")}, ${workspaceId}, ${title}, ${`${description} ${MARKER}`}, ${category}, ${status},
                ${capacity}, now() + (${dayOffset} || ' days')::interval)`;
    }
    console.log(`Inserted ${BOOTSTRAP_EVENTS.length} events.`);
  }
}

const events = await sql`
  select id, capacity, status from events where workspace_id = ${workspaceId} order by starts_at`;

if (events.length === 0) {
  console.error(`Workspace ${workspaceId} has no events — registrations would have nothing to attach to.`);
  process.exit(1);
}

console.log(`Workspace ${workspaceId}: ${events.length} events`);
console.log(`Would insert: ${PEOPLE.length} guests, ${TEMPLATES.length} templates, plus registrations.`);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  for (const spec of TEMPLATES) {
    const c = buildContents(spec);
    console.log(
      `  ${spec.name.padEnd(30)} ${c.checklistItems.length} tasks, ${c.runOfShowItems.length} cues, ${c.budgetItems.length} budget lines`,
    );
  }
  process.exit(0);
}

const guestIds: string[] = [];
for (const [name, contact, notes] of PEOPLE) {
  const id = rid("gst");
  await sql`
    insert into guests (id, workspace_id, name, contact, notes)
    values (${id}, ${workspaceId}, ${name}, ${contact}, ${notes ? `${notes} ${MARKER}` : MARKER})`;
  guestIds.push(id);
}
console.log(`Inserted ${guestIds.length} guests.`);

/**
 * Spread guests across events with a believable status mix. Roughly two thirds confirmed
 * so capacity bars and the confirmed count both read as a live event rather than an
 * empty one or a suspiciously perfect one.
 */
let registrations = 0;
for (const [index, event] of events.entries()) {
  const capacity = (event as { capacity: number | null }).capacity;
  const share = capacity && capacity < guestIds.length ? Math.max(6, Math.floor(capacity * 0.15)) : 14;
  const slice = guestIds.slice((index * 5) % guestIds.length).slice(0, share);

  for (const [i, guestId] of slice.entries()) {
    const status = i % 3 === 2 ? "pending" : "confirmed";
    const daysAgo = 30 - i;
    await sql`
      insert into registrations (id, workspace_id, event_id, guest_id, status, registered_at)
      values (${rid("reg")}, ${workspaceId}, ${(event as { id: string }).id}, ${guestId}, ${status},
              now() - (${daysAgo} || ' days')::interval)`;
    registrations += 1;
  }
}
console.log(`Inserted ${registrations} registrations across ${events.length} events.`);

for (const spec of TEMPLATES) {
  await sql`
    insert into templates (id, workspace_id, name, description, category, default_capacity, contents)
    values (${rid("tpl")}, ${workspaceId}, ${spec.name}, ${`${spec.description} ${MARKER}`},
            ${spec.category}, ${spec.capacity}, ${JSON.stringify(buildContents(spec))}::jsonb)`;
}
console.log(`Inserted ${TEMPLATES.length} templates.`);
console.log(`\nDone. Undo with: npx tsx scripts/seed-demo-content.mts --workspace ${workspaceId} --undo`);
