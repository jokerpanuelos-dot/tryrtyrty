# 🎲 Color Game — Banker Edition

A real-time multiplayer color guessing game with a Banker host. Built with Node.js, Express, and Socket.io.

---

## 📁 Project Structure

```
color-game/
├── server.js           ← Node.js backend (Express + Socket.io)
├── package.json
├── public/
│   ├── index.html      ← Main HTML (all screens)
│   ├── css/
│   │   └── style.css   ← Styles
│   └── js/
│       └── app.js      ← Client-side game logic
└── README.md
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js v16 or higher — download at https://nodejs.org

### Steps

```bash
# 1. Go into the project folder
cd color-game

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

The server will start and print:
```
🎮 Color Game Server running!
   Local:   http://localhost:3000
   Network: http://192.168.x.x:3000
```

---

## 🌐 Playing Over Local WiFi (Multiple Devices)

1. Make sure all devices are connected to the **same WiFi network**.
2. Find your computer's local IP address:
   - **Windows**: Open Command Prompt → type `ipconfig` → look for `IPv4 Address`
   - **Mac/Linux**: Open Terminal → type `ifconfig` or `ip addr` → look for `inet` address
3. On other devices, open a browser and go to:
   ```
   http://192.168.x.x:3000
   ```
   *(replace with your actual IP)*

---

## 🎮 How to Play

1. **Banker** opens the game and clicks **"Create Room as Banker"**.
2. **Players** click **"Join Room as Player"** and enter the 4-letter room code.
3. Banker clicks **▶ Start Round** to begin.
4. Players choose a color before the banker draws.
5. Banker clicks **🎲 Draw Color** to reveal the winning color.
6. Winners get **+50 credits**, losers lose **-20 credits**.
7. Banker clicks **↩ New Round** to play again.

---

## ☁️ Deploying to Hostinger

### Option A: Node.js Hosting (Recommended)

1. **Log in to Hostinger** → Go to **hPanel**.
2. Select or purchase a **Business** or higher hosting plan (supports Node.js).
3. Go to **Hosting → Manage → Node.js**.
4. Set:
   - **Node.js version**: 18.x or higher
   - **Application root**: your upload folder (e.g., `public_html/color-game`)
   - **Application startup file**: `server.js`
5. Upload all project files via **File Manager** or **FTP** (using FileZilla).
6. In the Node.js panel, click **Install dependencies** (runs `npm install`).
7. Click **Restart application**.
8. Your game will be live at your domain or subdomain.

> 💡 **Tip**: Set the PORT in your app using `process.env.PORT` — already done in server.js.

### Option B: VPS Hosting

If you have a Hostinger VPS:

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Upload your files (via FTP or git)
cd /var/www/color-game

# Install and start
npm install
npm start

# Optional: Keep alive with PM2
npm install -g pm2
pm2 start server.js --name color-game
pm2 save
pm2 startup
```

---

## 🔧 Configuration

You can change these values in `server.js`:

| Setting | Default | Description |
|---------|---------|-------------|
| PORT | 3000 | Server port |
| Starting credits | 100 | Each player starts with this |
| Win amount | +50 | Credits won per round |
| Lose amount | -20 | Credits lost per round |

---

## 🔥 Future Enhancements (Optional)

- ⏱ **Timer per round** — Auto-draw after countdown
- 💸 **Custom bet amounts** — Let players choose how much to wager
- 🔊 **Sound effects** — Win/lose audio feedback
- ✨ **Animations** — Color reveal effects
- 📊 **Leaderboard** — Rank players by credits
- 🔒 **Room passwords** — Private rooms

---

## 🛠 Tech Stack

- **Backend**: Node.js + Express
- **Real-time**: Socket.io
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Storage**: In-memory only (no database)
