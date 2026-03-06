const {
  joinFlappyLobby,
  leaveFlappyLobby,
  takeFlappyLobbyForStart,
  createFlappyMatch,
  getFlappyMatch,
  removeFlappyMatch,
  flappyLobbyTimers,
  FLAPPY_MIN_PLAYERS,
  FLAPPY_MAX_PLAYERS,
  FLAPPY_LOBBY_WAIT_MS,
} = require('../game/flappyMatchmaking');
const UserModel = require('../models/User');
const { FlappyMatch, FlappyScore, FlappyUser, FlappyQuest } = require('../models/flappy');
const { DAILY_QUEST_POOL } = require('../routes/flappy');

const privateLobbyMap = new Map();

function setupFlappyHandlers(io, socket) {
  let currentUserId = null;
  let currentUsername = null;

  socket.on('flappy_queue_join', async ({ userId, username }) => {
    currentUserId = userId;
    currentUsername = username;
    if (!userId || !username) {
      socket.emit('flappy_queue_error', { error: 'Geçersiz kullanıcı bilgisi' });
      return;
    }

    const playerData = { socketId: socket.id, userId, username };
    const result = joinFlappyLobby(playerData);

    if (result.error) {
      socket.emit('flappy_queue_error', { error: result.error });
      return;
    }

    if (result.canStart) {
      const key = result.key;
      const prev = flappyLobbyTimers.get(key);
      if (prev) clearTimeout(prev);
      const t = setTimeout(async () => {
        flappyLobbyTimers.delete(key);
        const players = takeFlappyLobbyForStart(key);
        if (!players || players.length === 0) return;
        const match = createFlappyMatch(players);
        for (const p of players) {
          if (p.socketId) {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.join(match.id);
          }
        }
        let playersPayload = players.map((p) => ({ userId: p.userId, username: p.username, avatar: null }));
        try {
          const realIds = players.filter((p) => !p.userId?.startsWith('bot_')).map((p) => p.userId);
          if (realIds.length > 0 && UserModel) {
            const avatarResults = await Promise.all(
              realIds.map((uid) => UserModel.findOne({ where: { oduserId: uid }, attributes: ['avatar'] }).catch(() => null))
            );
            const avatarMap = {};
            realIds.forEach((uid, i) => { avatarMap[uid] = avatarResults[i]?.avatar || null; });
            playersPayload = players.map((p) => ({
              userId: p.userId,
              username: p.username,
              avatar: p.userId?.startsWith('bot_') ? null : (avatarMap[p.userId] || null),
            }));
          }
        } catch (e) {
          console.error('[Flappy] Avatar fetch error:', e?.message);
        }
        console.log('[Flappy] Match started:', match.id, 'players:', players.length);
        const startAt = Date.now() + 3000;
        io.to(match.id).emit('flappy_match_found', {
          matchId: match.id,
          seed: match.seed,
          players: playersPayload,
          startAt,
        });
        setTimeout(() => {
          io.to(match.id).emit('flappy_game_start', { matchId: match.id });
        }, 3000);
      }, FLAPPY_LOBBY_WAIT_MS);
      flappyLobbyTimers.set(key, t);
    }

    socket.emit('flappy_queue_waiting', {
      message: result.count >= FLAPPY_MIN_PLAYERS
        ? `Başlamak için ${FLAPPY_LOBBY_WAIT_MS / 1000} saniye bekleniyor (${result.count} oyuncu)...`
        : `Oyuncu bekleniyor (${result.count}/${FLAPPY_MAX_PLAYERS})...`,
      count: result.count,
    });
  });

  socket.on('flappy_queue_leave', () => {
    const r = leaveFlappyLobby(socket.id);
    if (r && r.remainingCount !== undefined && r.remainingCount < FLAPPY_MIN_PLAYERS) {
      const prev = flappyLobbyTimers.get(r.key);
      if (prev) { clearTimeout(prev); flappyLobbyTimers.delete(r.key); }
    }
    socket.emit('flappy_queue_left');
  });

  // Power-up kullanımı
  socket.on('flappy_use_powerup', async ({ matchId, powerupKey }) => {
    const match = getFlappyMatch(matchId);
    if (!match || match.status !== 'playing') return;
    if (!match.alive[currentUserId]) return;

    const fieldMap = { shield: 'shieldCount', slow: 'slowCount', magnet: 'magnetCount', double: 'doubleCount' };
    const field = fieldMap[powerupKey];
    if (!field) return;

    try {
      const user = await FlappyUser.findByPk(currentUserId);
      if (!user || (user[field] || 0) <= 0) {
        socket.emit('flappy_powerup_error', { error: 'Power-up yok' });
        return;
      }
      user[field] -= 1;
      await user.save();

      if (!match.activePowerups) match.activePowerups = {};
      if (!match.activePowerups[currentUserId]) match.activePowerups[currentUserId] = [];
      match.activePowerups[currentUserId].push(powerupKey);

      socket.emit('flappy_powerup_activated', { powerupKey, remaining: user[field] });
      socket.to(matchId).emit('flappy_opponent_powerup', { userId: currentUserId, powerupKey });
    } catch (e) {
      console.error('[Flappy] Powerup error:', e?.message);
    }
  });

  socket.on('flappy_score', ({ matchId, score }) => {
    const match = getFlappyMatch(matchId);
    if (!match || match.status !== 'playing') return;
    if (!match.players[currentUserId] || !match.alive[currentUserId]) return;
    const prev = match.scores[currentUserId] || 0;
    if (typeof score !== 'number' || score < prev) return;
    match.scores[currentUserId] = score;
    socket.to(matchId).emit('flappy_score_update', { userId: currentUserId, username: currentUsername, score });
  });

  socket.on('flappy_died', ({ matchId }) => {
    const match = getFlappyMatch(matchId);
    if (!match || match.status !== 'playing') return;
    if (!match.players[currentUserId]) return;
    match.alive[currentUserId] = false;
    const aliveCount = Object.values(match.alive).filter(Boolean).length;
    io.to(matchId).emit('flappy_player_died', {
      userId: currentUserId,
      username: currentUsername,
      score: match.scores[currentUserId] || 0,
      aliveCount,
    });
    if (aliveCount <= 1) {
      finishMatch(io, match);
    }
  });

  socket.on('flappy_leave_match', ({ matchId }) => {
    const match = getFlappyMatch(matchId);
    if (!match) return;
    socket.leave(matchId);
    if (match.players[currentUserId]) {
      match.alive[currentUserId] = false;
      const aliveCount = Object.values(match.alive).filter(Boolean).length;
      io.to(matchId).emit('flappy_player_died', {
        userId: currentUserId,
        username: currentUsername,
        score: match.scores[currentUserId] || 0,
        aliveCount,
      });
      if (aliveCount <= 1) {
        finishMatch(io, match);
      }
    }
  });

  // Arkadaşlarla oyna - özel lobi
  socket.on('flappy_create_private', ({ userId, username }) => {
    currentUserId = userId;
    currentUsername = username;
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    privateLobbyMap.set(code, { host: { socketId: socket.id, userId, username }, players: [{ socketId: socket.id, userId, username }] });
    socket.join(`private_${code}`);
    socket.emit('flappy_private_created', { code });
  });

  socket.on('flappy_join_private', ({ userId, username, code }) => {
    currentUserId = userId;
    currentUsername = username;
    const lobby = privateLobbyMap.get(code);
    if (!lobby) {
      socket.emit('flappy_private_error', { error: 'Lobi bulunamadı' });
      return;
    }
    if (lobby.players.length >= 10) {
      socket.emit('flappy_private_error', { error: 'Lobi dolu' });
      return;
    }
    lobby.players.push({ socketId: socket.id, userId, username });
    socket.join(`private_${code}`);
    io.to(`private_${code}`).emit('flappy_private_update', {
      players: lobby.players.map((p) => ({ userId: p.userId, username: p.username })),
      code,
    });
  });

  socket.on('flappy_start_private', ({ code }) => {
    const lobby = privateLobbyMap.get(code);
    if (!lobby) return;
    if (lobby.host.userId !== currentUserId) return;
    if (lobby.players.length < 1) return;

    const match = createFlappyMatch(lobby.players);
    for (const p of lobby.players) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.join(match.id);
    }
    const playersPayload = lobby.players.map((p) => ({ userId: p.userId, username: p.username, avatar: null }));
    const startAt = Date.now() + 3000;
    io.to(`private_${code}`).emit('flappy_match_found', {
      matchId: match.id,
      seed: match.seed,
      players: playersPayload,
      startAt,
    });
    setTimeout(() => {
      io.to(match.id).emit('flappy_game_start', { matchId: match.id });
    }, 3000);
    privateLobbyMap.delete(code);
  });
}

