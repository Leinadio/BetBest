import { Injury, Standing, StatsScore } from "./types";

function parseForm(form: string | null): { wins: number; draws: number; losses: number } {
  if (!form) return { wins: 0, draws: 0, losses: 0 };
  const results = form.split(",").map((r) => r.trim());
  return {
    wins: results.filter((r) => r === "W").length,
    draws: results.filter((r) => r === "D").length,
    losses: results.filter((r) => r === "L").length,
  };
}

function formScore(form: string | null): number {
  const { wins, draws, losses } = parseForm(form);
  const total = wins + draws + losses;
  if (total === 0) return 0.5;
  return (wins * 3 + draws) / (total * 3);
}

export function calculateStats(
  homeStanding: Standing,
  awayStanding: Standing,
  totalTeams: number,
  homeInjuries?: Injury[],
  awayInjuries?: Injury[],
  homeSquadQuality?: number,
  awaySquadQuality?: number
): StatsScore {
  const factors: StatsScore["factors"] = [];

  // 1. Position (20%) - lower position = better
  const homePosScore = (totalTeams - homeStanding.position + 1) / totalTeams;
  const awayPosScore = (totalTeams - awayStanding.position + 1) / totalTeams;
  factors.push({
    label: "Position au classement",
    homeValue: `${homeStanding.position}e`,
    awayValue: `${awayStanding.position}e`,
    weight: 0.20,
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

  // 3. Form - last 5 matches (20%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.20,
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

  // Weighted composite
  const homeTotal =
    homePosScore * 0.20 +
    homePPMScore * 0.16 +
    homeFormScore * 0.20 +
    homeGDScore * 0.12 +
    homeAdvantage * 0.14 +
    homeInjScore * 0.10 +
    homeSquadScore * 0.08;

  const awayTotal =
    awayPosScore * 0.20 +
    awayPPMScore * 0.16 +
    awayFormScore * 0.20 +
    awayGDScore * 0.12 +
    awayAdvantage * 0.14 +
    awayInjScore * 0.10 +
    awaySquadScore * 0.08;

  // Convert to 1/N/2 scores (normalized)
  const diff = homeTotal - awayTotal;
  const drawBand = 0.05; // if teams are very close, draw is more likely

  let homeScore: number;
  let drawScore: number;
  let awayScore: number;

  if (Math.abs(diff) < drawBand) {
    drawScore = 0.4;
    homeScore = 0.35;
    awayScore = 0.25;
  } else if (diff > 0) {
    homeScore = 0.4 + diff * 2;
    drawScore = 0.3 - diff * 0.5;
    awayScore = 1 - homeScore - drawScore;
  } else {
    awayScore = 0.4 + Math.abs(diff) * 2;
    drawScore = 0.3 - Math.abs(diff) * 0.5;
    homeScore = 1 - awayScore - drawScore;
  }

  // Clamp values
  homeScore = Math.max(0.05, Math.min(0.85, homeScore));
  awayScore = Math.max(0.05, Math.min(0.85, awayScore));
  drawScore = Math.max(0.05, Math.min(0.85, drawScore));

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
