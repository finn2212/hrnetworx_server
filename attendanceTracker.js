// Alternative: Noch performantere Version für 500+ Teilnehmer
const ultraOptimizedScroll = async (ul) => {
  const scrollContainer = ul.closest('.overflow-y-auto');
  const allAttendeesMap = new Map();
  
  // Sehr große Schritte, sammle nur jede 3. Position
  const scrollStep = 300;
  const steps = Math.ceil(scrollContainer.scrollHeight / scrollStep);
  
  for (let step = 0; step <= steps; step += 3) { // Nur jede 3. Position
    scrollContainer.scrollTop = step * scrollStep;
    await new Promise(r => setTimeout(r, 30)); // Sehr kurz warten
    
    const items = ul.querySelectorAll('li');
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