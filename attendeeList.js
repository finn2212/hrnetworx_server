// attendeeList.js
async function getAttendeeList(page) {
    try {
      // 1. Shadow-Host
      const hostHandle = await page.$("#streamingPage_webinargeek");
      if (!hostHandle) {
        throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
      }
  
      // 2. Shadow-Root abrufen
      const shadowRootHandle = await hostHandle.evaluateHandle((host) => host.shadowRoot);
  
      // 3. UL mit aria-label="Zuschauer" suchen
      const attendeeListHandle = await shadowRootHandle.$('ul[aria-label="Zuschauer"]');
      if (!attendeeListHandle) {
        throw new Error("Attendee-Liste im Shadow DOM nicht gefunden!");
      }
  
      // 4. Daten extrahieren
      const attendees = await attendeeListHandle.$$eval("li", (items) => {
        return items.map((item) => {
          //-----------------------------------------
          // (A) NAME
          //-----------------------------------------
          // Versuche: Finde <div class="sc-bTIvZA ..."> => reiner Teilnehmername
          let nameDiv = item.querySelector('div.sc-bTIvZA');
          let name = nameDiv ? nameDiv.textContent.trim() : null;
  
          // Fallback: Falls wir noch keinen Namen haben, probier aria-label
          if (!name) {
            const ariaLabel = item.getAttribute("aria-label")?.trim();
            if (ariaLabel) {
              name = ariaLabel;
            }
          }
  
          //-----------------------------------------
          // (B) ONLINE-STATUS
          //-----------------------------------------
          const onlineDiv = item.querySelector("div[data-online]");
          const onlineStatus = onlineDiv ? onlineDiv.getAttribute("data-online") : null;
  
          //-----------------------------------------
          // (C) E-MAIL extrahieren
          //-----------------------------------------
          let email = null;
          // Suche in allen div/span/p nach @
          const possibleNodes = item.querySelectorAll("div, span, p, li, b, i");
          for (const node of possibleNodes) {
            const txt = node.textContent?.trim() || "";
            // Regex: erstes Vorkommen einer E-Mail
            const match = txt.match(/[\w.+-]+@[\w.-]+\.\w+/);
            if (match) {
              email = match[0];
              break;
            }
          }
  
          return { name, onlineStatus, email };
        });
      });
  
      return attendees;
    } catch (err) {
      console.error("Fehler beim Auslesen der Attendee-Liste:", err);
      return [];
    }
  }
  
  module.exports = {
    getAttendeeList,
  };