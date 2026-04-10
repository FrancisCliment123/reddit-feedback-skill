#!/usr/bin/env node
/**
 * Reddit Comment Reply via Playwright + Chrome CDP
 * Uses a symlink/junction to your real browser profile for session access.
 * No API keys, no login needed — uses your existing Reddit session.
 *
 * Supports: Windows, macOS, Linux
 *
 * Usage:
 *   node reply.js <comment_permalink> "Your reply text" [--browser chrome|brave]
 */

const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const platform = os.platform(); // 'win32', 'darwin', 'linux'

function getBrowserPaths() {
  if (platform === 'darwin') {
    return {
      chrome: {
        exe: [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ],
        userDataDir: path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome'),
        linkDir: path.join(os.tmpdir(), 'chrome-debug-profile'),
        processName: 'Google Chrome',
      },
      brave: {
        exe: [
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
          path.join(os.homedir(), 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser'),
        ],
        userDataDir: path.join(os.homedir(), 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        linkDir: path.join(os.tmpdir(), 'brave-debug-profile'),
        processName: 'Brave Browser',
      },
    };
  }

  if (platform === 'linux') {
    return {
      chrome: {
        exe: [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/snap/bin/chromium',
          '/usr/bin/chromium-browser',
        ],
        userDataDir: path.join(os.homedir(), '.config', 'google-chrome'),
        linkDir: path.join(os.tmpdir(), 'chrome-debug-profile'),
        processName: 'chrome',
      },
      brave: {
        exe: [
          '/usr/bin/brave-browser',
          '/usr/bin/brave-browser-stable',
          '/snap/bin/brave',
        ],
        userDataDir: path.join(os.homedir(), '.config', 'BraveSoftware', 'Brave-Browser'),
        linkDir: path.join(os.tmpdir(), 'brave-debug-profile'),
        processName: 'brave',
      },
    };
  }

  // Windows (default)
  return {
    chrome: {
      exe: [
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ],
      userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
      linkDir: path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'chrome-debug-profile'),
      processName: 'chrome.exe',
    },
    brave: {
      exe: [
        path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      ],
      userDataDir: path.join(os.homedir(), 'AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
      linkDir: path.join(os.homedir(), 'AppData', 'Local', 'Temp', 'brave-debug-profile'),
      processName: 'brave.exe',
    },
  };
}

const BROWSER_PATHS = getBrowserPaths();

function findExe(browserName) {
  const paths = BROWSER_PATHS[browserName]?.exe || [];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function killBrowser(processName) {
  try {
    if (platform === 'win32') {
      execSync(`taskkill /F /IM ${processName} 2>NUL`, { stdio: 'ignore', shell: true });
    } else {
      // macOS / Linux — pkill by process name
      execSync(`pkill -f "${processName}" 2>/dev/null`, { stdio: 'ignore', shell: true });
    }
  } catch (e) {}
}

function createLink(target, linkPath) {
  // Remove existing link/junction
  try {
    if (platform === 'win32') {
      execSync(`rmdir "${linkPath}" 2>NUL`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`rm -f "${linkPath}" 2>/dev/null`, { stdio: 'ignore', shell: true });
    }
  } catch (e) {}

  // Create new link
  if (platform === 'win32') {
    execSync(`mklink /J "${linkPath}" "${target}"`, { stdio: 'ignore', shell: true });
  } else {
    execSync(`ln -s "${target}" "${linkPath}"`, { stdio: 'ignore', shell: true });
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function humanDelay(min = 800, max = 2500) {
  return sleep(min + Math.random() * (max - min));
}

function waitForDebugger(port, maxWait = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => {
        if (Date.now() - start > maxWait) {
          reject(new Error('Timed out waiting for browser'));
        } else {
          setTimeout(check, 500);
        }
      });
      req.end();
    };
    check();
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node reply.js <comment_permalink> "reply text" [--browser chrome|brave]');
    process.exit(1);
  }

  const permalink = args[0];
  const replyText = args[1];
  let browserName = 'chrome';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--browser' && args[i + 1]) {
      browserName = args[i + 1].toLowerCase();
    }
  }

  const config = BROWSER_PATHS[browserName];
  if (!config) {
    console.error(`Unknown browser: ${browserName}. Use "chrome" or "brave".`);
    process.exit(1);
  }

  const exePath = findExe(browserName);
  if (!exePath) {
    console.error(`${browserName} not found.`);
    process.exit(1);
  }

  console.log(`Browser: ${browserName}`);
  console.log(`Target: ${permalink}`);
  console.log(`Reply: "${replyText.slice(0, 80)}${replyText.length > 80 ? '...' : ''}"`);
  console.log('');

  const DEBUG_PORT = 9222;
  let browser;

  try {
    // Step 1: Kill browser
    console.log('Step 1: Closing browser...');
    killBrowser(config.processName);
    await sleep(2000);

    // Step 2: Create symlink/junction to real profile
    console.log('Step 2: Setting up profile link...');
    createLink(config.userDataDir, config.linkDir);

    // Step 3: Launch browser with debugging
    console.log('Step 3: Launching browser...');
    const child = spawn(exePath, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${config.linkDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      'about:blank',
    ], {
      detached: true,
      stdio: 'ignore',
      shell: true,
    });
    child.unref();

    // Step 4: Wait for debugger
    console.log('Step 4: Waiting for browser...');
    await waitForDebugger(DEBUG_PORT);
    console.log('Browser ready.');

    // Step 5: Connect Playwright
    console.log('Step 5: Connecting...');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    // Step 6: Navigate to old.reddit.com
    let oldRedditUrl = permalink.replace('www.reddit.com', 'old.reddit.com');
    if (!oldRedditUrl.includes('old.reddit.com')) {
      oldRedditUrl = permalink.replace('reddit.com', 'old.reddit.com');
    }

    console.log('Step 6: Navigating...');
    await page.goto(oldRedditUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await humanDelay(2000, 3000);

    // Step 7: Verify login
    const userSpan = await page.$('.user a');
    if (!userSpan) {
      console.error('ERROR: Not logged into Reddit.');
      process.exit(1);
    }
    const username = (await userSpan.textContent()).trim();
    console.log(`Step 7: Logged in as "${username}"`);

    // Step 8: Find comment
    const commentIdMatch = permalink.match(/\/comments\/\w+\/[^/]*\/(\w+)/);
    if (!commentIdMatch) {
      console.error('Could not extract comment ID.');
      process.exit(1);
    }
    const commentId = commentIdMatch[1];
    const commentSelector = `#thing_t1_${commentId}`;
    console.log(`Step 8: Finding comment ${commentId}...`);

    let commentEl = await page.$(commentSelector);
    if (!commentEl) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000);
      commentEl = await page.$(commentSelector);
    }
    if (!commentEl) {
      console.error(`Comment ${commentId} not found.`);
      process.exit(1);
    }
    console.log('Comment found.');

    // Step 9: Click reply
    console.log('Step 9: Clicking reply...');
    const links = await commentEl.$$('ul.flat-list a');
    let replyClicked = false;
    for (const link of links) {
      const txt = (await link.textContent()).toLowerCase();
      if (txt.includes('reply') || txt.includes('responder') || txt.includes('contestar')) {
        await link.click();
        replyClicked = true;
        break;
      }
    }
    if (!replyClicked) {
      const replyLink = await commentEl.$('a.reply-button') || await commentEl.$('li.reply a');
      if (replyLink) {
        await replyLink.click();
        replyClicked = true;
      }
    }
    if (!replyClicked) {
      console.error('Reply button not found.');
      process.exit(1);
    }
    await humanDelay(1000, 2000);

    // Step 10: Type reply
    console.log('Step 10: Typing...');
    let textarea = await page.$(`${commentSelector} textarea[name="text"]`);
    if (!textarea) {
      // Try any visible textarea
      const allTa = await page.$$('textarea[name="text"]');
      textarea = allTa[allTa.length - 1];
    }
    if (!textarea) {
      console.error('Textarea not found.');
      process.exit(1);
    }
    await textarea.click();
    await humanDelay(200, 400);
    await textarea.fill(replyText);
    await humanDelay(1000, 2000);

    // Step 11: Submit
    console.log('Step 11: Submitting...');
    let saveBtn = await page.$(`${commentSelector} button.save`);
    if (!saveBtn) {
      const allBtns = await page.$$('button.save');
      saveBtn = allBtns[allBtns.length - 1];
    }
    if (!saveBtn) {
      console.error('Save button not found.');
      process.exit(1);
    }
    await saveBtn.click();
    await humanDelay(3000, 5000);

    // Check for errors
    const errorEl = await page.$(`${commentSelector} .error`);
    if (errorEl) {
      const errorText = (await errorEl.textContent()).trim();
      if (errorText) {
        console.error(`Reddit error: ${errorText}`);
        process.exit(1);
      }
    }

    console.log('');
    console.log(JSON.stringify({
      success: true,
      comment_id: commentId,
      reply_text: replyText,
      replied_as: username,
      browser: browserName,
      timestamp: new Date().toISOString(),
    }, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    killBrowser(config.processName);
  }
}

main();
