import { chromium } from 'playwright';

const STEAMDB_URL = 'https://steamdb.info/charts/?category=702';

/**
 * Scrape the top 200 most wishlisted games from SteamDB
 * @returns {Promise<Array<{rank: number, title: string, appId: string, followers: number}>>}
 */
export async function scrapeTop200() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to SteamDB...');
    await page.goto(STEAMDB_URL, { waitUntil: 'networkidle', timeout: 60000 });

    // Wait for the table to load
    await page.waitForSelector('table.table-products tbody tr', { timeout: 30000 });

    console.log('Extracting game data...');

    // Extract game data from the table
    const games = await page.evaluate(() => {
      const rows = document.querySelectorAll('table.table-products tbody tr');
      const results = [];

      rows.forEach((row, index) => {
        if (index >= 200) return; // Only top 200

        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;

        // Get app link for appId
        const appLink = row.querySelector('a[href*="/app/"]');
        const href = appLink?.getAttribute('href') || '';
        const appIdMatch = href.match(/\/app\/(\d+)/);

        // Get title from the app link text
        const title = appLink?.textContent?.trim() || '';

        // Get followers from the data-sort attribute (usually last numeric column)
        const followersCell = cells[cells.length - 1];
        const followers = parseInt(followersCell?.getAttribute('data-sort') || '0', 10);

        if (title && appIdMatch) {
          results.push({
            rank: index + 1,
            title: title,
            appId: appIdMatch[1],
            followers: followers
          });
        }
      });

      return results;
    });

    console.log(`Scraped ${games.length} games`);
    return games;
  } finally {
    await browser.close();
  }
}

/**
 * Scrape developer and publisher info for a specific game
 * @param {string} appId - Steam app ID
 * @returns {Promise<{developer: string, publisher: string}>}
 */
export async function scrapeGameDetails(appId) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto(`https://steamdb.info/app/${appId}/info/`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const details = await page.evaluate(() => {
      let developer = 'Unknown';
      let publisher = 'Unknown';

      // Look for developer and publisher in the info table
      const rows = document.querySelectorAll('table.table-dark tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0]?.textContent?.trim().toLowerCase();
          const value = cells[1]?.textContent?.trim();

          if (label === 'developer' || label === 'developers') {
            developer = value || 'Unknown';
          }
          if (label === 'publisher' || label === 'publishers') {
            publisher = value || 'Unknown';
          }
        }
      });

      return { developer, publisher };
    });

    return details;
  } catch (error) {
    console.error(`Failed to get details for app ${appId}:`, error.message);
    return { developer: 'Unknown', publisher: 'Unknown' };
  } finally {
    await browser.close();
  }
}

// Allow running standalone for testing
if (process.argv[1] && process.argv[1].endsWith('scraper.js')) {
  console.log('Running scraper test...');
  scrapeTop200()
    .then(games => {
      console.log(`\nFirst 5 games:`);
      games.slice(0, 5).forEach(g => console.log(`  #${g.rank}: ${g.title} (${g.followers.toLocaleString()} followers)`));
    })
    .catch(console.error);
}
