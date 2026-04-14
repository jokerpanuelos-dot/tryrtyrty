/**
 * Color Game with Banker - Server
 * Real-time multiplayer game using Socket.io
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// --- In-Memory Game State ---
// rooms: { [roomCode]: { banker, players, round, phase, winningColor, history } }
const rooms = {};

// Generate a random 4-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms[code] ? generateRoomCode() : code; // ensure unique
}

// Get a sanitized room state to broadcast to clients
function getRoomState(room) {
  return {
    code: room.code,
    round: room.round,
    phase: room.phase, // 'waiting' | 'betting' | 'result'
    winningColor: room.winningColor,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      selectedColor: p.selectedColor,
      isReady: p.isReady
    })),
    history: room.history
  };
}

// --- Socket.io Events ---
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // === CREATE ROOM (Banker) ===
  socket.on('create_room', ({ name }, callback) => {
    const code = generateRoomCode();
    rooms[code] = {
      code,
      banker: { id: socket.id, name },
      players: [],
      round: 0,
      phase: 'waiting',
      winningColor: null,
      history: []
    };
    socket.join(code);
    socket.roomCode = code;
    socket.isBanker = true;
    console.log(`[Room] ${code} created by banker: ${name}`);
    callback({ success: true, code, roomState: getRoomState(rooms[code]) });
  });

  // === JOIN ROOM (Player) ===
  socket.on('join_room', ({ name, code }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: 'Room not found.' });
    if (room.phase !== 'waiting') return callback({ success: false, error: 'Game already in progress.' });
    if (room.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
      return callback({ success: false, error: 'Name already taken in this room.' });
    }

    const player = {
      id: socket.id,
      name,
      credits: 100, // starting credits
      selectedColor: null,
      isReady: false
    };

    room.players.push(player);
    socket.join(code);
    socket.roomCode = code;
    socket.isBanker = false;

    console.log(`[Room] ${code} - ${name} joined`);
    io.to(code).emit('room_updated', getRoomState(room));
    callback({ success: true, roomState: getRoomState(room) });
  });

  // === BANKER: START ROUND ===
  socket.on('start_round', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room || !socket.isBanker) return;
    if (room.players.length === 0) return callback?.({ error: 'No players in room.' });

    room.round += 1;
    room.phase = 'betting';
    room.winningColor = null;

    // Reset player selections for new round
    room.players.forEach(p => {
      p.selectedColor = null;
      p.isReady = false;
    });

    console.log(`[Room] ${room.code} - Round ${room.round} started`);
    io.to(room.code).emit('room_updated', getRoomState(room));
    callback?.({ success: true });
  });

  // === PLAYER: SELECT COLOR ===
  socket.on('select_color', ({ color }, callback) => {
    const room = rooms[socket.roomCode];
    if (!room || room.phase !== 'betting') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    player.selectedColor = color;
    player.isReady = true;

    console.log(`[Room] ${room.code} - ${player.name} selected ${color}`);
    io.to(room.code).emit('room_updated', getRoomState(room));
    callback?.({ success: true });
  });

  // === BANKER: DRAW RESULT ===
  socket.on('draw_result', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room || !socket.isBanker || room.phase !== 'betting') return;

    const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple'];
    const winning = colors[Math.floor(Math.random() * colors.length)];
    room.winningColor = winning;
    room.phase = 'result';

    // Calculate winnings
    const winners = [];
    const losers = [];
    room.players.forEach(p => {
      if (p.selectedColor === winning) {
        p.credits += 50; // win amount
        winners.push(p.name);
      } else if (p.selectedColor) {
        p.credits -= 20; // lose amount
        p.credits = Math.max(0, p.credits); // floor at 0
        losers.push(p.name);
      }
    });

    // Save to history
    room.history.unshift({
      round: room.round,
      winningColor: winning,
      winners,
      losers
    });
    if (room.history.length > 10) room.history.pop(); // keep last 10

    console.log(`[Room] ${room.code} - Round ${room.round} result: ${winning}`);
    io.to(room.code).emit('room_updated', getRoomState(room));
    io.to(room.code).emit('round_result', {
      winningColor: winning,
      winners,
      losers
    });
    callback?.({ success: true, winningColor: winning });
  });

  // === BANKER: RESET ROUND (back to waiting) ===
  socket.on('reset_round', () => {
    const room = rooms[socket.roomCode];
    if (!room || !socket.isBanker) return;

    room.phase = 'waiting';
    room.winningColor = null;
    room.players.forEach(p => {
      p.selectedColor = null;
      p.isReady = false;
    });

    io.to(room.code).emit('room_updated', getRoomState(room));
  });

  // === BANKER: KICK PLAYER ===
  socket.on('kick_player', ({ playerId }) => {
    const room = rooms[socket.roomCode];
    if (!room || !socket.isBanker) return;

    room.players = room.players.filter(p => p.id !== playerId);
    io.to(playerId).emit('kicked');
    io.to(room.code).emit('room_updated', getRoomState(room));
  });

  // === DISCONNECT ===
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const room = rooms[code];

    if (socket.isBanker) {
      // Banker left - notify all players and close room
      io.to(code).emit('banker_left');
      delete rooms[code];
    } else {
      // Player left
      room.players = room.players.filter(p => p.id !== socket.id);
      io.to(code).emit('room_updated', getRoomState(room));
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Color Game Server running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-local-ip>:${PORT}\n`);
});
