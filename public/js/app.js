/**
 * Color Game — Client App
 * Handles all UI and Socket.io interactions
 */

const socket = io();

// ===== GAME COLORS CONFIG =====
const COLORS = [
  { name: 'Red',    bg: '#e74c3c', text: '#fff' },
  { name: 'Blue',   bg: '#3498db', text: '#fff' },
  { name: 'Green',  bg: '#2ecc71', text: '#fff' },
  { name: 'Yellow', bg: '#f1c40f', text: '#222' },
  { name: 'Orange', bg: '#e67e22', text: '#fff' },
  { name: 'Purple', bg: '#9b59b6', text: '#fff' },
];

// Helper: get color config by name
function getColor(name) {
  return COLORS.find(c => c.name === name) || { name, bg: '#555', text: '#fff' };
}

// ===== APP STATE =====
const State = {
  myName: '',
  isBanker: false,
  roomCode: '',
  roomState: null,
};

// ===== MAIN APP OBJECT =====
const App = {

  // --- Show join panel ---
  showJoin() {
    const p = document.getElementById('join-panel');
    p.style.display = p.style.display === 'none' ? 'flex' : 'none';
  },

  // --- Create Room (Banker) ---
  createRoom() {
    const name = document.getElementById('input-name').value.trim();
    if (!name) return showError('Please enter your name.');
    State.myName = name;
    State.isBanker = true;
    socket.emit('create_room', { name }, (res) => {
      if (!res.success) return showError(res.error || 'Error creating room.');
      State.roomCode = res.code;
      State.roomState = res.roomState;
      showScreen('screen-banker');
      renderBanker(res.roomState);
    });
  },

  // --- Join Room (Player) ---
  joinRoom() {
    const name = document.getElementById('input-name').value.trim();
    const code = document.getElementById('input-code').value.trim().toUpperCase();
    if (!name) return showError('Please enter your name.');
    if (code.length !== 4) return showError('Room code must be 4 characters.');
    State.myName = name;
    State.isBanker = false;
    State.roomCode = code;
    socket.emit('join_room', { name, code }, (res) => {
      if (!res.success) return showError(res.error || 'Could not join room.');
      State.roomState = res.roomState;
      showScreen('screen-player');
      renderPlayer(res.roomState);
    });
  },

  // --- Banker: Start Round ---
  startRound() {
    socket.emit('start_round', (res) => {
      if (res?.error) showToast('⚠️ ' + res.error);
    });
  },

  // --- Banker: Draw Result ---
  drawResult() {
    socket.emit('draw_result', (res) => {
      if (res?.error) showToast('Error: ' + res.error);
    });
  },

  // --- Banker: Reset ---
  resetRound() {
    socket.emit('reset_round');
  },

  // --- Banker: Kick player ---
  kickPlayer(playerId) {
    if (confirm('Kick this player?')) {
      socket.emit('kick_player', { playerId });
    }
  },

  // --- Player: Select color ---
  selectColor(colorName) {
    if (State.roomState?.phase !== 'betting') return;
    socket.emit('select_color', { color: colorName }, (res) => {
      if (res?.success) {
        // Update local selection immediately for responsiveness
        renderColorGrid(colorName);
        document.getElementById('color-pick-status').textContent = `✅ You picked ${colorName}!`;
        document.getElementById('color-pick-status').className = 'pick-status picked';
      }
    });
  }
};

// ===== SOCKET EVENTS =====

// Room state updated (player join/leave, color selection, etc.)
socket.on('room_updated', (roomState) => {
  State.roomState = roomState;
  if (State.isBanker) {
    renderBanker(roomState);
  } else {
    renderPlayer(roomState);
  }
});

