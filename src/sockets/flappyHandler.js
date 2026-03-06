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
const { DAILY_QUEST_POOL, addXp, checkAchievements, xpForLevel } = require('../routes/flappy');

const privateLobbyMap = new Map();
const spectatorMap = new Map();

function setupFlappyHandlers(io, socket) {
  let currentUserId = null;
  let currentUsername = null;

  socket.on('flappy_queue_join', async ({ userId, username, difficulty, speedMult, theme }) => {
    currentUserId = userId;
    currentUsername = username;
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const spd = [0.75, 1, 1.5, 2].includes(Number(speedMult)) ? Number(speedMult) : 1;
    const validThemes = ['space', 'classic', 'sunset', 'neon', 'snow'];
    const thm = validThemes.includes(theme) ? theme : 'space';
    if (!userId || !username) {
      socket.emit('flappy_queue_error', { error: 'Geçersiz kullanıcı bilgisi' });
      return;
    }

    const playerData = { socketId: socket.id, userId, username, difficulty: diff, speedMult: spd, theme: thm };
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

        const matchDifficulty = players[0]?.difficulty || diff;
        const matchSpeed = players[0]?.speedMult || 1;
        const matchTheme = players[0]?.theme || 'space';
        const match = createFlappyMatch(players);
        match.difficulty = matchDifficulty;
        match.speedMult = matchSpeed;
        match.theme = matchTheme;
        for (const p of players) {
          if (p.socketId) {
            const s = io.sockets.sockets.get(p.socketId);
            if (s) s.join(match.id);
          }
        }
        let playersPayload = players.map((p) => ({ userId: p.userId, username: p.username, avatar: null }));
        try {
          const userIds = players.map((p) => p.userId);
          if (userIds.length > 0 && UserModel) {
            const avatarResults = await Promise.all(
              userIds.map((uid) => UserModel.findOne({ where: { oduserId: uid }, attributes: ['avatar'] }).catch(() => null))
            );
            const avatarMap = {};
            userIds.forEach((uid, i) => { avatarMap[uid] = avatarResults[i]?.avatar || null; });
            playersPayload = players.map((p) => ({
              userId: p.userId,
              username: p.username,
              avatar: avatarMap[p.userId] || null,
            }));
          }
        } catch (e) {
          console.error('[Flappy] Avatar fetch error:', e?.message);
        }
        console.log('[Flappy] Match started:', match.id, 'players:', players.length, 'difficulty:', matchDifficulty);
        const startAt = Date.now() + 3000;
        io.to(match.id).emit('flappy_match_found', {
          matchId: match.id,
          seed: match.seed,
          players: playersPayload,
          startAt,
          difficulty: matchDifficulty,
          speedMult: matchSpeed,
          theme: matchTheme,
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
    // Canlı izleyicilere de gönder
    const room = `spectate_${matchId}`;
    io.to(room).emit('flappy_spectate_score', { userId: currentUserId, username: currentUsername, score });
  });

  socket.on('flappy_died', ({ matchId, coinsCollected }) => {
    const match = getFlappyMatch(matchId);
    if (!match || match.status !== 'playing') return;
    if (!match.players[currentUserId]) return;
    match.alive[currentUserId] = false;
    if (!match.coinsCollected) match.coinsCollected = {};
    match.coinsCollected[currentUserId] = coinsCollected || 0;
    const aliveCount = Object.values(match.alive).filter(Boolean).length;
    io.to(matchId).emit('flappy_player_died', {
      userId: currentUserId,
      username: currentUsername,
      score: match.scores[currentUserId] || 0,
      aliveCount,
    });
    io.to(`spectate_${matchId}`).emit('flappy_spectate_died', {
      userId: currentUserId,
      username: currentUsername,
      score: match.scores[currentUserId] || 0,
      aliveCount,
    });
    if (aliveCount === 0) {
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
      if (aliveCount === 0) {
        finishMatch(io, match);
      }
    }
  });

  // Emoji reaksiyonları
  socket.on('flappy_emoji', ({ matchId, emoji, userId, username }) => {
    socket.to(matchId).emit('flappy_emoji', { emoji, userId, username });
    io.to(`spectate_${matchId}`).emit('flappy_emoji', { emoji, userId, username });
  });

  // Canlı izleme
  socket.on('flappy_spectate_join', ({ matchId }) => {
    const match = getFlappyMatch(matchId);
    if (!match) {
      socket.emit('flappy_spectate_error', { error: 'Maç bulunamadı' });
      return;
    }
    const room = `spectate_${matchId}`;
    socket.join(room);
    if (!spectatorMap.has(matchId)) spectatorMap.set(matchId, new Set());
    spectatorMap.get(matchId).add(socket.id);
    socket.emit('flappy_spectate_info', {
      matchId,
      players: Object.entries(match.players).map(([uid, p]) => ({
        userId: uid,
        username: p.username,
        alive: match.alive[uid],
        score: match.scores[uid] || 0,
      })),
      status: match.status,
    });
  });

  socket.on('flappy_spectate_leave', ({ matchId }) => {
    socket.leave(`spectate_${matchId}`);
    const set = spectatorMap.get(matchId);
    if (set) { set.delete(socket.id); if (set.size === 0) spectatorMap.delete(matchId); }
  });

  // Arkadaşlarla oyna - özel lobi
  socket.on('flappy_create_private', ({ userId, username, difficulty, speedMult, theme }) => {
    currentUserId = userId;
    currentUsername = username;
    const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const spd = [0.75, 1, 1.5, 2].includes(Number(speedMult)) ? Number(speedMult) : 1;
    const validThemes = ['space', 'classic', 'sunset', 'neon', 'snow'];
    const thm = validThemes.includes(theme) ? theme : 'space';
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    privateLobbyMap.set(code, {
      host: { socketId: socket.id, userId, username },
      players: [{ socketId: socket.id, userId, username }],
      difficulty: diff, speedMult: spd, theme: thm,
    });
    socket.join(`private_${code}`);
    socket.emit('flappy_private_created', { code, difficulty: diff, speedMult: spd, theme: thm });
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
      difficulty: lobby.difficulty,
      speedMult: lobby.speedMult,
      theme: lobby.theme,
    });
  });

  socket.on('flappy_start_private', ({ code }) => {
    const lobby = privateLobbyMap.get(code);
    if (!lobby) return;
    if (lobby.host.userId !== currentUserId) return;
    if (lobby.players.length < 1) return;

    const match = createFlappyMatch(lobby.players);
    match.difficulty = lobby.difficulty || 'medium';
    match.speedMult = lobby.speedMult || 1;
    match.theme = lobby.theme || 'space';
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
      difficulty: lobby.difficulty || 'medium',
      speedMult: lobby.speedMult || 1,
      theme: lobby.theme || 'space',
    });
    setTimeout(() => {
      io.to(match.id).emit('flappy_game_start', { matchId: match.id });
    }, 3000);
    privateLobbyMap.delete(code);
  });

  socket.on('flappy_update_private_settings', ({ code, difficulty, speedMult, theme }) => {
    const lobby = privateLobbyMap.get(code);
    if (!lobby) return;
    if (lobby.host.userId !== currentUserId) return;
    if (['easy', 'medium', 'hard'].includes(difficulty)) lobby.difficulty = difficulty;
    if ([0.75, 1, 1.5, 2].includes(Number(speedMult))) lobby.speedMult = Number(speedMult);
    const validThemes = ['space', 'classic', 'sunset', 'neon', 'snow'];
    if (validThemes.includes(theme)) lobby.theme = theme;
    io.to(`private_${code}`).emit('flappy_private_settings', {
      difficulty: lobby.difficulty,
      speedMult: lobby.speedMult,
      theme: lobby.theme,
    });
  });
}

