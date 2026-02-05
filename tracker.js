import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORTS_DIR = path.join(__dirname, 'reports');
const WATCHLISTS_DIR = path.join(__dirname, 'watchlists');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WATCHLISTS_DIR)) {
    fs.mkdirSync(WATCHLISTS_DIR, { recursive: true });
  }
}

// Get timestamp for filenames
function getTimestamp() {
  const now = new Date();
  return now.toISOString().split('T')[0] + '_' +
         now.toTimeString().split(' ')[0].replace(/:/g, '-');
}

// Get the most recent previous report
function getPreviousReport() {
  if (!fs.existsSync(REPORTS_DIR)) return null;

  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const latestFile = path.join(REPORTS_DIR, files[0]);
  const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
  return data;
}

// Compare current and previous reports to find interesting changes
function findChanges(currentGames, previousGames) {
  const newEntries = [];
  const risers = [];

  if (!previousGames || previousGames.length === 0) {
    return { newEntries, risers, isFirstRun: true };
  }

  // Create a map of previous games by title
  const previousMap = new Map();
  for (const game of previousGames) {
    previousMap.set(game.title, game);
  }

  for (const game of currentGames) {
    const previous = previousMap.get(game.title);

    if (!previous) {
      // New to top 200
      newEntries.push(game);
    } else if (previous.rank - game.rank > 2) {
      // Rose more than 2 slots (lower rank number = higher position)
      risers.push({
        ...game,
        previousRank: previous.rank,
        change: previous.rank - game.rank
      });
    }
  }

  return { newEntries, risers, isFirstRun: false };
}

// Format follower count with commas
function formatFollowers(followers) {
  if (!followers && followers !== 0) return 'N/A';
  return followers.toLocaleString();
}

// Generate markdown report (rank, title, and followers)
function generateReport(games) {
  let markdown = `# Steam Most Wishlisted Games Report\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;
  markdown += `| Rank | Title | Followers |\n`;
  markdown += `|------|-------|----------|\n`;

  for (const game of games) {
    markdown += `| ${game.rank} | ${game.title} | ${formatFollowers(game.followers)} |\n`;
  }

  return markdown;
}

// Generate watchlist markdown (includes developer/publisher for watchlist items)
function generateWatchlist(changes, watchlistData) {
  let markdown = `# Watchlist - ${new Date().toLocaleDateString()}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleString()}\n\n`;

  if (changes.isFirstRun) {
    markdown += `*This is the first run - no previous data to compare against.*\n\n`;
    return markdown;
  }

  markdown += `## New to Top 200\n\n`;
  if (changes.newEntries.length === 0) {
    markdown += `*No new entries*\n\n`;
  } else {
    markdown += `| Rank | Title | Followers | App ID | Developer | Publisher |\n`;
    markdown += `|------|-------|-----------|--------|-----------|----------|\n`;
    for (const game of changes.newEntries) {
      const info = watchlistData?.find(w => w.title === game.title) || {};
      markdown += `| ${game.rank} | ${game.title} | ${formatFollowers(game.followers)} | ${game.appId} | ${info.developer || 'Unknown'} | ${info.publisher || 'Unknown'} |\n`;
    }
    markdown += `\n`;
  }

  markdown += `## Rising Titles (Up 3+ Spots)\n\n`;
  if (changes.risers.length === 0) {
    markdown += `*No significant risers*\n\n`;
  } else {
    markdown += `| Current Rank | Previous Rank | Change | Title | Followers | App ID | Developer | Publisher |\n`;
    markdown += `|--------------|---------------|--------|-------|-----------|--------|-----------|----------|\n`;
    for (const game of changes.risers) {
      const info = watchlistData?.find(w => w.title === game.title) || {};
      markdown += `| ${game.rank} | ${game.previousRank} | +${game.change} | ${game.title} | ${formatFollowers(game.followers)} | ${game.appId} | ${info.developer || 'Unknown'} | ${info.publisher || 'Unknown'} |\n`;
    }
  }

  return markdown;
}

// Process games data passed as JSON argument
function processGames(gamesJson, watchlistJson) {
  ensureDirectories();
  const timestamp = getTimestamp();

  const games = JSON.parse(gamesJson);
  const watchlistData = watchlistJson ? JSON.parse(watchlistJson) : null;

  if (games.length === 0) {
    console.error('No games provided.');
    process.exit(1);
  }

  // Get previous report for comparison
  const previousData = getPreviousReport();
  const previousGames = previousData?.games || [];

  // Find changes
  const changes = findChanges(games, previousGames);

  // Generate and save report
  const reportMarkdown = generateReport(games);
  const reportPath = path.join(REPORTS_DIR, `report_${timestamp}.md`);
  fs.writeFileSync(reportPath, reportMarkdown);
  console.log(`Report saved: ${reportPath}`);

  // Save JSON data for future comparisons
  const jsonPath = path.join(REPORTS_DIR, `report_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp, games }, null, 2));
  console.log(`Data saved: ${jsonPath}`);

  // Generate and save watchlist
  const watchlistMarkdown = generateWatchlist(changes, watchlistData);
  const watchlistPath = path.join(WATCHLISTS_DIR, `watchlist_${timestamp}.md`);
  fs.writeFileSync(watchlistPath, watchlistMarkdown);
  console.log(`Watchlist saved: ${watchlistPath}`);

  // Print summary
  console.log('\n--- Summary ---');
  console.log(`Total games tracked: ${games.length}`);
  if (!changes.isFirstRun) {
    console.log(`New to top 200: ${changes.newEntries.length}`);
    console.log(`Rising titles: ${changes.risers.length}`);
  } else {
    console.log('First run - baseline established');
  }

  // Output games that need enrichment (for the enrichment subagent)
  if (!changes.isFirstRun) {
    const needsEnrichment = [
      ...changes.newEntries,
      ...changes.risers
    ];
    if (needsEnrichment.length > 0) {
      console.log('\n--- ENRICHMENT_DATA_START ---');
      console.log(JSON.stringify(needsEnrichment));
      console.log('--- ENRICHMENT_DATA_END ---');
    }
  }

  // Return results for display
  return {
    totalGames: games.length,
    newEntries: changes.newEntries,
    risers: changes.risers,
    isFirstRun: changes.isFirstRun,
    reportPath,
    watchlistPath
  };
}

// Get games JSON from command line arguments or file
let gamesJson = process.argv[2];
let watchlistJson = process.argv[3]; // Optional: developer/publisher info for watchlist items

if (!gamesJson) {
  console.error('Usage: node tracker.js \'[{"rank":1,"title":"..."},...]\' or node tracker.js --file <path>');
  process.exit(1);
}

// If --file flag is used, read from file
if (gamesJson === '--file') {
  const filePath = process.argv[3];
  if (!filePath) {
    console.error('Please provide a file path after --file');
    process.exit(1);
  }
  gamesJson = fs.readFileSync(filePath, 'utf-8');
  watchlistJson = process.argv[4]; // Shift watchlist to next arg when using --file
}

processGames(gamesJson, watchlistJson);
