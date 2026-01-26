import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WATCHLISTS_DIR = path.join(__dirname, 'watchlists');

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

  return {
    path: path.join(WATCHLISTS_DIR, files[0]),
    filename: files[0]
  };
}

/**
 * Parse watchlist markdown into structured data
 */
function parseWatchlistMarkdown(content) {
  const result = {
    newEntries: [],
    risers: [],
    isFirstRun: content.includes('first run')
  };

  // Parse New to Top 200 section
  const newEntriesMatch = content.match(/## New to Top (?:100|200)\n\n([\s\S]*?)(?=## Rising|$)/);
  if (newEntriesMatch && !newEntriesMatch[1].includes('No new entries')) {
    const rows = newEntriesMatch[1].match(/\| \d+ \|[^\n]+/g) || [];
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 4) {
        result.newEntries.push({
          rank: cells[0],
          title: cells[1],
          followers: cells[2],
          developer: cells[3] || 'Unknown',
          publisher: cells[4] || cells[3] || 'Unknown'
        });
      }
    }
  }

  // Parse Rising Titles section
  const risersMatch = content.match(/## Rising Titles[^\n]*\n\n([\s\S]*?)$/);
  if (risersMatch && !risersMatch[1].includes('No significant risers')) {
    const rows = risersMatch[1].match(/\| \d+ \|[^\n]+/g) || [];
    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 5) {
        result.risers.push({
          currentRank: cells[0],
          previousRank: cells[1],
          change: cells[2],
          title: cells[3],
          followers: cells[4],
          developer: cells[5] || 'Unknown',
          publisher: cells[6] || cells[5] || 'Unknown'
        });
      }
    }
  }

  return result;
}

/**
 * Build HTML email from watchlist data
 */
