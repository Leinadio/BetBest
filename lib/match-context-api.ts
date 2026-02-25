import { BASE_URL, getSeasonCandidates, LEAGUE_IDS, normalizeTeamName } from "./injuries-api";
import { MatchContext, MatchOdds, RefereeProfile, Standing, Stakes } from "./types";

async function fetchFromAPI<T>(path: string, apiKey: string): Promise<T | null> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 43200 },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// --- Referee stats ---

interface APIFixtureEvent {
  type: string;
  detail: string;
}

interface APIFixtureWithEvents {
  fixture: { id: number; referee: string | null };
  events: APIFixtureEvent[];
}

interface APIFixtureEventsResponse {
  response: APIFixtureWithEvents[];
}

export async function getRefereeStats(
  leagueCode: string,
  refereeName: string
): Promise<RefereeProfile | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey || !refereeName) return null;

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return null;

  const [current, fallback] = getSeasonCandidates();

  const data =
    (await fetchFromAPI<APIFixtureEventsResponse>(`/fixtures?league=${leagueId}&season=${current}`, apiKey)) ??
    (await fetchFromAPI<APIFixtureEventsResponse>(`/fixtures?league=${leagueId}&season=${fallback}`, apiKey));
  if (!data) return null;

  const normalizedRef = refereeName.toLowerCase().trim();
  const refFixtures = data.response.filter(
    (f) => f.fixture.referee?.toLowerCase().trim().includes(normalizedRef)
  );

  if (refFixtures.length === 0) return null;

  let totalYellows = 0;
  let totalReds = 0;
  let totalPenalties = 0;

  for (const fix of refFixtures) {
    for (const event of fix.events ?? []) {
      if (event.type === "Card" && event.detail === "Yellow Card") totalYellows++;
      if (event.type === "Card" && (event.detail === "Red Card" || event.detail === "Second Yellow card")) totalReds++;
      if (event.type === "Goal" && event.detail === "Penalty") totalPenalties++;
    }
  }

  const matches = refFixtures.length;
  return {
    name: refereeName,
    matchesOfficiated: matches,
    avgYellowsPerMatch: Math.round((totalYellows / matches) * 10) / 10,
    avgRedsPerMatch: Math.round((totalReds / matches) * 10) / 10,
    penaltiesAwarded: totalPenalties,
  };
}

// --- Betting odds (via the-odds-api.com) ---

const ODDS_SPORT_KEYS: Record<string, string> = {
  PL: "soccer_epl",
  PD: "soccer_spain_la_liga",
  SA: "soccer_italy_serie_a",
  BL1: "soccer_germany_bundesliga",
  FL1: "soccer_france_ligue_one",
  CL: "soccer_uefa_champs_league",
};

interface OddsAPIOutcome {
  name: string;
  price: number;
}

interface OddsAPIBookmaker {
  key: string;
  title: string;
  markets: { key: string; outcomes: OddsAPIOutcome[] }[];
}

interface OddsAPIEvent {
  home_team: string;
  away_team: string;
  bookmakers: OddsAPIBookmaker[];
}

const NOISE_WORDS = new Set(["fc", "rc", "sc", "ac", "cf", "de", "du", "le", "la", "les", "of", "the", "club", "racing", "sporting", "olympique", "stade", "association", "aj", "as", "og", "ogc", "us", "sco", "osc"]);
const GENERIC_TEAM_WORDS = new Set(["united", "city", "real", "athletic", "atletico", "inter", "milan"]);

function getSignificantWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !NOISE_WORDS.has(w));
}

function teamsMatch(nameA: string, nameB: string): boolean {
  // 1. Substring match on full normalized names (require >50% coverage to avoid "chester" ∈ "manchester")
  const normA = normalizeTeamName(nameA);
  const normB = normalizeTeamName(nameB);
  const shorter = normA.length <= normB.length ? normA : normB;
  const longer = normA.length > normB.length ? normA : normB;
  if (shorter.length >= 3 && longer.includes(shorter) && shorter.length / longer.length > 0.5) return true;

  // 2. Word-level: strict equality on distinguishing words (no substring, no generic words)
  const wordsA = getSignificantWords(nameA);
  const wordsB = getSignificantWords(nameB);
  return wordsA.some((wa) => wa.length >= 4 && !GENERIC_TEAM_WORDS.has(wa) && wordsB.some((wb) => wa === wb));
}