// Round result announced
socket.on('round_result', ({ winningColor, winners, losers }) => {
  const color = getColor(winningColor);
  if (State.isBanker) {
    // Already handled in renderBanker
  } else {
    const isWinner = winners.includes(State.myName);
    const isLoser = losers.includes(State.myName);
    const resultArea = document.getElementById('player-result-area');
    resultArea.style.display = 'block';
    resultArea.className = `result-area ${isWinner ? 'result-win' : isLoser ? 'result-lose' : 'result-neutral'}`;

    if (isWinner) {
      resultArea.innerHTML = `
        <div class="result-label">🎉 YOU WON!</div>
        <div class="winning-color-badge" style="background:${color.bg};color:${color.text}">${winningColor}</div>
        <div style="color:#f5a623;font-weight:700;margin-top:8px;">+50 Credits</div>
      `;
      showToast('🎉 You won 50 credits!');
    } else if (isLoser) {
      resultArea.innerHTML = `
        <div class="result-label">😢 Wrong color</div>
        <div class="winning-color-badge" style="background:${color.bg};color:${color.text}">${winningColor}</div>
        <div style="color:#e74c3c;font-weight:700;margin-top:8px;">-20 Credits</div>
      `;
      showToast('😢 Wrong color! -20 credits');
    } else {
      resultArea.innerHTML = `
        <div class="result-label">Winning Color</div>
        <div class="winning-color-badge" style="background:${color.bg};color:${color.text}">${winningColor}</div>
        <div style="color:#8a8aaa;font-size:0.85rem;margin-top:6px;">You didn't pick this round</div>
      `;
    }
  }
});

// Banker left the room
socket.on('banker_left', () => {
  showToast('⚠️ The banker has left. Room closed.');
  setTimeout(() => location.reload(), 2500);
});

// This player was kicked
socket.on('kicked', () => {
  showToast('You were removed from the room.');
  setTimeout(() => location.reload(), 2500);
});

// ===== RENDER FUNCTIONS =====

function renderBanker(roomState) {
  document.getElementById('banker-name-display').textContent = State.myName;
  document.getElementById('room-code-display').textContent = roomState.code;
  document.getElementById('banker-round').textContent = roomState.round || '—';
  document.getElementById('banker-player-count').textContent = roomState.players.length;
  document.getElementById('banker-phase').textContent = capitalize(roomState.phase);

  // Buttons visibility based on phase
  const btnStart = document.getElementById('btn-start-round');
  const btnDraw = document.getElementById('btn-draw');
  const btnReset = document.getElementById('btn-reset');

  btnStart.style.display = roomState.phase === 'waiting' ? 'block' : 'none';
  btnDraw.style.display = roomState.phase === 'betting' ? 'block' : 'none';
  btnReset.style.display = roomState.phase === 'result' ? 'block' : 'none';

  // Winning color display
  const resultArea = document.getElementById('banker-result-area');
  if (roomState.winningColor) {
    const col = getColor(roomState.winningColor);
    resultArea.style.display = 'block';
    document.getElementById('banker-winning-color').textContent = roomState.winningColor;
    document.getElementById('banker-winning-color').style.background = col.bg;
    document.getElementById('banker-winning-color').style.color = col.text;
  } else {
    resultArea.style.display = 'none';
  }

  // Players list
  const list = document.getElementById('banker-players-list');
  if (roomState.players.length === 0) {
    list.innerHTML = '<p style="color:var(--text2);font-size:0.85rem;text-align:center;padding:12px;">Waiting for players to join...</p>';
  } else {
    list.innerHTML = roomState.players.map(p => {
      const col = p.selectedColor ? getColor(p.selectedColor) : null;
      const isWinner = roomState.winningColor && p.selectedColor === roomState.winningColor;
      const isLoser = roomState.winningColor && p.selectedColor && p.selectedColor !== roomState.winningColor;
      return `
        <div class="player-row ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}">
          <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
          <div class="player-info">
            <div class="player-name">${p.name} ${isWinner ? '🏆' : ''}</div>
            <div class="player-credits">💰 ${p.credits} credits</div>
          </div>
          <div class="player-color-dot ${!col ? 'empty' : ''}" 
               style="background:${col ? col.bg : ''}"
               title="${p.selectedColor || 'No pick'}"></div>
          <span class="player-status ${p.isReady ? 'ready' : ''}">
            ${p.isReady ? '✓ Ready' : 'Waiting'}
          </span>
          <button class="kick-btn" onclick="App.kickPlayer('${p.id}')">Kick</button>
        </div>
      `;
    }).join('');
  }

  // History
  renderHistory('banker-history', roomState.history);
}

