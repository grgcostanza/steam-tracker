/**
 * Quick test script to verify the Anthropic API key and web search work.
 * Run: node test-contact.js
 */

// Load .env for local testing
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (e) {
  // dotenv not installed, rely on environment variables
}

import { isSelfPublished, researchContact } from './contact-research.js';

// Test 1: isSelfPublished logic
console.log('=== Test 1: isSelfPublished logic ===');
const tests = [
  ['poncle', 'poncle', true],
  ['Wolf Haus Games', 'Wolf Haus Games', true],
  ['CAPCOM Co., Ltd.', 'CAPCOM Co., Ltd.', true],
  ['Digital Extremes', 'Digital Extremes', true],
  ['All Parts Connected', 'tinyBuild', false],
  ['Paraglacial', 'THQ Nordic', false],
  ['Unknown', 'Unknown', false],
];

let passed = 0;
for (const [dev, pub, expected] of tests) {
  const result = isSelfPublished(dev, pub);
  const ok = result === expected;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: "${dev}" / "${pub}" -> ${result} (expected ${expected})`);
  if (ok) passed++;
}
console.log(`  ${passed}/${tests.length} passed\n`);

// Test 2: API key check
console.log('=== Test 2: API key check ===');
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('  ANTHROPIC_API_KEY is NOT set.');
  console.log('  Create a .env file with: ANTHROPIC_API_KEY=sk-ant-...');
  console.log('  Or set it as an environment variable.\n');
  process.exit(1);
}
console.log(`  ANTHROPIC_API_KEY is set (starts with: ${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...)\n`);

// Test 3: Claude API call with web search
console.log('=== Test 3: Claude API call with web search ===');
console.log('  Testing with: "Vampire Survivors" by "poncle" (AppID: 1794680)\n');

try {
  const result = await researchContact('Vampire Survivors', 'poncle', '1794680');
  console.log('\n  Result:', JSON.stringify(result, null, 2));

  if (result.selfPublished) {
    console.log('\n  SUCCESS: API call worked and identified poncle as self-published.');
    if (result.contactMethod !== '-') {
      console.log(`  Contact found: ${result.personName ? result.personName + ': ' : ''}${result.contactMethod}`);
    }
  } else {
    console.log('\n  API call worked but did not identify as self-published.');
    console.log('  This may be correct (poncle has worked with publishers for some titles).');
  }
} catch (e) {
  console.error('\n  FAILED:', e.message);
  console.error('  Check that:');
  console.error('  1. Your ANTHROPIC_API_KEY is valid');
  console.error('  2. Web search is enabled at: https://console.anthropic.com/settings/privacy');
}

console.log('\n=== Done ===');
