import type { FloorplanShape } from "@/data/entities";

export interface FloorplanShapeSpec {
  label: string;
  width: number;
  height: number;
  seats: number | null;
  round: boolean;
  className: string;
}

export const FLOORPLAN_SHAPE_SPECS: Record<FloorplanShape, FloorplanShapeSpec> = {
  "round-table": { label: "Round table", width: 9, height: 12, seats: 10, round: true, className: "bg-primary-muted border-primary/40 text-foreground" },
  "cocktail-table": { label: "Highboy / cocktail", width: 4, height: 6, seats: null, round: true, className: "bg-warning-tint border-warning/40 text-warning-text" },
  "long-table": { label: "Long table", width: 22, height: 7, seats: 16, round: false, className: "bg-primary-muted border-primary/40 text-foreground" },
  stage: { label: "Stage", width: 30, height: 9, seats: null, round: false, className: "bg-secondary border-secondary text-secondary-foreground" },
  bar: { label: "Bar", width: 8, height: 16, seats: null, round: false, className: "bg-info-tint border-info/40 text-info-text" },
  entrance: { label: "Entrance", width: 12, height: 6, seats: null, round: false, className: "bg-success-tint border-success/40 text-success-text" },
  dancefloor: { label: "Dance floor", width: 24, height: 20, seats: null, round: false, className: "bg-surface-sunken border-dashed border-muted-foreground/50 text-muted-foreground" },
  booth: { label: "Booth", width: 10, height: 10, seats: 4, round: false, className: "bg-warning-tint border-warning/40 text-warning-text" },
  av: { label: "AV desk", width: 9, height: 7, seats: null, round: false, className: "bg-muted border-muted-foreground/40 text-muted-foreground" },
  tree: { label: "Tree", width: 7, height: 10, seats: null, round: true, className: "bg-success-tint border-success/50 text-success-text" },
  chair: { label: "Chair", width: 4, height: 6, seats: 1, round: false, className: "bg-surface border-muted-foreground/40 text-foreground" },
  "chair-row": { label: "Row of chairs", width: 24, height: 6, seats: 8, round: false, className: "bg-surface border-primary/40 text-foreground" },
  "custom-shape": { label: "Custom shape", width: 18, height: 14, seats: null, round: false, className: "border-transparent bg-transparent text-info-text shadow-none" },
  image: { label: "Image", width: 18, height: 14, seats: null, round: false, className: "border-primary/40 bg-surface text-foreground" },
  text: { label: "Text box", width: 20, height: 7, seats: null, round: false, className: "border-dashed border-primary/40 bg-surface/90 text-foreground" },
};
