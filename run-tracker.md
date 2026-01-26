# SteamDB Tracker - How to Run

## Overview
The tracker consists of two parts:
1. **tracker.js** - Scrapes the top 200 most wishlisted games, compares to previous data, generates reports and watchlists
2. **enrich-watchlist.js** - Enriches watchlist entries with developer/publisher info from individual game pages

## Running with Claude Code

When you ask Claude to "run the tracker", it will:

1. Navigate to SteamDB's most wishlisted games page
2. Scrape all 200 games (rank, title, and appId)
3. Run `tracker.js` with the scraped data
4. Parse the output to find games needing enrichment
5. For each game in the watchlist (new entries + risers):
   - Navigate to the game's individual SteamDB page
   - Extract developer and publisher info
   - Run `enrich-watchlist.js` to update the watchlist
6. Display the final enriched watchlist

## Data Flow

```
SteamDB Page → tracker.js → watchlist.md (with "Unknown" dev/pub)
                    ↓
            ENRICHMENT_DATA (list of games to enrich)
                    ↓
Individual Game Pages → enrich-watchlist.js → watchlist.md (with real dev/pub)
```

## Output Files

- `reports/report_YYYY-MM-DD_HH-MM-SS.md` - Full ranking report
- `reports/report_YYYY-MM-DD_HH-MM-SS.json` - JSON data for future comparisons
- `watchlists/watchlist_YYYY-MM-DD_HH-MM-SS.md` - Watchlist with new entries and risers
