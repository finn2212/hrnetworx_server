// attendeeList.js
async function getAttendeeList(page) {
    try {
      // 1. Hol das Shadow-Host-Element
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
      const allItems = await attendeeListHandle.$$eval("li", (items) => {
        return items.map((item) => {
          //-----------------------------------------
          // (A) NAME (so wie vorher)
          //-----------------------------------------
          let nameDiv = item.querySelector("div.sc-bTIvZA");
          let name = nameDiv ? nameDiv.textContent.trim() : null;
  
          if (!name) {
            const ariaLabel = item.getAttribute("aria-label")?.trim();
            if (ariaLabel) {
              name = ariaLabel;
            }
          }
  
          //-----------------------------------------
          // (B) ONLINE-STATUS (unverändert)
          //-----------------------------------------
          const onlineDiv = item.querySelector("div[data-online]");
          const onlineStatus = onlineDiv
            ? onlineDiv.getAttribute("data-online")
            : null;
  
          //-----------------------------------------
          // (C) E-MAIL 
          // Nur aus div.sc-iTOIXX.ihbVgp -> reiner Text "events@hrnetworx.de"
          //-----------------------------------------
          let email = null;
          const emailDiv = item.querySelector("div.sc-iTOIXX.ihbVgp");
          if (emailDiv) {
            // Direkt den Text-Inhalt übernehmen
            email = emailDiv.textContent.trim();
          }
  
          return { name, onlineStatus, email };
        });
      });
  
      // 5. Leere Einträge (ohne name, email, status) rausfiltern
      const attendees = allItems.filter((item) => {
        return item.name || item.email || item.onlineStatus;
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