async function finishMatch(io, match) {
  if (match.status === 'finished') return;
  match.status = 'finished';
  const leaderboard = Object.entries(match.scores)
    .map(([uid, s]) => ({ userId: uid, username: match.players[uid]?.username || '?', score: s }))
    .sort((a, b) => b.score - a.score);
  const winnerId = leaderboard.length > 0 ? leaderboard[0].userId : null;

  const coinGains = {};
  for (let i = 0; i < leaderboard.length; i++) {
    const p = leaderboard[i];
    let coins = 5 + Math.floor(p.score * 2);
    if (p.userId === winnerId) coins += 20;
    if (i === 0) coins += 10;
    coins += (match.coinsCollected?.[p.userId] || 0);
    coinGains[p.userId] = coins;
  }

  io.to(match.id).emit('flappy_game_finished', {
    matchId: match.id,
    winnerId,
    scores: match.scores,
    leaderboard,
    coinGains,
  });
  io.to(`spectate_${match.id}`).emit('flappy_spectate_finished', {
    matchId: match.id,
    winnerId,
    leaderboard,
  });

  saveFlappyMatchToDb(match.id, match.seed, match.players, match.scores, winnerId, coinGains, match.coinsCollected).catch((e) =>
    console.error('[Flappy] DB save error:', e?.message)
  );
  setTimeout(() => removeFlappyMatch(match.id), 15000);
}

async function saveFlappyMatchToDb(matchId, seed, players, scores, winnerId, coinGains, coinsCollected) {
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
      user.totalCoinsCollected += (coinsCollected?.[p.userId] || 0);
      user.seasonXp += Math.floor(p.score / 2) + 5;

      const xpGain = 10 + Math.floor(p.score * 1.5) + (p.userId === winnerId ? 25 : 0);
      const leveledUp = addXp(user, xpGain);
      await user.save();

      await checkAchievements(user);
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
