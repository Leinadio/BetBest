/** Normalize team name: NFD + strip diacritics + lowercase + alphanumeric only. */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (é→e, ü→u, ç→c)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
