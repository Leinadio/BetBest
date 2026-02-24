import { Injury } from "./types";

export const BASE_URL = "https://v3.football.api-sports.io";

export const LEAGUE_IDS: Record<string, number> = {
  CL: 2,
  PL: 39,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61,
};

export function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Returns [currentSeason, fallbackSeason] to handle free-plan API limits. */
export function getSeasonCandidates(): [number, number] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const current = month < 7 ? year - 1 : year;
  return [current, current - 1];
}

interface APIInjuryResponse {
  response: {
    player: { name: string; type: string; reason: string };
    team: { name: string };
    fixture: { date: string };
    league: { season: number };
  }[];
}

async function fetchInjuriesForSeason(
  leagueId: number,
  season: number,
  apiKey: string
): Promise<APIInjuryResponse | null> {
  const res = await fetch(
    `${BASE_URL}/injuries?league=${leagueId}&season=${season}`,
    {
      headers: { "x-apisports-key": apiKey },
      next: { revalidate: 43200 },
    }
  );

  if (!res.ok) return null;

  const data = (await res.json()) as APIInjuryResponse;
  if (data.response.length === 0) return null;
  return data;
}

export async function getInjuries(
  leagueCode: string
): Promise<Record<string, Injury[]>> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return {};

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return {};

  const [current, fallback] = getSeasonCandidates();

  const data =
    (await fetchInjuriesForSeason(leagueId, current, apiKey)) ??
    (await fetchInjuriesForSeason(leagueId, fallback, apiKey));

  if (!data) {
    console.error(`API-Football injuries: no data for league=${leagueCode}`);
    return {};
  }

  // Filter stale data: if the most recent entry is > 45 days old, the season is over
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const mostRecentDate = data.response.reduce((max, e) => {
    return e.fixture.date > max ? e.fixture.date : max;
  }, "");
  if (mostRecentDate && new Date(mostRecentDate) < cutoffDate) {
    console.log(`Injuries data stale (latest: ${mostRecentDate.slice(0, 10)}), skipping`);
    return {};
  }

  // Only keep recent injuries (last 30 days) to filter out recovered players
  const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Deduplicate: keep only the most recent entry per player per team
  const latestByPlayer = new Map<string, { teamKey: string; injury: Injury; date: string }>();

  for (const entry of data.response) {
    // Skip old entries — player likely recovered
    if (new Date(entry.fixture.date) < recentCutoff) continue;

    const teamKey = normalizeTeamName(entry.team.name);
    const key = `${teamKey}:${entry.player.name}`;
    const existing = latestByPlayer.get(key);
    if (!existing || entry.fixture.date > existing.date) {
      latestByPlayer.set(key, {
        teamKey,
        injury: { player: entry.player.name, type: entry.player.type, reason: entry.player.reason },
        date: entry.fixture.date,
      });
    }
  }

  const grouped: Record<string, Injury[]> = {};
  for (const { teamKey, injury } of latestByPlayer.values()) {
    if (!grouped[teamKey]) {
      grouped[teamKey] = [];
    }
    grouped[teamKey].push(injury);
  }

  return grouped;
}

export function findTeamInjuries(
  allInjuries: Record<string, Injury[]>,
  teamName: string
): Injury[] {
  const normalized = normalizeTeamName(teamName);

  // Exact match first
  if (allInjuries[normalized]) {
    return allInjuries[normalized];
  }

  // Partial match: check if either name contains the other
  for (const [key, injuries] of Object.entries(allInjuries)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return injuries;
    }
  }

  return [];
}
