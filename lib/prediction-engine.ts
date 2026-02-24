import { HeadToHeadRecord, Injury, Standing, StatsScore } from "./types";

function formScore(form: string | null): number {
  if (!form) return 0.5;
  const results = form.split(",").map((r) => r.trim());
  if (results.length === 0) return 0.5;

  // Recency weights: first result = most recent = heaviest weight
  const weights = [0.30, 0.25, 0.20, 0.15, 0.10];
  let weighted = 0;
  let totalWeight = 0;

  for (let i = 0; i < results.length; i++) {
    const w = weights[i] ?? 0.10;
    const pts = results[i] === "W" ? 1 : results[i] === "D" ? 0.33 : 0;
    weighted += pts * w;
    totalWeight += w;
  }

  return totalWeight > 0 ? weighted / totalWeight : 0.5;
}

export function calculateStats(
  homeStanding: Standing,
  awayStanding: Standing,
  totalTeams: number,
  homeInjuries?: Injury[],
  awayInjuries?: Injury[],
  homeSquadQuality?: number,
  awaySquadQuality?: number,
  headToHead?: HeadToHeadRecord
): StatsScore {
  const factors: StatsScore["factors"] = [];

  // 1. Position (18%) - lower position = better
  const homePosScore = (totalTeams - homeStanding.position + 1) / totalTeams;
  const awayPosScore = (totalTeams - awayStanding.position + 1) / totalTeams;
  factors.push({
    label: "Position au classement",
    homeValue: `${homeStanding.position}e`,
    awayValue: `${awayStanding.position}e`,
    weight: 0.18,
  });

  // 2. Points per match (16%)
  const homePPM = homeStanding.playedGames > 0
    ? homeStanding.points / homeStanding.playedGames
    : 0;
  const awayPPM = awayStanding.playedGames > 0
    ? awayStanding.points / awayStanding.playedGames
    : 0;
  const maxPPM = 3;
  const homePPMScore = homePPM / maxPPM;
  const awayPPMScore = awayPPM / maxPPM;
  factors.push({
    label: "Points par match",
    homeValue: homePPM.toFixed(2),
    awayValue: awayPPM.toFixed(2),
    weight: 0.16,
  });

  // 3. Form - last 5 matches (18%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.18,
  });

  // 4. Goal difference (12%)
  const maxGD = Math.max(
    Math.abs(homeStanding.goalDifference),
    Math.abs(awayStanding.goalDifference),
    1
  );
  const homeGDScore = (homeStanding.goalDifference / maxGD + 1) / 2;
  const awayGDScore = (awayStanding.goalDifference / maxGD + 1) / 2;
  factors.push({
    label: "Différence de buts",
    homeValue: `${homeStanding.goalDifference > 0 ? "+" : ""}${homeStanding.goalDifference}`,
    awayValue: `${awayStanding.goalDifference > 0 ? "+" : ""}${awayStanding.goalDifference}`,
    weight: 0.12,
  });

  // 5. Home advantage (14%) - flat bonus for home team
  const homeAdvantage = 0.6;
  const awayAdvantage = 0.4;
  factors.push({
    label: "Avantage domicile",
    homeValue: "Domicile",
    awayValue: "Extérieur",
    weight: 0.14,
  });

  // 6. Injuries (10%) - fewer injuries = better
  const homeInjCount = homeInjuries?.length ?? 0;
  const awayInjCount = awayInjuries?.length ?? 0;
  const maxInj = Math.max(homeInjCount, awayInjCount, 1);
  const homeInjScore = 1 - homeInjCount / (maxInj + 5);
  const awayInjScore = 1 - awayInjCount / (maxInj + 5);
  factors.push({
    label: "Joueurs absents",
    homeValue: `${homeInjCount} absent${homeInjCount !== 1 ? "s" : ""}`,
    awayValue: `${awayInjCount} absent${awayInjCount !== 1 ? "s" : ""}`,
    weight: 0.10,
  });

  // 7. Squad quality (8%) - based on key players analysis
  const homeSquadScore = homeSquadQuality ?? 0.5;
  const awaySquadScore = awaySquadQuality ?? 0.5;
  factors.push({
    label: "Qualité effectif",
    homeValue: `${Math.round(homeSquadScore * 100)}%`,
    awayValue: `${Math.round(awaySquadScore * 100)}%`,
    weight: 0.08,
  });

  // 8. Head-to-head record (4%)
  const h2hTotal = headToHead ? headToHead.team1Wins + headToHead.draws + headToHead.team2Wins : 0;
  const homeH2HScore = h2hTotal > 0 ? headToHead!.team1Wins / h2hTotal : 0.5;
  const awayH2HScore = h2hTotal > 0 ? headToHead!.team2Wins / h2hTotal : 0.5;
  factors.push({
    label: "Confrontations directes",
    homeValue: h2hTotal > 0 ? `${headToHead!.team1Wins}V ${headToHead!.draws}N ${headToHead!.team2Wins}D` : "N/A",
    awayValue: h2hTotal > 0 ? `${headToHead!.team2Wins}V ${headToHead!.draws}N ${headToHead!.team1Wins}D` : "N/A",
    weight: 0.04,
  });

  // Weighted composite
  const homeTotal =
    homePosScore * 0.18 +
    homePPMScore * 0.16 +
    homeFormScore * 0.18 +
    homeGDScore * 0.12 +
    homeAdvantage * 0.14 +
    homeInjScore * 0.10 +
    homeSquadScore * 0.08 +
    homeH2HScore * 0.04;

  const awayTotal =
    awayPosScore * 0.18 +
    awayPPMScore * 0.16 +
    awayFormScore * 0.18 +
    awayGDScore * 0.12 +
    awayAdvantage * 0.14 +
    awayInjScore * 0.10 +
    awaySquadScore * 0.08 +
    awayH2HScore * 0.04;

  // Convert to 1/N/2 probabilities using realistic football distributions
  const diff = homeTotal - awayTotal;

  // Draw probability: Gaussian decay from 27% baseline (football average ~25-28%)
  // Wider diff = less likely draw, but always >= 8%
  let drawScore = Math.max(0.08, 0.27 * Math.exp(-4 * diff * diff));

  // Remaining probability split using tanh for smooth, bounded favorite bias
  const remaining = 1 - drawScore;
  const favorBias = Math.tanh(diff * 2.5);
  let homeScore = remaining * (0.5 + favorBias * 0.40);
  let awayScore = remaining * (0.5 - favorBias * 0.40);

  // Safety clamp (should rarely trigger with this formula)
  homeScore = Math.max(0.05, Math.min(0.85, homeScore));
  awayScore = Math.max(0.05, Math.min(0.85, awayScore));
  drawScore = Math.max(0.08, Math.min(0.35, drawScore));

  // Renormalize
  const sum = homeScore + drawScore + awayScore;
  homeScore /= sum;
  drawScore /= sum;
  awayScore /= sum;

  return {
    homeScore: Math.round(homeScore * 100),
    drawScore: Math.round(drawScore * 100),
    awayScore: Math.round(awayScore * 100),
    factors,
  };
}
