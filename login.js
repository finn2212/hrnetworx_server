// login.js

/**
 * Automatischer Login bei WebinarGeek
 * @param {puppeteer.Page} page Puppeteer Page-Instanz
 * @param {string} email Benutzername/E-Mail
 * @param {string} password Passwort
 */
async function doLogin(page, email, password) {
  console.log("[Login] Versuche Login auf:", page.url());

  // Falls bereits eingeloggt: Hinweisbox erkennen und früh beenden
  try {
    await page.waitForSelector('.notice-container .text span', { timeout: 3000 });
    const alreadyText = await page.$eval('.notice-container .text span', el => el.textContent?.trim() || '');
    if (alreadyText.toLowerCase().includes('bereits eingeloggt')) {
      console.log('[Login] Bereits eingeloggt – überspringe Login.');
      return;
    }
  } catch (_) {
    // Hinweis nicht gefunden – normal fortfahren
  }

  // Neues Formular hat id="new_user"
  await page.waitForSelector('#new_user', { timeout: 15000 });

  // E-Mail/Passwort-Felder füllen (IDs bestehen weiterhin)
  await page.type('#user_email', email, { delay: 50 });
  await page.type('#user_password', password, { delay: 50 });

  // Absenden über den Submit-Button innerhalb des Formulars
  await page.click('#new_user button[type="submit"]');

  // Auf Navigation/Redirect warten
  try {
    await page.waitForNavigation({ timeout: 30000, waitUntil: 'networkidle0' });
  } catch (e) {
    console.warn('[Login] Keine Navigation erkannt – prüfe Status trotzdem...', e?.message);
  }

  // Nochmals prüfen, ob ein Fehler oder "bereits eingeloggt" angezeigt wird
  try {
    const msg = await page.$eval('.notice-container .text span', el => el.textContent?.trim() || '');
    console.log('[Login] Hinweis:', msg);
  } catch (_) {
    // keine Hinweisbox – okay
  }

  console.log('[Login] Login abgeschlossen. Aktuelle URL ist:', page.url());
}
  
  module.exports = {
    doLogin,
  };