async function finishMatch(io, match) {
  match.status = 'finished';
  const winnerId = Object.keys(match.alive).find((id) => match.alive[id]) || null;
  const leaderboard = Object.entries(match.scores)
    .map(([uid, s]) => ({ userId: uid, username: match.players[uid]?.username || '?', score: s }))
    .sort((a, b) => b.score - a.score);

  // Coin kazandırma
  const coinGains = {};
  for (let i = 0; i < leaderboard.length; i++) {
    const p = leaderboard[i];
    let coins = 5 + Math.floor(p.score * 2);
    if (p.userId === winnerId) coins += 20;
    if (i === 0) coins += 10;
    coinGains[p.userId] = coins;
  }

  io.to(match.id).emit('flappy_game_finished', {
    matchId: match.id,
    winnerId,
    scores: match.scores,
    leaderboard,
    coinGains,
  });

  // DB kayıt + kullanıcı güncelleme
  saveFlappyMatchToDb(match.id, match.seed, match.players, match.scores, winnerId, coinGains).catch((e) =>
    console.error('[Flappy] DB save error:', e?.message)
  );
  setTimeout(() => removeFlappyMatch(match.id), 15000);
}

async function saveFlappyMatchToDb(matchId, seed, players, scores, winnerId, coinGains) {
  const playerCount = Object.keys(players).length;
  await FlappyMatch.create({
    id: matchId,
    seed,
    playerCount,
    winnerId,
    scores,
    finishedAt: new Date(),
  });
  const leaderboard = Object.entries(scores)
    .map(([uid, s]) => ({ userId: uid, username: players[uid]?.username || '?', score: s }))
    .sort((a, b) => b.score - a.score);

  for (let i = 0; i < leaderboard.length; i++) {
    const p = leaderboard[i];
    await FlappyScore.create({ matchId, userId: p.userId, username: p.username, score: p.score, rank: i + 1 });

    // FlappyUser güncelle
    try {
      let user = await FlappyUser.findByPk(p.userId);
      if (!user) {
        user = await FlappyUser.create({ userId: p.userId, username: p.username });
      }
      user.totalGames += 1;
      user.totalScore += p.score;
      if (p.score > user.bestScore) user.bestScore = p.score;
      if (p.userId === winnerId) user.wins += 1;
      user.coins += (coinGains?.[p.userId] || 5);
      user.seasonXp += Math.floor(p.score / 2) + 5;
      await user.save();

      // Görev ilerletme
      await updateQuests(p.userId, p.score, p.userId === winnerId);
    } catch (e) {
      console.error('[Flappy] User update error:', e?.message);
    }
  }
}

async function updateQuests(userId, score, won) {
  const today = new Date().toISOString().slice(0, 10);
  const quests = await FlappyQuest.findAll({ where: { userId, questDate: today, completed: false } });

  for (const quest of quests) {
    const def = DAILY_QUEST_POOL.find((q) => q.key === quest.questKey);
    if (!def) continue;

    if (def.type === 'games') {
      quest.progress += 1;
    } else if (def.type === 'score') {
      quest.progress += score;
    } else if (def.type === 'wins' && won) {
      quest.progress += 1;
    }

    if (quest.progress >= quest.target) {
      quest.completed = true;
    }
    await quest.save();
  }
}

module.exports = { setupFlappyHandlers };
