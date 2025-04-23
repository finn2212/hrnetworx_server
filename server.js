// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const { doLogin } = require('./login');
const { getAttendeeList } = require('./attendeeList');

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
  browser = await puppeteer.launch({
    headless: true,                // auf Server meist headless
    args: ['--no-sandbox','--disable-setuid-sandbox'],
  });
  console.log('[LOG] Browser launched.');
  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Kamera/Mikro lassen sich bei headless ggf. weglassen
  await browser
    .defaultBrowserContext()
    .overridePermissions(adminUrl, ['camera','microphone']);

  console.log('[LOG] Navigating to admin URL...');
  // 1. Admin-Seite aufrufen
  await page.goto(adminUrl, { waitUntil: 'networkidle2' });
  console.log('[LOG] Page loaded:', page.url());

  console.log('[LOG] Checking if login is required...');
  // 2. Login falls nötig
  if (page.url().includes('users/sign_in')) {
    console.log('[LOG] Performing login...');
    await doLogin(page, loginEmail, loginPassword);
    if (!page.url().includes('/webinar/admin/')) {
      await page.goto(adminUrl, { waitUntil: 'networkidle2' });
    }
    console.log('[LOG] Logged in, current URL:', page.url());
  }

  console.log('[LOG] Waiting for streaming host element...');
  // 3. Automatisches Join + Tab-Wechsel
  // Warten, bis das Streaming-Shadow-Host-Element geladen ist
  await page.waitForSelector('#streamingPage_webinargeek', { timeout: 15000 });
  const streamingHost = await page.$('#streamingPage_webinargeek');
  const streamingShadow = await streamingHost.evaluateHandle(el => el.shadowRoot);
  const malongRoot = await streamingShadow.$('#malong-root');
  console.log('[LOG] Waiting for join button...');
  // Warten, bis der "Webinar beitreten"-Button im Shadow DOM verfügbar ist
  await page.waitForFunction(() => {
    const host = document.querySelector('#streamingPage_webinargeek');
    const root = host && host.shadowRoot;
    return !!root && !!root.querySelector('button[data-button-type="tertiary"]');
  }, { timeout: 15000 });
  const joinBtn = await malongRoot.$('button[data-button-type="tertiary"]');
  console.log('[LOG] Join button found. Waiting for it to be enabled...');
  await page.waitForFunction(() => {
    const host = document.querySelector('#streamingPage_webinargeek');
    const root = host && host.shadowRoot;
    const button = root && root.querySelector('button[data-button-type="tertiary"]');
    return button && !button.hasAttribute('disabled');
  }, { timeout: 15000 });
  console.log('[LOG] Join button is enabled, clicking now...');
  await joinBtn.click();
  console.log('[LOG] Clicked join button.');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('[LOG] Waiting for "Alle" tab button...');
  try {
    // Erst kurz prüfen, ob der Button im Shadow DOM erscheint
    await page.waitForFunction(() => {
      const host = document.querySelector('#streamingPage_webinargeek');
      const root = host && host.shadowRoot;
      const malong = root && root.querySelector('#malong-root');
      return malong && malong.querySelector('#sidebar-button-attendeeList');
    }, { timeout: 10000 });
    console.log('[LOG] "Alle" tab button appeared.');
  } catch (err) {
    console.warn('[LOG] Timeout waiting for "Alle" tab; falling back to manual delay.');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  const allTab = await malongRoot.$('#sidebar-button-attendeeList');
  if (allTab) {
    console.log('[LOG] "Alle" tab button found, clicking...');
    await allTab.click();
    console.log('[LOG] Clicked "Alle" tab.');
  } else {
    console.error('[LOG] Could not find "Alle" tab button at all!');
  }

  // 4. Monitoring-Loop
  while (isLogging) {
    console.log('[LOG] Monitoring loop iteration...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    const attendees = await getAttendeeList(page);
    console.log('Aktuelle Teilnehmerliste:', attendees);
    console.log('[LOG] Sleeping before next iteration...');
  }

  // 5. Aufräumen
  await browser.close();
  browser = null;
  page = null;
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

app.get('/', (req, res) => {
  res.send('✅ Server is running');
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));