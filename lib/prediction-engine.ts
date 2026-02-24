import { HeadToHeadRecord, Injury, ScheduleFatigue, Standing, StatsScore, TacticalProfile } from "./types";

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

/** Win rate from a record (wins / played), returns 0.5 if no data. */
function winRate(record: { played: number; wins: number } | undefined): number {
  if (!record || record.played === 0) return 0.5;
  return record.wins / record.played;
}

/** Points-per-match from a record (wins*3 + draws) / played, normalized to [0,1]. */
function recordPPM(record: { played: number; wins: number; draws: number } | undefined): number {
  if (!record || record.played === 0) return 0.5;
  return (record.wins * 3 + record.draws) / (record.played * 3);
}

export function calculateStats(
  homeStanding: Standing,
  awayStanding: Standing,
  totalTeams: number,
  homeInjuries?: Injury[],
  awayInjuries?: Injury[],
  homeSquadQuality?: number,
  awaySquadQuality?: number,
  headToHead?: HeadToHeadRecord,
  homeTactics?: TacticalProfile | null,
  awayTactics?: TacticalProfile | null,
  fatigue?: ScheduleFatigue | null,
): StatsScore {
  const factors: StatsScore["factors"] = [];

  // 1. Position (15%) - lower position = better
  const homePosScore = (totalTeams - homeStanding.position + 1) / totalTeams;
  const awayPosScore = (totalTeams - awayStanding.position + 1) / totalTeams;
  factors.push({
    label: "Position au classement",
    homeValue: `${homeStanding.position}e`,
    awayValue: `${awayStanding.position}e`,
    weight: 0.15,
  });

  // 2. Points per match (14%)
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
    weight: 0.14,
  });

  // 3. Form - last 5 matches (16%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.16,
  });

  // 4. Goal difference (10%)
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
    weight: 0.10,
  });

  // 5. Home/Away performance (14%) — real records from tactics API, fallback to generic bonus
  let homeVenueScore: number;
  let awayVenueScore: number;
  let homeVenueLabel: string;
  let awayVenueLabel: string;

  if (homeTactics?.homeRecord && homeTactics.homeRecord.played > 0) {
    homeVenueScore = recordPPM(homeTactics.homeRecord);
    const r = homeTactics.homeRecord;
    homeVenueLabel = `${r.wins}V ${r.draws}N ${r.losses}D (dom)`;
  } else {
    homeVenueScore = 0.6;
    homeVenueLabel = "Domicile";
  }

  if (awayTactics?.awayRecord && awayTactics.awayRecord.played > 0) {
    awayVenueScore = recordPPM(awayTactics.awayRecord);
    const r = awayTactics.awayRecord;
    awayVenueLabel = `${r.wins}V ${r.draws}N ${r.losses}D (ext)`;
  } else {
    awayVenueScore = 0.4;
    awayVenueLabel = "Extérieur";
  }

  factors.push({
    label: "Bilan dom/ext",
    homeValue: homeVenueLabel,
    awayValue: awayVenueLabel,
    weight: 0.14,
  });

  // 6. Injuries (8%) - fewer injuries = better
  const homeInjCount = homeInjuries?.length ?? 0;
  const awayInjCount = awayInjuries?.length ?? 0;
  const maxInj = Math.max(homeInjCount, awayInjCount, 1);
  const homeInjScore = 1 - homeInjCount / (maxInj + 5);
  const awayInjScore = 1 - awayInjCount / (maxInj + 5);
  factors.push({
    label: "Joueurs absents",
    homeValue: `${homeInjCount} absent${homeInjCount !== 1 ? "s" : ""}`,
    awayValue: `${awayInjCount} absent${awayInjCount !== 1 ? "s" : ""}`,
    weight: 0.08,
  });

  // 7. Squad quality (7%) - based on key players analysis
  const homeSquadScore = homeSquadQuality ?? 0.5;
  const awaySquadScore = awaySquadQuality ?? 0.5;
  factors.push({
    label: "Qualité effectif",
    homeValue: `${Math.round(homeSquadScore * 100)}%`,
    awayValue: `${Math.round(awaySquadScore * 100)}%`,
    weight: 0.07,
  });

  // 8. Schedule fatigue (8%) — more rest + fewer recent matches = better
  let homeFatigueScore = 0.5;
  let awayFatigueScore = 0.5;
  let homeFatigueLabel = "N/A";
  let awayFatigueLabel = "N/A";

  if (fatigue) {
    const fatigueScore = (t: typeof fatigue.home) => {
      // Rest days: 0-1 = tired (0.2), 2 = short (0.4), 3-4 = normal (0.6), 5+ = well rested (0.8)
      let restScore = 0.5;
      if (t.daysSinceLastMatch !== null) {
        const d = t.daysSinceLastMatch;
        restScore = d <= 1 ? 0.2 : d === 2 ? 0.4 : d <= 4 ? 0.6 : 0.8;
      }
      // Match load: fewer matches in 30 days = less fatigue
      const loadScore = Math.max(0, 1 - t.matchesLast30Days / 12);
      return restScore * 0.6 + loadScore * 0.4;
    };

    homeFatigueScore = fatigueScore(fatigue.home);
    awayFatigueScore = fatigueScore(fatigue.away);

    const fmtFatigue = (t: typeof fatigue.home) => {
      const parts: string[] = [];
      if (t.daysSinceLastMatch !== null) parts.push(`${t.daysSinceLastMatch}j repos`);
      parts.push(`${t.matchesLast30Days}m/30j`);
      return parts.join(", ");
    };
    homeFatigueLabel = fmtFatigue(fatigue.home);
    awayFatigueLabel = fmtFatigue(fatigue.away);
  }

  factors.push({
    label: "Fatigue calendrier",
    homeValue: homeFatigueLabel,
    awayValue: awayFatigueLabel,
    weight: 0.08,
  });

  // 9. Head-to-head record (4%)
  const h2hTotal = headToHead ? headToHead.team1Wins + headToHead.draws + headToHead.team2Wins : 0;
  const homeH2HScore = h2hTotal > 0 ? headToHead!.team1Wins / h2hTotal : 0.5;
  const awayH2HScore = h2hTotal > 0 ? headToHead!.team2Wins / h2hTotal : 0.5;
  factors.push({
    label: "Confrontations directes",
    homeValue: h2hTotal > 0 ? `${headToHead!.team1Wins}V ${headToHead!.draws}N ${headToHead!.team2Wins}D` : "N/A",
    awayValue: h2hTotal > 0 ? `${headToHead!.team2Wins}V ${headToHead!.draws}N ${headToHead!.team1Wins}D` : "N/A",
    weight: 0.04,
  });

  // Weighted composite (total = 15+14+16+10+14+8+7+8+4 = 96% ... remaining 4% is defensive quality)

  // 10. Defensive solidity (4%) — clean sheets + goals against avg
  let homeDefScore = 0.5;
  let awayDefScore = 0.5;
  let homeDefLabel = "N/A";
  let awayDefLabel = "N/A";

  if (homeTactics) {
    const csRate = homeTactics.homeRecord.played > 0
      ? homeTactics.cleanSheets.home / homeTactics.homeRecord.played
      : 0;
    const gaAvg = parseFloat(homeTactics.goalsAgainstAvg.home) || 1.5;
    homeDefScore = csRate * 0.5 + Math.max(0, 1 - gaAvg / 3) * 0.5;
    homeDefLabel = `${homeTactics.cleanSheets.home} CS, ${homeTactics.goalsAgainstAvg.home} enc/m`;
  }

  if (awayTactics) {
    const csRate = awayTactics.awayRecord.played > 0
      ? awayTactics.cleanSheets.away / awayTactics.awayRecord.played
      : 0;
    const gaAvg = parseFloat(awayTactics.goalsAgainstAvg.away) || 1.5;
    awayDefScore = csRate * 0.5 + Math.max(0, 1 - gaAvg / 3) * 0.5;
    awayDefLabel = `${awayTactics.cleanSheets.away} CS, ${awayTactics.goalsAgainstAvg.away} enc/m`;
  }

  factors.push({
    label: "Solidité défensive",
    homeValue: homeDefLabel,
    awayValue: awayDefLabel,
    weight: 0.04,
  });

  // Weighted composite (total = 15+14+16+10+14+8+7+8+4+4 = 100%)
  const homeTotal =
    homePosScore * 0.15 +
    homePPMScore * 0.14 +
    homeFormScore * 0.16 +
    homeGDScore * 0.10 +
    homeVenueScore * 0.14 +
    homeInjScore * 0.08 +
    homeSquadScore * 0.07 +
    homeFatigueScore * 0.08 +
    homeH2HScore * 0.04 +
    homeDefScore * 0.04;

  const awayTotal =
    awayPosScore * 0.15 +
    awayPPMScore * 0.14 +
    awayFormScore * 0.16 +
    awayGDScore * 0.10 +
    awayVenueScore * 0.14 +
    awayInjScore * 0.08 +
    awaySquadScore * 0.07 +
    awayFatigueScore * 0.08 +
    awayH2HScore * 0.04 +
    awayDefScore * 0.04;

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
