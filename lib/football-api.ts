import { Match, Standing } from "./types";

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

  return data.matches.map((m) => ({
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
