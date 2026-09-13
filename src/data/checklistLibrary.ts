/**
 * The starter checklist library.
 *
 * Two ways in: a package, which is a whole event type's worth of tasks in one go, and
 * the individual task list for topping up. Both are static content rather than data —
 * they are suggestions the product ships with, not records a workspace owns — so they
 * live in source and cost no fetch.
 *
 * Package tasks are titles that must exist in `CHECKLIST_LIBRARY`; the test enforces it,
 * so a typo in a package can't silently add a task with no category.
 */

export interface LibraryTask {
  title: string;
  category: string;
}

export interface ChecklistPackage {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tasks: string[];
}

export const CHECKLIST_CATEGORIES = [
  "General",
  "Venue",
  "Catering",
  "AV/Tech",
  "Staffing",
  "Marketing",
  "Logistics",
  "Safety",
] as const;

export const CHECKLIST_LIBRARY: LibraryTask[] = [
  { title: "Book venue / conference space", category: "Venue" },
  { title: "Confirm venue capacity", category: "Venue" },
  { title: "Visit venue for site inspection", category: "Venue" },
  { title: "Arrange parking logistics", category: "Venue" },
  { title: "Check ADA accessibility", category: "Venue" },
  { title: "Confirm setup and breakdown times", category: "Venue" },
  { title: "Arrange venue insurance certificate", category: "Venue" },
  { title: "Book AV equipment", category: "AV/Tech" },
  { title: "Test sound system", category: "AV/Tech" },
  { title: "Arrange projector / screens", category: "AV/Tech" },
  { title: "Set up livestream / recording", category: "AV/Tech" },
  { title: "Test internet connectivity", category: "AV/Tech" },
  { title: "Arrange backup equipment on-site", category: "AV/Tech" },
  { title: "Arrange stage lighting", category: "AV/Tech" },
  { title: "Confirm menu with caterer", category: "Catering" },
  { title: "Arrange dietary options (vegan, gluten-free, etc.)", category: "Catering" },
  { title: "Plan catering staff count", category: "Catering" },
  { title: "Arrange bar / beverage service", category: "Catering" },
  { title: "Coordinate catering setup / breakdown time", category: "Catering" },
  { title: "Order coffee and snacks for registration", category: "Catering" },
  { title: "Create event page / website", category: "Marketing" },
  { title: "Send save-the-date emails", category: "Marketing" },
  { title: "Launch social media campaign", category: "Marketing" },
  { title: "Design promotional materials", category: "Marketing" },
  { title: "Send final reminder to attendees", category: "Marketing" },
  { title: "Arrange event photography / videography", category: "Marketing" },
  { title: "Press release / media outreach", category: "Marketing" },
  { title: "Confirm event manager assignment", category: "Staffing" },
  { title: "Recruit and brief volunteers", category: "Staffing" },
  { title: "Brief security team", category: "Staffing" },
  { title: "Assign staff roles and responsibilities", category: "Staffing" },
  { title: "Create staff schedule", category: "Staffing" },
  { title: "Create event run of show", category: "Logistics" },
  { title: "Order name badges / lanyards", category: "Logistics" },
  { title: "Arrange transportation / shuttle service", category: "Logistics" },
  { title: "Set up registration desk", category: "Logistics" },
  { title: "Print directions and venue signage", category: "Logistics" },
  { title: "Coordinate gift bags / swag", category: "Logistics" },
  { title: "First aid kit on-site", category: "Safety" },
  { title: "Emergency contact list distributed", category: "Safety" },
  { title: "Fire exits and safety briefing", category: "Safety" },
  { title: "Send thank-you emails to attendees", category: "General" },
  { title: "Collect attendee feedback / survey", category: "General" },
  { title: "Write event summary report", category: "General" },
  { title: "Review event financials vs. budget", category: "General" },
  { title: "Archive event materials and photos", category: "General" },
];

