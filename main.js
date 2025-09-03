// main.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { fork } = require('child_process')

let win, recorder

function createWindow() {
  win = new BrowserWindow({
    width: 400, height: 200,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  win.loadFile('index.html')
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

ipcMain.handle('start-recording', () => {
  if (recorder) return
  recorder = fork(path.join(__dirname, 'server.js'), [], {
    env: process.env,
    stdio: 'inherit'
  })
})
ipcMain.handle('stop-recording', () => {
  if (!recorder) return
  recorder.kill()
  recorder = null
})