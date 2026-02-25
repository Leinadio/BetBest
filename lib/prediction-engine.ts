import { HeadToHeadRecord, Injury, MatchOdds, ScheduleFatigue, Standing, StatsScore, TacticalProfile, TeamElo, TeamXG } from "./types";

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

/** Points-per-match from a record (wins*3 + draws) / played, normalized to [0,1]. */
function recordPPM(record: { played: number; wins: number; draws: number } | undefined): number {
  if (!record || record.played === 0) return 0.5;
  return (record.wins * 3 + record.draws) / (record.played * 3);
}

/** Convert ELO to a 0-1 score. ELO typically ranges 1200-2100 for top clubs. */
function eloToScore(elo: number): number {
  return Math.max(0, Math.min(1, (elo - 1200) / 900));
}

/** Convert bookmaker odds to implied probability. */
function oddsToProb(odds: number): number {
  return odds > 0 ? 1 / odds : 0;
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
  homeXG?: TeamXG | null,
  awayXG?: TeamXG | null,
  homeElo?: TeamElo | null,
  awayElo?: TeamElo | null,
  odds?: MatchOdds | null,
): StatsScore {
  const factors: StatsScore["factors"] = [];

  // ====== CORE FACTORS (52%) ======

  // 1. ELO Rating (14%) — best single predictor of team strength
  const homeEloScore = homeElo ? eloToScore(homeElo.elo) : 0.5;
  const awayEloScore = awayElo ? eloToScore(awayElo.elo) : 0.5;
  factors.push({
    label: "Rating ELO",
    homeValue: homeElo ? `${Math.round(homeElo.elo)}` : "N/A",
    awayValue: awayElo ? `${Math.round(awayElo.elo)}` : "N/A",
    weight: 0.14,
  });

  // 2. xG Performance (12%) — separates luck from quality
  let homeXGScore = 0.5;
  let awayXGScore = 0.5;
  let homeXGLabel = "N/A";
  let awayXGLabel = "N/A";

  if (homeXG) {
    // Combine offensive xG and defensive xGA into a score
    // Higher xG/match = better attack, lower xGA/match = better defense
    const attackScore = Math.min(homeXG.xGPerMatch / 2.5, 1);
    const defenseScore = Math.max(0, 1 - homeXG.xGAPerMatch / 2.5);
    homeXGScore = attackScore * 0.5 + defenseScore * 0.5;
    homeXGLabel = `${homeXG.xGPerMatch} xG, ${homeXG.xGAPerMatch} xGA`;
  }

  if (awayXG) {
    const attackScore = Math.min(awayXG.xGPerMatch / 2.5, 1);
    const defenseScore = Math.max(0, 1 - awayXG.xGAPerMatch / 2.5);
    awayXGScore = attackScore * 0.5 + defenseScore * 0.5;
    awayXGLabel = `${awayXG.xGPerMatch} xG, ${awayXG.xGAPerMatch} xGA`;
  }

  factors.push({
    label: "xG (Expected Goals)",
    homeValue: homeXGLabel,
    awayValue: awayXGLabel,
    weight: 0.12,
  });

  // 3. Points per match (12%)
  const homePPM = homeStanding.playedGames > 0
    ? homeStanding.points / homeStanding.playedGames
    : 0;
  const awayPPM = awayStanding.playedGames > 0
    ? awayStanding.points / awayStanding.playedGames
    : 0;
  const homePPMScore = homePPM / 3;
  const awayPPMScore = awayPPM / 3;
  factors.push({
    label: "Points par match",
    homeValue: homePPM.toFixed(2),
    awayValue: awayPPM.toFixed(2),
    weight: 0.12,
  });

  // 4. Form - last 5 matches (14%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.14,
  });

  // ====== CONTEXTUAL FACTORS (36%) ======

  // 5. Home/Away performance (12%) — real records from tactics API
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
    weight: 0.12,
  });

  // 6. Goal difference (6%)
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
    weight: 0.06,
  });

  // 7. Injuries (6%)
  const homeInjCount = homeInjuries?.length ?? 0;
  const awayInjCount = awayInjuries?.length ?? 0;
  const maxInj = Math.max(homeInjCount, awayInjCount, 1);
  const homeInjScore = 1 - homeInjCount / (maxInj + 5);
  const awayInjScore = 1 - awayInjCount / (maxInj + 5);
  factors.push({
    label: "Joueurs absents",
    homeValue: `${homeInjCount} absent${homeInjCount !== 1 ? "s" : ""}`,
    awayValue: `${awayInjCount} absent${awayInjCount !== 1 ? "s" : ""}`,
    weight: 0.06,
  });

  // 8. Squad quality (5%)
  const homeSquadScore = homeSquadQuality ?? 0.5;
  const awaySquadScore = awaySquadQuality ?? 0.5;
  factors.push({
    label: "Qualité effectif",
    homeValue: `${Math.round(homeSquadScore * 100)}%`,
    awayValue: `${Math.round(awaySquadScore * 100)}%`,
    weight: 0.05,
  });

  // 9. Schedule fatigue (5%)
  let homeFatigueScore = 0.5;
  let awayFatigueScore = 0.5;
  let homeFatigueLabel = "N/A";
  let awayFatigueLabel = "N/A";

  if (fatigue) {
    const fatigueScore = (t: typeof fatigue.home) => {
      let restScore = 0.5;
      if (t.daysSinceLastMatch !== null) {
        const d = t.daysSinceLastMatch;
        restScore = d <= 1 ? 0.2 : d === 2 ? 0.4 : d <= 4 ? 0.6 : 0.8;
      }
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
    weight: 0.05,
  });

  // 10. Head-to-head (3%)
  const h2hTotal = headToHead ? headToHead.team1Wins + headToHead.draws + headToHead.team2Wins : 0;
  const homeH2HScore = h2hTotal > 0 ? headToHead!.team1Wins / h2hTotal : 0.5;
  const awayH2HScore = h2hTotal > 0 ? headToHead!.team2Wins / h2hTotal : 0.5;
  factors.push({
    label: "Confrontations directes",
    homeValue: h2hTotal > 0 ? `${headToHead!.team1Wins}V ${headToHead!.draws}N ${headToHead!.team2Wins}D` : "N/A",
    awayValue: h2hTotal > 0 ? `${headToHead!.team2Wins}V ${headToHead!.draws}N ${headToHead!.team1Wins}D` : "N/A",
    weight: 0.03,
  });

  // 11. Defensive solidity (3%)
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
    weight: 0.03,
  });

  // ====== MARKET ANCHOR (12%) ======

  // 12. Bookmaker odds (12%) — the market is the strongest single predictor
  let homeOddsScore = 0.5;
  let awayOddsScore = 0.5;
  let homeOddsLabel = "N/A";
  let awayOddsLabel = "N/A";

  if (odds) {
    const homeProb = oddsToProb(odds.homeWin);
    const drawProb = oddsToProb(odds.draw);
    const awayProb = oddsToProb(odds.awayWin);
    const totalProb = homeProb + drawProb + awayProb;
    // Normalize (remove bookmaker margin)
    const normHome = homeProb / totalProb;
    const normAway = awayProb / totalProb;
    homeOddsScore = normHome;
    awayOddsScore = normAway;
    homeOddsLabel = `${odds.homeWin} (${Math.round(normHome * 100)}%)`;
    awayOddsLabel = `${odds.awayWin} (${Math.round(normAway * 100)}%)`;
  }

  factors.push({
    label: "Cotes du marché",
    homeValue: homeOddsLabel,
    awayValue: awayOddsLabel,
    weight: 0.12,
  });

  // ====== WEIGHTED COMPOSITE ======
  // Total = 14+12+12+14+12+6+6+5+5+3+3+12 = 104%... let me recheck
  // ELO 14 + xG 12 + PPM 12 + Form 14 + Venue 12 + GD 6 + Inj 6 + Squad 5 + Fatigue 5 + H2H 3 + Def 3 + Odds 12 = 104
  // Need to fix: reduce to 100. Let me adjust.
  // ELO 12 + xG 10 + PPM 10 + Form 12 + Venue 10 + GD 6 + Inj 6 + Squad 5 + Fatigue 5 + H2H 3 + Def 3 + Odds 18 = 100

  // Actually let me use the weights as declared in factors above and just normalize
  const homeTotal =
    homeEloScore * 0.14 +
    homeXGScore * 0.12 +
    homePPMScore * 0.12 +
    homeFormScore * 0.14 +
    homeVenueScore * 0.12 +
    homeGDScore * 0.06 +
    homeInjScore * 0.06 +
    homeSquadScore * 0.05 +
    homeFatigueScore * 0.05 +
    homeH2HScore * 0.03 +
    homeDefScore * 0.03 +
    homeOddsScore * 0.12;

  const awayTotal =
    awayEloScore * 0.14 +
    awayXGScore * 0.12 +
    awayPPMScore * 0.12 +
    awayFormScore * 0.14 +
    awayVenueScore * 0.12 +
    awayGDScore * 0.06 +
    awayInjScore * 0.06 +
    awaySquadScore * 0.05 +
    awayFatigueScore * 0.05 +
    awayH2HScore * 0.03 +
    awayDefScore * 0.03 +
    awayOddsScore * 0.12;

  // Normalize weights (sum = 1.04, so divide by 1.04)
  const weightSum = 0.14 + 0.12 + 0.12 + 0.14 + 0.12 + 0.06 + 0.06 + 0.05 + 0.05 + 0.03 + 0.03 + 0.12;
  const homeNorm = homeTotal / weightSum;
  const awayNorm = awayTotal / weightSum;
  const diff = homeNorm - awayNorm;

  // Draw probability: Gaussian decay from 27% baseline
  let drawScore = Math.max(0.08, 0.27 * Math.exp(-4 * diff * diff));

  // Remaining probability split using tanh
  const remaining = 1 - drawScore;
  const favorBias = Math.tanh(diff * 2.5);
  let homeScore = remaining * (0.5 + favorBias * 0.40);
  let awayScore = remaining * (0.5 - favorBias * 0.40);

  // Safety clamp
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
