import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCHLISTS_DIR = path.join(__dirname, 'watchlists');

/**
 * Check if a game is potentially self-published by comparing developer and publisher names.
 * Normalizes names by stripping common suffixes (Inc, LLC, Ltd, etc.) and comparing case-insensitively.
 */
export function isSelfPublished(developer, publisher) {
  if (!developer || !publisher) return false;
  if (developer === 'Unknown' || publisher === 'Unknown') return false;

  const normalize = (s) => s.toLowerCase()
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|co\.?|corp\.?|gmbh|s\.?r\.?l\.?|studio[s]?|game[s]?|entertainment|interactive)\s*$/i, '')
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalize(developer) === normalize(publisher);
}

/**
 * Cheap first-pass classifier using Claude Haiku (no web search).
 * Decides whether a studio is a major/AAA publisher we should SKIP,
 * a genuine indie worth researching, or unknown (fall through to research).
 *
 * Returns: { classification: 'major' | 'indie' | 'unknown', reasoning: string }
 */
export async function classifyStudio(developer, publisher) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { classification: 'unknown', reasoning: '' };
  }

  const studioName = developer || publisher;
  const prompt = `Classify the game studio "${studioName}" (publisher: "${publisher}") as one of:
- "major" — a large/AAA publisher, public company, platform holder, or a well-known mid-size publisher. Examples: Capcom, Square Enix, SEGA, EA, Ubisoft, Bandai Namco, Konami, Activision, Blizzard, Take-Two, 2K, Rockstar, Nintendo, Sony, Microsoft / Xbox Game Studios, Valve, Epic Games, Riot, Tencent, NetEase, Nexon, Krafton, Embracer, THQ Nordic, Paradox, CD Projekt, Devolver Digital, tinyBuild, Annapurna Interactive, Playstack, Hooded Horse, Raw Fury, Focus Entertainment, 505 Games, Team17, Kepler, Kwalee, Fireshine, Shiro Unlimited, Saber Interactive, miHoYo/HoYoverse, NCsoft, Gameforge, Wargaming, Com2uS, Netmarble, Smilegate. Also "major" if the studio is a well-known AAA developer with hundreds of employees (IO Interactive, FromSoftware, Remedy, Arkane, Respawn, Obsidian, inXile, Larian, Kojima Productions, Bungie, 343, etc.) or a subsidiary of any of the above.
- "indie" — a small independent developer that is not any of the above, with no major corporate parent or investor.
- "unknown" — you cannot tell with confidence from the name alone.

Respond in EXACTLY this JSON format with no other text, no markdown, no code fences:
{"classification": "major|indie|unknown", "reasoning": "one short sentence"}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`    Classify API error ${response.status}: ${errorText.substring(0, 200)}`);
      return { classification: 'unknown', reasoning: '' };
    }

    const data = await response.json();
    const textBlocks = data.content.filter(b => b.type === 'text');
    if (textBlocks.length === 0) return { classification: 'unknown', reasoning: '' };

    const jsonMatch = textBlocks[textBlocks.length - 1].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { classification: 'unknown', reasoning: '' };

    const result = JSON.parse(jsonMatch[0]);
    const classification = ['major', 'indie', 'unknown'].includes(result.classification)
      ? result.classification
      : 'unknown';

    return {
      classification,
      reasoning: result.reasoning || ''
    };
  } catch (error) {
    console.error(`  Classify failed for ${studioName}: ${error.message}`);
    return { classification: 'unknown', reasoning: '' };
  }
}

/**
 * Call Claude API with web search to verify self-publishing status and find contact info.
 *
 * Returns: { selfPublished: boolean, contactMethod: string, personName: string }
 */
export async function researchContact(title, developer, appId) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('  ANTHROPIC_API_KEY not set, skipping contact research');
    return { selfPublished: false, contactMethod: '-', personName: '' };
  }

  const prompt = `Research the video game "${title}" by "${developer}" (Steam App ID: ${appId}).

I need you to determine two things:

1. SELF-PUBLISHING VERIFICATION: Is "${developer}" truly an independent, self-publishing game studio?
   - Check if they have a parent company (e.g., owned by Tencent, Embracer, Sony, Microsoft, NetEase, etc.)
   - Check if they received significant funding from or are publishing through a larger entity
   - A studio is self-published ONLY if they are genuinely independent with no major corporate parent or investor
   - Major publishers like Square Enix, SEGA, EA, Ubisoft, Capcom, Bandai Namco, etc. are NOT self-published
   - If you cannot determine ownership with confidence, mark as NOT self-published

2. CONTACT RESEARCH (regardless of self-publishing status):
   Find the best way to contact the developer. Search in this STRICT priority order and return the HIGHEST-tier contact you can verify. Do NOT return a lower tier if a higher tier is available:
   1. Personal/individual email of the CEO or founder (or co-founder)
   2. LinkedIn profile URL of the CEO or founder (or co-founder)
   3. Twitter/X profile URL of the CEO or founder (or co-founder)
   4. General company/studio email (e.g., contact@studio.com, hello@studio.com, press@studio.com)
   5. Discord server invite link

   Look at the studio's official website, social media, press kits, and LinkedIn pages.

You MUST respond in EXACTLY this JSON format with no other text, no markdown, no code fences:
{"selfPublished": true, "reasoning": "brief explanation of why self-published or not", "contactMethod": "the actual contact info found or -", "contactType": "founder_email|linkedin|twitter|studio_email|discord|none", "personName": "Full Name of the person if applicable, or empty string"}

