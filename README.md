# ChromaBet — Multiplayer Color Game

A real-time multiplayer color betting game with WebSocket support.
Players bet on colors, the Banker controls the game and reveals the winner.

---

## 🚀 Hostinger Deployment (VPS or Node.js Hosting)

### Requirements
- Node.js 16+ installed on your server
- A VPS or Hostinger plan that supports Node.js apps

---

### Step 1: Upload Files

Upload the entire `colorgame` folder to your Hostinger server.
You can use the File Manager, FTP, or SSH.

Recommended path: `/home/u12345678/colorgame/` (use your actual username)

---

### Step 2: Install Dependencies

SSH into your server and run:

```bash
cd /path/to/colorgame
npm install
```

This installs the `ws` (WebSocket) package.

---

### Step 3: Configure WebSocket URL

By default, the game connects to:
```
ws://YOUR_SERVER_IP:3000
```

You need to update the `WS_URL` in both `game.html` and `banker.html`.

**Option A — Using IP directly** (quick setup):
Find these lines in both files:
```javascript
const WS_URL = `ws://${location.hostname}:3000`;
```
This auto-detects the hostname — works if you're running everything from the same server.

**Option B — Using a domain** (recommended for production):
Replace with:
```javascript
const WS_URL = 'wss://yourdomain.com/ws';  // Use wss:// for HTTPS
```
Then configure Nginx to proxy WebSocket traffic (see Step 6).

---

### Step 4: Start the Server

```bash
node server.js
```

Or run it in the background:
```bash
nohup node server.js > game.log 2>&1 &
```

To run as a service (recommended), use PM2:
```bash
npm install -g pm2
pm2 start server.js --name chromabet
pm2 save
pm2 startup
```

---

### Step 5: Open Firewall Port

Make sure port 3000 is open on your Hostinger VPS:
```bash
ufw allow 3000
```

Or configure it in the Hostinger firewall settings panel.

---

### Step 6 (Optional): Nginx Reverse Proxy + HTTPS

If you have a domain and SSL, add this to your Nginx config:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /path/to/colorgame;
        index index.html;
        try_files $uri $uri/ =404;
    }

    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Then update WS_URL in the HTML files to:
```javascript
const WS_URL = 'wss://yourdomain.com/ws';
```

---

## 🎮 How to Play

### Banker
1. Open `http://yourserver/banker.html` on one device
2. Click **▶ Start Betting** to begin a round (set your timer)
3. Watch players place their bets in real time
4. After time's up (or manually close), select the winning color
5. Click **🎲 Reveal Selected Color** to announce the winner
6. Use **↺ Reset Game** to start fresh

### Players
1. Open `http://yourserver/game.html` (or `index.html` → Player)
2. Enter your name and join
3. When betting opens, click a color and enter your bet amount
4. Watch the countdown — bets lock when time runs out
5. The Banker reveals the winner — winners split 90% of the pot!

---

## 💰 Game Rules

- Each player starts with **₱1,000**
- Minimum bet: **₱10**
- Winners split **90% of the total pot** proportionally (10% house edge)
- The Banker can add balance to any player at any time
- Player balances persist for the session (reconnect by name)

---

## 📁 File Structure

```
colorgame/
├── index.html      ← Landing page (choose Player or Banker)
├── game.html       ← Player game interface
├── banker.html     ← Banker control panel
├── server.js       ← Node.js WebSocket + HTTP server
├── package.json    ← Dependencies
└── README.md       ← This file
```

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT     | 3000    | Server port |

Set with: `PORT=8080 node server.js`
