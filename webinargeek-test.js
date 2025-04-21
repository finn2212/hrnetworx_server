const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// Ordner für Screenshots
const screenshotsDir = path.join(__dirname, "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
} else {
  fs.readdirSync(screenshotsDir).forEach((file) => {
    fs.unlinkSync(path.join(screenshotsDir, file));
  });
}

// Hilfsfunktion für Screenshots
async function takeScreenshot(page, stepName) {
  await page.screenshot({ path: `screenshots/${stepName}.png` });
}

// true = manuell klicken; false = automatisch klicken
const manualClick = true;

// --- Funktion, um Attendee-Liste abzufragen ---
async function getAttendeeList(page) {
  try {
    // 1. Host-Element aus dem Shadow DOM holen
    const hostHandle = await page.$("#streamingPage_webinargeek");
    if (!hostHandle) {
      throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
    }

    // 2. ShadowRoot abrufen
    const shadowRootHandle = await hostHandle.evaluateHandle(
      (host) => host.shadowRoot
    );

    // 3. Im Shadow-Root die UL mit aria-label="Zuschauer" suchen
    const attendeeListHandle = await shadowRootHandle.$('ul[aria-label="Zuschauer"]');
    if (!attendeeListHandle) {
      throw new Error("Attendee-Liste im Shadow DOM nicht gefunden!");
    }

    // 4. Daten aus jedem LI-Element extrahieren
    const attendees = await attendeeListHandle.$$eval("li", (items) => {
      return items.reduce((acc, item) => {
        // Name aus aria-label holen
        const name = item.getAttribute("aria-label")?.trim();
        // Online-Status (z. B. "online"/"offline") via data-online
        const onlineDiv = item.querySelector("div[data-online]");
        const onlineStatus = onlineDiv
          ? onlineDiv.getAttribute("data-online")
          : null;

        // Nur hinzufügen, wenn Name existiert
        if (name) {
          acc.push({ name, onlineStatus });
        }
        return acc;
      }, []);
    });

    return attendees;
  } catch (err) {
    console.error("Fehler beim Auslesen der Attendee-Liste:", err);
    return [];
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1920,1080"],
  });
  const page = await browser.newPage();

  // Viewport einstellen
  await page.setViewport({ width: 1920, height: 1080 });

  // Kamera- und Mikrofonrechte für die passende Domain setzen
  await browser.defaultBrowserContext().overridePermissions(
    "https://hrnetworx.webinargeek.com",
    ["camera", "microphone"]
  );

  // Seite öffnen
  await page.goto(
    "https://hrnetworx.webinargeek.com/webinar/admin/NKvetw7N0Ht5WvEZtcpxGlSz2Vj1nvLn4-_c2dGjZbKr732I-du8jv3lYBTjQ0ns9x3fFrVGIzz6MN5RCKtGbA/"
  );

  // Erstes Screenshot
  await takeScreenshot(page, "01_page_loaded");
  // Kurze Wartezeit (damit Inhalt geladen wird)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Vor dem Join klicken
  await takeScreenshot(page, "02_before_join");

  // Button "Bühne betreten" entweder automatisch oder manuell
  if (!manualClick) {
    try {
      await page.waitForSelector('button[aria-label*="Bühne betreten"]', {
        timeout: 10000,
      });
      await page.click('button[aria-label*="Bühne betreten"]');
    } catch (err) {
      console.error(
        'Join-Button "Bühne betreten" nicht gefunden, bitte Selektor prüfen.'
      );
    }
  } else {
    console.log(
      "Manueller Klick: Bitte klicke jetzt den 'Bühne betreten'-Button im Browser."
    );
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  await takeScreenshot(page, "03_after_join");
  await takeScreenshot(page, "04_debug");

  // Warte, bis der Shadow-DOM geladen ist (mind. 1x)
  await page.waitForSelector("#streamingPage_webinargeek", { timeout: 20000 });
  console.log("Shadow-Host gefunden. Starte Status-Überwachung ...");

  // Endlos-Schleife (bzw. bis manuell abgebrochen)
  while (true) {
    // Alle 5s aktuelle Liste abrufen
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const attendees = await getAttendeeList(page);
    console.log("Aktuelle Attendee-Liste:", attendees);
  }

  // -> wird in diesem Beispiel nie aufgerufen,
  //    weil die while-Schleife unendlich läuft:
  // await browser.close();
})();