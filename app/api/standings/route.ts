import { getStandings } from "@/lib/football-api";
import { LEAGUES } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const league = request.nextUrl.searchParams.get("league");

  if (!league || !LEAGUES.some((l) => l.code === league)) {
    return NextResponse.json(
      { error: "Paramètre 'league' invalide. Valeurs : CL, PL, PD, SA, BL1, FL1" },
      { status: 400 }
    );
  }

  try {
    const standings = await getStandings(league);
    return NextResponse.json(standings);
  } catch (error) {
    console.error("Error fetching standings:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du classement" },
      { status: 500 }
    );
  }
}
