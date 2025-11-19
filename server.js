// Load environment variables from .env
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
// Initialize Supabase client for settings
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// server.js
const chromium = require("@sparticuz/chromium");
const puppeteerCore = require("puppeteer-core");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const { doLogin } = require("./login");
const { getAttendeeList } = require("./attendeeList");

// Helper to retry puppeteer-core.launch on ETXTBSY errors
async function safeLaunch(options, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await puppeteerCore.launch(options);
    } catch (err) {
      lastError = err;
      if (err.code === "ETXTBSY" && attempt < retries) {
        console.warn(`[LOG] ETXTBSY on launch, retrying attempt ${attempt}...`);
        await new Promise((r) => setTimeout(r, attempt * 1000));
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
  const msg = args.join(" ");
  logBuffer.push(msg);
  if (logBuffer.length > 1000) {
    logBuffer.shift();
  }
  originalLog(...args);
};

const isLocal = process.env.NODE_ENV !== "production";

let browser = null;
let page = null;
let isLogging = false;

async function startLoggingProcess() {
  if (isLogging) return;
  console.log("[LOG] Loading configuration from Supabase...");
  const { data: configData, error: configError } = await supabase
    .from("app_settings")
    .select("key, value");
  if (configError) {
    throw new Error(`Failed to load config: ${configError.message}`);
  }
  const config = Object.fromEntries(
    configData.map(({ key, value }) => [key, value])
  );
  const adminUrl = config.ADMIN_URL;
  const loginEmail = config.LOGIN_EMAIL;
  const loginPassword = config.LOGIN_PASSWORD;
  const webinarName = config.WEBINAR_NAME;
  console.log("[LOG] Configuration loaded:", adminUrl, loginEmail, webinarName);

  console.log("[LOG] startLoggingProcess: starting...");
  isLogging = true;
  console.log(webinarName, loginPassword, loginEmail);

  console.log("[LOG] Launching browser...");
  if (isLocal) {
    console.log("[LOG] Local development mode: launching full Puppeteer...");
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    console.log("[LOG] Browser launched (full Puppeteer).");
  } else {
    console.log("[LOG] Production mode: launching serverless Chromium...");
    let executablePath;
    try {
      executablePath = await chromium.executablePath();
    } catch {
      throw new Error("Failed to get Chromium executable path in production");
    }
    browser = await safeLaunch({
      executablePath,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });
    console.log("[LOG] Browser launched with executablePath:", executablePath);
  }

  page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  // Set timeouts for navigation and operations
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(30000);
  console.log("[LOG] Default timeouts set to 30s");

  if (isLocal) {
    console.log(
      "[LOG] Overriding camera & microphone permissions for local mode..."
    );
    await browser
      .defaultBrowserContext()
      .overridePermissions(adminUrl, ["camera", "microphone"]);
  }

  console.log("[LOG] Navigating to admin URL...");
  try {
    await page.goto(adminUrl, { waitUntil: "networkidle2" });
    console.log("[LOG] Page loaded:", page.url());
    if (!isLocal) {
      try {
        const screenshotPath = `/tmp/screenshot_goto_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[LOG] Saved screenshot after goto: ${screenshotPath}`);
      } catch (err) {
        console.error("[LOG] Error taking screenshot after goto:", err);
      }
    }
  } catch (err) {
    console.error("[LOG] Error during page.goto:", err);
    return;
  }

  console.log("[LOG] Checking if login is required...");
  if (page.url().includes("users/sign_in")) {
    console.log("[LOG] Performing login...");
    await doLogin(page, loginEmail, loginPassword);
    await page.goto(adminUrl, { waitUntil: "networkidle2" });
    console.log("[LOG] Logged in, current URL:", page.url());
  }

  console.log("[LOG] Waiting for streaming host element...");
  try {
    await page.waitForSelector("#streamingPage_webinargeek", {
      timeout: 15000,
    });
    console.log("[LOG] Streaming host element found");
    if (!isLocal) {
      try {
        const screenshotPath = `/tmp/screenshot_host_${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(
          `[LOG] Saved screenshot of streaming host: ${screenshotPath}`
        );
      } catch (err) {
        console.error("[LOG] Error taking screenshot of streaming host:", err);
      }
    }
  } catch (err) {
    console.error("[LOG] Error waiting for streaming host:", err);
    return;
  }
  const streamingHost = await page.$("#streamingPage_webinargeek");
  const streamingShadow = await streamingHost.evaluateHandle(
    (el) => el.shadowRoot
  );
  const malongRoot = await streamingShadow.$("#malong-root");

  console.log("[LOG] Waiting for join button...");
  await page.waitForFunction(
    () => {
      const host = document.querySelector("#streamingPage_webinargeek");
      const root = host && host.shadowRoot;
      const btn =
        root && root.querySelector('button[data-button-type="tertiary"]');
      return btn && !btn.hasAttribute("disabled");
    },
    { timeout: 15000 }
  );

  const joinBtn = await malongRoot.$('button[data-button-type="tertiary"]');
  console.log("[LOG] Clicking join button...");
  await joinBtn.click();
  console.log("[LOG] Clicked join button.");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("[LOG] Waiting for attendee list tab...");
  await page.waitForFunction(
    () => {
      const host = document.querySelector("#streamingPage_webinargeek");
      const root = host && host.shadowRoot;
      const malong = root && root.querySelector("#malong-root");
      return malong && malong.querySelector("#sidebar-button-attendeeList");
    },
    { timeout: 15000 }
  );

  const allTab = await malongRoot.$("#sidebar-button-attendeeList");
  if (allTab) {
    console.log("[LOG] Clicking attendee list tab...");
    await allTab.click();
    console.log("[LOG] Attendee list opened.");
  } else {
    console.error("[LOG] Could not find attendee list tab button!");
  }

  while (isLogging) {
    console.log("[LOG] Monitoring iteration...");
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const attendees = await getAttendeeList(page);

      const now = new Date().toISOString();
      const eventId = config.EVENT_ID || "default_event";

      const diffs = diffAttendees(attendees, eventId, now);

      for (const entry of diffs) {
        if (entry.type === "join") {
          await supabase.from("attendee_logs").insert([
            {
              event_id: entry.event_id,
              attendee_id: entry.attendee_id,
              webinar_name: webinarName,
              timestamp: entry.join_time,
              type: "join",
            },
          ]);
        } else if (entry.type === "leave") {
          await supabase.from("attendee_logs").insert([
            {
              event_id: entry.event_id,
              attendee_id: entry.attendee_id,
              webinar_name: webinarName,
              timestamp: entry.leave_time,
              type: "leave",
            },
          ]);
        }
      }
    } catch (err) {
      console.error("[LOG] Error reading attendees:", err);
    }
  }

  await browser.close();
  browser = null;
  page = null;
  console.log("[LOG] Browser closed, logging stopped.");
}
function normalizeName(name) {
  if (!name) return null;

  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Sonderzeichen entfernen
    .replace(/\s+/g, " "); // Mehrfachspaces entfernen
}

function getStableId(attendee) {
  const norm = normalizeName(attendee.name);
  return norm ? `name:${norm}` : null;
}

// Run logging process directly when invoked as a script
if (require.main === module) {
  startLoggingProcess().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Einfache diffAttendees Funktion (in server.js einfügen)
let knownAttendees = new Set();

// NEW: Stabiler Anwesenheitszustand
const stablePresent = new Set(); // Wer gilt als stabil anwesend
const lastSeen = new Map(); // Letzte Sichtung in ms Timestamp
const ABSENCE_THRESHOLD_MS = 5000; // 5 Sekunden Schwelle für echte Leavesfin

function diffAttendees(currentAttendees, eventId, isoTimestamp) {
  const now = Date.now();
  const changes = [];

  // Markiere alle, die aktuell sichtbar sind
  for (const att of currentAttendees) {
    const id = getStableId(att);
    if (!id) continue; // skip unknowns

    lastSeen.set(id, now);

    if (!stablePresent.has(id)) {
      // echter neuer Join
      stablePresent.add(id);

      changes.push({
        type: "join",
        event_id: eventId,
        attendee_id: id,
        attendee_name: att.name,
        join_time: isoTimestamp,
      });

      console.log(`[JOIN] ${att.name} (${id})`);
    }
  }

  // Check for people who disappeared (länger als 5 Sekunden)
  for (const id of Array.from(stablePresent)) {
    const last = lastSeen.get(id);
    if (last && now - last > ABSENCE_THRESHOLD_MS) {
      // echter Leave
      stablePresent.delete(id);

      changes.push({
        type: "leave",
        event_id: eventId,
        attendee_id: id,
        leave_time: isoTimestamp,
      });

      console.log(`[LEAVE] ${id}`);
    }
  }

  return changes;
}