export const CHECKLIST_PACKAGES: ChecklistPackage[] = [
  {
    id: "corporate_conference",
    name: "Corporate Conference",
    description: "Full-scale conference or summit",
    emoji: "\ud83c\udfdb",
    tasks: [
      "Book venue / conference space",
      "Confirm venue capacity",
      "Book AV equipment",
      "Test sound system",
      "Arrange projector / screens",
      "Set up livestream / recording",
      "Confirm menu with caterer",
      "Arrange dietary options (vegan, gluten-free, etc.)",
      "Arrange bar / beverage service",
      "Create event page / website",
      "Send save-the-date emails",
      "Design promotional materials",
      "Send final reminder to attendees",
      "Arrange event photography / videography",
      "Confirm event manager assignment",
      "Brief security team",
      "Create event run of show",
      "Order name badges / lanyards",
      "Set up registration desk",
      "Print directions and venue signage",
      "First aid kit on-site",
    ],
  },
  {
    id: "workshop_training",
    name: "Workshop / Training",
    description: "Internal or external skills workshop",
    emoji: "\ud83d\udcda",
    tasks: [
      "Book venue / conference space",
      "Book AV equipment",
      "Test sound system",
      "Arrange projector / screens",
      "Test internet connectivity",
      "Confirm menu with caterer",
      "Order coffee and snacks for registration",
      "Send save-the-date emails",
      "Send final reminder to attendees",
      "Assign staff roles and responsibilities",
      "Create event run of show",
      "Set up registration desk",
    ],
  },
  {
    id: "team_building",
    name: "Team Building Day",
    description: "Social, offsite, or team bonding event",
    emoji: "\ud83e\udd1d",
    tasks: [
      "Book venue / conference space",
      "Arrange parking logistics",
      "Confirm menu with caterer",
      "Arrange bar / beverage service",
      "Order coffee and snacks for registration",
      "Send save-the-date emails",
      "Send final reminder to attendees",
      "Arrange event photography / videography",
      "Arrange transportation / shuttle service",
      "Create event run of show",
      "First aid kit on-site",
    ],
  },
  {
    id: "product_launch",
    name: "Product Launch",
    description: "Press event, demo day, or announcement",
    emoji: "\ud83d\ude80",
    tasks: [
      "Book venue / conference space",
      "Book AV equipment",
      "Test sound system",
      "Arrange projector / screens",
      "Set up livestream / recording",
      "Arrange stage lighting",
      "Confirm menu with caterer",
      "Arrange bar / beverage service",
      "Create event page / website",
      "Send save-the-date emails",
      "Launch social media campaign",
      "Design promotional materials",
      "Press release / media outreach",
      "Arrange event photography / videography",
      "Confirm event manager assignment",
      "Create event run of show",
      "Order name badges / lanyards",
      "Set up registration desk",
    ],
  },
  {
    id: "nonprofit_fundraiser",
    name: "Nonprofit Fundraiser",
    description: "Charity gala, community event, or donor night",
    emoji: "\ud83d\udc9b",
    tasks: [
      "Book venue / conference space",
      "Confirm venue capacity",
      "Check ADA accessibility",
      "Confirm menu with caterer",
      "Arrange bar / beverage service",
      "Create event page / website",
      "Launch social media campaign",
      "Send save-the-date emails",
      "Send final reminder to attendees",
      "Arrange event photography / videography",
      "Recruit and brief volunteers",
      "Assign staff roles and responsibilities",
      "Create event run of show",
      "Set up registration desk",
      "First aid kit on-site",
      "Collect attendee feedback / survey",
    ],
  },
  {
    id: "annual_retreat",
    name: "Annual Company Retreat",
    description: "Multi-day company offsite with activities",
    emoji: "\ud83c\udfd4",
    tasks: [
      "Book venue / conference space",
      "Confirm venue capacity",
      "Visit venue for site inspection",
      "Arrange parking logistics",
      "Confirm menu with caterer",
      "Arrange dietary options (vegan, gluten-free, etc.)",
      "Arrange bar / beverage service",
      "Arrange transportation / shuttle service",
      "Send save-the-date emails",
      "Send final reminder to attendees",
      "Arrange event photography / videography",
      "Confirm event manager assignment",
      "Assign staff roles and responsibilities",
      "Create event run of show",
      "Coordinate gift bags / swag",
      "First aid kit on-site",
      "Emergency contact list distributed",
      "Collect attendee feedback / survey",
    ],
  },
];

/** Category for a library title, defaulting to General for anything unknown. */
export function categoryForTask(title: string): string {
  return CHECKLIST_LIBRARY.find((task) => task.title === title)?.category ?? "General";
}
