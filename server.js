const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// HTTP server for static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
  };
  const contentType = mimeTypes[ext] || 'text/plain';
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Game state
let gameState = {
  phase: 'waiting',   // waiting | betting | reveal | result
  round: 0,
  colors: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
  winningColor: null,
  bets: {},           // { playerId: { color, amount } }
  players: {},        // { id: { name, balance, role } }
  countdown: 0,
  history: [],
  bankerConnected: false,
};

let countdownInterval = null;

function broadcast(data, excludeId = null) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      if (!excludeId || client.playerId !== excludeId) {
        client.send(msg);
      }
    }
  });
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getPublicState() {
  return {
    type: 'state',
    phase: gameState.phase,
    round: gameState.round,
    colors: gameState.colors,
    players: Object.entries(gameState.players).map(([id, p]) => ({
      id,
      name: p.name,
      balance: p.balance,
      hasBet: !!gameState.bets[id],
      betColor: gameState.phase === 'result' ? (gameState.bets[id]?.color || null) : null,
    })),
    betCounts: (() => {
      const counts = {};
      gameState.colors.forEach(c => counts[c] = 0);
      Object.values(gameState.bets).forEach(b => {
        if (b && b.color) counts[b.color] = (counts[b.color] || 0) + 1;
      });
      return counts;
    })(),
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
    if (gameState.countdown <= 0) {
      clearInterval(countdownInterval);
      onEnd();
    }
  }, 1000);
}

wss.on('connection', (ws) => {
  ws.playerId = null;

  sendTo(ws, { type: 'welcome' });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'join': {
        const id = msg.id || ('p_' + Math.random().toString(36).slice(2, 8));
        ws.playerId = id;
        const isRejoining = !!gameState.players[id];

        if (msg.role === 'banker') {
          gameState.bankerConnected = true;
          ws.role = 'banker';
          gameState.players[id] = { name: 'Banker', balance: 999999, role: 'banker' };
          sendTo(ws, { type: 'joined', id, role: 'banker' });
        } else {
          ws.role = 'player';
          if (!isRejoining) {
            gameState.players[id] = { name: msg.name || 'Player', balance: 1000, role: 'player' };
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
        if (isNaN(amount) || amount < 10) return sendTo(ws, { type: 'error', msg: 'Minimum bet is 10.' });
        if (gameState.players[pid].balance < amount) return sendTo(ws, { type: 'error', msg: 'Not enough balance.' });

        gameState.players[pid].balance -= amount;
        gameState.bets[pid] = { color, amount };
        sendTo(ws, { type: 'betConfirmed', color, amount, balance: gameState.players[pid].balance });
        broadcast(getPublicState());
        break;
      }

      // BANKER ACTIONS
      case 'startBetting': {
        if (ws.role !== 'banker') return;
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

      case 'revealColor': {
        if (ws.role !== 'banker') return;
        clearInterval(countdownInterval);
        const winner = msg.color;
        if (!gameState.colors.includes(winner)) return;
        gameState.winningColor = winner;
        gameState.phase = 'reveal';

        // Calculate results
        const results = {};
        let totalPot = 0;
        let winnerCount = 0;
        Object.entries(gameState.bets).forEach(([pid, bet]) => {
          totalPot += bet.amount;
          if (bet.color === winner) winnerCount++;
        });

        Object.entries(gameState.bets).forEach(([pid, bet]) => {
          if (bet.color === winner) {
            const payout = winnerCount > 0 ? Math.floor((totalPot / winnerCount) * 0.9) : 0; // 10% house
            gameState.players[pid].balance += (bet.amount + payout);
            results[pid] = { won: true, payout: bet.amount + payout };
          } else {
            results[pid] = { won: false, payout: 0 };
          }
        });

        gameState.history.push({ round: gameState.round, winner, totalPot });

        broadcast({
          type: 'reveal',
          winningColor: winner,
          results,
          players: Object.entries(gameState.players).map(([id, p]) => ({ id, name: p.name, balance: p.balance })),
        });

        gameState.phase = 'result';
        broadcast(getPublicState());
        break;
      }

      case 'resetGame': {
        if (ws.role !== 'banker') return;
        clearInterval(countdownInterval);
        Object.keys(gameState.players).forEach(pid => {
          if (gameState.players[pid].role !== 'banker') {
            gameState.players[pid].balance = 1000;
          }
        });
        gameState.bets = {};
        gameState.phase = 'waiting';
        gameState.winningColor = null;
        broadcast({ type: 'reset' });
        broadcast(getPublicState());
        break;
      }

      case 'addBalance': {
        if (ws.role !== 'banker') return;
        const { targetId, amount } = msg;
        if (gameState.players[targetId]) {
          gameState.players[targetId].balance += amount;
          broadcast(getPublicState());
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (ws.role === 'banker') {
      gameState.bankerConnected = false;
    }
    // Keep player in state for rejoin
    broadcast(getPublicState());
  });
});

server.listen(PORT, () => {
  console.log(`🎮 Color Game server running on port ${PORT}`);
});
