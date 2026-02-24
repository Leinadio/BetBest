import { BASE_URL, getSeasonCandidates, LEAGUE_IDS, normalizeTeamName } from "./injuries-api";
import { GoalsByPeriod, TacticalProfile } from "./types";

// --- Mapping nom normalisé → API-Football team ID ---

interface APITeamEntry {
  team: { id: number; name: string };
}

interface APITeamsResponse {
  response: APITeamEntry[];
}

async function fetchLeagueTeamsForSeason(
  leagueId: number,
  season: number,
  apiKey: string
): Promise<APITeamsResponse | null> {
  const res = await fetch(
    `${BASE_URL}/teams?league=${leagueId}&season=${season}`,
    {
      headers: { "x-apisports-key": apiKey },
      next: { revalidate: 43200 },
    }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as APITeamsResponse;
  if (data.response.length === 0) return null;
  return data;
}

export async function getLeagueTeamIds(
  leagueCode: string
): Promise<Map<string, number>> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return new Map();

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return new Map();

  const [current, fallback] = getSeasonCandidates();

  const data =
    (await fetchLeagueTeamsForSeason(leagueId, current, apiKey)) ??
    (await fetchLeagueTeamsForSeason(leagueId, fallback, apiKey));

  if (!data) {
    console.error(`API-Football teams: no data for league=${leagueCode}`);
    return new Map();
  }

  const map = new Map<string, number>();
  for (const entry of data.response) {
    map.set(normalizeTeamName(entry.team.name), entry.team.id);
  }
  return map;
}

export function resolveApiFootballTeamId(
  teamIdMap: Map<string, number>,
  teamName: string
): number | null {
  const normalized = normalizeTeamName(teamName);

  // Exact match
  const exact = teamIdMap.get(normalized);
  if (exact !== undefined) return exact;

  // Partial match
  for (const [key, id] of teamIdMap) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return id;
    }
  }

  return null;
}

// --- Team statistics / tactical profile ---

interface APIGoalsPeriod {
  [period: string]: { total: number | null; percentage: string | null };
}

interface APITeamStatsResponse {
  response: {
    team: { name: string };
    form: string;
    lineups: { formation: string; played: number }[];
    fixtures: {
      played: { home: number; away: number; total: number };
      wins: { home: number; away: number; total: number };
      draws: { home: number; away: number; total: number };
      loses: { home: number; away: number; total: number };
    };
    goals: {
      for: {
        total: { home: number; away: number; total: number };
        average: { home: string; away: string; total: string };
        minute: APIGoalsPeriod;
      };
      against: {
        total: { home: number; away: number; total: number };
        average: { home: string; away: string; total: string };
        minute: APIGoalsPeriod;
      };
    };
    clean_sheet: { home: number; away: number; total: number };
    failed_to_score: { home: number; away: number; total: number };
    biggest: {
      streak: { wins: number; draws: number; loses: number };
    };
    penalty: {
      scored: { total: number };
      missed: { total: number };
    };
  };
}

function extractGoalsByPeriod(minute: APIGoalsPeriod): GoalsByPeriod {
  return {
    "0-15": minute["0-15"]?.total ?? null,
    "16-30": minute["16-30"]?.total ?? null,
    "31-45": minute["31-45"]?.total ?? null,
    "46-60": minute["46-60"]?.total ?? null,
    "61-75": minute["61-75"]?.total ?? null,
    "76-90": minute["76-90"]?.total ?? null,
  };
}

async function fetchTeamStatsForSeason(
  teamId: number,
  leagueId: number,
  season: number,
  apiKey: string
): Promise<APITeamStatsResponse["response"] | null> {
  const res = await fetch(
    `${BASE_URL}/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
    {
      headers: { "x-apisports-key": apiKey },
      next: { revalidate: 43200 },
    }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as APITeamStatsResponse;
  if (!data.response || !data.response.team) return null;
  return data.response;
}

export async function getTeamTactics(
  apiFootballTeamId: number,
  leagueCode: string
): Promise<TacticalProfile | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return null;

  const [current, fallback] = getSeasonCandidates();

  const stats =
    (await fetchTeamStatsForSeason(apiFootballTeamId, leagueId, current, apiKey)) ??
    (await fetchTeamStatsForSeason(apiFootballTeamId, leagueId, fallback, apiKey));

  if (!stats) {
    console.error(`API-Football team stats: no data for team=${apiFootballTeamId}, league=${leagueCode}`);
    return null;
  }

  const sortedLineups = [...stats.lineups].sort((a, b) => b.played - a.played);

  return {
    teamName: stats.team.name,
    form: stats.form ?? "",
    preferredFormation: sortedLineups[0]?.formation ?? "N/A",
    formationUsage: sortedLineups.map((l) => ({ formation: l.formation, played: l.played })),
    homeRecord: {
      played: stats.fixtures.played.home,
      wins: stats.fixtures.wins.home,
      draws: stats.fixtures.draws.home,
      losses: stats.fixtures.loses.home,
    },
    awayRecord: {
      played: stats.fixtures.played.away,
      wins: stats.fixtures.wins.away,
      draws: stats.fixtures.draws.away,
      losses: stats.fixtures.loses.away,
    },
    goalsForAvg: stats.goals.for.average,
    goalsAgainstAvg: stats.goals.against.average,
    goalsForByPeriod: extractGoalsByPeriod(stats.goals.for.minute),
    goalsAgainstByPeriod: extractGoalsByPeriod(stats.goals.against.minute),
    cleanSheets: stats.clean_sheet,
    failedToScore: stats.failed_to_score,
    biggestStreak: {
      wins: stats.biggest.streak.wins,
      draws: stats.biggest.streak.draws,
      losses: stats.biggest.streak.loses,
    },
    penaltyRecord: {
      scored: stats.penalty.scored.total,
      missed: stats.penalty.missed.total,
    },
  };
}
