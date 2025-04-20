const fs = require("fs");
const path = require("path");

const screenshotsDir = path.join(__dirname, "screenshots");

// Erstelle den Screenshot-Ordner, falls er nicht existiert, oder lösche alle vorhandenen Dateien darin
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
} else {
  fs.readdirSync(screenshotsDir).forEach((file) => {
    fs.unlinkSync(path.join(screenshotsDir, file));
  });
}

// Hilfsfunktion, um Screenshots mit einem bestimmten Namen zu speichern
async function takeScreenshot(page, stepName) {
  await page.screenshot({ path: `screenshots/${stepName}.png` });
}

const puppeteer = require("puppeteer");

// Setze manualClick auf true, falls du den Klick manuell ausführen möchtest,
// ansonsten wird automatisch auf den "Bühne betreten"-Button geklickt.
const manualClick = true;

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--window-size=1920,1080"],
  });
  const page = await browser.newPage();

  // Setze den Viewport auf HD-Größe
  await page.setViewport({ width: 1920, height: 1080 });

  // Überschreibe Berechtigungen für Kamera und Mikrofon
  await browser
    .defaultBrowserContext()
    .overridePermissions("https://hrnetworx.webinargeek.com", [
      "camera",
      "microphone",
    ]);

  await page.goto(
    "https://hrnetworx.webinargeek.com/webinar/admin/NKvetw7N0Ht5WvEZtcpxGlSz2Vj1nvLn4-_c2dGjZbKr732I-du8jv3lYBTjQ0ns9x3fFrVGIzz6MN5RCKtGbA/"
  );

  // Screenshot nach dem Laden der Seite
  await takeScreenshot(page, "01_page_loaded");

  // Warte kurz, damit dynamischer Content geladen werden kann
  await new Promise((resolve) => setTimeout(resolve, 10000)); // 5 Sekunden warten (Promise-basierter Timeout)

  // Screenshot vor dem Join-Versuch
  await takeScreenshot(page, "02_before_join");

  // Join Button Handling: entweder automatischer Klick oder manuelle Intervention
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
      "Manueller Klick: Bitte klicke den 'Bühne betreten'-Button im Browser."
    );
    // Warte 10 Sekunden, damit du manuell klicken kannst
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  // Screenshot nach dem Join-Versuch
  await takeScreenshot(page, "03_after_join");

  // Weitere Debug-Screenshot
  await takeScreenshot(page, "04_debug");

  // Warten auf das Element mit der Teilnehmerliste im Shadow-DOM
  try {
    // 1. Warte auf das Host-Element, das den Shadow DOM enthält
    const hostHandle = await page.waitForSelector(
      "#streamingPage_webinargeek",
      { timeout: 20000 }
    );
    if (!hostHandle) {
      throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
    }

    // 2. Shadow-Root abrufen
    const shadowRootHandle = await hostHandle.evaluateHandle(
      (host) => host.shadowRoot
    );

    // 3. Innerhalb des Shadow-Roots nach dem ul suchen
    const attendeeListHandle = await shadowRootHandle.$(
      'ul[aria-label="Zuschauer"]'
    );
    if (!attendeeListHandle) {
      throw new Error("Attendee-Liste im Shadow DOM nicht gefunden!");
    }

    // 4. Daten aus der Liste extrahieren
    // 4. Daten aus der Liste extrahieren
    const attendees = await attendeeListHandle.$$eval("li", (items) => {
      return items.reduce((acc, item) => {
        // 1. Namen aus dem aria-label holen
        const name = item.getAttribute("aria-label")?.trim();

        // 2. Online-Status ermitteln:
        //    Wir holen das div[data-online], um den Wert (z. B. "online"/"offline") auszulesen
        const onlineDiv = item.querySelector("div[data-online]");
        // Der Wert befindet sich im data-Attribut "data-online"
        const onlineStatus = onlineDiv
          ? onlineDiv.getAttribute("data-online")
          : null;

        // Optional: Wenn du den Text-Inhalt ("Online"/"Offline") benötigst, könntest du so
        // den Span oder das Div auslesen:
        // const onlineText = onlineDiv ? onlineDiv.textContent.trim() : null;

        // 3. Nur hinzufügen, wenn ein Name vorhanden ist
        if (name) {
          acc.push({ name, onlineStatus });
        }

        return acc;
      }, []);
    });

    console.log("Attendee List:", attendees);
  } catch (err) {
    console.error(
      "Fehler beim Auslesen der Attendee-Liste im Shadow DOM:",
      err
    );
    await browser.close();
    return;
  }

  // Screenshot, wenn die Teilnehmerliste geladen wurde
  await takeScreenshot(page, "05_attendee_list_loaded");

  // Extrahiere die AttendeeList-Daten
  await browser.close();
})();
