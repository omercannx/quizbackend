const {
  joinDrawLobby,
  leaveDrawLobby,
  takeDrawLobbyForStart,
  createDrawMatch,
  getDrawMatch,
  removeDrawMatch,
  removePlayerFromMatch,
  getCurrentDrawer,
  getCurrentWord,
  checkGuess,
  drawLobbyTimers,
  DRAW_MIN_PLAYERS,
  DRAW_LOBBY_WAIT_MS,
  DRAW_ROUND_TIME_MS,
  DRAW_POINTS_CORRECT,
  DRAW_POINTS_DRAWER,
} = require('../game/drawMatchmaking');

const DRAW_KICK_VOTE_COOLDOWN_MS = 30000;
const DRAW_KICK_VOTE_TIMEOUT_MS = 30000;
const DRAW_KICK_MIN_YES = 3;
const UserModel = require('../models/User');

const drawPrivateLobbyMap = new Map();

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

      if (result.canStart) {
        const key = result.key;
        const prev = drawLobbyTimers.get(key);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
          drawLobbyTimers.delete(key);
          const players = takeDrawLobbyForStart(key);
          if (!players || players.length === 0) return;
          const match = createDrawMatch(players);
          for (const p of players) {
            if (p.socketId) {
              const s = io.sockets.sockets.get(p.socketId);
              if (s) s.join(match.id);
            }
          }
          const realIds = players.filter((p) => !p.userId?.startsWith('bot_')).map((p) => p.userId);
          const avatarResults = await Promise.all(
            realIds.map((uid) => UserModel.findOne({ where: { oduserId: uid }, attributes: ['avatar'] }))
          );
          const avatarMap = {};
          realIds.forEach((uid, i) => { avatarMap[uid] = avatarResults[i]?.avatar || null; });
          const playersPayload = players.map((p) => ({
            userId: p.userId,
            username: p.username,
            avatar: p.userId?.startsWith('bot_') ? null : (avatarMap[p.userId] || null),
          }));
          io.to(match.id).emit('draw_match_found', { matchId: match.id, players: playersPayload });
          startDrawRound(io, match, playersPayload);
        }, DRAW_LOBBY_WAIT_MS);
        drawLobbyTimers.set(key, t);
      }

      socket.emit('draw_queue_waiting', {
        message: result.count >= DRAW_MIN_PLAYERS
          ? `Başlamak için ${DRAW_LOBBY_WAIT_MS / 1000} saniye bekleniyor (${result.count} oyuncu)...`
          : `Oyuncu bekleniyor (${result.count}/${DRAW_MIN_PLAYERS})...`,
        count: result.count,
      });
    });

    socket.on('draw_queue_leave', () => {
      const r = leaveDrawLobby(socket.id);
      if (r && r.remainingCount !== undefined && r.remainingCount < DRAW_MIN_PLAYERS) {
        const prev = drawLobbyTimers.get(r.key);
        if (prev) { clearTimeout(prev); drawLobbyTimers.delete(r.key); }
      }
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

    // Tahmin gönderme + gelişmiş skor sistemi
  socket.on('draw_guess', ({ matchId, userId: guessUserId, username: guessUsername, text }) => {
    const uid = guessUserId || currentUserId;
    const uname = guessUsername || currentUsername;
    const match = getDrawMatch(matchId);
    if (!match || match.status !== 'playing') return;
    const drawer = getCurrentDrawer(match);
    if (!drawer || drawer.userId === uid) return;

    const now = Date.now();

    // Spam / flood koruması
    if (!match.spamHistory[uid]) match.spamHistory[uid] = [];
    if (!match.spamMutedUntil[uid]) match.spamMutedUntil[uid] = 0;

    if (now < match.spamMutedUntil[uid]) {
      socket.emit('draw_guess_blocked', { reason: 'Çok hızlı tahmin, birkaç saniye bekle.' });
      return;
    }

    const word = getCurrentWord(match);
    const isCorrect = checkGuess(text, word);

    if (isCorrect) {
      match.guesses[uid] = { correct: true, text: (text || '').trim() };

      // --- Zaman bonusu ---
      const elapsedMs = match.roundStartTime ? now - match.roundStartTime : DRAW_ROUND_TIME_MS;
      let timeBonus = 0;
      if (elapsedMs <= 5000) {
        timeBonus = 50;
      } else if (elapsedMs <= 15000) {
        timeBonus = 30;
      } else if (elapsedMs <= 30000) {
        timeBonus = 10;
      }

      // --- Zorluk çarpanı (kelime uzunluğuna göre yaklaşık) ---
      const cleanWord = (word || '').replace(/\s+/g, '');
      const len = cleanWord.length;
      let difficulty = 'easy';
      let difficultyMultiplier = 1;
      if (len >= 10) {
        difficulty = 'hard';
        difficultyMultiplier = 1.6;
      } else if (len >= 6) {
        difficulty = 'medium';
        difficultyMultiplier = 1.3;
      }

      // --- Seri (streak) çarpanı ---
      const prevStreak = match.streaks[uid] || 0;
      const newStreak = prevStreak + 1;
      match.streaks[uid] = newStreak;
      const prevMax = match.maxStreaks[uid] || 0;
      if (newStreak > prevMax) match.maxStreaks[uid] = newStreak;

      let streakMultiplier = 1;
      if (newStreak >= 5) streakMultiplier = 2;
      else if (newStreak >= 3) streakMultiplier = 1.5;
      else if (newStreak >= 2) streakMultiplier = 1.2;

      const baseGuessPoints = DRAW_POINTS_CORRECT;
      const baseDrawerPoints = DRAW_POINTS_DRAWER;

      const rawGuessPoints = baseGuessPoints + timeBonus;
      const finalGuessPoints = Math.round(rawGuessPoints * streakMultiplier * difficultyMultiplier);
      const finalDrawerPoints = Math.round(baseDrawerPoints * difficultyMultiplier);

      match.scores[uid] = (match.scores[uid] || 0) + finalGuessPoints;
      match.scores[drawer.userId] = (match.scores[drawer.userId] || 0) + finalDrawerPoints;

      // En hızlı bilen istatistiği
      if (!match.fastestGuess || elapsedMs < match.fastestGuess.ms) {
        match.fastestGuess = {
          userId: uid,
          username: uname,
          ms: elapsedMs,
          word,
        };
      }

      io.to(matchId).emit('draw_guess_correct', {
        userId: uid,
        username: uname,
        text: text.trim(),
        word,
        scores: match.scores,
        meta: {
          timeMs: elapsedMs,
          timeBonus,
          streak: newStreak,
          streakMultiplier,
          difficulty,
          difficultyMultiplier,
          gained: {
            guesser: finalGuessPoints,
            drawer: finalDrawerPoints,
          },
        },
      });

      if (match.roundTimer) {
        clearTimeout(match.roundTimer);
        match.roundTimer = null;
      }
      nextDrawRound(io, match);
    } else {
      // Yanlış tahminde seri sıfırlama
      match.streaks[uid] = 0;

      // Spam takibi: son 5 saniyedeki tahmin sayısına göre ceza
      const history = match.spamHistory[uid];
      history.push(now);
      const windowMs = 5000;
      const minGapMs = 300; // çok sık arka arkaya
      // Eski kayıtları temizle
      while (history.length && now - history[0] > windowMs) {
        history.shift();
      }
      const tooManyGuesses = history.length >= 8;
      const recentFastGuesses = history.slice(-3).every((t, idx, arr) =>
        idx === 0 ? true : t - arr[idx - 1] < minGapMs
      );

      let penalty = 0;
      let mutedMs = 0;
      if (tooManyGuesses || recentFastGuesses) {
        penalty = 5;
        mutedMs = 3000;
        match.scores[uid] = (match.scores[uid] || 0) - penalty;
        match.spamMutedUntil[uid] = now + mutedMs;
      }

      io.to(matchId).emit('draw_guess_wrong', {
        userId: uid,
        username: uname,
        text: (text || '').trim().slice(0, 50),
        penalty,
        mutedMs,
      });
    }
  });

  socket.on('draw_leave_match', ({ matchId, userId: leaveUserId }) => {
    const match = getDrawMatch(matchId);
    if (!match) return;
    const result = removePlayerFromMatch(matchId, leaveUserId || currentUserId);
    if (!result) return;

    socket.leave(matchId);
    io.to(matchId).emit('draw_player_left', {
      userId: leaveUserId || currentUserId,
      username: currentUsername,
      kicked: false,
      remainingCount: result.remainingCount,
    });

    if (result.remainingCount <= 2) {
      endDrawGame(io, match);
      return;
    }

    const drawer = getCurrentDrawer(match);
    const drawerLeft = !drawer || drawer.userId === (leaveUserId || currentUserId);
    if (drawerLeft && match.roundTimer) {
      clearTimeout(match.roundTimer);
      match.roundTimer = null;
      nextDrawRound(io, match);
    } else {
      const playersPayload = match.playerOrder.map((uid) => {
        const p = match.players[uid];
        const cached = match.playersPayload?.find((x) => x.userId === uid);
        return { userId: uid, username: p?.username || '?', avatar: cached?.avatar };
      });
      match.playersPayload = playersPayload;
      io.to(matchId).emit('draw_players_updated', { players: playersPayload });
    }
  });

  socket.on('draw_kick_vote_start', ({ matchId, targetUserId }) => {
    const match = getDrawMatch(matchId);
    if (!match || match.status !== 'playing') return;
    if (!match.players[targetUserId] || targetUserId === currentUserId) return;

    const now = Date.now();
    const lastVote = match.lastKickVoteTime || 0;
    if (now - lastVote < DRAW_KICK_VOTE_COOLDOWN_MS) {
      const waitSec = Math.ceil((DRAW_KICK_VOTE_COOLDOWN_MS - (now - lastVote)) / 1000);
      socket.emit('draw_kick_vote_error', { error: `Oylama ${waitSec} saniye sonra başlatılabilir` });
      return;
    }
    if (match.kickVote) {
      socket.emit('draw_kick_vote_error', { error: 'Zaten devam eden bir oylama var' });
      return;
    }

    match.lastKickVoteTime = now;
    match.kickVote = {
      targetUserId,
      targetUsername: match.players[targetUserId]?.username || 'Bilinmiyor',
      initiatorUserId: currentUserId,
      initiatorUsername: currentUsername || 'Bilinmiyor',
      votes: {},
      startTime: now,
    };

    if (match.kickVoteTimer) clearTimeout(match.kickVoteTimer);
    match.kickVoteTimer = setTimeout(() => {
      match.kickVoteTimer = null;
      if (!match.kickVote) return;
      const v = match.kickVote;
      match.kickVote = null;
      io.to(matchId).emit('draw_kick_vote_ended', {
        targetUserId: v.targetUserId,
        targetUsername: v.targetUsername,
        kicked: false,
        votes: v.votes,
      });
    }, DRAW_KICK_VOTE_TIMEOUT_MS);

    io.to(matchId).emit('draw_kick_vote_started', {
      targetUserId: match.kickVote.targetUserId,
      targetUsername: match.kickVote.targetUsername,
      initiatorUserId: match.kickVote.initiatorUserId,
      initiatorUsername: match.kickVote.initiatorUsername,
      votes: {},
      expiresAt: now + DRAW_KICK_VOTE_TIMEOUT_MS,
    });
  });

  socket.on('draw_kick_vote', ({ matchId, vote }) => {
    const match = getDrawMatch(matchId);
    if (!match || !match.kickVote || (vote !== 'yes' && vote !== 'no')) return;
    if (match.kickVote.targetUserId === currentUserId) return;

    match.kickVote.votes[currentUserId] = vote;
    const votes = match.kickVote.votes;
    const yesCount = Object.values(votes).filter((v) => v === 'yes').length;

    io.to(matchId).emit('draw_kick_vote_updated', {
      targetUserId: match.kickVote.targetUserId,
      votes,
      yesCount,
    });

    if (yesCount >= DRAW_KICK_MIN_YES) {
      if (match.kickVoteTimer) {
        clearTimeout(match.kickVoteTimer);
        match.kickVoteTimer = null;
      }
      const targetUserId = match.kickVote.targetUserId;
      const targetUsername = match.kickVote.targetUsername;
      const targetSocketId = match.players[targetUserId]?.socketId;
      match.kickVote = null;

      const result = removePlayerFromMatch(matchId, targetUserId);
      if (!result) return;

      const kickedSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
      if (kickedSocket) {
        kickedSocket.leave(matchId);
        kickedSocket.emit('draw_kicked', { matchId });
      }

      io.to(matchId).emit('draw_player_left', {
        userId: targetUserId,
        username: targetUsername,
        kicked: true,
        remainingCount: result.remainingCount,
      });

      io.to(matchId).emit('draw_kick_vote_ended', {
        targetUserId,
        targetUsername,
        kicked: true,
        votes,
      });

      if (result.remainingCount <= 2) {
        endDrawGame(io, match);
      } else {
        const drawer = getCurrentDrawer(match);
        const drawerKicked = drawer?.userId === targetUserId;
        if (drawerKicked && match.roundTimer) {
          clearTimeout(match.roundTimer);
          match.roundTimer = null;
          nextDrawRound(io, match);
        } else {
          const playersPayload = match.playerOrder.map((uid) => {
            const p = match.players[uid];
            const cached = match.playersPayload?.find((x) => x.userId === uid);
            return { userId: uid, username: p?.username || '?', avatar: cached?.avatar };
          });
          match.playersPayload = playersPayload;
          io.to(matchId).emit('draw_players_updated', { players: playersPayload });
        }
      }
    }
  });

  // === Özel Oda (Private Room) ===

  socket.on('draw_create_private', ({ userId, username }) => {
    currentUserId = userId;
    currentUsername = username;
    if (!userId || !username) {
      socket.emit('draw_private_error', { error: 'Geçersiz kullanıcı bilgisi' });
      return;
    }

    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    drawPrivateLobbyMap.set(code, {
      host: { socketId: socket.id, userId, username },
      players: [{ socketId: socket.id, userId, username }],
      createdAt: Date.now(),
    });

    socket.join(`draw_private_${code}`);
    socket.emit('draw_private_created', {
      code,
      players: [{ userId, username }],
    });
    console.log('[Draw] Private room created:', code, 'by', username);
  });

  socket.on('draw_join_private', ({ userId, username, code }) => {
    currentUserId = userId;
    currentUsername = username;
    const lobby = drawPrivateLobbyMap.get(code);
    if (!lobby) {
      socket.emit('draw_private_error', { error: 'Oda bulunamadı' });
      return;
    }
    if (lobby.players.length >= 10) {
      socket.emit('draw_private_error', { error: 'Oda dolu' });
      return;
    }

    const already = lobby.players.find((p) => p.userId === userId);
    if (!already) {
      lobby.players.push({ socketId: socket.id, userId, username });
    } else {
      already.socketId = socket.id;
    }

    socket.join(`draw_private_${code}`);
    io.to(`draw_private_${code}`).emit('draw_private_update', {
      code,
      players: lobby.players.map((p) => ({ userId: p.userId, username: p.username })),
    });
    console.log('[Draw] Player joined private room:', code, username);
  });

  socket.on('draw_start_private', ({ code }) => {
    const lobby = drawPrivateLobbyMap.get(code);
    if (!lobby) return;
    if (lobby.host.userId !== currentUserId) {
      socket.emit('draw_private_error', { error: 'Sadece oda sahibi başlatabilir' });
      return;
    }
    if (lobby.players.length < 2) {
      socket.emit('draw_private_error', { error: 'En az 2 oyuncu gerekli' });
      return;
    }

    const match = createDrawMatch(lobby.players);
    for (const p of lobby.players) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.join(match.id);
    }

    const playersPayload = lobby.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: null,
    }));

    io.to(`draw_private_${code}`).emit('draw_match_found', {
      matchId: match.id,
      players: playersPayload,
    });

    setTimeout(() => {
      startDrawRound(io, match, playersPayload);
    }, 3000);

    drawPrivateLobbyMap.delete(code);
    console.log('[Draw] Private match started:', match.id, 'players:', lobby.players.length);
  });

  socket.on('draw_leave_private', ({ code }) => {
    const lobby = drawPrivateLobbyMap.get(code);
    if (!lobby) return;

    socket.leave(`draw_private_${code}`);
    lobby.players = lobby.players.filter((p) => p.socketId !== socket.id);

    if (lobby.players.length === 0) {
      drawPrivateLobbyMap.delete(code);
      return;
    }

    // Eğer host çıktıysa, yeni host ata
    if (lobby.host.socketId === socket.id && lobby.players.length > 0) {
      lobby.host = lobby.players[0];
    }

    io.to(`draw_private_${code}`).emit('draw_private_update', {
      code,
      players: lobby.players.map((p) => ({ userId: p.userId, username: p.username })),
    });
  });
}

