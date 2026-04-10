#!/usr/bin/env node
/**
 * Reddit Comment Reply via Playwright
 * Uses your real browser profile (Chrome or Brave) to reply to comments.
 * You must be logged into Reddit in that browser.
 *
 * Usage:
 *   node reply.js <comment_permalink> "Your reply text" [--browser chrome|brave]
 *
 * Examples:
 *   node reply.js "https://www.reddit.com/r/SpainFIRE/comments/.../comment_id/" "Gracias por el feedback!"
 *   node reply.js "https://www.reddit.com/r/SpainFIRE/comments/.../comment_id/" "Thanks!" --browser brave
 */

const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const BROWSER_PATHS = {
  chrome: {
    exe: [
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
  },
  brave: {
    exe: [
      path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
    userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
  },
};

function findExe(browserName) {
  const fs = require('fs');
  const paths = BROWSER_PATHS[browserName]?.exe || [];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Random human-like delay
function humanDelay(min = 800, max = 2500) {
  return sleep(min + Math.random() * (max - min));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node reply.js <comment_permalink> "reply text" [--browser chrome|brave]');
    console.error('');
    console.error('IMPORTANT: Close the browser before running this script.');
    console.error('Playwright needs exclusive access to the browser profile.');
    process.exit(1);
  }

  let permalink = args[0];
  let replyText = args[1];
  let browserName = 'chrome';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--browser' && args[i + 1]) {
      browserName = args[i + 1].toLowerCase();
    }
  }

  if (!BROWSER_PATHS[browserName]) {
    console.error(`Unknown browser: ${browserName}. Use "chrome" or "brave".`);
    process.exit(1);
  }

  const exePath = findExe(browserName);
  if (!exePath) {
    console.error(`${browserName} not found. Checked:`);
    BROWSER_PATHS[browserName].exe.forEach(p => console.error(`  - ${p}`));
    process.exit(1);
  }

  const userDataDir = BROWSER_PATHS[browserName].userDataDir;
  console.log(`Using ${browserName}: ${exePath}`);
  console.log(`Profile: ${userDataDir}`);
  console.log(`Target: ${permalink}`);
  console.log(`Reply: "${replyText.slice(0, 80)}${replyText.length > 80 ? '...' : ''}"`);
  console.log('');

  let context;
  try {
    // Launch with persistent context to use the existing Reddit session
    context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: exePath,
      headless: false,
      args: [
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
      ],
      viewport: { width: 1280, height: 900 },
    });

    const page = context.pages()[0] || await context.newPage();

    // Navigate to old.reddit.com (simpler DOM, easier to automate)
    let oldRedditUrl = permalink.replace('www.reddit.com', 'old.reddit.com');
    if (!oldRedditUrl.includes('old.reddit.com')) {
      oldRedditUrl = permalink.replace('reddit.com', 'old.reddit.com');
    }

    console.log('Navigating to comment...');
    await page.goto(oldRedditUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 4000);

    // Check if logged in
    const loginLink = await page.$('a.login-required');
    const userSpan = await page.$('.user a');
    if (!userSpan) {
      console.error('ERROR: Not logged into Reddit in this browser profile.');
      console.error('Open the browser manually, log into Reddit, then retry.');
      process.exit(1);
    }

    const username = await userSpan.textContent();
    console.log(`Logged in as: ${username}`);

    // Find the target comment's reply button
    // The permalink ends with the comment ID — extract it
    const commentIdMatch = permalink.match(/\/comments\/\w+\/[^/]+\/(\w+)/);
    if (!commentIdMatch) {
      console.error('Could not extract comment ID from URL.');
      process.exit(1);
    }
    const commentId = commentIdMatch[1];
    console.log(`Comment ID: ${commentId}`);

    // Find the comment element and its reply link
    const commentSelector = `#thing_t1_${commentId}`;
    const commentEl = await page.$(commentSelector);

    if (!commentEl) {
      // Maybe we're on the comment directly — try to find the reply button in the focused comment
      console.log('Comment not found by ID, looking for the focused comment...');
      const replyBtn = await page.$('.comment.target .buttons a[onclick*="reply"]') ||
                       await page.$('.comment .buttons a.reply-button') ||
                       await page.$('a[data-event-action="comment"]');
      if (!replyBtn) {
        console.error('Could not find the reply button. The comment may have been deleted.');
        process.exit(1);
      }
      await replyBtn.click();
    } else {
      // Click the reply link on the specific comment
      const replyLink = await commentEl.$('ul.buttons a[onclick*="reply"]') ||
                        await commentEl.$('li.reply a');
      if (!replyLink) {
        console.error('Reply button not found on this comment.');
        process.exit(1);
      }
      console.log('Clicking reply...');
      await replyLink.click();
    }

    await humanDelay(1000, 2000);

    // Find the textarea that appeared and type the reply
    const textarea = await page.$(`${commentSelector} .usertext-edit textarea`) ||
                     await page.$('.usertext-edit textarea:visible') ||
                     await page.$('textarea[name="text"]');

    if (!textarea) {
      console.error('Reply textarea did not appear.');
      process.exit(1);
    }

    console.log('Typing reply...');
    // Type character by character with human-like delays
    await textarea.click();
    await humanDelay(300, 600);

    for (const char of replyText) {
      await textarea.type(char, { delay: 30 + Math.random() * 70 });
    }

    await humanDelay(1000, 2000);

    // Click the save/submit button
    const saveBtn = await page.$(`${commentSelector} .usertext-edit button[type="submit"]`) ||
                    await page.$('.usertext-edit button.save') ||
                    await page.$('button[type="submit"]:has-text("save")') ||
                    await page.$('button[type="submit"]:has-text("Save")');

    if (!saveBtn) {
      console.error('Save button not found.');
      process.exit(1);
    }

    console.log('Submitting reply...');
    await saveBtn.click();

    await humanDelay(3000, 5000);

    // Check for errors
    const errorEl = await page.$('.error');
    if (errorEl) {
      const errorText = await errorEl.textContent();
      if (errorText && errorText.trim()) {
        console.error(`Reddit error: ${errorText.trim()}`);
        process.exit(1);
      }
    }

    console.log('');
    console.log(JSON.stringify({
      success: true,
      comment_id: commentId,
      reply_text: replyText,
      replied_as: username.trim(),
      browser: browserName,
      timestamp: new Date().toISOString(),
    }, null, 2));

  } catch (err) {
    if (err.message.includes('lock') || err.message.includes('already running') || err.message.includes('SingletonLock')) {
      console.error('ERROR: The browser is currently open. Close it first, then retry.');
      console.error('Playwright needs exclusive access to the browser profile.');
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

main();
