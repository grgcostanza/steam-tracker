import { chromium } from 'playwright';

const STEAMDB_URL = 'https://steamdb.info/charts/?category=702';

/**
 * Scrape the top 200 most wishlisted games from SteamDB
 * @returns {Promise<Array<{rank: number, title: string, appId: string, followers: number}>>}
 */
export async function scrapeTop200() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Add extra headers to look more like a real browser
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to SteamDB...');

    // Use 'domcontentloaded' instead of 'networkidle' for faster, more reliable loading
    await page.goto(STEAMDB_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Wait for the table to appear
    console.log('Waiting for table to load...');
    await page.waitForSelector('table tbody tr', { timeout: 30000 });

    // Give a bit more time for dynamic content
    await page.waitForTimeout(2000);

    console.log('Extracting game data...');

    // Extract game data from the table
    const games = await page.evaluate(() => {
      // Try multiple possible table selectors
      let rows = document.querySelectorAll('table.table-products tbody tr');
      if (rows.length === 0) {
        rows = document.querySelectorAll('table tbody tr');
      }

      const results = [];

      rows.forEach((row, index) => {
        if (index >= 200) return; // Only top 200

        const cells = row.querySelectorAll('td');
        if (cells.length < 3) return;

        // Get app link for appId
        const appLink = row.querySelector('a[href*="/app/"]');
        if (!appLink) return;

        const href = appLink.getAttribute('href') || '';
        const appIdMatch = href.match(/\/app\/(\d+)/);

        // Get title from the app link text
        const title = appLink.textContent?.trim() || '';

        // Try to find followers - look for cells with numeric data-sort
        let followers = 0;
        for (const cell of cells) {
          const dataSort = cell.getAttribute('data-sort');
          if (dataSort && !isNaN(parseInt(dataSort)) && parseInt(dataSort) > 1000) {
            followers = parseInt(dataSort, 10);
          }
        }

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
  } catch (error) {
    // Take a screenshot for debugging if it fails
    try {
      await page.screenshot({ path: 'debug-screenshot.png' });
      console.log('Debug screenshot saved to debug-screenshot.png');
    } catch (e) {
      // Ignore screenshot errors
    }
    throw error;
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
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(`https://steamdb.info/app/${appId}/info/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for content to load
    await page.waitForTimeout(1000);

    const details = await page.evaluate(() => {
      let developer = 'Unknown';
      let publisher = 'Unknown';

      // Look for developer and publisher in any table
      const rows = document.querySelectorAll('table tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const label = cells[0]?.textContent?.trim().toLowerCase();
          const value = cells[1]?.textContent?.trim();

          if (label && (label.includes('developer'))) {
            developer = value || 'Unknown';
          }
          if (label && (label.includes('publisher'))) {
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
