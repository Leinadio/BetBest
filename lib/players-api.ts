import { BASE_URL, getSeasonCandidates, LEAGUE_IDS, normalizeTeamName } from "./injuries-api";
import { CriticalAbsence, Injury, KeyPlayer, PlayerForm, TeamPlayerAnalysis } from "./types";

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

  // Penalty for critical absences (capped at 60% of raw score)
  const rawScore = baseScore + contributionScore;
  const absencePenalty = criticalAbsences.reduce((penalty, a) => {
    const contributions = a.player.goals + a.player.assists;
    const weight = contributions / Math.max(totalContributions, 1);
    return penalty + weight * (a.impact === "high" ? 0.8 : 0.5);
  }, 0);
  const cappedPenalty = Math.min(absencePenalty, rawScore * 0.6);

  return Math.max(0, Math.min(1, rawScore - cappedPenalty));
}

export function buildTeamPlayerAnalysis(
  keyPlayers: KeyPlayer[],
  injuries: Injury[]
): TeamPlayerAnalysis {
  const criticalAbsences = identifyCriticalAbsences(keyPlayers, injuries);
  const squadQualityScore = computeSquadQualityScore(keyPlayers, criticalAbsences);
  return { keyPlayers, criticalAbsences, squadQualityScore };
}

// --- Forme récente des joueurs (via fixtures API-Football) ---

interface APIFixtureEvent {
  team: { name: string };
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
}

interface APIFixtureEntry {
  fixture: { id: number; date: string };
  teams: { home: { name: string }; away: { name: string } };
  events: APIFixtureEvent[] | null;
}

interface APIFixturesResponse {
  response: APIFixtureEntry[];
}

export async function getRecentPlayerForm(
  leagueCode: string
): Promise<Record<string, PlayerForm[]>> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return {};

  const leagueId = LEAGUE_IDS[leagueCode];
  if (!leagueId) return {};

  const [current, fallback] = getSeasonCandidates();

  let fixtures: APIFixtureEntry[] = [];
  for (const season of [current, fallback]) {
    const res = await fetch(
      `${BASE_URL}/fixtures?league=${leagueId}&season=${season}&last=50`,
      {
        headers: { "x-apisports-key": apiKey },
        next: { revalidate: 43200 },
      }
    );
    if (!res.ok) continue;
    const json = (await res.json()) as APIFixturesResponse;
    if (json.response.length > 0) {
      fixtures = json.response;
      break;
    }
  }

  if (fixtures.length === 0) return {};

  // Check staleness: if the most recent fixture is > 45 days old, data is from a finished season
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const latestDate = fixtures.reduce((max, f) => f.fixture.date > max ? f.fixture.date : max, "");
  if (latestDate && new Date(latestDate) < staleCutoff) {
    return {};
  }

  // Trier par date croissante
  fixtures.sort(
    (a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  );

  // Grouper les fixtures par équipe
  const teamFixtures = new Map<string, APIFixtureEntry[]>();
  for (const fixture of fixtures) {
    for (const teamName of [fixture.teams.home.name, fixture.teams.away.name]) {
      const key = normalizeTeamName(teamName);
      const list = teamFixtures.get(key) ?? [];
      list.push(fixture);
      teamFixtures.set(key, list);
    }
  }

  // Extraire buts/passes des 5 derniers matchs par équipe
  const result: Record<string, PlayerForm[]> = {};

  for (const [teamKey, teamFixtureList] of teamFixtures) {
    const last5 = teamFixtureList.slice(-5);
    const totalMatches = last5.length;
    const playerStats = new Map<
      string,
      { goals: number; assists: number; matchIds: Set<number> }
    >();

    for (const fixture of last5) {
      if (!fixture.events) continue;
      for (const event of fixture.events) {
        if (event.type !== "Goal" || event.detail === "Missed Penalty") continue;

        const eventTeamKey = normalizeTeamName(event.team.name);
        if (
          eventTeamKey !== teamKey &&
          !eventTeamKey.includes(teamKey) &&
          !teamKey.includes(eventTeamKey)
        )
          continue;

        if (event.player?.name) {
          const stats = playerStats.get(event.player.name) ?? {
            goals: 0,
            assists: 0,
            matchIds: new Set(),
          };
          stats.goals++;
          stats.matchIds.add(fixture.fixture.id);
          playerStats.set(event.player.name, stats);
        }

        if (event.assist?.name) {
          const stats = playerStats.get(event.assist.name) ?? {
            goals: 0,
            assists: 0,
            matchIds: new Set(),
          };
          stats.assists++;
          stats.matchIds.add(fixture.fixture.id);
          playerStats.set(event.assist.name, stats);
        }
      }
    }

    const forms: PlayerForm[] = Array.from(playerStats.entries())
      .map(([name, stats]) => ({
        name,
        recentGoals: stats.goals,
        recentAssists: stats.assists,
        matchesWithContribution: stats.matchIds.size,
        totalRecentMatches: totalMatches,
      }))
      .sort(
        (a, b) =>
          b.recentGoals + b.recentAssists - (a.recentGoals + a.recentAssists)
      );

    if (forms.length > 0) {
      result[teamKey] = forms;
    }
  }

  return result;
}

export function findTeamPlayerForm(
  allForms: Record<string, PlayerForm[]>,
  teamName: string
): PlayerForm[] {
  const normalized = normalizeTeamName(teamName);

  if (allForms[normalized]) return allForms[normalized];

  for (const [key, forms] of Object.entries(allForms)) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return forms;
    }
  }

  return [];
}
