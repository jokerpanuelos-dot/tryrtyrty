# ChromaBet — Multiplayer Color Game

A real-time multiplayer color betting game with WebSocket support.  
1 Banker hosts the table · Up to 4+ Players join and bet on colors.

---

## 💰 Money & Mechanics

| Role   | Starting Balance | Notes |
|--------|-----------------|-------|
| Banker | ₱10,000         | Acts as the house/bookmaker |
| Player | ₱1,000          | Each of the 4 players |

### How Payouts Work (Proportional Odds)
- **Losing bets** → collected by the banker (95% goes to banker, 5% is house edge)
- **Winning bets** → player gets their stake back + a proportional share of all losing bets
  - Formula: `profit = floor( losingPot × (yourStake / totalWinningPot) × 0.95 )`
- If **everyone** bet the same color (no losers): banker pays 1:1 from their own pocket minus 5%
- Banker can go broke — balance is tracked in real time

### Example (Round):
- Red: ₱200 (Player A), Blue: ₱300 (Player B), Green: ₱100 (Player C) → Total pot ₱600
- **Blue wins** → winningPot = ₱300, losingPot = ₱300
- Player B profit: `floor(300 × (300/300) × 0.95)` = ₱285
- Player B payout: ₱300 (stake back) + ₱285 = **₱585**
- Banker gets: ₱300 (losing bets) × 0.95 - ₱285 = net **+₱0** (nearly break even with 5% edge)

---

## 🚀 Setup & Run

```bash
cd colorgame
npm install
node server.js
```

Then open in browser:
- **Banker:** `http://localhost:3000/banker.html`
- **Players:** `http://localhost:3000/game.html`

---

## 🎮 How to Play

### Banker (1 person)
1. Open `banker.html`
2. Click **▶ Start Betting** — choose a timer (20–90 seconds)
3. Watch players place bets live. Click **⏹ Close Bets** to end early
4. Select a winning color, click **🎲 Reveal**
5. Banker balance updates automatically with winnings/losses
6. Use **Reset Players** to give all players ₱1,000 back (banker keeps balance)
7. Use **Full Reset** to start a brand-new session (everyone back to start)

### Players (up to 4+)
1. Open `game.html`, enter your name
2. When betting opens, click a color then enter/tap a bet amount
3. Quick-bet buttons: ₱50 / ₱100 / ₱200 / ₱500 / ALL IN
4. Watch the countdown — bets lock when time runs out
5. The banker reveals the winner — overlay shows your result instantly

---

## 📁 Files
```
colorgame/
├── index.html    ← Landing page
├── game.html     ← Player interface
├── banker.html   ← Banker control panel
├── server.js     ← Node.js WebSocket server
├── package.json
└── README.md
```
