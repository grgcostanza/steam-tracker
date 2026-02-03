# Steam Wishlist Tracker

Tracks the top 200 most wishlisted games on Steam and identifies interesting changes using Steam's official API.

## Usage

The tracker runs automatically via GitHub Actions every Monday at 6:00 AM PST.

To run manually:
```bash
npm run daily
```

The script will:
1. Fetch the top 200 most wishlisted games from Steam's official API
2. Compare against the previous run to find changes
3. For any new entries or risers, fetch developer/publisher info from Steam
4. Generate reports and watchlists automatically
5. Send email notifications via Resend (if configured)

## Output

- **reports/**: Contains timestamped markdown reports with all 200 games (rank + title)
- **watchlists/**: Contains daily watchlists highlighting:
  - New entries to the top 200 (with developer/publisher)
  - Games that rose 3+ positions since last run (with developer/publisher)

## Data Points Tracked

### Full Report
| Field | Description |
|-------|-------------|
| Rank | Current wishlist position (1-200) |
| Title | Game name |

### Watchlist Only
| Field | Description |
|-------|-------------|
| Rank | Current wishlist position |
| Title | Game name |
| Developer | Development studio (searched online) |
| Publisher | Publishing company (searched online) |
