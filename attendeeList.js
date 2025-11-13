// attendeeList.js
async function getAttendeeList(page) {
  try {
    // 1. Hol das Shadow-Host-Element
    const hostHandle = await page.$("#streamingPage_webinargeek");
    if (!hostHandle) {
      throw new Error("Shadow-Host #streamingPage_webinargeek nicht gefunden!");
    }

    // 2. Shadow-Root abrufen
    const shadowRootHandle = await hostHandle.evaluateHandle(
      (host) => host.shadowRoot
    );

    // 3. UL mit aria-label="Zuschauer" suchen
    const attendeeListHandle = await shadowRootHandle.$(
      'ul[aria-label="Zuschauer"], ul[aria-label="Attendees"]'
    );
    if (!attendeeListHandle) {
      throw new Error("Attendee-Liste im Shadow DOM nicht gefunden!");
    }

    // VERWENDE die ultraOptimizedScroll Funktion
    const allAttendees = await attendeeListHandle.evaluate(async (ul) => {
      // Deine ultraOptimizedScroll Funktion
      const ultraOptimizedScroll = async (ul) => {
        const scrollContainer = ul.closest('.overflow-y-auto');
        const allAttendeesMap = new Map();
        
        // Sehr große Schritte, sammle nur jede 3. Position
        const scrollStep = 300;
        const steps = Math.ceil(scrollContainer.scrollHeight / scrollStep);
        
        console.log(`Starte ultra-optimiertes Scrollen: ${steps} Schritte`);
        
        for (let step = 0; step <= steps; step += 3) { // Nur jede 3. Position
          scrollContainer.scrollTop = step * scrollStep;
          await new Promise(r => setTimeout(r, 30)); // Sehr kurz warten
          
          const items = ul.querySelectorAll('li');
          console.log(`Schritt ${step}/${steps}: ${items.length} Items gefunden`);
          
          for (const li of items) {
            const dataIndex = li.getAttribute('data-index');
            const name = li.getAttribute('aria-label') || li.textContent.trim();
            if (name && dataIndex) {
              allAttendeesMap.set(dataIndex, {
                name,
                dataIndex,
                onlineStatus: li.querySelector('div[data-online]')?.getAttribute('data-online'),
                email: li.querySelector('div.sc-iTOIXX.ihbVgp')?.textContent.trim()
              });
            }
          }
        }
        
        return Array.from(allAttendeesMap.values());
      };

      // Führe die Scroll-Funktion aus
      return await ultraOptimizedScroll(ul);
    });

    console.log(`\n=== ERGEBNIS ===`);
    console.log(`Gesammelte Teilnehmer: ${allAttendees.length}`);
    
    // Debug-Ausgabe
    console.log('Alle gefundenen Teilnehmer:');
    allAttendees.forEach((attendee, index) => {
      console.log(`  ${index + 1}. ${attendee.name} (Index: ${attendee.dataIndex})`);
    });

    return allAttendees;

  } catch (err) {
    console.error("Fehler beim Auslesen der Attendee-Liste:", err);
    return [];
  }
}

module.exports = {
  getAttendeeList,
};