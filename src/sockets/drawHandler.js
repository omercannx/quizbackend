const {
  joinDrawLobby,
  leaveDrawLobby,
  createDrawMatch,
  getDrawMatch,
  removeDrawMatch,
  getCurrentDrawer,
  getCurrentWord,
  checkGuess,
  drawLobbyTimers,
  DRAW_PLAYERS_REQUIRED,
  DRAW_ROUND_TIME_MS,
  DRAW_POINTS_CORRECT,
  DRAW_POINTS_DRAWER,
} = require('../game/drawMatchmaking');

function setupDrawHandlers(io, socket) {
  let currentUserId = null;
  let currentUsername = null;

  socket.on('draw_queue_join', ({ userId, username }) => {
    currentUserId = userId;
    currentUsername = username;
      if (!userId || !username) {
        socket.emit('draw_queue_error', { error: 'Geçersiz kullanıcı bilgisi' });
        return;
      }

      const playerData = { socketId: socket.id, userId, username };
      const result = joinDrawLobby(playerData);

      if (result.error) {
        socket.emit('draw_queue_error', { error: result.error });
        return;
      }

      if (result.started) {
        const match = createDrawMatch(result.players);
        for (const p of result.players) {
          if (p.socketId) {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.join(match.id);
          }
        }
        const playersPayload = result.players.map((p) => ({
          userId: p.userId,
          username: p.username,
        }));
        io.to(match.id).emit('draw_match_found', {
          matchId: match.id,
          players: playersPayload,
        });
        startDrawRound(io, match);
        return;
      }

      socket.emit('draw_queue_waiting', {
        message: `Çiz ve Bil lobisi (${result.count}/${DRAW_PLAYERS_REQUIRED})...`,
        count: result.count,
      });
    });

    socket.on('draw_queue_leave', () => {
      leaveDrawLobby(socket.id);
      socket.emit('draw_queue_left');
    });

    // Çizim stroke - sadece çizen oyuncu gönderir, sunucu broadcast eder
    socket.on('draw_stroke', ({ matchId, stroke }) => {
      const match = getDrawMatch(matchId);
      if (!match || match.status !== 'playing') return;
      const drawer = getCurrentDrawer(match);
      if (!drawer || drawer.socketId !== socket.id) return;

      match.strokes.push(stroke);
      socket.to(matchId).emit('draw_stroke', { stroke });
    });

    // Canvas temizleme
    socket.on('draw_clear', ({ matchId }) => {
      const match = getDrawMatch(matchId);
      if (!match || match.status !== 'playing') return;
      const drawer = getCurrentDrawer(match);
      if (!drawer || drawer.socketId !== socket.id) return;

      match.strokes = [];
      io.to(matchId).emit('draw_clear');
    });

    // Tahmin gönderme
  socket.on('draw_guess', ({ matchId, userId: guessUserId, username: guessUsername, text }) => {
    const uid = guessUserId || currentUserId;
    const uname = guessUsername || currentUsername;
    const match = getDrawMatch(matchId);
    if (!match || match.status !== 'playing') return;
    const drawer = getCurrentDrawer(match);
    if (!drawer || drawer.userId === uid) return;

    const word = getCurrentWord(match);
    const isCorrect = checkGuess(text, word);

    if (isCorrect) {
      match.guesses[uid] = { correct: true, text: (text || '').trim() };
      match.scores[uid] = (match.scores[uid] || 0) + DRAW_POINTS_CORRECT;
        match.scores[drawer.userId] = (match.scores[drawer.userId] || 0) + DRAW_POINTS_DRAWER;

      io.to(matchId).emit('draw_guess_correct', {
        userId: uid,
        username: uname,
          text: text.trim(),
          word,
          scores: match.scores,
        });
        if (match.roundTimer) {
          clearTimeout(match.roundTimer);
          match.roundTimer = null;
        }
      nextDrawRound(io, match);
    } else {
      io.to(matchId).emit('draw_guess_wrong', {
        userId: uid,
        username: uname,
        text: (text || '').trim().slice(0, 50),
      });
    }
  });

  socket.on('draw_leave_match', ({ matchId, userId: leaveUserId }) => {
    const match = getDrawMatch(matchId);
    if (!match) return;
    if (match.roundTimer) {
      clearTimeout(match.roundTimer);
      match.roundTimer = null;
    }
    socket.leave(matchId);
    match.status = 'finished';
    io.to(matchId).emit('draw_player_left', { userId: leaveUserId, username: currentUsername });
    removeDrawMatch(matchId);
  });
}

function startDrawRound(io, match) {
  const drawer = getCurrentDrawer(match);
  const word = getCurrentWord(match);

  match.strokes = [];
  match.guesses = {};
  match.roundStartTime = Date.now();

  match.roundTimer = setTimeout(() => {
    match.roundTimer = null;
    nextDrawRound(io, match);
  }, DRAW_ROUND_TIME_MS);

  const hint = word.split('').map((c, i) => (i === 0 ? c : c === ' ' ? ' ' : '_')).join('');
  const roundPayload = {
    drawerId: drawer.userId,
    drawerUsername: drawer.username,
    wordLength: word.length,
    roundTime: Math.floor(DRAW_ROUND_TIME_MS / 1000),
    hint,
  };

  io.to(match.id).emit('draw_round_start', roundPayload);
  io.to(drawer.socketId).emit('draw_your_word', { word });
}

function nextDrawRound(io, match) {
  if (match.roundTimer) {
    clearTimeout(match.roundTimer);
    match.roundTimer = null;
  }

  match.currentWordIndex++;
  if (match.currentWordIndex >= match.words.length) {
    match.currentDrawerIndex++;
    match.currentWordIndex = 0;
  }

  if (match.currentDrawerIndex >= match.playerOrder.length) {
    endDrawGame(io, match);
    return;
  }

  setTimeout(() => startDrawRound(io, match), 2000);
}

function endDrawGame(io, match) {
  if (match.roundTimer) {
    clearTimeout(match.roundTimer);
    match.roundTimer = null;
  }
  match.status = 'finished';

  const leaderboard = Object.entries(match.scores)
    .map(([userId, score]) => ({
      userId,
      username: match.players[userId]?.username || 'Bilinmiyor',
      score,
    }))
    .sort((a, b) => b.score - a.score);

  const winnerId = leaderboard[0]?.userId || null;

  io.to(match.id).emit('draw_game_finished', {
    matchId: match.id,
    scores: match.scores,
    leaderboard,
    winnerId,
  });

  setTimeout(() => removeDrawMatch(match.id), 15000);
}

module.exports = { setupDrawHandlers };
