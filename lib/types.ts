export interface Team {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface Standing {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form: string | null; // e.g. "W,W,D,L,W"
}

export interface Match {
  id: number;
  utcDate: string;
  status: "TIMED" | "SCHEDULED";
  matchday: number;
  homeTeam: Team;
  awayTeam: Team;
}

export interface League {
  code: string;
  name: string;
  country: string;
  flag: string;
}

export interface StatsScore {
  homeScore: number;
  drawScore: number;
  awayScore: number;
  factors: {
    label: string;
    homeValue: string;
    awayValue: string;
    weight: number;
  }[];
}

export interface Injury {
  player: string;
  type: string;
  reason: string;
}

export interface KeyPlayer {
  playerId: number;
  name: string;
  photo: string;
  goals: number;
  assists: number;
  appearances: number;
  role: "scorer" | "assister" | "both";
}

export interface CriticalAbsence {
  player: KeyPlayer;
  injury: Injury;
  impact: "high" | "medium";
}

export interface TeamPlayerAnalysis {
  keyPlayers: KeyPlayer[];
  criticalAbsences: CriticalAbsence[];
  squadQualityScore: number;
}

export interface Prediction {
  outcome: "1" | "N" | "2";
  confidence: number;
  reasoning: string;
  statsScore: StatsScore;
  homeTeam: Team;
  awayTeam: Team;
  league: string;
  injuries: { home: Injury[]; away: Injury[] };
  playerAnalysis: { home: TeamPlayerAnalysis; away: TeamPlayerAnalysis };
}

export const LEAGUES: League[] = [
  { code: "PL", name: "Premier League", country: "Angleterre", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "PD", name: "La Liga", country: "Espagne", flag: "🇪🇸" },
  { code: "SA", name: "Serie A", country: "Italie", flag: "🇮🇹" },
  { code: "BL1", name: "Bundesliga", country: "Allemagne", flag: "🇩🇪" },
  { code: "FL1", name: "Ligue 1", country: "France", flag: "🇫🇷" },
];