export async function getMatchOdds(
  leagueCode: string,
  homeTeamName: string,
  awayTeamName: string
): Promise<MatchOdds | null> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) return null;

  const sportKey = ODDS_SPORT_KEYS[leagueCode];
  if (!sportKey) return null;

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;

    const events = (await res.json()) as OddsAPIEvent[];
    if (!events || events.length === 0) return null;

    // Find the matching event by team names (fuzzy match)
    const event = events.find((e) => {
      return teamsMatch(homeTeamName, e.home_team) && teamsMatch(awayTeamName, e.away_team);
    });

    if (!event || event.bookmakers.length === 0) return null;

    // Prefer well-known EU bookmaker
    const preferred =
      event.bookmakers.find((b) =>
        ["unibet_eu", "unibet_fr", "betclic", "betclic_fr", "pinnacle", "williamhill", "winamax_fr"].includes(b.key)
      ) ?? event.bookmakers[0];

    const h2h = preferred.markets.find((m) => m.key === "h2h");
    if (!h2h) return null;

    const drawOdd = h2h.outcomes.find((o) => o.name === "Draw");
    if (!drawOdd) return null;

    // Find home/away odds — guard against both matching the same outcome (derby intra-ville)
    const nonDrawOutcomes = h2h.outcomes.filter((o) => o.name !== "Draw");
    let homeOdd = nonDrawOutcomes.find((o) => teamsMatch(homeTeamName, o.name));
    let awayOdd = nonDrawOutcomes.find((o) => teamsMatch(awayTeamName, o.name));

    // If both matched the same outcome, or one is missing, fall back to positional order
    // (odds API returns outcomes in order: home, draw, away)
    if (!homeOdd || !awayOdd || homeOdd === awayOdd) {
      if (nonDrawOutcomes.length >= 2) {
        // Use the-odds-api convention: first non-draw = home_team, second = away_team
        const homeIdx = nonDrawOutcomes.findIndex((o) => teamsMatch(event.home_team, o.name));
        const awayIdx = nonDrawOutcomes.findIndex((o) => teamsMatch(event.away_team, o.name));
        if (homeIdx !== -1 && awayIdx !== -1 && homeIdx !== awayIdx) {
          homeOdd = nonDrawOutcomes[homeIdx];
          awayOdd = nonDrawOutcomes[awayIdx];
        } else {
          // Last resort: positional (the-odds-api lists home first)
          homeOdd = nonDrawOutcomes[0];
          awayOdd = nonDrawOutcomes[1];
        }
      } else {
        return null;
      }
    }

    if (!homeOdd || !awayOdd) return null;

    return {
      homeWin: homeOdd.price,
      draw: drawOdd.price,
      awayWin: awayOdd.price,
      bookmaker: preferred.title,
    };
  } catch {
    return null;
  }
}

// --- Match context (no API call) ---

const DERBY_PAIRS: [string, string][] = [
  // France
  ["paris saint-germain", "olympique de marseille"],
  ["olympique lyonnais", "as saint-étienne"],
  // England
  ["liverpool", "everton"],
  ["manchester united", "manchester city"],
  ["arsenal", "tottenham"],
  ["chelsea", "tottenham"],
  // Spain
  ["real madrid", "atletico madrid"],
  ["real madrid", "barcelona"],
  ["barcelona", "espanyol"],
  // Italy
  ["inter", "ac milan"],
  ["juventus", "torino"],
  ["roma", "lazio"],
  // Germany
  ["borussia dortmund", "schalke"],
  ["bayern", "borussia dortmund"],
];

function getStakes(position: number, totalTeams: number): Stakes {
  if (position <= 2) return "title";
  if (position <= Math.min(6, Math.ceil(totalTeams * 0.3))) return "europe";
  if (position > totalTeams - 3) return "relegation";
  return "midtable";
}

function isDerbyMatch(homeName: string, awayName: string): boolean {
  const h = normalizeTeamName(homeName);
  const a = normalizeTeamName(awayName);

  return DERBY_PAIRS.some(([t1, t2]) => {
    const n1 = normalizeTeamName(t1);
    const n2 = normalizeTeamName(t2);
    return (h.includes(n1) && a.includes(n2)) || (h.includes(n2) && a.includes(n1));
  });
}

export function getMatchContext(
  homeStanding: Standing,
  awayStanding: Standing,
  totalTeams: number
): MatchContext {
  return {
    homeStakes: getStakes(homeStanding.position, totalTeams),
    awayStakes: getStakes(awayStanding.position, totalTeams),
    isDerby: isDerbyMatch(homeStanding.team.name, awayStanding.team.name),
  };
}
