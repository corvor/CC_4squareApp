# CC_4SquareApp: Start Here

**Diamondback Career Connections · FutureProof Careers**

Students pick a career and see its tasks sorted into a four-square: **AI Exposure** × **Human Comparative Advantage**.

There are two ways to run it on your computer:

| | **Demo** | **Full app** |
|---|---|---|
| Careers | 8 sample careers | About 900 official O*NET careers |
| Internet | Not needed | Needed |
| API key | Not needed | Needed (from console.anthropic.com) |
| Results | Sample reports written to show the app | Live AI analysis of real O*NET tasks |
| Use it for | Showing people what the app does | Real use with students |

---

## One-time setup: install Node.js
1. Go to **https://nodejs.org** and download the **LTS** version.
2. Run the installer and accept the defaults.
3. Restart your computer if the installer asks you to.

---

## Option A: Double-click (no VS Code needed)
**Windows:** double-click **`Start-Demo-Windows.bat`**
**Mac:** double-click **`Start-Demo-Mac.command`**. The first time, macOS may block it: right-click the file, choose **Open**, then click **Open** again.

A black window opens and your browser shows the app. **Keep the black window open** while you use the app. To stop, close that window or press **Ctrl+C** in it.

For the full app, use `Start-Full-App-Windows.bat` or `Start-Full-App-Mac.command` (see "Turning on the full app" below).

---

## Option B: Run it in VS Code
1. Install VS Code from **https://code.visualstudio.com** if you don't have it.
2. In VS Code, choose **File → Open Folder…** and select the **CC_4SquareApp** folder. If VS Code asks whether you trust the authors, click **Yes, I trust the authors**.
3. Choose **Terminal → New Terminal** from the top menu.
4. Type one of these and press **Enter**:

   | To do this | Type |
   |---|---|
   | Run the demo | `npm run demo` |
   | Run the full app | `npm start` |
   | Run the automated tests | `npm test` |

5. Your browser opens to the app. If it doesn't, hold **Ctrl** (Mac: **Cmd**) and click the `http://localhost:3000` link in the terminal.
6. To stop, click in the terminal and press **Ctrl+C**.

**Shortcuts:** **Terminal → Run Task…** lists the same commands. You can also open the **Run and Debug** panel (the play-button icon on the left), pick **Run DEMO** or **Run FULL APP**, and press the green arrow.

---

## Turning on the full app
1. Get an API key at **https://console.anthropic.com/** (add billing, then create a key). Set a **monthly spend limit** on the Limits page; that's your cost cap.
2. Run the full app once (`npm start` or the Start-Full-App file). It creates a file called **`.env.local`** in this folder and tells you to add your key.
3. Open **`.env.local`** (in VS Code, click it in the file list on the left). Paste your key right after `ANTHROPIC_API_KEY=` with no spaces, then save.
4. Run the full app again. The first time, it downloads the official O*NET career list, which takes about a minute. After that it starts right away.

**Keep `.env.local` private.** Don't email it, share it, or upload it to GitHub.

---

## Common problems
- **"npm is not recognized" or "command not found: node":** Node.js isn't installed, or VS Code was open while you installed it. Install Node.js, then close and reopen VS Code.
- **The browser says "This site can't be reached":** the app isn't running. Start it again and keep the black window or terminal open.
- **The port is already in use:** the app picks the next free port automatically (3001, 3002…). Use the link shown in the window.
- **The O*NET download fails:** check your internet connection. School networks sometimes block downloads; try another network. The demo works offline either way.
- **Windows shows "Windows protected your PC":** click **More info**, then **Run anyway**. This appears because the file came from email or the internet.

---

## Putting it online for students
See **README.md → Put it online**. It covers a private GitHub repo plus free Vercel hosting.