function renderPlayer(roomState) {
  document.getElementById('player-name-display').textContent = State.myName;
  document.getElementById('player-room-code-display').textContent = roomState.code;
  document.getElementById('player-round').textContent = roomState.round || '—';
  document.getElementById('player-phase').textContent = capitalize(roomState.phase);

  // My credits
  const me = roomState.players.find(p => p.name === State.myName);
  if (me) {
    document.getElementById('player-credits').textContent = me.credits;
  }

  // Color picker
  const colorSection = document.getElementById('color-picker-section');
  const statusEl = document.getElementById('color-pick-status');

  if (roomState.phase === 'betting') {
    colorSection.style.opacity = '1';
    colorSection.style.pointerEvents = 'auto';
    renderColorGrid(me?.selectedColor);
    if (!me?.selectedColor) {
      statusEl.textContent = 'Choose a color before the banker draws!';
      statusEl.className = 'pick-status';
    } else {
      statusEl.textContent = `✅ You picked ${me.selectedColor}!`;
      statusEl.className = 'pick-status picked';
    }
  } else if (roomState.phase === 'result') {
    colorSection.style.opacity = '0.6';
    colorSection.style.pointerEvents = 'none';
    renderColorGrid(me?.selectedColor);
    statusEl.textContent = roomState.winningColor
      ? `Winning color: ${roomState.winningColor}`
      : '';
    statusEl.className = 'pick-status';
  } else {
    // Waiting phase
    colorSection.style.opacity = '0.5';
    colorSection.style.pointerEvents = 'none';
    renderColorGrid(null);
    statusEl.textContent = 'Waiting for banker to start the round...';
    statusEl.className = 'pick-status';
    // Hide result area
    document.getElementById('player-result-area').style.display = 'none';
  }

  // Players list
  const list = document.getElementById('player-players-list');
  list.innerHTML = roomState.players.map(p => {
    const col = p.selectedColor ? getColor(p.selectedColor) : null;
    const isWinner = roomState.winningColor && p.selectedColor === roomState.winningColor;
    const isLoser = roomState.winningColor && p.selectedColor && p.selectedColor !== roomState.winningColor;
    const isMe = p.name === State.myName;
    return `
      <div class="player-row ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''}">
        <div class="player-avatar">${p.name.charAt(0).toUpperCase()}</div>
        <div class="player-info">
          <div class="player-name">${p.name}${isMe ? ' (You)' : ''} ${isWinner ? '🏆' : ''}</div>
          <div class="player-credits">💰 ${p.credits} credits</div>
        </div>
        <!-- Only show color after result is revealed OR it's the current player's pick -->
        <div class="player-color-dot ${!col || (roomState.phase !== 'result' && !isMe) ? 'empty' : ''}" 
             style="background:${col && (roomState.phase === 'result' || isMe) ? col.bg : ''}"></div>
        <span class="player-status ${p.isReady ? 'ready' : ''}">
          ${p.isReady ? '✓ Ready' : 'Waiting'}
        </span>
      </div>
    `;
  }).join('');

  // History
  renderHistory('player-history', roomState.history);
}

// Render the color selection buttons
function renderColorGrid(selected) {
  const grid = document.getElementById('color-grid');
  grid.innerHTML = COLORS.map(c => `
    <button class="color-btn ${selected === c.name ? 'selected' : ''}"
            style="background:${c.bg};color:${c.text}"
            onclick="App.selectColor('${c.name}')">
      ${c.name}
    </button>
  `).join('');
}

// Render round history
function renderHistory(containerId, history) {
  const el = document.getElementById(containerId);
  if (!history || history.length === 0) {
    el.innerHTML = '<p class="no-history">No rounds played yet.</p>';
    return;
  }
  el.innerHTML = history.map(h => {
    const col = getColor(h.winningColor);
    return `
      <div class="history-row">
        <span class="history-round">Rd ${h.round}</span>
        <div class="history-dot" style="background:${col.bg}"></div>
        <div class="history-text">
          <strong>${h.winningColor}</strong>
          ${h.winners.length ? ` — 🏆 ${h.winners.join(', ')}` : ' — No winners'}
        </div>
      </div>
    `;
  }).join('');
}

// ===== UTILITY =====

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showError(msg) {
  document.getElementById('lobby-error').textContent = msg;
  setTimeout(() => {
    document.getElementById('lobby-error').textContent = '';
  }, 3000);
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Enter key support for join form
document.getElementById('input-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') App.joinRoom();
});
document.getElementById('input-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.getElementById('join-panel').style.display !== 'none') {
      App.joinRoom();
    }
  }
});
