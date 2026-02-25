import { HeadToHeadRecord, Match, ScheduleFatigue, Standing, StrengthOfSchedule, TeamFatigue } from "./types";

const BASE_URL = "https://api.football-data.org/v4";

async function fetchAPI<T>(path: string): Promise<T> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    throw new Error("FOOTBALL_DATA_API_KEY is not set");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey },
    next: { revalidate: 3600 }, // cache 1h
  });

  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

interface StandingsResponse {
  standings: {
    type: string;
    table: {
      position: number;
      team: {
        id: number;
        name: string;
        shortName: string;
        tla: string;
        crest: string;
      };
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      form: string | null;
    }[];
  }[];
}

export async function getStandings(leagueCode: string): Promise<Standing[]> {
  const data = await fetchAPI<StandingsResponse>(
    `/competitions/${leagueCode}/standings`
  );

  const total = data.standings.find((s) => s.type === "TOTAL");
  if (!total) throw new Error("No TOTAL standings found");

  return total.table.map((row) => ({
    position: row.position,
    team: {
      id: row.team.id,
      name: row.team.name,
      shortName: row.team.shortName,
      tla: row.team.tla,
      crest: row.team.crest,
    },
    playedGames: row.playedGames,
    won: row.won,
    draw: row.draw,
    lost: row.lost,
    points: row.points,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    form: row.form,
  }));
}

interface FinishedMatchesResponse {
  matches: {
    utcDate: string;
    homeTeam: { id: number };
    awayTeam: { id: number };
    score: {
      fullTime: { home: number | null; away: number | null };
    };
  }[];
}

export async function getRecentForm(
  leagueCode: string
): Promise<Map<number, string>> {
  const data = await fetchAPI<FinishedMatchesResponse>(
    `/competitions/${leagueCode}/matches?status=FINISHED`
  );

  // Collecter les résultats par équipe (triés par date croissante par l'API)
  const teamResults = new Map<number, string[]>();

  for (const m of data.matches) {
    const homeGoals = m.score.fullTime.home;
    const awayGoals = m.score.fullTime.away;
    if (homeGoals === null || awayGoals === null) continue;

    const homeResult = homeGoals > awayGoals ? "W" : homeGoals < awayGoals ? "L" : "D";
    const awayResult = awayGoals > homeGoals ? "W" : awayGoals < homeGoals ? "L" : "D";

    if (!teamResults.has(m.homeTeam.id)) teamResults.set(m.homeTeam.id, []);
    teamResults.get(m.homeTeam.id)!.push(homeResult);

    if (!teamResults.has(m.awayTeam.id)) teamResults.set(m.awayTeam.id, []);
    teamResults.get(m.awayTeam.id)!.push(awayResult);
  }

  // Garder les 5 derniers résultats par équipe (récent → ancien, cohérent avec standings.form)
  const formMap = new Map<number, string>();
  for (const [teamId, results] of teamResults) {
    formMap.set(teamId, results.slice(-5).reverse().join(","));
  }

  return formMap;
}

export async function getFinishedMatches(
  leagueCode: string
): Promise<FinishedMatchesResponse["matches"]> {
  // Same URL as getRecentForm — Next.js revalidate cache ensures single HTTP call
  const data = await fetchAPI<FinishedMatchesResponse>(
    `/competitions/${leagueCode}/matches?status=FINISHED`
  );
  return data.matches;
}

export function computeStrengthOfSchedule(
  teamId: number,
  finishedMatches: FinishedMatchesResponse["matches"],
  standings: Standing[]
): StrengthOfSchedule | null {
  const teamMatches = finishedMatches
    .filter(
      (m) =>
        m.score.fullTime.home !== null &&
        (m.homeTeam.id === teamId || m.awayTeam.id === teamId)
    )
    .slice(-5);

  if (teamMatches.length === 0) return null;

  const totalTeams = standings.length;
  let sumPosition = 0;
  let sumPPM = 0;
  let counted = 0;

  for (const m of teamMatches) {
    const oppId = m.homeTeam.id === teamId ? m.awayTeam.id : m.homeTeam.id;
    const oppStanding = standings.find((s) => s.team.id === oppId);
    if (oppStanding) {
      sumPosition += oppStanding.position;
      sumPPM +=
        oppStanding.playedGames > 0
          ? oppStanding.points / oppStanding.playedGames
          : 0;
      counted++;
    }
  }

  if (counted === 0) return null;

  const avgPosition = sumPosition / counted;
  const avgPPM = sumPPM / counted;
  // Lower avg position = faced stronger teams = higher SOS
  const sosScore = Math.max(
    0,
    Math.min(1, 1 - (avgPosition - 1) / (totalTeams - 1))
  );

  return {
    teamId,
    recentOpponentsAvgPosition: Math.round(avgPosition * 10) / 10,
    recentOpponentsAvgPPM: Math.round(avgPPM * 100) / 100,
    sosScore: Math.round(sosScore * 100) / 100,
  };
}

interface H2HMatchesResponse {
  matches: {
    utcDate: string;
    homeTeam: { id: number; name: string };
    awayTeam: { id: number; name: string };
    score: {
      fullTime: { home: number | null; away: number | null };
    };
  }[];
}

