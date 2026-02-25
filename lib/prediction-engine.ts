import { CalculateStatsInput, CriticalAbsence, Injury, Stakes, StatsScore } from "./types";

/** Retourne fallback si value est null, undefined ou NaN. */
function safeNum(value: number | null | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return value;
}

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
    const pts = results[i] === "W" ? 1 : results[i] === "D" ? 0.4 : 0;
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

export function calculateStats(input: CalculateStatsInput): StatsScore {
  const {
    homeStanding, awayStanding, homeInjuries, awayInjuries,
    homeSquadQuality, awaySquadQuality, headToHead,
    homeTactics, awayTactics, fatigue, homeXG, awayXG,
    homeElo, awayElo, odds, homeSOS, awaySOS,
    homeCriticalAbsences, awayCriticalAbsences,
    matchContext, referee,
  } = input;

  const factors: StatsScore["factors"] = [];

  // ====== CORE FACTORS ======

  // 1. ELO Rating (7%)
  const homeEloScore = homeElo ? eloToScore(safeNum(homeElo.elo, 1650)) : 0.5;
  const awayEloScore = awayElo ? eloToScore(safeNum(awayElo.elo, 1650)) : 0.5;
  factors.push({
    label: "Rating ELO",
    homeValue: homeElo ? `${Math.round(homeElo.elo)}` : "N/A",
    awayValue: awayElo ? `${Math.round(awayElo.elo)}` : "N/A",
    weight: 0.07,
  });

  // 2. xG Performance (12%) — recent 5-match, threshold 3.0, 40% attack / 60% defense
  let homeXGScore = 0.5;
  let awayXGScore = 0.5;
  let homeXGLabel = "N/A";
  let awayXGLabel = "N/A";

  if (homeXG) {
    const xgpm = safeNum(homeXG.recentXGPerMatch, safeNum(homeXG.xGPerMatch, 1.2));
    const xgapm = safeNum(homeXG.recentXGAPerMatch, safeNum(homeXG.xGAPerMatch, 1.2));
    const attackScore = Math.min(xgpm / 3.0, 1);
    const defenseScore = Math.max(0, 1 - xgapm / 3.0);
    homeXGScore = attackScore * 0.4 + defenseScore * 0.6;
    homeXGLabel = `${xgpm.toFixed(2)} xG, ${xgapm.toFixed(2)} xGA (5m)`;
  }

  if (awayXG) {
    const xgpm = safeNum(awayXG.recentXGPerMatch, safeNum(awayXG.xGPerMatch, 1.2));
    const xgapm = safeNum(awayXG.recentXGAPerMatch, safeNum(awayXG.xGAPerMatch, 1.2));
    const attackScore = Math.min(xgpm / 3.0, 1);
    const defenseScore = Math.max(0, 1 - xgapm / 3.0);
    awayXGScore = attackScore * 0.4 + defenseScore * 0.6;
    awayXGLabel = `${xgpm.toFixed(2)} xG, ${xgapm.toFixed(2)} xGA (5m)`;
  }

  factors.push({
    label: "xG récent (5 matchs)",
    homeValue: homeXGLabel,
    awayValue: awayXGLabel,
    weight: 0.12,
  });

  // 3. Form - last 5 matches (8%)
  const homeFormScore = formScore(homeStanding.form);
  const awayFormScore = formScore(awayStanding.form);
  factors.push({
    label: "Forme récente (5 matchs)",
    homeValue: homeStanding.form ?? "N/A",
    awayValue: awayStanding.form ?? "N/A",
    weight: 0.08,
  });

  // ====== CONTEXTUAL FACTORS ======

  // 4. Home/Away performance (10%)
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
    weight: 0.10,
  });

  // 5. xG Trend (5%) — momentum indicator
  const homeXGTrendScore = homeXG?.xGTrend != null ? (safeNum(homeXG.xGTrend, 0) + 1) / 2 : 0.5;
  const awayXGTrendScore = awayXG?.xGTrend != null ? (safeNum(awayXG.xGTrend, 0) + 1) / 2 : 0.5;
  const fmtTrend = (t: number | undefined | null) => {
    if (t == null) return "N/A";
    const arrow = t > 0.05 ? "↑" : t < -0.05 ? "↓" : "→";
    return `${arrow} ${t > 0 ? "+" : ""}${t.toFixed(2)}`;
  };
  factors.push({
    label: "Tendance xG",
    homeValue: fmtTrend(homeXG?.xGTrend),
    awayValue: fmtTrend(awayXG?.xGTrend),
    weight: 0.05,
  });

  // 6. Injuries (8%) — role-weighted using critical absences
  const computeInjuryPenalty = (
    injuries: Injury[] | undefined,
    criticals: CriticalAbsence[] | undefined
  ): number => {
    let penalty = 0;

    // Fuzzy matching cohérent avec identifyCriticalAbsences (players-api.ts)
    const criticalPlayerNames = (criticals ?? []).map((c) => c.player.name.toLowerCase());
    const isCriticalPlayer = (injName: string): boolean => {
      const injNorm = injName.toLowerCase();
      const injLast = injNorm.split(" ").pop() ?? "";
      return criticalPlayerNames.some((critNorm) => {
        const critLast = critNorm.split(" ").pop() ?? "";
        return injNorm.includes(critNorm) || critNorm.includes(injNorm) ||
          (injLast.length > 1 && injLast === critLast);
      });
    };

    for (const ca of criticals ?? []) {
      const contributions = ca.player.goals + ca.player.assists;
      const productivityFactor = Math.min(contributions / 15, 1);
      const rolePenalty =
        ca.player.role === "both" ? 0.20 :
        ca.player.role === "scorer" ? 0.15 : 0.10;
      penalty += rolePenalty * productivityFactor;
    }

    const nonCriticalCount = (injuries ?? []).filter(
      (inj) => !isCriticalPlayer(inj.player)
    ).length;
    penalty += nonCriticalCount * 0.03;

    return Math.min(penalty, 0.8);
  };

  const homeInjPenalty = computeInjuryPenalty(homeInjuries, homeCriticalAbsences);
  const awayInjPenalty = computeInjuryPenalty(awayInjuries, awayCriticalAbsences);
  const homeInjScore = 1 - homeInjPenalty;
  const awayInjScore = 1 - awayInjPenalty;

  const homeInjCount = homeInjuries?.length ?? 0;
  const awayInjCount = awayInjuries?.length ?? 0;
  const homeCritCount = homeCriticalAbsences?.length ?? 0;
  const awayCritCount = awayCriticalAbsences?.length ?? 0;
  factors.push({
    label: "Joueurs absents",
    homeValue: homeCritCount > 0 ? `${homeInjCount} (${homeCritCount} clés)` : `${homeInjCount} absent${homeInjCount !== 1 ? "s" : ""}`,
    awayValue: awayCritCount > 0 ? `${awayInjCount} (${awayCritCount} clés)` : `${awayInjCount} absent${awayInjCount !== 1 ? "s" : ""}`,
    weight: 0.08,
  });

  // 7. Squad quality (4%)
  const homeSquadScore = safeNum(homeSquadQuality, 0.5);
  const awaySquadScore = safeNum(awaySquadQuality, 0.5);
  factors.push({
    label: "Qualité effectif",
    homeValue: `${Math.round(homeSquadScore * 100)}%`,
    awayValue: `${Math.round(awaySquadScore * 100)}%`,
    weight: 0.04,
  });

  // 8. Schedule fatigue (6%)
  let homeFatigueScore = 0.5;
  let awayFatigueScore = 0.5;
  let homeFatigueLabel = "N/A";
  let awayFatigueLabel = "N/A";

  if (fatigue) {
    const fatigueScoreFn = (t: typeof fatigue.home) => {
      let restScore = 0.5;
      if (t.daysSinceLastMatch !== null) {
        const d = t.daysSinceLastMatch;
        restScore = d <= 1 ? 0.2 : d === 2 ? 0.4 : d <= 4 ? 0.6 : 0.8;
      }
      const loadScore = Math.max(0, 1 - safeNum(t.matchesLast30Days, 4) / 12);
      return restScore * 0.6 + loadScore * 0.4;
    };

    homeFatigueScore = fatigueScoreFn(fatigue.home);
    awayFatigueScore = fatigueScoreFn(fatigue.away);

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
    weight: 0.06,
  });

  // 9. Head-to-head (2%) — PPM-style: draws count as 1/3 victory
  const h2hTotal = headToHead ? headToHead.team1Wins + headToHead.draws + headToHead.team2Wins : 0;
  const homeH2HScore = h2hTotal > 0
    ? (headToHead!.team1Wins * 3 + headToHead!.draws) / (h2hTotal * 3)
    : 0.5;
  const awayH2HScore = h2hTotal > 0
    ? (headToHead!.team2Wins * 3 + headToHead!.draws) / (h2hTotal * 3)
    : 0.5;
  factors.push({
    label: "Confrontations directes",
    homeValue: h2hTotal > 0 ? `${headToHead!.team1Wins}V ${headToHead!.draws}N ${headToHead!.team2Wins}D` : "N/A",
    awayValue: h2hTotal > 0 ? `${headToHead!.team2Wins}V ${headToHead!.draws}N ${headToHead!.team1Wins}D` : "N/A",
    weight: 0.02,
  });

  // 10. Defensive solidity (2%)
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
    weight: 0.02,
  });

  // 11. Strength of Schedule (5%)
  const homeSOSScore = homeSOS ? safeNum(homeSOS.sosScore, 0.5) : 0.5;
  const awaySOSScore = awaySOS ? safeNum(awaySOS.sosScore, 0.5) : 0.5;
  factors.push({
    label: "Difficulté calendrier",
    homeValue: homeSOS ? `Top ${Math.round((1 - homeSOS.sosScore) * 100)}% (avg pos ${homeSOS.recentOpponentsAvgPosition})` : "N/A",
    awayValue: awaySOS ? `Top ${Math.round((1 - awaySOS.sosScore) * 100)}% (avg pos ${awaySOS.recentOpponentsAvgPosition})` : "N/A",
    weight: 0.05,
  });

  // 12. Match Context / Stakes (4%)
  let homeContextScore = 0.5;
  let awayContextScore = 0.5;

  const stakesValue: Record<Stakes, number> = {
    title: 0.65,
    europe: 0.58,
    midtable: 0.50,
    relegation: 0.55,
  };
  const stakeLabels: Record<Stakes, string> = {
    title: "Titre",
    europe: "Europe",
    midtable: "Mi-tableau",
    relegation: "Maintien",
  };

  if (matchContext) {
    homeContextScore = stakesValue[matchContext.homeStakes];
    awayContextScore = stakesValue[matchContext.awayStakes];

    if (matchContext.isDerby) {
      homeContextScore = homeContextScore * 0.85 + 0.5 * 0.15;
      awayContextScore = awayContextScore * 0.85 + 0.5 * 0.15;
    }
  }

  factors.push({
    label: "Enjeux du match",
    homeValue: matchContext ? `${stakeLabels[matchContext.homeStakes]}${matchContext.isDerby ? " (Derby)" : ""}` : "N/A",
    awayValue: matchContext ? `${stakeLabels[matchContext.awayStakes]}${matchContext.isDerby ? " (Derby)" : ""}` : "N/A",
    weight: 0.04,
  });

  // 13. Referee profile (2%)
  let homeRefScore = 0.5;
  let awayRefScore = 0.5;
  let refLabel = "N/A";

  if (referee && referee.matchesOfficiated >= 3) {
    const severityScore = Math.min(1, (safeNum(referee.avgYellowsPerMatch, 3.5) - 2) / 4);
    const penaltyRate = safeNum(referee.penaltiesAwarded, 0) / Math.max(1, safeNum(referee.matchesOfficiated, 1));
    const penaltyFactor = Math.min(1, penaltyRate / 0.4);
    const baseRefScore = Math.max(0.2, Math.min(0.8, 0.5 - severityScore * 0.05 + penaltyFactor * 0.03));
    homeRefScore = baseRefScore;
    awayRefScore = baseRefScore;
    refLabel = `${referee.name} (${referee.avgYellowsPerMatch} j/m)`;
  }

  factors.push({
    label: "Profil arbitre",
    homeValue: refLabel,
    awayValue: refLabel,
    weight: 0.02,
  });

  // ====== MARKET ANCHOR (25%) ======

  // 14. Bookmaker odds (25%) — the market is the strongest single predictor
  let homeOddsScore = 0.5;
  let awayOddsScore = 0.5;
  let homeOddsLabel = "N/A";
  let awayOddsLabel = "N/A";

  if (odds) {
    const homeProb = oddsToProb(odds.homeWin);
    const drawProb = oddsToProb(odds.draw);
    const awayProb = oddsToProb(odds.awayWin);
    const totalProb = homeProb + drawProb + awayProb;
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
    weight: 0.25,
  });

  // ====== WEIGHTED COMPOSITE ======
  // Odds 25 + xG 12 + Venue 10 + Form 8 + ELO 7 + Injuries 8 + xGTrend 5 + SOS 5 + Fatigue 6 + Squad 4 + H2H 2 + Def 2 + Context 4 + Referee 2 = 100%

  const oddsAvailable = !!odds;
  const oddsWeight = oddsAvailable ? 0.25 : 0;
  const redistributionFactor = oddsAvailable ? 1 : 1 / (1 - 0.25);

  const homeTotal =
    homeOddsScore * oddsWeight +
    (homeXGScore * 0.12 +
    homeVenueScore * 0.10 +
    homeFormScore * 0.08 +
    homeEloScore * 0.07 +
    homeInjScore * 0.08 +
    homeXGTrendScore * 0.05 +
    homeSOSScore * 0.05 +
    homeFatigueScore * 0.06 +
    homeSquadScore * 0.04 +
    homeH2HScore * 0.02 +
    homeDefScore * 0.02 +
    homeContextScore * 0.04 +
    homeRefScore * 0.02) * redistributionFactor;

  const awayTotal =
    awayOddsScore * oddsWeight +
    (awayXGScore * 0.12 +
    awayVenueScore * 0.10 +
    awayFormScore * 0.08 +
    awayEloScore * 0.07 +
    awayInjScore * 0.08 +
    awayXGTrendScore * 0.05 +
    awaySOSScore * 0.05 +
    awayFatigueScore * 0.06 +
    awaySquadScore * 0.04 +
    awayH2HScore * 0.02 +
    awayDefScore * 0.02 +
    awayContextScore * 0.04 +
    awayRefScore * 0.02) * redistributionFactor;

  const diff = homeTotal - awayTotal;

  // Draw probability: steeper Gaussian (-6 instead of -4) for better discrimination
  let drawScore = Math.max(0.08, 0.27 * Math.exp(-6 * diff * diff));

  // Blend with bookmaker draw probability: 40% model / 60% market (market estimates draws better)
  if (odds) {
    const drawProb = oddsToProb(odds.draw);
    const totalProb = oddsToProb(odds.homeWin) + drawProb + oddsToProb(odds.awayWin);
    const drawImplied = drawProb / totalProb;
    drawScore = drawScore * 0.4 + drawImplied * 0.6;
  }

  // Context-driven draw adjustments
  if (matchContext) {
    const { homeStakes, awayStakes, isDerby } = matchContext;
    if (homeStakes === "relegation" && awayStakes === "relegation") {
      drawScore += 0.05;
    } else if (homeStakes === "title" && awayStakes === "title") {
      drawScore += 0.02;
    }
    if (isDerby) {
      drawScore += 0.03;
    }
  }

  // Strict referee micro-boost for draw
  if (referee && referee.matchesOfficiated >= 3) {
    const severityScore = Math.min(1, (safeNum(referee.avgYellowsPerMatch, 3.5) - 2) / 4);
    if (severityScore > 0.6) {
      drawScore += 0.01;
    }
  }

  // Remaining probability split using tanh
  const remaining = 1 - drawScore;
  const favorBias = Math.tanh(diff * 2.5);
  let homeScore = remaining * (0.5 + favorBias * 0.35);
  let awayScore = remaining * (0.5 - favorBias * 0.35);

  // Safety clamp (tighter when odds are absent — less reliable model)
  const maxClamp = oddsAvailable ? 0.85 : 0.75;
  homeScore = Math.max(0.05, Math.min(maxClamp, homeScore));
  awayScore = Math.max(0.05, Math.min(maxClamp, awayScore));
  drawScore = Math.max(0.08, Math.min(0.40, drawScore));

  // Renormalize
  const sum = homeScore + drawScore + awayScore;
  homeScore /= sum;
  drawScore /= sum;
  awayScore /= sum;

  // Final NaN safety net — if anything slipped through, return neutral prediction
  if (Number.isNaN(homeScore) || Number.isNaN(drawScore) || Number.isNaN(awayScore)) {
    console.error("[prediction-engine] NaN detected — returning neutral prediction");
    return { homeScore: 40, drawScore: 25, awayScore: 35, factors };
  }

  return {
    homeScore: Math.round(homeScore * 100),
    drawScore: Math.round(drawScore * 100),
    awayScore: Math.round(awayScore * 100),
    factors,
  };
}
