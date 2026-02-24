import Anthropic from "@anthropic-ai/sdk";
import { Injury, Prediction, Standing, StatsScore, Team, TeamPlayerAnalysis } from "./types";

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

    const lines: string[] = [];
    if (injured.length > 0) {
      lines.push(`Blessés (${injured.length}) :`);
      lines.push(...injured.map((i) => `- ${i.player} (${i.reason})`));
    }
    if (suspended.length > 0) {
      lines.push(`Suspendus (${suspended.length}) :`);
      lines.push(...suspended.map((i) => `- ${i.player} (${i.reason})`));
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

=== JOUEURS CLÉS ===
${formatPlayerAnalysis(homeTeam.name, homePlayerAnalysis)}

${formatPlayerAnalysis(awayTeam.name, awayPlayerAnalysis)}

=== SCORES STATISTIQUES ===
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
  };
}