export async function getHeadToHead(
  leagueCode: string,
  team1Id: number,
  team2Id: number,
  limit = 10
): Promise<HeadToHeadRecord> {
  const data = await fetchAPI<H2HMatchesResponse>(
    `/competitions/${leagueCode}/matches?status=FINISHED`
  );

  const h2hMatches = data.matches
    .filter((m) => {
      const ids = [m.homeTeam.id, m.awayTeam.id];
      return ids.includes(team1Id) && ids.includes(team2Id);
    })
    .filter((m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null)
    .slice(-limit);

  let team1Wins = 0;
  let draws = 0;
  let team2Wins = 0;

  const matches = h2hMatches.map((m) => {
    const homeGoals = m.score.fullTime.home!;
    const awayGoals = m.score.fullTime.away!;

    if (homeGoals === awayGoals) {
      draws++;
    } else {
      const winnerId = homeGoals > awayGoals ? m.homeTeam.id : m.awayTeam.id;
      if (winnerId === team1Id) team1Wins++;
      else team2Wins++;
    }

    return {
      date: m.utcDate,
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      homeGoals,
      awayGoals,
    };
  });

  return { matches, team1Wins, draws, team2Wins };
}

interface MatchesResponse {
  matches: {
    id: number;
    utcDate: string;
    status: string;
    matchday: number;
    homeTeam: {
      id: number;
      name: string;
      shortName: string;
      tla: string;
      crest: string;
    };
    awayTeam: {
      id: number;
      name: string;
      shortName: string;
      tla: string;
      crest: string;
    };
  }[];
}

export async function getMatches(leagueCode: string): Promise<Match[]> {
  const data = await fetchAPI<MatchesResponse>(
    `/competitions/${leagueCode}/matches?status=SCHEDULED,TIMED`
  );

  return data.matches
    .filter((m) => m.homeTeam.name && m.awayTeam.name)
    .map((m) => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status as "TIMED" | "SCHEDULED",
      matchday: m.matchday,
      homeTeam: {
        id: m.homeTeam.id,
        name: m.homeTeam.name,
        shortName: m.homeTeam.shortName,
        tla: m.homeTeam.tla,
        crest: m.homeTeam.crest,
      },
      awayTeam: {
        id: m.awayTeam.id,
        name: m.awayTeam.name,
        shortName: m.awayTeam.shortName,
        tla: m.awayTeam.tla,
        crest: m.awayTeam.crest,
      },
    }));
}

// --- Schedule data (fatigue + referee) ---

interface ScheduleMatchData {
  utcDate: string;
  homeTeam: { id: number };
  awayTeam: { id: number };
  referees: { id: number; name: string; type: string; nationality: string }[];
}

interface ScheduleMatchesResponse {
  matches: ScheduleMatchData[];
}

function computeTeamFatigue(
  finishedDates: Date[],
  scheduledDates: Date[],
  now: Date
): TeamFatigue {
  const pastSorted = finishedDates.sort((a, b) => a.getTime() - b.getTime());
  const futureSorted = scheduledDates.sort((a, b) => a.getTime() - b.getTime());

  const lastMatch = pastSorted.length > 0 ? pastSorted[pastSorted.length - 1] : null;
  const nextMatch = futureSorted.length > 0 ? futureSorted[0] : null;

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const matchesLast30 = pastSorted.filter((d) => d >= thirtyDaysAgo).length;

  return {
    daysSinceLastMatch: lastMatch
      ? Math.round((now.getTime() - lastMatch.getTime()) / (1000 * 60 * 60 * 24))
      : null,
    daysUntilNextMatch: nextMatch
      ? Math.round((nextMatch.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null,
    matchesLast30Days: matchesLast30,
  };
}

export async function getMatchScheduleData(
  leagueCode: string,
  homeTeamId: number,
  awayTeamId: number
): Promise<{
  fatigue: ScheduleFatigue | null;
  refereeName: string | null;
}> {
  let finished: ScheduleMatchesResponse;
  let scheduled: ScheduleMatchesResponse;

  try {
    [finished, scheduled] = await Promise.all([
      fetchAPI<ScheduleMatchesResponse>(`/competitions/${leagueCode}/matches?status=FINISHED`),
      fetchAPI<ScheduleMatchesResponse>(`/competitions/${leagueCode}/matches?status=SCHEDULED,TIMED`),
    ]);
  } catch {
    return { fatigue: null, refereeName: null };
  }

  const now = new Date();

  // --- Fatigue ---
  const homeFinished: Date[] = [];
  const awayFinished: Date[] = [];
  const homeScheduled: Date[] = [];
  const awayScheduled: Date[] = [];

  for (const m of finished.matches) {
    const d = new Date(m.utcDate);
    if (m.homeTeam.id === homeTeamId || m.awayTeam.id === homeTeamId) homeFinished.push(d);
    if (m.homeTeam.id === awayTeamId || m.awayTeam.id === awayTeamId) awayFinished.push(d);
  }
  for (const m of scheduled.matches) {
    const d = new Date(m.utcDate);
    if (m.homeTeam.id === homeTeamId || m.awayTeam.id === homeTeamId) homeScheduled.push(d);
    if (m.homeTeam.id === awayTeamId || m.awayTeam.id === awayTeamId) awayScheduled.push(d);
  }

  const homeFatigue = computeTeamFatigue(homeFinished, homeScheduled, now);
  const awayFatigue = computeTeamFatigue(awayFinished, awayScheduled, now);

  const fatigue: ScheduleFatigue = { home: homeFatigue, away: awayFatigue };

  // --- Referee (from the specific upcoming match) ---
  let refereeName: string | null = null;
  const targetMatch = scheduled.matches.find(
    (m) =>
      (m.homeTeam.id === homeTeamId && m.awayTeam.id === awayTeamId) ||
      (m.homeTeam.id === awayTeamId && m.awayTeam.id === homeTeamId)
  );
  if (targetMatch) {
    const mainRef = targetMatch.referees.find((r) => r.type === "REFEREE");
    if (mainRef) refereeName = mainRef.name;
  }

  return { fatigue, refereeName };
}
