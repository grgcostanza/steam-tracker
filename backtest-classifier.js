/**
 * Backtest for classifyStudio().
 *
 * Walks every historical watchlist, extracts unique (developer, publisher)
 * pairs, and calls classifyStudio() on each. Scores against a hand-labeled
 * ground-truth set so you can see how often the Haiku classifier gets the
 * obvious cases right (e.g. Capcom/Valve = major, poncle = indie).
 *
 * Run: ANTHROPIC_API_KEY=sk-ant-... node backtest-classifier.js
 * Optional flags:
 *   --truth-only   Only run on the ground-truth set (fast smoke test)
 *   --limit N      Cap the total number of API calls
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {}

import { classifyStudio } from './contact-research.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WATCHLISTS_DIR = path.join(__dirname, 'watchlists');

// Ground-truth labels. Keys are lowercased developer names.
// "major" = should be filtered out before expensive research.
// "indie" = genuine indie studio worth researching.
const GROUND_TRUTH = {
  // Majors the user has explicitly called out
  'capcom': 'major',
  'capcom co., ltd.': 'major',
  'valve': 'major',
  'nexon': 'major',
  'io interactive': 'major',
  'konami': 'major',
  // Other well-known majors likely to appear
  'square enix': 'major',
  'sega': 'major',
  'ea': 'major',
  'electronic arts': 'major',
  'ubisoft': 'major',
  'bandai namco entertainment inc.': 'major',
  'activision': 'major',
  'blizzard entertainment': 'major',
  'take-two interactive': 'major',
  'rockstar games': 'major',
  'nintendo': 'major',
  'sony interactive entertainment': 'major',
  'microsoft': 'major',
  'xbox game studios': 'major',
  'epic games': 'major',
  'riot games': 'major',
  'tencent': 'major',
  'netease games': 'major',
  'krafton': 'major',
  'embracer group': 'major',
  'thq nordic': 'major',
  'paradox interactive': 'major',
  'cd projekt red': 'major',
  'devolver digital': 'major',
  'tinybuild': 'major',
  'annapurna interactive': 'major',
  'playstack': 'major',
  'hooded horse': 'major',
  'raw fury': 'major',
  'focus entertainment': 'major',
  '505 games': 'major',
  'team17': 'major',
  'kwalee': 'major',
  'fireshine games': 'major',
  'saber interactive': 'major',
  'mihoyo': 'major',
  'hoyoverse': 'major',
  'ncsoft': 'major',
  'fromsoftware': 'major',
  'remedy entertainment': 'major',
  'arkane studios': 'major',
  'respawn entertainment': 'major',
  'obsidian entertainment': 'major',
  'larian studios': 'major',
  'archetype entertainment': 'major', // Wizards of the Coast subsidiary
  'wizards of the coast': 'major',
  'bungie': 'major',
  // Known indies seen in the watchlists
  'poncle': 'indie',
  'lazy bear games': 'indie',
  'hillfort games': 'indie',
  'beartwigs': 'indie',
  'adrastea games': 'indie',
  'cyberwave': 'indie',
  'funselektor labs inc.': 'indie',
  'brain jar games, inc.': 'indie',
  'push on': 'indie',
  'evil raptor': 'indie',
  'bun muen': 'indie',
  'paper cult': 'indie',
  'coldblood inc.': 'indie',
  'one more level': 'indie',
  'the sledding corporation': 'indie',
  'dwarven brothers': 'indie',
  'radical fish games': 'indie',
  'mooneye studios': 'indie',
  'fakefish': 'indie',
  'fantastic signals': 'indie',
  'cold symmetry': 'indie',
  'facepunch studios': 'indie',
  'weappy studio': 'indie',
  'longpines games': 'indie',
  'gemdrops, inc.': 'indie',
};

function parseFlags(argv) {
  const flags = { truthOnly: false, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--truth-only') flags.truthOnly = true;
    else if (argv[i] === '--limit') flags.limit = parseInt(argv[++i], 10) || Infinity;
  }
  return flags;
}

// Pull all (developer, publisher) pairs out of every watchlist markdown file.
function collectHistoricalPairs() {
  if (!fs.existsSync(WATCHLISTS_DIR)) return [];
  const files = fs.readdirSync(WATCHLISTS_DIR).filter(f => f.endsWith('.md')).sort();

  // Matches both table shapes. We grab whatever looks like "| dev | pub |" where both
  // cells are adjacent text columns. We'll filter out non-pairs heuristically.
  const newRowRe = /\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*[^|]+\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
  const riserRowRe = /\|\s*\d+\s*\|\s*\d+\s*\|\s*\+\d+\s*\|\s*([^|]+?)\s*\|\s*[^|]+\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;

  const seen = new Map(); // key: `${dev}||${pub}` -> { developer, publisher, sources: Set<title> }
  for (const f of files) {
    const content = fs.readFileSync(path.join(WATCHLISTS_DIR, f), 'utf-8');
    for (const re of [newRowRe, riserRowRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(content)) !== null) {
        const [, title, developer, publisher] = m;
        if (!developer || !publisher) continue;
        if (developer.trim() === 'Developer') continue; // header
        if (developer.trim() === 'Unknown' || publisher.trim() === 'Unknown') continue;
        const key = `${developer.trim()}||${publisher.trim()}`;
        if (!seen.has(key)) {
          seen.set(key, {
            developer: developer.trim(),
            publisher: publisher.trim(),
            sources: new Set()
          });
        }
        seen.get(key).sources.add(title.trim());
      }
    }
  }
  return Array.from(seen.values());
}

function truthFor(developer) {
  return GROUND_TRUTH[developer.toLowerCase()] || null;
}

async function main() {
  const flags = parseFlags(process.argv);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it in .env or as an env var.');
    process.exit(1);
  }

  let pairs = collectHistoricalPairs();
  console.log(`Collected ${pairs.length} unique (dev, pub) pairs from historical watchlists.`);

  if (flags.truthOnly) {
    pairs = pairs.filter(p => truthFor(p.developer) !== null);
    // Also inject any ground-truth names that never appeared in watchlists,
    // so the smoke test covers the full hand-labeled set.
    const have = new Set(pairs.map(p => p.developer.toLowerCase()));
    for (const name of Object.keys(GROUND_TRUTH)) {
      if (!have.has(name)) {
        pairs.push({ developer: name, publisher: name, sources: new Set(['(synthetic)']) });
      }
    }
    console.log(`Ground-truth-only mode: ${pairs.length} studios.`);
  }

  if (pairs.length > flags.limit) {
    pairs = pairs.slice(0, flags.limit);
    console.log(`Limiting to ${flags.limit} pairs.`);
  }

  let correct = 0;
  let wrong = 0;
  let unknownGT = 0;
  const disagreements = [];

  console.log('\n| Developer | Publisher | Classification | Expected | Match | Reasoning |');
  console.log('|---|---|---|---|---|---|');

  for (const pair of pairs) {
    const { developer, publisher } = pair;
    let result;
    try {
      result = await classifyStudio(developer, publisher);
    } catch (e) {
      result = { classification: 'error', reasoning: e.message };
    }

    const expected = truthFor(developer);
    let match = '-';
    if (expected) {
      if (result.classification === expected) {
        match = 'PASS';
        correct++;
      } else if (result.classification === 'unknown') {
        match = 'unknown';
        unknownGT++;
      } else {
        match = 'FAIL';
        wrong++;
        disagreements.push({ developer, publisher, expected, got: result.classification, reasoning: result.reasoning });
      }
    }

    console.log(`| ${developer} | ${publisher} | ${result.classification} | ${expected || '-'} | ${match} | ${(result.reasoning || '').replace(/\|/g, '\\|')} |`);

    await new Promise(r => setTimeout(r, 250)); // soft rate limit
  }

  console.log('\n--- Summary ---');
  const labeled = correct + wrong + unknownGT;
  console.log(`Labeled studios:    ${labeled}`);
  console.log(`Correct:            ${correct}`);
  console.log(`Wrong (misclass):   ${wrong}`);
  console.log(`Returned unknown:   ${unknownGT}`);
  if (labeled > 0) {
    console.log(`Accuracy (strict):  ${((correct / labeled) * 100).toFixed(1)}%`);
    console.log(`Accuracy (w/ unk):  ${(((correct + unknownGT) / labeled) * 100).toFixed(1)}%  (unknowns fall through to full research, so they're safe)`);
  }

  if (disagreements.length > 0) {
    console.log('\n--- Disagreements ---');
    for (const d of disagreements) {
      console.log(`  ${d.developer}  expected=${d.expected}  got=${d.got}  reason="${d.reasoning}"`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
