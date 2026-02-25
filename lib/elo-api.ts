import { normalizeTeamName } from "./normalize";
import { TeamElo } from "./types";

const cache = new Map<string, { data: TeamElo[]; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (ELO changes slowly)

export async function getAllEloRatings(): Promise<TeamElo[]> {
  const cacheKey = "elo";
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(`http://api.clubelo.com/${today}`, {
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      // Stale-while-revalidate: return expired cache if available
      if (cached) return cached.data;
      return [];
    }

    const text = await res.text();
    const lines = text.trim().split("\n");
    // Header: Rank,Club,Country,Level,Elo,From,To
    const ratings: TeamElo[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      if (cols.length < 5) continue;
      ratings.push({
        team: cols[1],
        elo: parseFloat(cols[4]),
      });
    }

    cache.set(cacheKey, { data: ratings, ts: Date.now() });
    return ratings;
  } catch (error) {
    console.error("ClubElo fetch failed:", error);
    // Stale-while-revalidate: return expired cache if available
    if (cached) return cached.data;
    return [];
  }
}

export function findTeamElo(
  allElo: TeamElo[],
  teamName: string
): TeamElo | null {
  const lowered = teamName.toLowerCase();
  const normalized = normalizeTeamName(teamName);

  // Direct match
  const direct = allElo.find(
    (e) => e.team.toLowerCase() === lowered
  );
  if (direct) return direct;

  // Common name mappings (football-data.org -> ClubElo)
  const ALIASES: Record<string, string> = {
    "wolverhampton wanderers": "wolves",
    "wolverhampton": "wolves",
    "tottenham hotspur": "tottenham",
    "west ham united": "west ham",
    "newcastle united": "newcastle",
    "nottingham forest": "nott'm forest",
    "manchester united": "man united",
    "manchester city": "man city",
    "paris saint-germain": "paris sg",
    "atletico madrid": "atletico",
    "atletico de madrid": "atletico",
    "real sociedad": "real sociedad",
    "rcd espanyol": "espanyol",
    "borussia dortmund": "dortmund",
    "bayer leverkusen": "leverkusen",
    "rb leipzig": "leipzig",
    "bayern munich": "bayern",
    "bayern münchen": "bayern",
    "fc bayern münchen": "bayern",
    "as roma": "roma",
    "ac milan": "milan",
    "inter milan": "inter",
    "ssc napoli": "napoli",
    "olympique marseille": "marseille",
    "olympique lyonnais": "lyon",
    "olympique de marseille": "marseille",
    "as monaco": "monaco",
    "rc strasbourg alsace": "strasbourg",
    "fc barcelona": "barcelona",
    "sporting cp": "sporting",
    "sl benfica": "benfica",
    "fc porto": "porto",
  };

  const alias = ALIASES[lowered];
  if (alias) {
    const found = allElo.find(
      (e) => e.team.toLowerCase() === alias
    );
    if (found) return found;
  }

  // NFD-normalized match (handles diacritics: "Bayern München" → "bayernmunchen")
  const nfdMatch = allElo.find(
    (e) => normalizeTeamName(e.team) === normalized
  );
  if (nfdMatch) return nfdMatch;

  // Best partial match: prefer longest match to avoid ambiguity ("inter" vs "inter milan")
  const words = lowered
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["fc", "sc", "cf", "afc"].includes(w));

  let bestMatch: TeamElo | null = null;
  let bestLen = 0;
  for (const entry of allElo) {
    const eloLower = entry.team.toLowerCase();
    if (eloLower.includes(lowered) || lowered.includes(eloLower)) {
      const matchLen = Math.min(eloLower.length, lowered.length);
      if (matchLen > bestLen) { bestMatch = entry; bestLen = matchLen; }
    }
    if (!bestMatch && words.length > 0 && words.every((w) => eloLower.includes(w))) {
      bestMatch = entry;
      bestLen = words.join("").length;
    }
  }

  return bestMatch;
}
