// attendeeList.js
async function getAttendeeList(page) {
    try {
      // 1. Shadow-Host selektieren
      const hostHandle = await page.$("#streamingPage_webinargeek");
      if (!hostHandle) {
        throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
      }
  
      // 2. Shadow-Root abrufen
      const shadowRootHandle = await hostHandle.evaluateHandle(
        (host) => host.shadowRoot
      );
  
      // 3. UL mit aria-label="Zuschauer" suchen
      const attendeeListHandle = await shadowRootHandle.$('ul[aria-label="Zuschauer"]');
      if (!attendeeListHandle) {
        throw new Error("Attendee-Liste im Shadow DOM nicht gefunden!");
      }
  
      // 4. Daten aus den LI-Elementen extrahieren
      const attendees = await attendeeListHandle.$$eval("li", (items) => {
        return items.reduce((acc, item) => {
          // Name aus aria-label
          const name = item.getAttribute("aria-label")?.trim();
          // Status div[data-online]
          const onlineDiv = item.querySelector("div[data-online]");
          const onlineStatus = onlineDiv
            ? onlineDiv.getAttribute("data-online")
            : null;
  
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
  
  module.exports = {
    getAttendeeList,
  };