import { normalizeTeamName } from "./normalize";
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

    if (!res.ok) {
      if (cached) return cached.data;
      return {};
    }

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

      result[normalizeTeamName(team.title)] = {
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
    // Stale-while-revalidate: return expired cache if available
    if (cached) return cached.data;
    return {};
  }
}

// Aliases: football-data.org name (lowercased) -> Understat key (lowercased)
const UNDERSTAT_ALIASES: Record<string, string> = {
  // Germany
  "fc bayern münchen": "bayern munich",
  "bayern münchen": "bayern munich",
  "bayer 04 leverkusen": "bayer leverkusen",
  "rb leipzig": "rasenballsport leipzig",
  "1. fc union berlin": "union berlin",
  "1. fc köln": "koln",
  "1. fc heidenheim 1846": "heidenheim",
  "vfb stuttgart": "stuttgart",
  "vfl wolfsburg": "wolfsburg",
  "vfl bochum 1848": "bochum",
  "tsg 1899 hoffenheim": "hoffenheim",
  "sv werder bremen": "werder bremen",
  "1. fsv mainz 05": "mainz 05",
  "borussia mönchengladbach": "borussia m.gladbach",
  // France
  "paris saint-germain fc": "paris saint germain",
  "paris saint-germain": "paris saint germain",
  "olympique de marseille": "marseille",
  "olympique lyonnais": "lyon",
  "rc strasbourg alsace": "strasbourg",
  "stade rennais fc 1901": "rennes",
  "stade rennais fc": "rennes",
  "as monaco fc": "monaco",
  "as monaco": "monaco",
  "losc lille": "lille",
  "montpellier hsc": "montpellier",
  "stade brestois 29": "brest",
  "as saint-étienne": "saint-etienne",
  "angers sco": "angers",
  "le havre ac": "le havre",
  // Spain
  "club atlético de madrid": "atletico madrid",
  "atlético de madrid": "atletico madrid",
  "fc barcelona": "barcelona",
  "real sociedad de fútbol": "real sociedad",
  "rcd espanyol de barcelona": "espanyol",
  "real betis balompié": "real betis",
  "rc celta de vigo": "celta vigo",
  "ca osasuna": "osasuna",
  "rcd mallorca": "mallorca",
  "ud las palmas": "las palmas",
  "deportivo alavés": "alaves",
  // Italy
  "ssc napoli": "napoli",
  "ac milan": "milan",
  "inter milan": "inter",
  "fc internazionale milano": "inter",
  "as roma": "roma",
  "ss lazio": "lazio",
  "atalanta bc": "atalanta",
  "acf fiorentina": "fiorentina",
  "torino fc": "torino",
  "bologna fc 1909": "bologna",
  "us sassuolo calcio": "sassuolo",
  "hellas verona fc": "verona",
  "us lecce": "lecce",
  "cagliari calcio": "cagliari",
  "genoa cfc": "genoa",
  "udinese calcio": "udinese",
  "empoli fc": "empoli",
  "como 1907": "como",
  "parma calcio 1913": "parma",
  "venezia fc": "venezia",
  // England
  "wolverhampton wanderers fc": "wolverhampton wanderers",
  "nottingham forest fc": "nottingham forest",
  "newcastle united fc": "newcastle united",
  "manchester united fc": "manchester united",
  "manchester city fc": "manchester city",
  "tottenham hotspur fc": "tottenham",
  "west ham united fc": "west ham united",
  "brighton & hove albion fc": "brighton",
  "crystal palace fc": "crystal palace",
  "leicester city fc": "leicester",
  "afc bournemouth": "bournemouth",
  "southampton fc": "southampton",
  "ipswich town fc": "ipswich",
};

export function findTeamXG(
  allXG: Record<string, TeamXG>,
  teamName: string
): TeamXG | null {
  const normalized = normalizeTeamName(teamName);
  const lowered = teamName.toLowerCase();

  // Exact match (Understat keys are lowercased titles)
  if (allXG[lowered]) return allXG[lowered];

  // Alias match (aliases use lowercased football-data.org names)
  const alias = UNDERSTAT_ALIASES[lowered];
  if (alias && allXG[alias]) return allXG[alias];

  // NFD-normalized exact match (handles diacritics: "Saint-Étienne" → "saintetienne")
  for (const [key, xg] of Object.entries(allXG)) {
    if (normalizeTeamName(key) === normalized) return xg;
  }

  // Best partial match: prefer longest key match to avoid "inter" matching "inter milan" over "internazionale"
  let bestMatch: TeamXG | null = null;
  let bestLen = 0;
  for (const [key, xg] of Object.entries(allXG)) {
    if (key.includes(lowered) || lowered.includes(key)) {
      const matchLen = Math.min(key.length, lowered.length);
      if (matchLen > bestLen) { bestMatch = xg; bestLen = matchLen; }
    }
  }
  if (bestMatch) return bestMatch;

  // Word-based match (e.g. "Manchester United FC" -> "Manchester United")
  const words = lowered.split(/\s+/).filter((w) => w.length > 3);
  for (const [key, xg] of Object.entries(allXG)) {
    if (words.length > 0 && words.every((w) => key.includes(w))) return xg;
  }

  return null;
}
