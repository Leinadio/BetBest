import { TeamXG } from "./types";

const UNDERSTAT_LEAGUES: Record<string, string> = {
  PL: "EPL",
  PD: "La_liga",
  BL1: "Bundesliga",
  SA: "Serie_A",
  FL1: "Ligue_1",
};

interface UnderstatTeamHistory {
  xG: number;
  xGA: number;
  scored: number;
  missed: number;
  xpts: number;
  result: string;
  date: string;
}

interface UnderstatTeam {
  id: string;
  title: string;
  history: UnderstatTeamHistory[];
}

interface UnderstatResponse {
  teams: Record<string, UnderstatTeam>;
}

const cache = new Map<string, { data: Record<string, TeamXG>; ts: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCurrentSeason(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

export async function getLeagueXG(
  leagueCode: string
): Promise<Record<string, TeamXG>> {
  const understatLeague = UNDERSTAT_LEAGUES[leagueCode];
  if (!understatLeague) return {};

  const cacheKey = `${understatLeague}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const season = getCurrentSeason();

  try {
    const res = await fetch(
      `https://understat.com/getLeagueData/${understatLeague}/${season}`,
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0",
          "Accept-Encoding": "gzip, deflate, br",
        },
        next: { revalidate: 21600 },
      }
    );

    if (!res.ok) return {};

    const data = (await res.json()) as UnderstatResponse;
    const result: Record<string, TeamXG> = {};

    for (const team of Object.values(data.teams)) {
      const history = team.history;
      if (history.length === 0) continue;

      // Season totals
      const totalXG = history.reduce((s, h) => s + h.xG, 0);
      const totalXGA = history.reduce((s, h) => s + h.xGA, 0);
      const totalScored = history.reduce((s, h) => s + h.scored, 0);
      const matches = history.length;

      const seasonXGPM = totalXG / matches;
      const seasonXGAPM = totalXGA / matches;

      // Recent 5 matches momentum
      const RECENT_N = 5;
      const recentMatches = history.slice(-RECENT_N);
      const recentXG = recentMatches.reduce((s, h) => s + h.xG, 0);
      const recentXGA = recentMatches.reduce((s, h) => s + h.xGA, 0);
      const recentCount = recentMatches.length;

      const recentXGPM = recentCount > 0 ? recentXG / recentCount : seasonXGPM;
      const recentXGAPM = recentCount > 0 ? recentXGA / recentCount : seasonXGAPM;

      // Trend: combine attack improvement (xG up) and defense improvement (xGA down)
      const attackDelta = recentXGPM - seasonXGPM;
      const defenseDelta = seasonXGAPM - recentXGAPM;
      const xGTrend = Math.max(-1, Math.min(1, (attackDelta + defenseDelta) / 2));

      result[team.title.toLowerCase()] = {
        team: team.title,
        matches,
        xG: Math.round(totalXG * 100) / 100,
        xGA: Math.round(totalXGA * 100) / 100,
        xGPerMatch: Math.round(seasonXGPM * 100) / 100,
        xGAPerMatch: Math.round(seasonXGAPM * 100) / 100,
        xGDiff: Math.round((totalXG - totalScored) * 100) / 100,
        recentXGPerMatch: Math.round(recentXGPM * 100) / 100,
        recentXGAPerMatch: Math.round(recentXGAPM * 100) / 100,
        xGTrend: Math.round(xGTrend * 100) / 100,
      };
    }

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (error) {
    console.error(`Understat xG fetch failed for ${leagueCode}:`, error);
    return {};
  }
}

export function findTeamXG(
  allXG: Record<string, TeamXG>,
  teamName: string
): TeamXG | null {
  const normalized = teamName.toLowerCase();

  // Exact match
  if (allXG[normalized]) return allXG[normalized];

  // Partial match
  for (const [key, xg] of Object.entries(allXG)) {
    if (key.includes(normalized) || normalized.includes(key)) return xg;
  }

  // Word-based match (e.g. "Manchester United FC" -> "Manchester United")
  const words = normalized.split(/\s+/).filter((w) => w.length > 3);
  for (const [key, xg] of Object.entries(allXG)) {
    if (words.every((w) => key.includes(w))) return xg;
  }

  return null;
}
