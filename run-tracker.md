# Steam Tracker - How to Run

## Overview
The tracker consists of multiple components:
1. **scraper.js** - Fetches the top 200 most wishlisted games from Steam's official API
2. **tracker.js** - Compares current data to previous reports, generates reports and watchlists
3. **enrich-watchlist.js** - Enriches watchlist entries with developer/publisher info from Steam
4. **email-notify.js** - Sends email notifications via Resend
5. **run-daily.js** - Orchestrates the entire pipeline

## Running the Tracker

### Automated (GitHub Actions)
The tracker runs automatically every Monday at 6:00 AM PST via GitHub Actions.

### Manual Execution
```bash
npm run daily
```

## Pipeline Flow

When `run-daily.js` executes:

1. **Scrape** - `scraper.js` fetches top 200 games from Steam API
2. **Track** - `tracker.js` compares data and generates reports/watchlists
3. **Enrich** - For each game needing enrichment, `scraper.js` fetches details and `enrich-watchlist.js` updates the watchlist
4. **Notify** - `email-notify.js` sends email with changes

## Data Flow

```
Steam API → scraper.js → tracker.js → watchlist.md (with "Unknown" dev/pub)
                                ↓
                        ENRICHMENT_DATA (list of games to enrich)
                                ↓
Steam API → scraper.js → enrich-watchlist.js → watchlist.md (with real dev/pub)
                                ↓
                          email-notify.js
```

## Output Files

- `reports/report_YYYY-MM-DD_HH-MM-SS.md` - Full ranking report
- `reports/report_YYYY-MM-DD_HH-MM-SS.json` - JSON data for future comparisons
- `watchlists/watchlist_YYYY-MM-DD_HH-MM-SS.md` - Watchlist with new entries and risers
