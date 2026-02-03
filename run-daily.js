import { scrapeTop200, scrapeGameDetails } from './scraper.js';
import { sendNotification } from './email-notify.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env for local testing
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // dotenv not installed or failed to load, rely on environment variables
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run tracker.js with the scraped games data
 */
async function runTracker(gamesJson) {
  return new Promise((resolve, reject) => {
    const tracker = spawn('node', ['tracker.js', gamesJson], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    tracker.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    tracker.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    tracker.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Tracker exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Run enrich-watchlist.js with enrichment data
 */
async function enrichWatchlist(enrichmentData) {
  return new Promise((resolve, reject) => {
    const enrich = spawn('node', ['enrich-watchlist.js', JSON.stringify(enrichmentData)], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';

    enrich.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    enrich.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    enrich.on('close', (code) => {
      resolve({ success: code === 0, output: stdout });
    });
  });
}

/**
 * Parse enrichment data from tracker output
 */
function parseEnrichmentData(trackerOutput) {
  const match = trackerOutput.match(/--- ENRICHMENT_DATA_START ---\n(.*)\n--- ENRICHMENT_DATA_END ---/s);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.error('Failed to parse enrichment data:', e.message);
      return [];
    }
  }
  return [];
}

/**
 * Main daily workflow
 */
async function main() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Steam Daily Tracker - ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Step 1: Scrape top 200 games
    console.log('[1/4] Scraping Steam API...');
    const games = await scrapeTop200();

    if (games.length === 0) {
      throw new Error('No games scraped - possible page structure change or blocking');
    }

    console.log(`  Scraped ${games.length} games\n`);

    // Step 2: Run tracker
    console.log('[2/4] Running tracker...');
    const trackerOutput = await runTracker(JSON.stringify(games));
    console.log('');

    // Step 3: Enrich watchlist items with developer/publisher info
    console.log('[3/4] Enriching watchlist...');
    const gamesToEnrich = parseEnrichmentData(trackerOutput);

    if (gamesToEnrich.length > 0) {
      console.log(`  Found ${gamesToEnrich.length} games to enrich\n`);

      for (const game of gamesToEnrich) {
        if (game.appId) {
          try {
            console.log(`  Getting details for: ${game.title}`);
            const details = await scrapeGameDetails(game.appId);

            await enrichWatchlist({
              title: game.title,
              appId: game.appId,
              developer: details.developer,
              publisher: details.publisher
            });

            // Rate limiting - be nice to Steam API
            await new Promise(r => setTimeout(r, 2000));
          } catch (e) {
            console.error(`  Failed to enrich ${game.title}: ${e.message}`);
          }
        }
      }
    } else {
      console.log('  No games need enrichment\n');
    }

    // Step 4: Send email notification
    console.log('[4/4] Sending email notification...');
    const emailResult = await sendNotification();

    if (emailResult.success) {
      console.log('  Email sent successfully\n');
    } else {
      console.log(`  Email skipped: ${emailResult.reason}\n`);
    }

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`${'='.repeat(60)}`);
    console.log(`Daily run completed in ${duration}s`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\nDaily run failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
