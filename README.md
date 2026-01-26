# SteamDB Wishlist Tracker

Tracks the top 100 most wishlisted games on Steam and identifies interesting changes.

## Usage

Simply ask Claude: **"Run the tracker"** or **"Track SteamDB wishlists"**

Claude will:
1. Open SteamDB in the browser via Chrome extension
2. Extract the top 100 most wishlisted games (rank + title)
3. Compare against the previous run to find changes
4. For any new entries or risers, search online for developer/publisher info
5. Generate reports and watchlists automatically

## Output

- **reports/**: Contains timestamped markdown reports with all 100 games (rank + title)
- **watchlists/**: Contains daily watchlists highlighting:
  - New entries to the top 100 (with developer/publisher)
  - Games that rose 3+ positions since last run (with developer/publisher)

## Data Points Tracked

### Full Report
| Field | Description |
|-------|-------------|
| Rank | Current wishlist position (1-100) |
| Title | Game name |

### Watchlist Only
| Field | Description |
|-------|-------------|
| Rank | Current wishlist position |
| Title | Game name |
| Developer | Development studio (searched online) |
| Publisher | Publishing company (searched online) |
