import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCHLISTS_DIR = path.join(__dirname, 'watchlists');

// Parse command line arguments
// Expected: node enrich-watchlist.js '{"title":"Game Name","appId":"123456","developer":"Dev","publisher":"Pub"}'
const enrichmentJson = process.argv[2];

if (!enrichmentJson) {
  console.error('Usage: node enrich-watchlist.js \'{"title":"...","appId":"...","developer":"...","publisher":"..."}\'');
  process.exit(1);
}

// Get the most recent watchlist file
function getLatestWatchlist() {
  if (!fs.existsSync(WATCHLISTS_DIR)) return null;

  const files = fs.readdirSync(WATCHLISTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  return path.join(WATCHLISTS_DIR, files[0]);
}

// Update the watchlist with enrichment data
function enrichWatchlist(enrichmentData) {
  const watchlistPath = getLatestWatchlist();

  if (!watchlistPath) {
    console.error('No watchlist found to enrich');
    process.exit(1);
  }

  let content = fs.readFileSync(watchlistPath, 'utf-8');
  const { title, developer, publisher } = enrichmentData;

  // Escape special regex characters in title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern to match a row with this title and "Unknown" developer/publisher
  // Format: | rank | title | followers | Unknown | Unknown |
  // or: | rank | prevRank | change | title | followers | Unknown | Unknown |

  // For new entries table (5 columns: rank, title, followers, dev, pub)
  const newEntryPattern = new RegExp(
    `(\\|\\s*\\d+\\s*\\|\\s*${escapedTitle}\\s*\\|\\s*[\\d,N/A]+\\s*\\|)\\s*Unknown\\s*\\|\\s*Unknown\\s*\\|`,
    'g'
  );

  // For risers table (7 columns: rank, prevRank, change, title, followers, dev, pub)
  const riserPattern = new RegExp(
    `(\\|\\s*\\d+\\s*\\|\\s*\\d+\\s*\\|\\s*\\+\\d+\\s*\\|\\s*${escapedTitle}\\s*\\|\\s*[\\d,N/A]+\\s*\\|)\\s*Unknown\\s*\\|\\s*Unknown\\s*\\|`,
    'g'
  );

  let updated = false;
  const originalContent = content;

  // Try to replace in new entries table
  content = content.replace(newEntryPattern, `$1 ${developer} | ${publisher} |`);

  // Try to replace in risers table
  content = content.replace(riserPattern, `$1 ${developer} | ${publisher} |`);

  updated = content !== originalContent;

  if (updated) {
    fs.writeFileSync(watchlistPath, content);
    console.log(`Updated: ${title} -> Developer: ${developer}, Publisher: ${publisher}`);
  } else {
    console.log(`No match found for: ${title}`);
  }

  return { updated, watchlistPath };
}

const enrichmentData = JSON.parse(enrichmentJson);
enrichWatchlist(enrichmentData);
