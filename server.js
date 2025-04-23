// server.js
const express = require('express');
const cors = require('cors');
const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const { doLogin } = require('./login');
const { getAttendeeList } = require('./attendeeList');

// Helper to retry puppeteer-core.launch on ETXTBSY errors
async function safeLaunch(options, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await puppeteerCore.launch(options);
    } catch (err) {
      lastError = err;
      if (err.code === 'ETXTBSY' && attempt < retries) {
        console.warn(`[LOG] ETXTBSY on launch, retrying attempt ${attempt}...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// In-memory log buffer
const logBuffer = [];
// Helper to record logs
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.join(' ');
  logBuffer.push(msg);
  originalLog(...args);
};

const isLocal = process.env.NODE_ENV !== 'production';

const adminUrl = 'https://hrnetworx.webinargeek.com/webinar/admin/RP3XFDoqAnkSSeaCVcFLV1XGHiXBthxS9bh0OyqNjZgXEg_Qz0dqYfZwI9jWm0Ad9W6OSSiN4o9V34-xfzHCwQ/';
const loginEmail = 'events@hrnetworx.de';
const loginPassword = 'vFS8c^&a7F#b';

let browser = null;
let page = null;
let isLogging = false;

async function startLoggingProcess() {
  if (isLogging) return;
  console.log('[LOG] startLoggingProcess: starting...');
  isLogging = true;

  console.log('[LOG] Launching browser...');
  if (isLocal) {
    console.log('[LOG] Local development mode: launching full Puppeteer...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    console.log('[LOG] Browser launched (full Puppeteer).');
  } else {
    console.log('[LOG] Production mode: launching serverless Chromium...');
    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch {
      throw new Error('Failed to get Chromium executable path in production');
    }
    browser = await safeLaunch({
      executablePath,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });
    console.log('[LOG] Browser launched with executablePath:', executablePath);
  }

  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  // Set timeouts for navigation and operations
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(30000);
  console.log('[LOG] Default timeouts set to 30s');

  if (isLocal) {
    console.log('[LOG] Overriding camera & microphone permissions for local mode...');
    await browser.defaultBrowserContext().overridePermissions(adminUrl, ['camera', 'microphone']);
  }

  console.log('[LOG] Navigating to admin URL...');
  try {
    await page.goto(adminUrl, { waitUntil: 'networkidle2' });
    console.log('[LOG] Page loaded:', page.url());
    if (!isLocal) {
      try {
        const screenshotPath = `/tmp/screenshot_goto_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[LOG] Saved screenshot after goto: ${screenshotPath}`);
      } catch (err) {
        console.error('[LOG] Error taking screenshot after goto:', err);
      }
    }
  } catch (err) {
    console.error('[LOG] Error during page.goto:', err);
    return;
  }

  console.log('[LOG] Checking if login is required...');
  if (page.url().includes('users/sign_in')) {
    console.log('[LOG] Performing login...');
    await doLogin(page, loginEmail, loginPassword);
    await page.goto(adminUrl, { waitUntil: 'networkidle2' });
    console.log('[LOG] Logged in, current URL:', page.url());
  }

  console.log('[LOG] Waiting for streaming host element...');
  try {
    await page.waitForSelector('#streamingPage_webinargeek', { timeout: 15000 });
    console.log('[LOG] Streaming host element found');
    if (!isLocal) {
      try {
        const screenshotPath = `/tmp/screenshot_host_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`[LOG] Saved screenshot of streaming host: ${screenshotPath}`);
      } catch (err) {
        console.error('[LOG] Error taking screenshot of streaming host:', err);
      }
    }
  } catch (err) {
    console.error('[LOG] Error waiting for streaming host:', err);
    return;
  }
  const streamingHost = await page.$('#streamingPage_webinargeek');
  const streamingShadow = await streamingHost.evaluateHandle(el => el.shadowRoot);
  const malongRoot = await streamingShadow.$('#malong-root');

  console.log('[LOG] Waiting for join button...');
  await page.waitForFunction(() => {
    const host = document.querySelector('#streamingPage_webinargeek');
    const root = host && host.shadowRoot;
    const btn = root && root.querySelector('button[data-button-type="tertiary"]');
    return btn && !btn.hasAttribute('disabled');
  }, { timeout: 15000 });

  const joinBtn = await malongRoot.$('button[data-button-type="tertiary"]');
  console.log('[LOG] Clicking join button...');
  await joinBtn.click();
  console.log('[LOG] Clicked join button.');
  await new Promise(r => setTimeout(r, 3000));

  console.log('[LOG] Waiting for attendee list tab...');
  await page.waitForFunction(() => {
    const host = document.querySelector('#streamingPage_webinargeek');
    const root = host && host.shadowRoot;
    const malong = root && root.querySelector('#malong-root');
    return malong && malong.querySelector('#sidebar-button-attendeeList');
  }, { timeout: 15000 });

  const allTab = await malongRoot.$('#sidebar-button-attendeeList');
  if (allTab) {
    console.log('[LOG] Clicking attendee list tab...');
    await allTab.click();
    console.log('[LOG] Attendee list opened.');
  } else {
    console.error('[LOG] Could not find attendee list tab button!');
  }

  while (isLogging) {
    console.log('[LOG] Monitoring iteration...');
    await new Promise(r => setTimeout(r, 5000));
    try {
      const attendees = await getAttendeeList(page);
      console.log('[LOG] Current attendees:', attendees);
    } catch (err) {
      console.error('[LOG] Error reading attendees:', err);
    }
  }

  await browser.close();
  browser = null;
  page = null;
  console.log('[LOG] Browser closed, logging stopped.');
}

async function stopLoggingProcess() {
  isLogging = false;
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'https://hrnetworx-frontend.vercel.app'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
app.options('*', cors());


// Endpoint for polling logs
app.get('/api/webinars/logs', (req, res) => {
  res.json({ logs: logBuffer });
});

app.get('/', (req, res) => res.send('✅ Server is running'));
app.get('/api/webinars/startlogging', (req, res) => {
  startLoggingProcess().catch(err => console.error(err));
  res.status(200).send('Logging started');
});
app.get('/api/webinars/stoplogging', async (req, res) => {
  try {
    await stopLoggingProcess();
    res.status(200).send('Logging stopped');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error stopping logging');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));