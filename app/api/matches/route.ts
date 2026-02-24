import { getMatches } from "@/lib/football-api";
import { LEAGUES, Match } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

interface MatchdayGroup {
  matchday: number;
  matches: Match[];
}

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");

  if (!league || !LEAGUES.some((l) => l.code === league)) {
    return NextResponse.json(
      { error: "Parametre 'league' invalide. Valeurs : PL, PD, SA, BL1, FL1" },
      { status: 400 }
    );
  }

  try {
    const matches = await getMatches(league);

    // Grouper par matchday
    const matchdayMap = new Map<number, Match[]>();
    for (const match of matches) {
      const group = matchdayMap.get(match.matchday) ?? [];
      group.push(match);
      matchdayMap.set(match.matchday, group);
    }

    // Trier les matchs par date dans chaque groupe
    const matchdays: MatchdayGroup[] = Array.from(matchdayMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([matchday, dayMatches]) => ({
        matchday,
        matches: dayMatches.sort(
          (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
        ),
      }));

    const currentMatchday = matchdays.length > 0 ? matchdays[0].matchday : 0;

    return NextResponse.json({ currentMatchday, matchdays });
  } catch (error) {
    console.error("Error fetching matches:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recuperation des matchs" },
      { status: 500 }
    );
  }
}
