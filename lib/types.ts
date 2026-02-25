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

export interface HeadToHeadMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
}

export interface HeadToHeadRecord {
  matches: HeadToHeadMatch[];
  team1Wins: number;
  draws: number;
  team2Wins: number;
}

export interface RefereeProfile {
  name: string;
  matchesOfficiated: number;
  avgYellowsPerMatch: number;
  avgRedsPerMatch: number;
  penaltiesAwarded: number;
}

export interface MatchOdds {
  homeWin: number;
  draw: number;
  awayWin: number;
  bookmaker: string;
}

export interface TeamFatigue {
  daysSinceLastMatch: number | null;
  daysUntilNextMatch: number | null;
  matchesLast30Days: number;
}

export interface ScheduleFatigue {
  home: TeamFatigue;
  away: TeamFatigue;
}

export type Stakes = "title" | "europe" | "midtable" | "relegation";

export interface MatchContext {
  homeStakes: Stakes;
  awayStakes: Stakes;
  isDerby: boolean;
}

export interface TeamXG {
  team: string;
  matches: number;
  xG: number;
  xGA: number;
  xGPerMatch: number;
  xGAPerMatch: number;
  xGDiff: number; // xG - actual goals (positive = unlucky, negative = lucky)
}

export interface TeamElo {
  team: string;
  elo: number;
}

export interface PredictionAnalysis {
  powerBalance: string;
  momentum: string;
  tacticalEdge: string;
  contextualFactors: string;
  verdict: string;
}

export interface Prediction {
  outcome: "1" | "N" | "2";
  confidence: number;
  reasoning: string;
  analysis?: PredictionAnalysis;
  statsScore: StatsScore;
  homeTeam: Team;
  awayTeam: Team;
  league: string;
  injuries: { home: Injury[]; away: Injury[] };
  playerAnalysis: { home: TeamPlayerAnalysis; away: TeamPlayerAnalysis };
  news: { home: NewsArticle[]; away: NewsArticle[] };
  tactics?: { home: TacticalProfile | null; away: TacticalProfile | null };
  headToHead?: HeadToHeadRecord;
  referee?: RefereeProfile;
  odds?: MatchOdds;
  fatigue?: ScheduleFatigue;
  matchContext?: MatchContext;
  xG?: { home: TeamXG | null; away: TeamXG | null };
  elo?: { home: TeamElo | null; away: TeamElo | null };
}

export const LEAGUES: League[] = [
  { code: "CL", name: "Champions League", country: "Europe", flag: "🏆" },
  { code: "PL", name: "Premier League", country: "Angleterre", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { code: "PD", name: "La Liga", country: "Espagne", flag: "🇪🇸" },
  { code: "SA", name: "Serie A", country: "Italie", flag: "🇮🇹" },
  { code: "BL1", name: "Bundesliga", country: "Allemagne", flag: "🇩🇪" },
  { code: "FL1", name: "Ligue 1", country: "France", flag: "🇫🇷" },
];
