// main.js
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// Eigene Module
const { doLogin } = require("./login");      // <-- Deine Login-Funktion
const { getAttendeeList } = require("./attendeeList"); // <-- Deine Funktion zum Auslesen der Liste

// Screenshot-Ordner vorbereiten (nur falls gewünscht)
const screenshotsDir = path.join(__dirname, "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
} else {
  fs.readdirSync(screenshotsDir).forEach((file) => {
    fs.unlinkSync(path.join(screenshotsDir, file));
  });
}
async function takeScreenshot(page, stepName) {
  await page.screenshot({ path: `screenshots/${stepName}.png` });
}

// Konfiguration
const adminUrl =
  "https://hrnetworx.webinargeek.com/webinar/admin/NTbF2E8qD8TA7lNptlYZN3HUZkrKIuNpf6bVdcxMVXQcwpwIGesNICBxhAKvjPIXVP3iB0HTtH68PZB84Fwd5g/";
const manualClick = false; // Falls true, musst du selbst klicken
const loginEmail = "events@hrnetworx.de";
const loginPassword = "vFS8c^&a7F#b";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1920,1080"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Kamera- & Mikrofonrechte
  await browser
    .defaultBrowserContext()
    .overridePermissions("https://hrnetworx.webinargeek.com", [
      "camera",
      "microphone",
    ]);

  // 1. Zur Admin-Seite gehen
  await page.goto(adminUrl, { waitUntil: "networkidle2" });

  // 2. Prüfen, ob Login nötig ist
  if (page.url().includes("users/sign_in")) {
    console.log("[MAIN] → Auf Login-Seite gelandet, führe Login durch...");
    await doLogin(page, loginEmail, loginPassword);

    // Optional nochmal zur Admin-Seite nach Login
    if (!page.url().includes("/webinar/admin/")) {
      console.log("[MAIN] → Navigiere erneut zur Admin-URL ...");
      await page.goto(adminUrl, { waitUntil: "networkidle2" });
    }
  } else {
    console.log("[MAIN] → Offenbar schon eingeloggt / keine Login-Weiterleitung");
  }

  // Screenshot nach dem (ggf. automatischen) Login
  await takeScreenshot(page, "01_after_login");

  // 3. „Webinar beitreten“-Button anklicken
  if (!manualClick) {
    try {
      console.log("[MAIN] Warte 5 Sekunden, damit Elemente Zeit haben zu laden...");
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s Pause

      // Shadow-Host #streamingPage_webinargeek
      const streamingHost = await page.$("#streamingPage_webinargeek");
      if (!streamingHost) {
        throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
      }
      // ShadowRoot abrufen
      const streamingShadow = await streamingHost.evaluateHandle(el => el.shadowRoot);

      // malong-root
      const malongRoot = await streamingShadow.$("#malong-root");
      if (!malongRoot) {
        throw new Error("Konnte #malong-root im Shadow DOM nicht finden!");
      }

      // Button „Webinar beitreten“ suchen
      const webinarJoinButton = await malongRoot.$(
        'button[data-button-type="tertiary"]'
      );
      if (!webinarJoinButton) {
        throw new Error("Konnte 'Webinar beitreten'-Button nicht finden!");
      }

      // Klick „Webinar beitreten“
      await webinarJoinButton.click();
      console.log(">>> Automatisch auf 'Webinar beitreten' geklickt!");

      // 4. Kurz warten und dann auf den "Alle"-Tab klicken
      console.log("[MAIN] Warte 3s, dann klicke auf den 'Alle'-Tab ...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Gleicher Shadow-DOM (streamingShadow, malongRoot)
      // => Button mit aria-label="Bedienfeld Alle öffnen" oder #sidebar-button-attendeeList
      const allTabButton = await malongRoot.$('#sidebar-button-attendeeList');
      if (!allTabButton) {
        throw new Error("Konnte den 'Alle'-Tab-Button nicht finden!");
      }

      await allTabButton.click();
      console.log(">>> Automatisch auf 'Alle' (Teilnehmerliste) geklickt!");
    } catch (err) {
      console.error("[MAIN] Fehler beim Klick auf 'Webinar beitreten' / 'Alle':", err);
    }
  } else {
    // Manuelles Klicken
    console.log("[MAIN] Manuelles Klicken aktiv. Bitte selbst auf 'Webinar beitreten' klicken!");
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  // Optional: Screenshot
  await takeScreenshot(page, "02_join_attempt");

  // 5. Warte auf das Shadow-Element #streamingPage_webinargeek (für Teilnehmer-Überwachung)
  try {
    console.log("[MAIN] Warte nochmal 5s, bevor wir mit Monitoring starten...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Prüfe nur, ob das Host-Element da ist
    const streamingHostCheck = await page.$("#streamingPage_webinargeek");
    if (!streamingHostCheck) {
      throw new Error("[MAIN] Konnte #streamingPage_webinargeek nicht finden!");
    }
    console.log("[MAIN] → #streamingPage_webinargeek gefunden. Starte Monitoring-Schleife...");
  } catch (err) {
    console.error("[MAIN] Fehler beim Überprüfen von #streamingPage_webinargeek:", err);
    // Falls du hier abbrechen willst:
    // await browser.close();
    // return;
  }

  // 6. Endlos-Schleife: Teilnehmerliste auslesen
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const attendees = await getAttendeeList(page);
    console.log("Aktuelle Attendee-Liste:", attendees);
  }

  // (Wird nie erreicht, da Endlos-Schleife)
  // await browser.close();
})();