import { BASE_URL, getSeasonCandidates, LEAGUE_IDS, normalizeTeamName } from "./injuries-api";
import { CriticalAbsence, Injury, KeyPlayer, TeamPlayerAnalysis } from "./types";

interface APIPlayerEntry {
  player: {
    id: number;
    name: string;
    photo: string;
  };
  statistics: {
    team: { name: string };
    goals: { total: number | null; assists: number | null };
    games: { appearences: number | null };
  }[];
}

interface APIPlayersResponse {
  response: APIPlayerEntry[];
}

async function fetchPlayersForSeason(
  leagueId: number,
  season: number,
  apiKey: string
): Promise<{ scorers: APIPlayersResponse; assists: APIPlayersResponse } | null> {
  const headers = { "x-apisports-key": apiKey };
  const cacheOpts = { next: { revalidate: 43200 } } as RequestInit;

  const [scorersRes, assistsRes] = await Promise.all([
    fetch(
      `${BASE_URL}/players/topscorers?league=${leagueId}&season=${season}`,
      { headers, ...cacheOpts }
    ),
    fetch(
      `${BASE_URL}/players/topassists?league=${leagueId}&season=${season}`,
      { headers, ...cacheOpts }
    ),
  ]);

  if (!scorersRes.ok || !assistsRes.ok) return null;

  const scorers = (await scorersRes.json()) as APIPlayersResponse;
  const assists = (await assistsRes.json()) as APIPlayersResponse;

  if (scorers.response.length === 0 && assists.response.length === 0) return null;
  return { scorers, assists };
}

export async function getKeyPlayers(
  leagueCode: string
): Promise<Record<string, KeyPlayer[]>> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return {};

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return {};

  const [current, fallback] = getSeasonCandidates();

  const result =
    (await fetchPlayersForSeason(leagueId, current, apiKey)) ??
    (await fetchPlayersForSeason(leagueId, fallback, apiKey));

  if (!result) {
    console.error(`API-Football players: no data for league=${leagueCode}`);
    return {};
  }

  const { scorers: scorersData, assists: assistsData } = result;

  const playerMap = new Map<number, KeyPlayer & { teamKey: string }>();

  for (const entry of scorersData.response) {
    const stat = entry.statistics[0];
    if (!stat) continue;
    const teamKey = normalizeTeamName(stat.team.name);
    playerMap.set(entry.player.id, {
      playerId: entry.player.id,
      name: entry.player.name,
      photo: entry.player.photo,
      goals: stat.goals.total ?? 0,
      assists: stat.goals.assists ?? 0,
      appearances: stat.games.appearences ?? 0,
      role: "scorer",
      teamKey,
    });
  }

  for (const entry of assistsData.response) {
    const stat = entry.statistics[0];
    if (!stat) continue;
    const teamKey = normalizeTeamName(stat.team.name);
    const existing = playerMap.get(entry.player.id);
    if (existing) {
      existing.role = "both";
      existing.assists = Math.max(existing.assists, stat.goals.assists ?? 0);
    } else {
      playerMap.set(entry.player.id, {
        playerId: entry.player.id,
        name: entry.player.name,
        photo: entry.player.photo,
        goals: stat.goals.total ?? 0,
        assists: stat.goals.assists ?? 0,
        appearances: stat.games.appearences ?? 0,
        role: "assister",
        teamKey,
      });
    }
  }

  const grouped: Record<string, KeyPlayer[]> = {};
  for (const { teamKey, ...player } of playerMap.values()) {
    if (!grouped[teamKey]) {
      grouped[teamKey] = [];
    }
    grouped[teamKey].push(player);
  }

  return grouped;
}

export function findTeamKeyPlayers(
  allPlayers: Record<string, KeyPlayer[]>,
  teamName: string
): KeyPlayer[] {
  const normalized = normalizeTeamName(teamName);

  if (allPlayers[normalized]) {
    return allPlayers[normalized];
  }

  for (const [key, players] of Object.entries(allPlayers)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return players;
    }
  }

  return [];
}

export function identifyCriticalAbsences(
  keyPlayers: KeyPlayer[],
  injuries: Injury[]
): CriticalAbsence[] {
  const absences: CriticalAbsence[] = [];

  for (const player of keyPlayers) {
    const playerNorm = player.name.toLowerCase();
    const matchedInjury = injuries.find((inj) => {
      const injNorm = inj.player.toLowerCase();
      return (
        injNorm.includes(playerNorm) ||
        playerNorm.includes(injNorm) ||
        injNorm.split(" ").pop() === playerNorm.split(" ").pop()
      );
    });

    if (matchedInjury) {
      const contributions = player.goals + player.assists;
      absences.push({
        player,
        injury: matchedInjury,
        impact: contributions >= 10 || player.role === "both" ? "high" : "medium",
      });
    }
  }

  return absences;
}

export function computeSquadQualityScore(
  keyPlayers: KeyPlayer[],
  criticalAbsences: CriticalAbsence[]
): number {
  if (keyPlayers.length === 0) return 0.5;

  const totalContributions = keyPlayers.reduce(
    (sum, p) => sum + p.goals + p.assists,
    0
  );

  // Base score from having key players in the league top lists
  const baseScore = Math.min(keyPlayers.length / 5, 1) * 0.6;

  // Contribution bonus
  const contributionScore = Math.min(totalContributions / 40, 1) * 0.4;

  // Penalty for critical absences
  const absencePenalty = criticalAbsences.reduce((penalty, a) => {
    const contributions = a.player.goals + a.player.assists;
    const weight = contributions / Math.max(totalContributions, 1);
    return penalty + weight * (a.impact === "high" ? 0.8 : 0.5);
  }, 0);

  return Math.max(0, Math.min(1, baseScore + contributionScore - absencePenalty));
}

export function buildTeamPlayerAnalysis(
  keyPlayers: KeyPlayer[],
  injuries: Injury[]
): TeamPlayerAnalysis {
  const criticalAbsences = identifyCriticalAbsences(keyPlayers, injuries);
  const squadQualityScore = computeSquadQualityScore(keyPlayers, criticalAbsences);
  return { keyPlayers, criticalAbsences, squadQualityScore };
}
