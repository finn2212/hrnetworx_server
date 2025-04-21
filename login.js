// login.js

/**
 * Automatischer Login bei WebinarGeek
 * @param {puppeteer.Page} page Puppeteer Page-Instanz
 * @param {string} email Benutzername/E-Mail
 * @param {string} password Passwort
 */
async function doLogin(page, email, password) {
    console.log("[Login] Versuche Login auf:", page.url());
  
    // Warte, bis das Formular sichtbar ist (id="loginform")
    await page.waitForSelector("#loginform", { timeout: 15000 });
  
    // E-Mail in das Feld mit id="user_email" eintippen
    await page.type("#user_email", email, { delay: 50 });
  
    // Passwort in das Feld mit id="user_password" eintippen
    await page.type("#user_password", password, { delay: 50 });
  
    // Klicke den Button (type="submit") im Formular
    await page.click('#loginform button[type="submit"]');
  
    // Warte auf die Navigation nach dem Klick
    await page.waitForNavigation({ timeout: 30000 });
  
    console.log("[Login] Login abgeschlossen. Aktuelle URL ist:", page.url());
  }
  
  module.exports = {
    doLogin,
  };