function buildEmailHtml(watchlistData) {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const styles = `
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
      h1 { color: #1a1a2e; border-bottom: 2px solid #4a90d9; padding-bottom: 10px; }
      h2 { color: #16213e; margin-top: 30px; }
      table { border-collapse: collapse; width: 100%; margin: 15px 0; }
      th, td { border: 1px solid #ddd; padding: 10px 12px; text-align: left; }
      th { background-color: #4a90d9; color: white; }
      tr:nth-child(even) { background-color: #f9f9f9; }
      tr:hover { background-color: #f1f1f1; }
      .rank { font-weight: bold; color: #4a90d9; }
      .change { color: #28a745; font-weight: bold; }
      .no-changes { color: #666; font-style: italic; padding: 20px; background: #f9f9f9; border-radius: 5px; }
      .first-run { color: #666; font-style: italic; padding: 20px; background: #fff3cd; border-radius: 5px; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
    </style>
  `;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>${styles}</head>
    <body>
      <h1>SteamDB Watchlist Update</h1>
      <p><strong>Date:</strong> ${date}</p>
  `;

  if (watchlistData.isFirstRun) {
    html += `<div class="first-run">This is the first run - baseline established. Future runs will show changes.</div>`;
  } else {
    // New Entries section
    html += `<h2>New to Top 200</h2>`;
    if (watchlistData.newEntries.length > 0) {
      html += `
        <table>
          <thead>
            <tr><th>Rank</th><th>Title</th><th>Followers</th><th>Developer</th><th>Publisher</th></tr>
          </thead>
          <tbody>
      `;
      for (const game of watchlistData.newEntries) {
        html += `
          <tr>
            <td class="rank">#${game.rank}</td>
            <td>${game.title}</td>
            <td>${game.followers}</td>
            <td>${game.developer}</td>
            <td>${game.publisher}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    } else {
      html += `<div class="no-changes">No new entries to the top 200 today.</div>`;
    }

    // Rising Titles section
    html += `<h2>Rising Titles (Up 3+ Spots)</h2>`;
    if (watchlistData.risers.length > 0) {
      html += `
        <table>
          <thead>
            <tr><th>Rank</th><th>Change</th><th>Title</th><th>Followers</th><th>Developer</th></tr>
          </thead>
          <tbody>
      `;
      for (const game of watchlistData.risers) {
        html += `
          <tr>
            <td class="rank">#${game.currentRank}</td>
            <td class="change">${game.change}</td>
            <td>${game.title}</td>
            <td>${game.followers}</td>
            <td>${game.developer}</td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    } else {
      html += `<div class="no-changes">No significant risers today.</div>`;
    }
  }

  html += `
      <div class="footer">
        <p>This report was automatically generated by the SteamDB Tracker.</p>
        <p>Data source: <a href="https://steamdb.info/charts/?category=702">SteamDB Most Wishlisted</a></p>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Build plain text email from watchlist data
 */
function buildEmailText(watchlistData) {
  const date = new Date().toLocaleDateString();
  let text = `SteamDB Watchlist Update - ${date}\n${'='.repeat(50)}\n\n`;

  if (watchlistData.isFirstRun) {
    text += 'This is the first run - baseline established. Future runs will show changes.\n';
    return text;
  }

  text += 'NEW TO TOP 200\n' + '-'.repeat(30) + '\n';
  if (watchlistData.newEntries.length > 0) {
    for (const game of watchlistData.newEntries) {
      text += `#${game.rank} ${game.title} (${game.followers} followers)\n`;
      text += `    Developer: ${game.developer}\n\n`;
    }
  } else {
    text += 'No new entries today.\n\n';
  }

  text += 'RISING TITLES (+3 spots)\n' + '-'.repeat(30) + '\n';
  if (watchlistData.risers.length > 0) {
    for (const game of watchlistData.risers) {
      text += `#${game.currentRank} ${game.title} (${game.change} from #${game.previousRank})\n`;
      text += `    Developer: ${game.developer}\n\n`;
    }
  } else {
    text += 'No significant risers today.\n';
  }

  return text;
}

/**
 * Send email notification with the latest watchlist
 */
export async function sendNotification() {
  const apiKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.EMAIL_TO;

  if (!apiKey) {
    console.log('RESEND_API_KEY not configured, skipping email notification');
    return { success: false, reason: 'no_api_key' };
  }

  if (!emailTo) {
    console.log('EMAIL_TO not configured, skipping email notification');
    return { success: false, reason: 'no_recipient' };
  }

  const watchlist = getLatestWatchlist();
  if (!watchlist) {
    console.log('No watchlist found, skipping email notification');
    return { success: false, reason: 'no_watchlist' };
  }

  const content = fs.readFileSync(watchlist.path, 'utf-8');
  const watchlistData = parseWatchlistMarkdown(content);

  const resend = new Resend(apiKey);

  const date = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  try {
    const { data, error } = await resend.emails.send({
      from: 'SteamDB Tracker <notifications@tyler-matheson.com>',
      to: [emailTo],
      subject: `SteamDB Watchlist Update - ${date}`,
      html: buildEmailHtml(watchlistData),
      text: buildEmailText(watchlistData)
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, reason: 'send_failed', error };
    }

    console.log('Email notification sent successfully');
    console.log(`  To: ${emailTo}`);
    console.log(`  New entries: ${watchlistData.newEntries.length}`);
    console.log(`  Risers: ${watchlistData.risers.length}`);

    return { success: true, emailId: data?.id };
  } catch (error) {
    console.error('Email notification error:', error);
    return { success: false, reason: 'exception', error };
  }
}

// Allow running standalone for testing
if (process.argv[1] && process.argv[1].endsWith('email-notify.js')) {
  // Load .env for local testing
  try {
    const dotenv = await import('dotenv');
    dotenv.config();
  } catch (e) {
    // dotenv not installed, rely on environment variables
  }

  sendNotification()
    .then(result => {
      if (result.success) {
        console.log('\nEmail sent successfully!');
      } else {
        console.log('\nEmail not sent:', result.reason);
      }
    })
    .catch(console.error);
}
