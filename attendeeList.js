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

    // VERBESSERT: Sammle Daten WÄHREND des Scrollens
    const allAttendees = await attendeeListHandle.evaluate(async (ul) => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      
      // Finde den Scroll-Container
      const scrollContainer = ul.closest('.overflow-y-auto') || 
                             ul.parentElement || 
                             document.querySelector('.flex-1.overflow-y-auto');
      
      if (!scrollContainer) {
        console.warn('Scroll-Container nicht gefunden');
        return [];
      }

      console.log('Starte Scroll-Prozess mit Datensammlung...');
      
      // Set für alle gesammelten Attendees
      const allAttendees = new Set();
      
      // Funktion zum Extrahieren der Daten aus einem LI-Element
      const extractAttendeeData = (li) => {
        // NAME
        let nameDiv = li.querySelector("div.sc-bTIvZA");
        let name = nameDiv ? nameDiv.textContent.trim() : null;

        if (!name) {
          const ariaLabel = li.getAttribute("aria-label")?.trim();
          if (ariaLabel) {
            name = ariaLabel;
          }
        }

        // ONLINE-STATUS
        const onlineDiv = li.querySelector("div[data-online]");
        const onlineStatus = onlineDiv
          ? onlineDiv.getAttribute("data-online")
          : null;

        // E-MAIL
        let email = null;
        const emailDiv = li.querySelector("div.sc-iTOIXX.ihbVgp");
        if (emailDiv) {
          email = emailDiv.textContent.trim();
        }

        const dataIndex = li.getAttribute('data-index');
        const ariaLabel = li.getAttribute('aria-label');

        // Erstelle einen eindeutigen Identifier
        const uniqueId = `${name || ''}-${email || ''}-${dataIndex || ''}`;
        
        return {
          uniqueId,
          data: {
            name,
            onlineStatus, 
            email,
            dataIndex,
            ariaLabel
          }
        };
      };

      let scrollCycles = 0;
      const maxCycles = 3;

      while (scrollCycles < maxCycles) {
        console.log(`--- Scroll-Zyklus ${scrollCycles + 1}/${maxCycles} ---`);
        
        // 1. Ganz nach OBEN scrollen
        console.log('Scrolle nach OBEN...');
        scrollContainer.scrollTop = 0;
        await delay(800);

        // 2. Langsam nach UNTEN scrollen und Daten sammeln
        console.log('Scrolle langsam nach UNTEN und sammle Daten...');
        const scrollStep = 100;
        let currentScroll = 0;
        
        while (currentScroll <= scrollContainer.scrollHeight) {
          scrollContainer.scrollTop = currentScroll;
          await delay(150); // Warte für Rendering
          
          // Sammle Daten aller aktuell sichtbaren Items
          const currentItems = Array.from(ul.querySelectorAll('li'));
          currentItems.forEach(li => {
            const attendeeData = extractAttendeeData(li);
            if (attendeeData.data.name || attendeeData.data.email || attendeeData.data.onlineStatus) {
              allAttendees.add(JSON.stringify(attendeeData));
            }
          });
          
          currentScroll += scrollStep;
        }

        // 3. Final: Nochmal ganz nach UNTEN für letzte Items
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        await delay(300);
        
        // Finale Items sammeln
        const finalItems = Array.from(ul.querySelectorAll('li'));
        finalItems.forEach(li => {
          const attendeeData = extractAttendeeData(li);
          if (attendeeData.data.name || attendeeData.data.email || attendeeData.data.onlineStatus) {
            allAttendees.add(JSON.stringify(attendeeData));
          }
        });

        console.log(`Nach Zyklus ${scrollCycles + 1}: ${allAttendees.size} einzigartige Items gesammelt`);
        scrollCycles++;
      }

      // Konvertiere Set zurück zu Array von Objekten
      const attendeesArray = Array.from(allAttendees).map(str => JSON.parse(str).data);
      
      console.log(`Scroll-Prozess abgeschlossen. Gesamt: ${attendeesArray.length} Teilnehmer`);
      
      // Debug: Zeige die ersten 5
      console.log('Erste 5 gesammelte Teilnehmer:', attendeesArray.slice(0, 5));
      
      return attendeesArray;
    });

    console.log(`\n=== ERGEBNIS AUS SCROLL-PROZESS ===`);
    console.log(`Gesammelte Teilnehmer: ${allAttendees.length}`);
    
    // Entferne Duplikate (falls nötig)
    const uniqueAttendees = allAttendees.filter((item, index, self) => 
      index === self.findIndex(t => 
        t.name === item.name && 
        t.email === item.email &&
        t.dataIndex === item.dataIndex
      )
    );

    console.log(`Einzigartige Teilnehmer nach Filterung: ${uniqueAttendees.length}`);
    
    // Debug-Ausgabe aller gefundenen Teilnehmer
    console.log('Alle gefundenen Teilnehmer:');
    uniqueAttendees.forEach((attendee, index) => {
      console.log(`  ${index + 1}. ${attendee.name || 'No Name'} (Index: ${attendee.dataIndex || 'N/A'})`);
    });

    return uniqueAttendees;

  } catch (err) {
    console.error("Fehler beim Auslesen der Attendee-Liste:", err);
    return [];
  }
}

module.exports = {
  getAttendeeList,
};