function startDrawRound(io, match, playersPayload) {
  const drawer = getCurrentDrawer(match);
  const word = getCurrentWord(match);

  match.strokes = [];
  match.guesses = {};
  match.roundStartTime = Date.now();

  match.roundTimer = setTimeout(() => {
    match.roundTimer = null;

    // Kimse bilemediyse çizen için küçük ceza
    const drawerId = drawer.userId;
    const anyCorrect = Object.values(match.guesses || {}).some((g) => g.correct);
    if (!anyCorrect && drawerId) {
      match.scores[drawerId] = (match.scores[drawerId] || 0) - 10;
      io.to(match.id).emit('draw_round_timeout', {
        drawerId,
        drawerUsername: drawer.username,
        word,
        penalty: 10,
        scores: match.scores,
      });
    }

    nextDrawRound(io, match);
  }, DRAW_ROUND_TIME_MS);

  const hint = word.split('').map((c, i) => (i === 0 ? c : c === ' ' ? ' ' : '_')).join('');
  const roundPayload = {
    drawerId: drawer.userId,
    drawerUsername: drawer.username,
    wordLength: word.length,
    roundTime: Math.floor(DRAW_ROUND_TIME_MS / 1000),
    hint,
    players: playersPayload || match.playersPayload,
  };
  if (playersPayload) match.playersPayload = playersPayload;

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

  setTimeout(() => startDrawRound(io, match, match.playersPayload), 2000);
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

  // Ek istatistikler: en uzun seri, en hızlı bilen
  let bestStreakUser = null;
  let bestStreakValue = 0;
  for (const [uid, value] of Object.entries(match.maxStreaks || {})) {
    if (value > bestStreakValue) {
      bestStreakValue = value;
      bestStreakUser = uid;
    }
  }

  const fastestGuess = match.fastestGuess || null;

  io.to(match.id).emit('draw_game_finished', {
    matchId: match.id,
    scores: match.scores,
    leaderboard,
    winnerId,
    stats: {
      bestStreak: bestStreakUser
        ? {
            userId: bestStreakUser,
            username: match.players[bestStreakUser]?.username || 'Bilinmiyor',
            value: bestStreakValue,
          }
        : null,
      fastestGuess: fastestGuess
        ? {
            userId: fastestGuess.userId,
            username: fastestGuess.username,
            timeMs: fastestGuess.ms,
            word: fastestGuess.word,
          }
        : null,
    },
  });

  setTimeout(() => removeDrawMatch(match.id), 15000);
}

module.exports = { setupDrawHandlers };
