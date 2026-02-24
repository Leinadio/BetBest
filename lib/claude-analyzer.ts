import Anthropic from "@anthropic-ai/sdk";
import { Injury, NewsArticle, PlayerForm, Prediction, Standing, StatsScore, TacticalProfile, Team, TeamPlayerAnalysis } from "./types";

const anthropic = new Anthropic();

interface AnalyzeParams {
  homeTeam: Team;
  awayTeam: Team;
  homeStanding: Standing;
  awayStanding: Standing;
  statsScore: StatsScore;
  leagueCode: string;
  homeInjuries?: Injury[];
  awayInjuries?: Injury[];
  homePlayerAnalysis?: TeamPlayerAnalysis;
  awayPlayerAnalysis?: TeamPlayerAnalysis;
  homePlayerForm?: PlayerForm[];
  awayPlayerForm?: PlayerForm[];
  homeNews?: NewsArticle[];
  awayNews?: NewsArticle[];
  homeTactics?: TacticalProfile | null;
  awayTactics?: TacticalProfile | null;
}

export async function analyzePrediction({
  homeTeam,
  awayTeam,
  homeStanding,
  awayStanding,
  statsScore,
  leagueCode,
  homeInjuries,
  awayInjuries,
  homePlayerAnalysis,
  awayPlayerAnalysis,
  homePlayerForm,
  awayPlayerForm,
  homeNews,
  awayNews,
  homeTactics,
  awayTactics,
}: AnalyzeParams): Promise<Prediction> {
  const formatInjuries = (injuries: Injury[] | undefined): string => {
    if (!injuries || injuries.length === 0) return "Aucune absence signalée";

    const isSuspension = (reason: string | undefined | null) => {
      const lower = (reason ?? "").toLowerCase();
      return (
        lower.includes("suspend") ||
        lower.includes("red card") ||
        lower.includes("yellow card") ||
        lower.includes("carton") ||
        lower.includes("expuls")
      );
    };

    const injured = injuries.filter((i) => !isSuspension(i.reason));
    const suspended = injuries.filter((i) => isSuspension(i.reason));

    const formatEntry = (i: Injury) => {
      const status = i.type || "Missing Fixture";
      const statusLabel =
        status === "Missing Fixture" ? "absent" :
        status === "Doubtful" ? "incertain" :
        status === "Questionable" ? "douteux" : status;
      return `- ${i.player} (${i.reason ?? "non précisé"}) [${statusLabel}]`;
    };

    const lines: string[] = [];
    if (injured.length > 0) {
      lines.push(`Blessés (${injured.length}) :`);
      lines.push(...injured.map(formatEntry));
    }
    if (suspended.length > 0) {
      lines.push(`Suspendus (${suspended.length}) :`);
      lines.push(...suspended.map(formatEntry));
    }
    return lines.join("\n");
  };

  const formatPlayerAnalysis = (
    teamName: string,
    analysis: TeamPlayerAnalysis | undefined
  ): string => {
    if (!analysis || analysis.keyPlayers.length === 0)
      return `${teamName} : Aucun joueur clé identifié dans les classements de la ligue`;

    const players = analysis.keyPlayers
      .map((p) => {
        const roleLabel =
          p.role === "both" ? "buteur+passeur" : p.role === "scorer" ? "buteur" : "passeur";
        return `- ${p.name} (${roleLabel}) : ${p.goals} buts, ${p.assists} passes, ${p.appearances} matchs`;
      })
      .join("\n");

    const absences =
      analysis.criticalAbsences.length > 0
        ? "\n  ABSENCES CRITIQUES :\n" +
          analysis.criticalAbsences
            .map(
              (a) =>
                `  ⚠ ${a.player.name} (${a.injury.reason}) - impact ${a.impact === "high" ? "FORT" : "MOYEN"}`
            )
            .join("\n")
        : "";

    return `${teamName} (score effectif: ${Math.round(analysis.squadQualityScore * 100)}%) :\n${players}${absences}`;
  };

  const formatRecentForm = (teamName: string, forms: PlayerForm[] | undefined): string => {
    if (!forms || forms.length === 0)
      return `${teamName} : Données indisponibles`;
    const total = forms[0].totalRecentMatches;
    const lines = forms.slice(0, 8).map((p) => {
      const parts: string[] = [];
      if (p.recentGoals > 0) parts.push(`${p.recentGoals} but${p.recentGoals > 1 ? "s" : ""}`);
      if (p.recentAssists > 0) parts.push(`${p.recentAssists} passe${p.recentAssists > 1 ? "s" : ""}`);
      return `- ${p.name} : ${parts.join(", ")} (actif ${p.matchesWithContribution}/${total} matchs)`;
    });
    return `${teamName} (${total} derniers matchs) :\n${lines.join("\n")}`;
  };

  const formatNews = (teamName: string, articles: NewsArticle[] | undefined): string => {
    if (!articles || articles.length === 0) return `${teamName} : Aucune actualité récente`;
    const lines = articles.map((a) => {
      const date = new Date(a.pubDate);
      const daysAgo = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const relative = daysAgo === 0 ? "aujourd'hui" : daysAgo === 1 ? "hier" : `il y a ${daysAgo} jours`;
      const src = a.source ? ` (${a.source}, ${relative})` : ` (${relative})`;
      return `- "${a.title}"${src}`;
    });
    return `${teamName} :\n${lines.join("\n")}`;
  };

  const formatTactics = (teamName: string, tactics: TacticalProfile | null | undefined): string => {
    if (!tactics) return `${teamName} : Données tactiques indisponibles`;

    const formations = tactics.formationUsage
      .slice(0, 3)
      .map((f) => `${f.formation}: ${f.played} matchs`)
      .join(", ");

    const periods = Object.entries(tactics.goalsForByPeriod)
      .map(([p, v]) => `${p}: ${v ?? 0}`)
      .join(", ");

    const periodsAgainst = Object.entries(tactics.goalsAgainstByPeriod)
      .map(([p, v]) => `${p}: ${v ?? 0}`)
      .join(", ");

    return `${teamName} :
- Formation préférée : ${tactics.preferredFormation} (${formations})
- Bilan domicile : ${tactics.homeRecord.wins}V ${tactics.homeRecord.draws}N ${tactics.homeRecord.losses}D (${tactics.homeRecord.played} matchs)
- Bilan extérieur : ${tactics.awayRecord.wins}V ${tactics.awayRecord.draws}N ${tactics.awayRecord.losses}D (${tactics.awayRecord.played} matchs)
- Moyenne buts marqués : ${tactics.goalsForAvg.home} (dom) / ${tactics.goalsForAvg.away} (ext) / ${tactics.goalsForAvg.total} (total)
- Moyenne buts encaissés : ${tactics.goalsAgainstAvg.home} (dom) / ${tactics.goalsAgainstAvg.away} (ext) / ${tactics.goalsAgainstAvg.total} (total)
- Buts marqués par période : ${periods}
- Buts encaissés par période : ${periodsAgainst}
- Clean sheets : ${tactics.cleanSheets.total} (${tactics.cleanSheets.home} dom, ${tactics.cleanSheets.away} ext)
- Matchs sans marquer : ${tactics.failedToScore.total} (${tactics.failedToScore.home} dom, ${tactics.failedToScore.away} ext)
- Meilleure série : ${tactics.biggestStreak.wins}V, ${tactics.biggestStreak.draws}N, ${tactics.biggestStreak.losses}D
- Penalties : ${tactics.penaltyRecord.scored} marqués, ${tactics.penaltyRecord.missed} ratés`;
  };

  const prompt = `Tu es un expert en analyse de football. Analyse ce match et donne ta prédiction.

Match : ${homeTeam.name} (domicile) vs ${awayTeam.name} (extérieur)
Compétition : ${leagueCode}

=== STATISTIQUES ===
${homeTeam.name} :
- Position : ${homeStanding.position}e
- Points : ${homeStanding.points} (${homeStanding.playedGames} matchs)
- Bilan : ${homeStanding.won}V ${homeStanding.draw}N ${homeStanding.lost}D
- Buts : ${homeStanding.goalsFor} marqués, ${homeStanding.goalsAgainst} encaissés (diff: ${homeStanding.goalDifference > 0 ? "+" : ""}${homeStanding.goalDifference})
- Forme récente : ${homeStanding.form ?? "N/A"}

${awayTeam.name} :
- Position : ${awayStanding.position}e
- Points : ${awayStanding.points} (${awayStanding.playedGames} matchs)
- Bilan : ${awayStanding.won}V ${awayStanding.draw}N ${awayStanding.lost}D
- Buts : ${awayStanding.goalsFor} marqués, ${awayStanding.goalsAgainst} encaissés (diff: ${awayStanding.goalDifference > 0 ? "+" : ""}${awayStanding.goalDifference})
- Forme récente : ${awayStanding.form ?? "N/A"}

=== BLESSURES / SUSPENSIONS ===
${homeTeam.name} :
${formatInjuries(homeInjuries)}

${awayTeam.name} :
${formatInjuries(awayInjuries)}

=== JOUEURS CLÉS (stats saison) ===
${formatPlayerAnalysis(homeTeam.name, homePlayerAnalysis)}

${formatPlayerAnalysis(awayTeam.name, awayPlayerAnalysis)}

=== FORME RÉCENTE DES JOUEURS (derniers matchs) ===
${formatRecentForm(homeTeam.name, homePlayerForm)}

${formatRecentForm(awayTeam.name, awayPlayerForm)}

=== ACTUALITÉS RÉCENTES ===
${formatNews(homeTeam.name, homeNews)}

${formatNews(awayTeam.name, awayNews)}

=== ANALYSE TACTIQUE ===
${formatTactics(homeTeam.name, homeTactics)}

${formatTactics(awayTeam.name, awayTactics)}

=== MODÈLE STATISTIQUE (7 facteurs pondérés) ===
${statsScore.factors.map((f) => `- ${f.label} (poids ${Math.round(f.weight * 100)}%) : ${f.homeValue} vs ${f.awayValue}`).join("\n")}

Résultat du modèle :
Victoire domicile (1) : ${statsScore.homeScore}%
Match nul (N) : ${statsScore.drawScore}%
Victoire extérieur (2) : ${statsScore.awayScore}%

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans backticks) dans ce format :
{
  "outcome": "1" | "N" | "2",
  "confidence": <nombre entre 50 et 95>,
  "reasoning": "<analyse en français, 2-3 phrases, mentionne les joueurs clés et absences importantes si pertinent>"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  let parsed: { outcome: "1" | "N" | "2"; confidence: number; reasoning: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback: use stats-based prediction
    const maxScore = Math.max(statsScore.homeScore, statsScore.drawScore, statsScore.awayScore);
    let outcome: "1" | "N" | "2" = "1";
    if (maxScore === statsScore.drawScore) outcome = "N";
    else if (maxScore === statsScore.awayScore) outcome = "2";

    parsed = {
      outcome,
      confidence: Math.min(maxScore + 5, 90),
      reasoning: "Prédiction basée sur les statistiques disponibles.",
    };
  }

  const defaultAnalysis = { keyPlayers: [], criticalAbsences: [], squadQualityScore: 0.5 };

  return {
    outcome: parsed.outcome,
    confidence: Math.max(50, Math.min(95, parsed.confidence)),
    reasoning: parsed.reasoning,
    statsScore,
    homeTeam,
    awayTeam,
    league: leagueCode,
    injuries: {
      home: homeInjuries ?? [],
      away: awayInjuries ?? [],
    },
    playerAnalysis: {
      home: homePlayerAnalysis ?? defaultAnalysis,
      away: awayPlayerAnalysis ?? defaultAnalysis,
    },
    news: {
      home: homeNews ?? [],
      away: awayNews ?? [],
    },
    tactics: {
      home: homeTactics ?? null,
      away: awayTactics ?? null,
    },
  };
}
