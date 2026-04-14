const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Starting balances
const BANKER_START = 10000;  // ₱10,000 — banker is the house
const PLAYER_START = 1000;   // ₱1,000  — each player starts with this
const HOUSE_EDGE   = 0.05;   // 5% of losing bets kept by banker as pure profit

// HTTP server for static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg',
  };
  const contentType = mimeTypes[ext] || 'text/plain';
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end('Not found'); }
    else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content); }
  });
});

const wss = new WebSocket.Server({ server });

let gameState = {
  phase: 'waiting',
  round: 0,
  colors: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
  winningColor: null,
  bets: {},
  players: {},
  bankerBalance: BANKER_START,
  countdown: 0,
  history: [],
  bankerConnected: false,
};

let countdownInterval = null;

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}
function sendTo(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function getTotalPot() {
  return Object.values(gameState.bets).reduce((s, b) => s + (b ? b.amount : 0), 0);
}
function getColorPot(color) {
  return Object.values(gameState.bets)
    .filter(b => b && b.color === color)
    .reduce((s, b) => s + b.amount, 0);
}

function getPublicState() {
  const totalPot = getTotalPot();
  const betAmounts = {}; const betCounts = {};
  gameState.colors.forEach(c => { betAmounts[c] = 0; betCounts[c] = 0; });
  Object.values(gameState.bets).forEach(b => {
    if (b && b.color) {
      betAmounts[b.color] += b.amount;
      betCounts[b.color]++;
    }
  });
  return {
    type: 'state',
    phase: gameState.phase,
    round: gameState.round,
    colors: gameState.colors,
    players: Object.entries(gameState.players).map(([id, p]) => ({
      id, name: p.name, balance: p.balance, role: p.role,
      hasBet: !!gameState.bets[id],
      betColor: (gameState.phase === 'result' || gameState.phase === 'reveal') ? (gameState.bets[id]?.color || null) : null,
      betAmount: (gameState.phase === 'result' || gameState.phase === 'reveal') ? (gameState.bets[id]?.amount || null) : null,
    })),
    betCounts, betAmounts, totalPot,
    bankerBalance: gameState.bankerBalance,
    countdown: gameState.countdown,
    history: gameState.history.slice(-10),
    bankerConnected: gameState.bankerConnected,
  };
}

function startCountdown(seconds, onEnd) {
  clearInterval(countdownInterval);
  gameState.countdown = seconds;
  broadcast(getPublicState());
  countdownInterval = setInterval(() => {
    gameState.countdown--;
    broadcast({ type: 'countdown', value: gameState.countdown });
    if (gameState.countdown <= 0) { clearInterval(countdownInterval); onEnd(); }
  }, 1000);
}

wss.on('connection', (ws) => {
  ws.playerId = null;
  sendTo(ws, { type: 'welcome' });

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        const id = msg.id || ('p_' + Math.random().toString(36).slice(2, 8));
        ws.playerId = id;
        const isRejoining = !!gameState.players[id];

        if (msg.role === 'banker') {
          gameState.bankerConnected = true;
          ws.role = 'banker';
          if (!isRejoining) {
            gameState.players[id] = { name: 'Banker', balance: gameState.bankerBalance, role: 'banker' };
          }
          sendTo(ws, { type: 'joined', id, role: 'banker', balance: gameState.bankerBalance });
        } else {
          ws.role = 'player';
          if (!isRejoining) {
            gameState.players[id] = { name: msg.name || 'Player', balance: PLAYER_START, role: 'player' };
          } else {
            gameState.players[id].name = msg.name || gameState.players[id].name;
          }
          sendTo(ws, { type: 'joined', id, role: 'player', balance: gameState.players[id].balance });
        }
        broadcast(getPublicState());
        break;
      }

      case 'placeBet': {
        const pid = ws.playerId;
        if (!pid || !gameState.players[pid]) return;
        if (gameState.phase !== 'betting') return sendTo(ws, { type: 'error', msg: 'Betting is not open.' });
        if (gameState.bets[pid]) return sendTo(ws, { type: 'error', msg: 'You already placed a bet.' });

        const amount = parseInt(msg.amount);
        const color = msg.color;
        if (!gameState.colors.includes(color)) return sendTo(ws, { type: 'error', msg: 'Invalid color.' });
        if (isNaN(amount) || amount < 10) return sendTo(ws, { type: 'error', msg: 'Minimum bet is ₱10.' });
        if (gameState.players[pid].balance < amount) return sendTo(ws, { type: 'error', msg: 'Not enough balance.' });

        gameState.players[pid].balance -= amount;
        gameState.bets[pid] = { color, amount };
        sendTo(ws, { type: 'betConfirmed', color, amount, balance: gameState.players[pid].balance });
        broadcast(getPublicState());
        break;
      }

      // ── BANKER ACTIONS ──────────────────────────────────────────────────

      case 'startBetting': {
        if (ws.role !== 'banker') return;
        if (gameState.phase !== 'waiting' && gameState.phase !== 'result') return;
        gameState.phase = 'betting';
        gameState.round++;
        gameState.bets = {};
        gameState.winningColor = null;
        const secs = msg.seconds || 30;
        broadcast({ type: 'phaseChange', phase: 'betting', round: gameState.round });
        startCountdown(secs, () => {
          gameState.phase = 'closed';
          broadcast({ type: 'phaseChange', phase: 'closed' });
          broadcast(getPublicState());
        });
        broadcast(getPublicState());
        break;
      }

      case 'closeBetting': {
        if (ws.role !== 'banker') return;
        if (gameState.phase !== 'betting') return;
        clearInterval(countdownInterval);
        gameState.countdown = 0;
        gameState.phase = 'closed';
        broadcast({ type: 'phaseChange', phase: 'closed' });
        broadcast(getPublicState());
        break;
      }

      case 'revealColor': {
        if (ws.role !== 'banker') return;
        if (gameState.phase !== 'closed') return sendTo(ws, { type: 'error', msg: 'Close betting first.' });
        clearInterval(countdownInterval);

        const winner = msg.color;
        if (!gameState.colors.includes(winner)) return;

        gameState.winningColor = winner;
        gameState.phase = 'reveal';

        // ── Payout logic ──────────────────────────────────────────────
        // The BANKER is the house/bookmaker:
        //   • Losing bets → collected by banker (minus 5% pure house edge already theirs)
        //   • Winning bets → player gets stake back PLUS proportional share of losing pot
        //   • If everyone wins (no losers), banker pays from their own pocket at 1:1 minus 5% fee
        //
        // Formula for winner profit:
        //   profit = floor( losingPot × (myStake / winningPot) × (1 - HOUSE_EDGE) )
        // ─────────────────────────────────────────────────────────────

        const totalPot   = getTotalPot();
        const winningPot = getColorPot(winner);
        const losingPot  = totalPot - winningPot;

        const results = {};
        let totalBankerChange = 0;

        Object.entries(gameState.bets).forEach(([pid, bet]) => {
          if (!bet) return;
          if (bet.color === winner) {
            let profit = 0;
            if (losingPot > 0 && winningPot > 0) {
              profit = Math.floor(losingPot * (bet.amount / winningPot) * (1 - HOUSE_EDGE));
            } else if (losingPot === 0) {
              // No losers — banker pays 1:1 from their own pocket (minus house edge)
              profit = Math.floor(bet.amount * (1 - HOUSE_EDGE));
            }
            const payout = bet.amount + profit;
            gameState.players[pid].balance += payout;
            results[pid] = { won: true, stake: bet.amount, profit, payout };
            totalBankerChange -= profit; // banker pays the profit
          } else {
            // Loser — their stake was already deducted when they placed the bet
            // Banker collects 95% of losing stake (5% is house edge, stays in game pool)
            const collected = Math.floor(bet.amount * (1 - HOUSE_EDGE));
            results[pid] = { won: false, stake: bet.amount, profit: 0, payout: 0 };
            totalBankerChange += collected;
          }
        });

        gameState.bankerBalance = Math.max(0, gameState.bankerBalance + totalBankerChange);
        if (gameState.players['banker']) gameState.players['banker'].balance = gameState.bankerBalance;

        gameState.history.push({
          round: gameState.round, winner, totalPot, winningPot, losingPot,
          bankerChange: totalBankerChange,
        });

        broadcast({
          type: 'reveal',
          winningColor: winner,
          results,
          bankerBalance: gameState.bankerBalance,
          bankerChange: totalBankerChange,
          totalPot, winningPot, losingPot,
          players: Object.entries(gameState.players).map(([id, p]) => ({
            id, name: p.name, balance: p.balance, role: p.role,
          })),
        });

        gameState.phase = 'result';
        broadcast(getPublicState());
        break;
      }

      case 'resetGame': {
        // Reset players to start balance; banker keeps their current balance
        if (ws.role !== 'banker') return;
        clearInterval(countdownInterval);
        Object.keys(gameState.players).forEach(pid => {
          if (gameState.players[pid].role !== 'banker') {
            gameState.players[pid].balance = PLAYER_START;
          }
        });
        gameState.bets = {};
        gameState.phase = 'waiting';
        gameState.winningColor = null;
        gameState.countdown = 0;
        broadcast({ type: 'reset', bankerBalance: gameState.bankerBalance });
        broadcast(getPublicState());
        break;
      }

      case 'fullReset': {
        // Full reset — everyone back to starting money (new session)
        if (ws.role !== 'banker') return;
        clearInterval(countdownInterval);
        gameState.bankerBalance = BANKER_START;
        gameState.round = 0;
        gameState.history = [];
        Object.keys(gameState.players).forEach(pid => {
          const p = gameState.players[pid];
          p.balance = p.role === 'banker' ? BANKER_START : PLAYER_START;
        });
        gameState.bets = {};
        gameState.phase = 'waiting';
        gameState.winningColor = null;
        gameState.countdown = 0;
        broadcast({ type: 'fullReset', bankerBalance: BANKER_START, playerStart: PLAYER_START });
        broadcast(getPublicState());
        break;
      }

      case 'addBalance': {
        if (ws.role !== 'banker') return;
        const { targetId, amount } = msg;
        if (!gameState.players[targetId] || gameState.players[targetId].role === 'banker') return;
        const addAmt = parseInt(amount);
        if (isNaN(addAmt) || addAmt <= 0) return;
        if (gameState.bankerBalance < addAmt) {
          return sendTo(ws, { type: 'error', msg: "Banker doesn't have enough balance." });
        }
        gameState.bankerBalance -= addAmt;
        gameState.players[targetId].balance += addAmt;
        if (gameState.players['banker']) gameState.players['banker'].balance = gameState.bankerBalance;
        broadcast(getPublicState());
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.role === 'banker') gameState.bankerConnected = false;
    broadcast(getPublicState());
  });
});

server.listen(PORT, () => {
  console.log(`🎮 ChromaBet server running on port ${PORT}`);
  console.log(`   Banker starts with ₱${BANKER_START.toLocaleString()}`);
  console.log(`   Players start with ₱${PLAYER_START.toLocaleString()}`);
  console.log(`   House edge: ${HOUSE_EDGE * 100}%`);
});