If NOT self-published, still search for contacts and use:
{"selfPublished": false, "reasoning": "brief explanation", "contactMethod": "the actual contact info found or -", "contactType": "founder_email|linkedin|twitter|studio_email|discord|none", "personName": "Full Name of the person if applicable, or empty string"}`;

  try {
    console.log(`    Calling Claude API for: ${title}`);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }],
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`    API error ${response.status}: ${errorText.substring(0, 500)}`);
      throw new Error(`Claude API returned ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log(`    API response received - stop_reason: ${data.stop_reason}, content blocks: ${data.content?.length || 0}`);

    // Log web search usage if available
    if (data.usage?.server_tool_use?.web_search_requests) {
      console.log(`    Web searches performed: ${data.usage.server_tool_use.web_search_requests}`);
    }

    // Extract the last text block from Claude's response (the final answer after web searches)
    const textBlocks = data.content.filter(b => b.type === 'text');
    if (textBlocks.length === 0) {
      const blockTypes = data.content.map(b => b.type).join(', ');
      throw new Error(`No text blocks in response. Block types: ${blockTypes}`);
    }

    const textBlock = textBlocks[textBlocks.length - 1];

    // Parse JSON from the response, handling potential extra text
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`    Raw response text: ${jsonStr.substring(0, 300)}`);
      throw new Error('No JSON found in Claude response');
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`    Result: selfPublished=${result.selfPublished}, contactType=${result.contactType}, reasoning=${(result.reasoning || '').substring(0, 100)}`);

    return {
      selfPublished: result.selfPublished === true,
      contactMethod: result.contactMethod || '-',
      contactType: result.contactType || 'none',
      personName: result.personName || '',
      reasoning: result.reasoning || ''
    };

  } catch (error) {
    console.error(`  Contact research failed for ${title}: ${error.message}`);
    return {
      selfPublished: false,
      contactMethod: '-',
      contactType: 'none',
      personName: '',
      researchFailed: true,
      reasoning: `API error: ${error.message}`
    };
  }
}

/**
 * Parse the latest watchlist and return all games with their developer/publisher info.
 * This reads the markdown table directly, so it works regardless of how dev/pub was populated.
 */
export function getWatchlistGames() {
  const watchlistPath = getLatestWatchlist();
  if (!watchlistPath) return [];

  const content = fs.readFileSync(watchlistPath, 'utf-8');
  const games = [];

  // Parse new entries table (7 columns: rank, title, followers, appId, dev, pub, contact)
  const newEntryRowRegex = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*[^|]+\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/g;
  // Parse risers table (9 columns: rank, prevRank, change, title, followers, appId, dev, pub, contact)
  const riserRowRegex = /\|\s*\d+\s*\|\s*\d+\s*\|\s*\+\d+\s*\|\s*([^|]+?)\s*\|\s*[^|]+\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/g;

  // Split content into sections
  const sections = content.split(/^## /m);

  for (const section of sections) {
    if (section.startsWith('New to Top 200')) {
      let match;
      while ((match = newEntryRowRegex.exec(section)) !== null) {
        const [, , title, appId, developer, publisher, contact] = match;
        if (title !== 'Title' && developer !== 'Developer') { // skip header
          games.push({ title: title.trim(), appId, developer: developer.trim(), publisher: publisher.trim(), contact: contact.trim() });
        }
      }
    } else if (section.startsWith('Rising Titles')) {
      let match;
      while ((match = riserRowRegex.exec(section)) !== null) {
        const [, title, appId, developer, publisher, contact] = match;
        if (title !== 'Title' && developer !== 'Developer') { // skip header
          games.push({ title: title.trim(), appId, developer: developer.trim(), publisher: publisher.trim(), contact: contact.trim() });
        }
      }
    }
  }

  return games;
}

/**
 * Get the most recent watchlist file
 */
function getLatestWatchlist() {
  if (!fs.existsSync(WATCHLISTS_DIR)) return null;

  const files = fs.readdirSync(WATCHLISTS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  return path.join(WATCHLISTS_DIR, files[0]);
}

/**
 * Update the Contact Method column in the latest watchlist for a given game title.
 */
export function updateWatchlistContact(title, contactMethod) {
  const watchlistPath = getLatestWatchlist();

  if (!watchlistPath) {
    console.error('No watchlist found to update contact info');
    return { updated: false };
  }

  let content = fs.readFileSync(watchlistPath, 'utf-8');

  // Escape special regex characters in title
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Escape special regex characters in contactMethod for replacement safety
  const safeContact = contactMethod.replace(/\$/g, '$$$$');

  // For new entries table (7 columns: rank, title, followers, appId, dev, pub, contact)
  // Match the row and capture everything up to the last column
  const newEntryPattern = new RegExp(
    `(\\|\\s*\\d+\\s*\\|\\s*${escapedTitle}\\s*\\|\\s*[^|]+\\|\\s*\\d+\\s*\\|\\s*[^|]+\\|\\s*[^|]+\\|)\\s*-\\s*\\|`,
    'g'
  );

  // For risers table (9 columns: rank, prevRank, change, title, followers, appId, dev, pub, contact)
  const riserPattern = new RegExp(
    `(\\|\\s*\\d+\\s*\\|\\s*\\d+\\s*\\|\\s*\\+\\d+\\s*\\|\\s*${escapedTitle}\\s*\\|\\s*[^|]+\\|\\s*\\d+\\s*\\|\\s*[^|]+\\|\\s*[^|]+\\|)\\s*-\\s*\\|`,
    'g'
  );

  const originalContent = content;

  content = content.replace(newEntryPattern, `$1 ${safeContact} |`);
  content = content.replace(riserPattern, `$1 ${safeContact} |`);

  const updated = content !== originalContent;

  if (updated) {
    fs.writeFileSync(watchlistPath, content);
    console.log(`    Updated contact for: ${title} -> ${contactMethod}`);
  } else {
    console.log(`    No match found for contact update: ${title}`);
  }

  return { updated, watchlistPath };
}
