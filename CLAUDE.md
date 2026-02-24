# BetBest

Outil de prédiction de matchs de football (1/N/2) combinant statistiques réelles et analyse IA via Claude.

# currentDate
Today's date is 2026-02-24.

## Principe fondamental

Toutes les données récupérées (stats, blessures, forme joueurs, actualités, etc.) doivent :
1. **Être affichées dans le front-end** pour que l'utilisateur puisse les consulter
2. **Être incorporées dans le prompt de l'analyse IA** pour que Claude les utilise dans son raisonnement

Aucune donnée ne doit être récupérée sans être à la fois visible côté UI et exploitée par l'IA.

## APIs

- **Football-Data.org** (`FOOTBALL_DATA_API_KEY`) : classements, matchs, résultats
- **API-Football** (`API_FOOTBALL_KEY`) : blessures, suspensions, joueurs clés, fixtures récentes (100 req/jour, cache 12h)
- **Google News RSS** : actualités récentes des équipes (gratuit, sans clé, cache 3h)
