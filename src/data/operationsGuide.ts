export const OPERATIONS_SECTIONS = ["Start here", "Apparel & gear", "Bizy Link", "Tables", "Golf foursomes", "Sponsors & roadmap", "Wrap-up report"] as const;
export type OperationsSection = typeof OPERATIONS_SECTIONS[number];
export const OPERATIONS_LABELS: Record<OperationsSection, string> = {
  "Start here": "Start here", "Apparel & gear": "Sizes & supplies", "Bizy Link": "Share links",
  Tables: "Tables", "Golf foursomes": "Golf groups", "Sponsors & roadmap": "Sponsors & dates", "Wrap-up report": "Event report",
};
export const OPERATIONS_TOOLS: Record<OperationsSection, string> = {
  "Start here": "start", "Apparel & gear": "sizes", "Bizy Link": "links", Tables: "tables", "Golf foursomes": "golf", "Sponsors & roadmap": "sponsors", "Wrap-up report": "report",
};
export function operationsSectionFromSearch(search: string): OperationsSection {
  const tool = new URLSearchParams(search).get("tool");
  return OPERATIONS_SECTIONS.find(section => OPERATIONS_TOOLS[section] === tool) ?? "Start here";
}
