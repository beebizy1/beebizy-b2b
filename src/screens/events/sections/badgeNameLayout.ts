export type BadgeNameLayout = {
  line1: string;
  line2: string;
};

export function suggestBadgeNameLayout(name: string): BadgeNameLayout {
  const normalized = name.trim().replace(/\s+/g, " ");
  const words = normalized.split(" ").filter(Boolean);
  if (normalized.length <= 18 || words.length < 2) return { line1: normalized, line2: "" };

  let best = { line1: words[0]!, line2: words.slice(1).join(" ") };
  let bestLongestLine = Math.max(best.line1.length, best.line2.length);
  let bestDifference = Math.abs(best.line1.length - best.line2.length);
  for (let index = 2; index < words.length; index += 1) {
    const candidate = {
      line1: words.slice(0, index).join(" "),
      line2: words.slice(index).join(" "),
    };
    const longestLine = Math.max(candidate.line1.length, candidate.line2.length);
    const difference = Math.abs(candidate.line1.length - candidate.line2.length);
    if (longestLine < bestLongestLine || (longestLine === bestLongestLine && difference < bestDifference)) {
      best = candidate;
      bestLongestLine = longestLine;
      bestDifference = difference;
    }
  }
  return best;
}
