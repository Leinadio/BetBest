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

export interface PlayerForm {
  name: string;
  recentGoals: number;
  recentAssists: number;
  matchesWithContribution: number;
  totalRecentMatches: number;
}

export interface NewsArticle {
  title: string;
  source: string;
  pubDate: string;
  link: string;
}

export interface GoalsByPeriod {
  "0-15": number | null;
  "16-30": number | null;
  "31-45": number | null;
  "46-60": number | null;
  "61-75": number | null;
  "76-90": number | null;
}

export interface TacticalProfile {
  teamName: string;
  form: string;
  preferredFormation: string;
  formationUsage: { formation: string; played: number }[];
  homeRecord: { played: number; wins: number; draws: number; losses: number };
  awayRecord: { played: number; wins: number; draws: number; losses: number };
  goalsForAvg: { home: string; away: string; total: string };
  goalsAgainstAvg: { home: string; away: string; total: string };
  goalsForByPeriod: GoalsByPeriod;
  goalsAgainstByPeriod: GoalsByPeriod;
  cleanSheets: { home: number; away: number; total: number };
  failedToScore: { home: number; away: number; total: number };
  biggestStreak: { wins: number; draws: number; losses: number };
  penaltyRecord: { scored: number; missed: number };
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
  news: { home: NewsArticle[]; away: NewsArticle[] };
  tactics?: { home: TacticalProfile | null; away: TacticalProfile | null };
}

export const LEAGUES: League[] = [
  { code: "PL", name: "Premier League", country: "Angleterre", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "PD", name: "La Liga", country: "Espagne", flag: "🇪🇸" },
  { code: "SA", name: "Serie A", country: "Italie", flag: "🇮🇹" },
  { code: "BL1", name: "Bundesliga", country: "Allemagne", flag: "🇩🇪" },
  { code: "FL1", name: "Ligue 1", country: "France", flag: "🇫🇷" },
];
