// server.js
const express = require('express');
const cors = require('cors');
const chromium = require('@sparticuz/chromium');
const puppeteerCore = require('puppeteer-core');
const puppeteer = require('puppeteer'); // full Puppeteer for local development
const fs = require('fs');
const path = require('path');

const { doLogin } = require('./login');
const { getAttendeeList } = require('./attendeeList');

// SSE setup for frontend streaming
const sseClients = [];
function sendEvent(event) {
  sseClients.forEach(client =>
    client.write(`data: ${JSON.stringify(event)}\n\n`)
  );
}
// Override console.log to send events
const originalLog = console.log;
console.log = (...args) => {
  sendEvent({ type: 'log', message: args.join(' ') });
  originalLog(...args);
};

const isLocal = process.env.NODE_ENV !== 'production';

const adminUrl =
  'https://hrnetworx.webinargeek.com/webinar/admin/RP3XFDoqAnkSSeaCVcFLV1XGHiXBthxS9bh0OyqNjZgXEg_Qz0dqYfZwI9jWm0Ad9W6OSSiN4o9V34-xfzHCwQ/';
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
    console.log('[LOG] Browser launched (full puppeteer).');
  } else {
    console.log('[LOG] Serverless mode: launching Chromium...');
    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch {
      throw new Error(
        'Failed to get chromium executable path in production'
      );
    }
    browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });
    console.log(
      '[LOG] Browser launched with executablePath:',
      executablePath
    );
  }

  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Override permissions locally (camera & microphone)
  if (isLocal) {
    console.log(
      '[LOG] Overriding camera & microphone permissions for local mode...'
    );
    await browser
      .defaultBrowserContext()
      .overridePermissions(adminUrl, ['camera', 'microphone']);
  }

  console.log('[LOG] Navigating to admin URL...');
  await page.goto(adminUrl, { waitUntil: 'networkidle2' });
  console.log('[LOG] Page loaded:', page.url());

  console.log('[LOG] Checking if login is required...');
  if (page.url().includes('users/sign_in')) {
    console.log('[LOG] Performing login...');
    await doLogin(page, loginEmail, loginPassword);
    await page.goto(adminUrl, { waitUntil: 'networkidle2' });
    console.log('[LOG] Logged in, current URL:', page.url());
  }

  console.log('[LOG] Waiting for streaming host element...');
  await page.waitForSelector('#streamingPage_webinargeek', {
    timeout: 15000,
  });
  const streamingHost = await page.$('#streamingPage_webinargeek');
  const streamingShadow = await streamingHost.evaluateHandle(
    (el) => el.shadowRoot
  );
  const malongRoot = await streamingShadow.$('#malong-root');

  console.log('[LOG] Waiting for join button...');
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#streamingPage_webinargeek');
      const root = host && host.shadowRoot;
      const btn = root && root.querySelector('button[data-button-type="tertiary"]');
      return btn && !btn.hasAttribute('disabled');
    },
    { timeout: 15000 }
  );

  const joinBtn = await malongRoot.$(
    'button[data-button-type="tertiary"]'
  );
  console.log('[LOG] Clicking join button...');
  await joinBtn.click();
  console.log('[LOG] Clicked join button.');
  await new Promise((r) => setTimeout(r, 3000));

  console.log('[LOG] Waiting for attendee list tab...');
  await page.waitForFunction(
    () => {
      const host = document.querySelector('#streamingPage_webinargeek');
      const root = host && host.shadowRoot;
      const malong = root && root.querySelector('#malong-root');
      return malong && malong.querySelector('#sidebar-button-attendeeList');
    },
    { timeout: 15000 }
  );

  const allTab = await malongRoot.$('#sidebar-button-attendeeList');
  if (allTab) {
    console.log('[LOG] Clicking attendee list tab...');
    await allTab.click();
    console.log('[LOG] Attendee list opened.');
  } else {
    console.error(
      '[LOG] Could not find "Alle" tab button at all!'
    );
  }

  // Monitoring loop
  while (isLogging) {
    console.log('[LOG] Monitoring iteration...');
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const attendees = await getAttendeeList(page);
      console.log('Current attendees:', attendees);
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

// CORS configuration
app.use(
  cors({
    origin: [
      'http://localhost:3000',
      'https://hrnetworx-frontend.vercel.app',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);
// Enable preflight for all routes
app.options('*', cors());

// SSE endpoint for streaming log messages
app.get('/api/webinars/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

app.get('/', (req, res) => {
  res.send('✅ Server is running');
});

app.get('/api/webinars/startlogging', (req, res) => {
  startLoggingProcess().catch((err) => console.error(err));
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
app.listen(PORT, () =>
  console.log(`Server listening on port ${PORT}`)
);