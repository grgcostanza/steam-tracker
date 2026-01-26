/**
 * Steam Charts Scraper
 * Uses Steam's official store API to fetch most wishlisted games
 */

/**
 * Build Steam API URL for wishlisted games
 * @param {number} start - Starting index
 * @param {number} count - Number of results
 * @returns {string}
 */
function buildSteamUrl(start, count) {
  return `https://store.steampowered.com/search/results/?query&start=${start}&count=${count}&dynamic_data=&sort_by=_ASC&supportedlang=english&snr=1_7_7_globaltopsellers_7&filter=popularwishlist&infinite=1`;
}

/**
 * Fetch a batch of wishlisted games from Steam API
 * @param {number} start - Starting index
 * @param {number} count - Number of results
 * @returns {Promise<Array>}
 */
async function fetchBatch(start, count) {
  const response = await fetch(buildSteamUrl(start, count), {
    headers: {
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://store.steampowered.com/search/?filter=popularwishlist'
    }
  });

  if (!response.ok) {
    throw new Error(`Steam API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.results_html) {
    throw new Error('No results_html in Steam API response');
  }

  return parseGamesFromHtml(data.results_html, start);
}

/**
 * Fetch the top 200 most wishlisted games from Steam's API
 * @returns {Promise<Array<{rank: number, title: string, appId: string, followers: number}>>}
 */
export async function scrapeTop200() {
  console.log('Fetching from Steam API...');

  try {
    // Fetch first 100
    console.log('  Fetching games 1-100...');
    const batch1 = await fetchBatch(0, 100);

    // Small delay to be nice to the API
    await new Promise(r => setTimeout(r, 500));

    // Fetch next 100
    console.log('  Fetching games 101-200...');
    const batch2 = await fetchBatch(100, 100);

    // Combine and re-number
    const games = [...batch1, ...batch2].map((game, index) => ({
      ...game,
      rank: index + 1
    }));

    console.log(`Fetched ${games.length} games from Steam API`);
    return games;

  } catch (error) {
    console.error('Failed to fetch from Steam API:', error.message);
    throw error;
  }
}

/**
 * Parse game data from Steam's HTML response
 * @param {string} html - The HTML string from Steam API
 * @returns {Array<{rank: number, title: string, appId: string, followers: number}>}
 */
function parseGamesFromHtml(html, startRank = 0) {
  const games = [];

  // Match each game row - Steam uses data-ds-appid for the app ID
  const appIdRegex = /data-ds-appid="(\d+)"/g;
  const titleRegex = /<span class="title">([^<]+)<\/span>/g;

  // Extract all app IDs
  const appIds = [];
  let match;
  while ((match = appIdRegex.exec(html)) !== null) {
    appIds.push(match[1]);
  }

  // Extract all titles
  const titles = [];
  while ((match = titleRegex.exec(html)) !== null) {
    titles.push(decodeHtmlEntities(match[1]));
  }

  // Combine into game objects
  const count = Math.min(appIds.length, titles.length);
  for (let i = 0; i < count; i++) {
    games.push({
      rank: startRank + i + 1,
      title: titles[i],
      appId: appIds[i],
      followers: 0  // Steam API doesn't provide follower counts in this endpoint
    });
  }

  return games;
}

/**
 * Decode HTML entities in a string
 * @param {string} str - String with HTML entities
 * @returns {string} - Decoded string
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&trade;/g, '™')
    .replace(/&reg;/g, '®')
    .replace(/&copy;/g, '©');
}

/**
 * Fetch developer and publisher info for a specific game from Steam API
 * @param {string} appId - Steam app ID
 * @returns {Promise<{developer: string, publisher: string}>}
 */
export async function scrapeGameDetails(appId) {
  try {
    const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Steam API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data[appId]?.success || !data[appId]?.data) {
      return { developer: 'Unknown', publisher: 'Unknown' };
    }

    const appData = data[appId].data;

    return {
      developer: appData.developers?.[0] || 'Unknown',
      publisher: appData.publishers?.[0] || 'Unknown'
    };

  } catch (error) {
    console.error(`Failed to get details for app ${appId}:`, error.message);
    return { developer: 'Unknown', publisher: 'Unknown' };
  }
}

// Allow running standalone for testing
const isMainModule = process.argv[1]?.endsWith('scraper.js') ||
                     process.argv[1]?.replace(/\\/g, '/').endsWith('scraper.js');

if (isMainModule) {
  console.log('Running scraper test...');
  scrapeTop200()
    .then(games => {
      console.log(`\nFirst 10 games:`);
      games.slice(0, 10).forEach(g => console.log(`  #${g.rank}: ${g.title} (AppID: ${g.appId})`));
    })
    .catch(console.error);
}
