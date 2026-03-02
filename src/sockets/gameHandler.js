const { checkAnswer, getCorrectAnswer, getQuestionHint, getRandomQuestions, getDailyQuestion } = require('../data/questions');
const {
  joinQueue, leaveQueue, createMatch, getMatch, removeMatch, getQueueKey, getWaitingPlayer,
  createPrivateInvite, joinPrivateInvite, createBotPlayer,
  joinRaceLobby, leaveRaceLobby, takeRaceLobbyForStart, createRaceMatch,
  RACE_LOBBY_TIMEOUT_MS,
  joinRoyaleLobby, leaveRoyaleLobby, takeRoyaleLobbyForStart, createRoyaleMatch,
  ROYALE_LOBBY_TIMEOUT_MS,
} = require('../game/matchmaking');
const { recordMatchResult, recordAbandon, recordAbandonWin, getLeaderboard, getPlayerStats, getOrCreatePlayer } = require('../game/leaderboard');
const friends = require('../game/friends');
const UserModel = require('../models/User');
const DirectMessage = require('../models/DirectMessage');
const { createNotification, getNotifications, getUnreadCount, markRead, markAllRead } = require('../game/notifications');
const QuestionReportModel = require('../models/QuestionReport');
const QuestionModel = require('../models/Question');
const UserCosmeticModel = require('../models/UserCosmetic');
const CosmeticFrameModel = require('../models/CosmeticFrame');
const PurchaseHistoryModel = require('../models/PurchaseHistory');
const ShopItemModel = require('../models/ShopItem');
const { isChatBanned } = require('../game/chatBan');
const { generateDailyQuests, generateWeeklyQuests, getQuests, claimQuestReward } = require('../game/quests');
const { getSeasonInfo, claimSeasonReward } = require('../game/seasons');

const COSMETICS = {
  frames: [
    { key: 'frame_bronze', name: 'Bronz Çerçeve', type: 'frame', unlockLevel: 5, colors: ['#CD7F32', '#8B5E3C'] },
    { key: 'frame_silver', name: 'Gümüş Çerçeve', type: 'frame', unlockLevel: 10, colors: ['#C0C0C0', '#808080'] },
    { key: 'frame_gold', name: 'Altın Çerçeve', type: 'frame', unlockLevel: 15, colors: ['#FFD700', '#FFA000'] },
    { key: 'frame_diamond', name: 'Elmas Çerçeve', type: 'frame', unlockLevel: 20, colors: ['#00E5FF', '#7C4DFF'] },
    { key: 'frame_legendary', name: 'Efsanevi Çerçeve', type: 'frame', unlockLevel: 30, colors: ['#FF6D00', '#FF1744'] },
  ],
  badges: [
    { key: 'badge_first_win', name: 'İlk Zafer', type: 'badge', unlockAchievement: 'first_win', icon: 'trophy' },
    { key: 'badge_streak_5', name: 'Seri Katil', type: 'badge', unlockAchievement: 'streak_5', icon: 'flame' },
    { key: 'badge_perfect', name: 'Mükemmelci', type: 'badge', unlockAchievement: 'perfect', icon: 'star' },
    { key: 'badge_veteran', name: 'Veteran', type: 'badge', unlockAchievement: 'matches_50', icon: 'shield' },
    { key: 'badge_accuracy', name: 'Keskin Nişancı', type: 'badge', unlockAchievement: 'accuracy_80', icon: 'eye' },
    { key: 'badge_legend', name: 'Efsane', type: 'badge', unlockAchievement: 'matches_100', icon: 'diamond' },
  ],
};

const SHOP_ITEMS = [
  { id: 'fifty_fifty', name: '%50 Eleme', desc: '2 yanlış şıkkı eler', price: 80, icon: 'cut', field: 'ownedFiftyFifty' },
  { id: 'time_freeze', name: 'Ek Süre', desc: '+10 saniye ekstra süre', price: 60, icon: 'time', field: 'ownedTimeFreeze' },
  { id: 'double_points', name: 'Çift Puan', desc: 'Doğru cevapta 2x skor', price: 100, icon: 'flash', field: 'ownedDoublePoints' },
  { id: 'hint', name: 'İpucu', desc: 'Soru ipucu gösterir', price: 50, icon: 'bulb', field: 'ownedHint' },
  { id: 'bundle', name: 'Joker Paketi', desc: 'Her birinden 1 adet (4 joker)', price: 250, icon: 'gift', field: null },
];

async function loadPlayerPowerups(oduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user) return { fifty_fifty: 0, time_freeze: 0, double_points: 0, hint: 0 };
  return {
    fifty_fifty: user.ownedFiftyFifty || 0,
    time_freeze: user.ownedTimeFreeze || 0,
    double_points: user.ownedDoublePoints || 0,
    hint: user.ownedHint || 0,
  };
}

async function deductPowerup(oduserId, powerupType) {
  const fieldMap = { fifty_fifty: 'ownedFiftyFifty', time_freeze: 'ownedTimeFreeze', double_points: 'ownedDoublePoints', hint: 'ownedHint' };
  const field = fieldMap[powerupType];
  if (!field) return;
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user || user[field] <= 0) return;
  user[field] -= 1;
  await user.save();
}

const BOT_FALLBACK_SECONDS = 8;
const botFallbackTimeouts = new Map();
const raceLobbyTimers = new Map();
const royaleLobbyTimers = new Map();

// Bot sohbet mesajları - ince tahrik edici, hakaret içermeyen, çeşitli
const BOT_CHAT_MESSAGES = [
  'Hehe hadi bakalım 😏',
  'Bu sefer kaçıramazsın!',
  'Kolay mı sandın?',
  'Şanslısın bu soru kolaydı',
  'Gergin misin? 😄',
  'Biraz zorlanıyorsun galiba',
  'Hadi hadi, düşün!',
  'Bu soruyu biliyorum ben',
  'Yaklaştın, ama yetmedi',
  'Senden bekliyordum aslında',
  'Hmm ilginç seçim',
  'Bir dahakine belki 😉',
  'Hızlan biraz',
  'Kolay modda mısın sen?',
  'Dikkatli ol, sıradakiler zor',
  'Isınma turu bitti, asıl şimdi başlıyoruz',
  'Ooh iyi gidiyorsun',
  'Neredeyse tutturacaktın',
  'Hadi bakalım ne biliyorsun',
  'Benden çekinme 😎',
  'Bu kadar mı?',
  'Daha iyisini bekliyordum',
  'Şans eseri doğru sayılır',
  'Hmm riskli tercih',
  'Sen yaparsın, inan bana',
  'Zorlandın mı?',
  'Kolay mı geldi?',
  'Acele etme, düşün',
  'Emin misin o cevapla?',
  'Sana güveniyorum',
  'Güzel gidiyoruz',
  'Bekle beni geçeceksin 😄',
];

async function startRaceMatch(io, players, difficulty, category) {
  const match = await createRaceMatch(players, difficulty, category);
  for (const p of players) {
    if (p.socketId) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.join(match.id);
    }
  }
  const realPlayerIds = players.filter((p) => !p.userId?.startsWith('bot_')).map((p) => p.userId);
  const avatarResults = await Promise.all(realPlayerIds.map((uid) => UserModel.findOne({ where: { oduserId: uid }, attributes: ['avatar'] })));
  const avatarMap = {};
  realPlayerIds.forEach((uid, i) => { avatarMap[uid] = avatarResults[i]?.avatar || null; });
  const playersPayload = players.map((p) => ({
    userId: p.userId,
    username: p.username,
    avatar: p.userId?.startsWith('bot_') ? null : (avatarMap[p.userId] || null),
  }));
  const playerPowerups = {};
  for (const p of players) playerPowerups[p.userId] = match.players[p.userId]?.powerups || {};
  io.to(match.id).emit('match_found', {
    matchId: match.id,
    difficulty,
    category: match.category,
    mode: 'race',
    players: playersPayload,
    totalQuestions: match.questions.length,
    timePerQuestion: match.timePerQuestion,
    playerPowerups,
  });
  const hasBots = players.some((p) => p.userId?.startsWith('bot_'));
  if (hasBots) match.isBotMatch = true;
  setTimeout(() => sendQuestion(io, match.id), 3000);
}

async function startRoyaleMatch(io, players, difficulty, category) {
  const match = await createRoyaleMatch(players, difficulty, category);
  for (const p of players) {
    if (p.socketId) {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) s.join(match.id);
    }
  }
  const realPlayerIds = players.filter((p) => !p.userId?.startsWith('bot_')).map((p) => p.userId);
  const avatarResults = await Promise.all(realPlayerIds.map((uid) => UserModel.findOne({ where: { oduserId: uid }, attributes: ['avatar'] })));
  const avatarMap = {};
  realPlayerIds.forEach((uid, i) => { avatarMap[uid] = avatarResults[i]?.avatar || null; });
  const playersPayload = players.map((p) => ({
    userId: p.userId,
    username: p.username,
    avatar: p.userId?.startsWith('bot_') ? null : (avatarMap[p.userId] || null),
  }));
  io.to(match.id).emit('match_found', {
    matchId: match.id,
    difficulty,
    category: match.category,
    mode: 'royale',
    players: playersPayload,
    totalQuestions: match.questions.length,
    timePerQuestion: match.timePerQuestion,
    playerPowerups: {},
  });
  const hasBots = players.some((p) => p.userId?.startsWith('bot_'));
  if (hasBots) match.isBotMatch = true;
  setTimeout(() => sendRoyaleQuestion(io, match.id), 2000);
}

function maybeSendBotChat(io, match) {
  if (!match.isBotMatch) return;
  if (match.botChatSentThisRound) return;
  if (Math.random() > 0.4) return;
  const botId = Object.keys(match.players).find((id) => id.startsWith('bot_'));
  if (!botId) return;
  const bot = match.players[botId];
  if (!bot) return;
  match.botChatSentThisRound = true;
  const msg = BOT_CHAT_MESSAGES[Math.floor(Math.random() * BOT_CHAT_MESSAGES.length)];
  const payload = { id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, userId: botId, username: bot.username, text: msg, timestamp: Date.now() };
  const chatNs = io.of('/chat');
  if (chatNs) chatNs.to(match.id).emit('match_message', payload);
}

function setupGameSocket(io) {
  io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUsername = null;

    socket.on('register_user', async ({ userId, username }) => {
      currentUserId = userId;
      currentUsername = username;
      await getOrCreatePlayer(userId, username);
      friends.register(userId, username, socket.id);
    });

    // ── MATCHMAKING ──
    socket.on('queue_join', async ({ userId, username, difficulty, category, mode }) => {
      try {
        currentUserId = userId;
        currentUsername = username;
        if (!userId || !username) { socket.emit('queue_error', { error: 'Geçersiz kullanıcı bilgisi' }); return; }
        await getOrCreatePlayer(userId, username);
        friends.register(userId, username, socket.id);

        if (mode === 'solo') {
        handleSoloMode(socket, userId, username, difficulty, category);
        return;
      }
      if (mode === 'survival') {
        handleSurvivalMode(socket, userId, username, category);
        return;
      }
      if (mode === 'race') {
        const myPowerups = await loadPlayerPowerups(userId);
        const playerData = { socketId: socket.id, userId, username, powerups: myPowerups };
        const result = joinRaceLobby(playerData, difficulty, category);
        if (result.error) { socket.emit('queue_error', { error: result.error }); return; }
        if (result.started) {
          await startRaceMatch(io, result.players, difficulty, category);
          return;
        }
        socket.emit('queue_waiting', { message: `Sıralı Yarış lobisi (${result.count}/3)...` });
        const key = result.key;
        const prev = raceLobbyTimers.get(key);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
          raceLobbyTimers.delete(key);
          const players = takeRaceLobbyForStart(key);
          if (!players || players.length === 0) return;
          await startRaceMatch(io, players, difficulty, category);
        }, RACE_LOBBY_TIMEOUT_MS);
        raceLobbyTimers.set(key, t);
        return;
      }
      if (mode === 'royale') {
        const myPowerups = await loadPlayerPowerups(userId);
        const playerData = { socketId: socket.id, userId, username, powerups: myPowerups };
        const result = joinRoyaleLobby(playerData, difficulty, category);
        if (result.error) { socket.emit('queue_error', { error: result.error }); return; }
        if (result.started) {
          await startRoyaleMatch(io, result.players, difficulty, category);
          return;
        }
        socket.emit('queue_waiting', { message: `Hayatta Kal lobisi (${result.count}/10)...` });
        const key = result.key;
        const prev = royaleLobbyTimers.get(key);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
          royaleLobbyTimers.delete(key);
          const players = takeRoyaleLobbyForStart(key);
          if (!players || players.length === 0) return;
          await startRoyaleMatch(io, players, difficulty, category);
        }, ROYALE_LOBBY_TIMEOUT_MS);
        royaleLobbyTimers.set(key, t);
        return;
      }

      const myPowerups = await loadPlayerPowerups(userId);
      const playerData = { socketId: socket.id, userId, username, powerups: myPowerups };
      const result = await joinQueue(playerData, difficulty, category, mode);

      if (result.matched) {
        const opponent = result.opponent;
        if (opponent.socketId) {
          const prev = botFallbackTimeouts.get(opponent.socketId);
          if (prev) { clearTimeout(prev.timeout); botFallbackTimeouts.delete(opponent.socketId); }
        }
        if (!opponent.powerups) opponent.powerups = await loadPlayerPowerups(opponent.userId);
        const match = await createMatch(opponent, playerData, difficulty, category, mode);
        socket.join(match.id);
        io.sockets.sockets.get(opponent.socketId)?.join(match.id);

        const [p1Data, p2Data] = await Promise.all([
          UserModel.findOne({ where: { oduserId: opponent.userId }, attributes: ['avatar'] }),
          UserModel.findOne({ where: { oduserId: userId }, attributes: ['avatar'] }),
        ]);

        io.to(match.id).emit('match_found', {
          matchId: match.id,
          difficulty,
          category: match.category,
          mode: match.mode,
          players: [
            { userId: opponent.userId, username: opponent.username, avatar: p1Data?.avatar || null },
            { userId, username, avatar: p2Data?.avatar || null },
          ],
          totalQuestions: match.questions.length,
          timePerQuestion: match.timePerQuestion,
          playerPowerups: {
            [opponent.userId]: match.players[opponent.userId].powerups,
            [userId]: match.players[userId].powerups,
          },
        });
        setTimeout(() => sendQuestion(io, match.id), 3000);
      } else {
        socket.emit('queue_waiting', { message: 'Rakip aranıyor...' });
        const key = getQueueKey(difficulty, category, mode);
        const botTimeout = setTimeout(async () => {
          botFallbackTimeouts.delete(socket.id);
          if (!socket.connected) return;
          const wp = getWaitingPlayer(key, socket.id);
          if (wp) {
            leaveQueue(socket.id);
            const bot = createBotPlayer();
            const match = await createMatch(bot, wp, difficulty, category, mode);
            match.isBotMatch = true;
            socket.join(match.id);
            const p2Data = await UserModel.findOne({ where: { oduserId: userId }, attributes: ['avatar'] });
            io.to(match.id).emit('match_found', {
              matchId: match.id,
              difficulty,
              category: match.category,
              mode: match.mode,
              players: [
                { userId: bot.userId, username: bot.username, avatar: null },
                { userId, username, avatar: p2Data?.avatar || null },
              ],
              totalQuestions: match.questions.length,
              timePerQuestion: match.timePerQuestion,
              playerPowerups: {
                [bot.userId]: match.players[bot.userId].powerups,
                [userId]: match.players[userId].powerups,
              },
            });
            setTimeout(() => sendQuestion(io, match.id), 3000);
            match.botChatSentThisRound = false;
            setTimeout(() => maybeSendBotChat(io, match), 7000 + Math.random() * 4000);
          }
        }, BOT_FALLBACK_SECONDS * 1000);
        botFallbackTimeouts.set(socket.id, { timeout: botTimeout });
      }
      } catch (e) {
        console.error('queue_join hatası:', e);
        socket.emit('queue_error', { error: 'Eşleşme başarısız. Tekrar deneyin.' });
      }
    });

    socket.on('queue_leave', () => {
      const prev = botFallbackTimeouts.get(socket.id);
      if (prev) { clearTimeout(prev.timeout); botFallbackTimeouts.delete(socket.id); }
      leaveRaceLobby(socket.id);
      leaveRoyaleLobby(socket.id);
      leaveQueue(socket.id);
      socket.emit('queue_left');
    });

    // ── PRIVATE INVITE ──
    socket.on('create_invite', ({ userId, username, difficulty, category, mode }) => {
      const code = createPrivateInvite({ socketId: socket.id, userId, username }, difficulty, category, mode);
      socket.emit('invite_created', { code });
    });

    socket.on('join_invite', async ({ userId, username, code }) => {
      const result = joinPrivateInvite(code, { socketId: socket.id, userId, username });
      if (!result.success) { socket.emit('invite_error', { error: result.error }); return; }

      const [hostPw, joinPw] = await Promise.all([loadPlayerPowerups(result.host.userId), loadPlayerPowerups(userId)]);
      result.host.powerups = hostPw;
      const match = await createMatch(result.host, { socketId: socket.id, userId, username, powerups: joinPw }, result.difficulty, result.category, result.mode);
      socket.join(match.id);
      io.sockets.sockets.get(result.host.socketId)?.join(match.id);

      const [hostData, joinData] = await Promise.all([
        UserModel.findOne({ where: { oduserId: result.host.userId }, attributes: ['avatar'] }),
        UserModel.findOne({ where: { oduserId: userId }, attributes: ['avatar'] }),
      ]);

      io.to(match.id).emit('match_found', {
        matchId: match.id, difficulty: result.difficulty, category: match.category, mode: match.mode,
        players: [
          { userId: result.host.userId, username: result.host.username, avatar: hostData?.avatar || null },
          { userId, username, avatar: joinData?.avatar || null },
        ],
        totalQuestions: match.questions.length, timePerQuestion: match.timePerQuestion,
        playerPowerups: {
          [result.host.userId]: match.players[result.host.userId].powerups,
          [userId]: match.players[userId].powerups,
        },
      });
      setTimeout(() => sendQuestion(io, match.id), 3000);
    });

    // ── POWER-UPS ──
    socket.on('use_powerup', async ({ matchId, userId, powerup }) => {
      const match = getMatch(matchId);
      if (!match || match.status !== 'playing') return;
      const player = match.players[userId];
      if (!player || !player.powerups[powerup] || player.powerups[powerup] <= 0) return;

      player.powerups[powerup]--;
      deductPowerup(userId, powerup);
      const question = match.questions[match.currentQuestionIndex];

      if (powerup === 'fifty_fifty') {
        const wrong = question.options.map((_, i) => i).filter((i) => i !== question.correct);
        const eliminated = wrong.sort(() => Math.random() - 0.5).slice(0, 2);
        socket.emit('powerup_result', { powerup: 'fifty_fifty', eliminated });
      } else if (powerup === 'hint') {
        socket.emit('powerup_result', { powerup: 'hint', hint: question.hint || 'İpucu yok' });
      } else if (powerup === 'double_points') {
        player.doubleActive = true;
        socket.emit('powerup_result', { powerup: 'double_points', active: true });
      } else if (powerup === 'time_freeze') {
        const extraTime = 5;
        // Extend the server-side round timer
        if (match.timer && match.questionSentAt) {
          clearTimeout(match.timer);
          const elapsed = Date.now() - match.questionSentAt;
          const originalMs = match.timePerQuestion * 1000;
          const remaining = Math.max(0, originalMs - elapsed) + extraTime * 1000;
          match.timer = setTimeout(() => sendRoundResult(io, match), remaining);
        }
        socket.emit('powerup_result', { powerup: 'time_freeze', extraTime });
      }
    });

    // ── LEAVE MATCH ──
    socket.on('leave_match', async ({ matchId, userId }) => {
      const match = getMatch(matchId);
      if (!match) return;
      match.status = 'finished';
      if (match.timer) { clearTimeout(match.timer); match.timer = null; }
      if (match.voteTimer) { clearTimeout(match.voteTimer); match.voteTimer = null; }

      const player = match.players[userId];
      const opponentId = Object.keys(match.players).find((id) => id !== userId);

      // Penalize the player who left
      if (player) {
        const answeredCount = Object.values(player.answers).filter((a) => a.correct).length;
        const totalAsked = match.currentQuestionIndex + 1;
        await recordAbandon(userId, player.username, {
          matchKey: matchId,
          myScore: player.score,
          correctAnswers: answeredCount,
          totalQuestions: totalAsked,
          difficulty: match.difficulty,
          category: match.category,
          mode: match.mode,
        });
      }

      // Reward the opponent who stayed (bot değilse) - race/royale modunda abandon win verme
      if (match.mode !== 'race' && match.mode !== 'royale' && opponentId && !opponentId.startsWith('bot_') && match.players[opponentId]) {
        const opp = match.players[opponentId];
        const oppAnswered = Object.values(opp.answers).filter((a) => a.correct).length;
        const totalAsked = match.currentQuestionIndex + 1;
        await recordAbandonWin(opponentId, opp.username, {
          matchKey: matchId,
          myScore: opp.score,
          correctAnswers: oppAnswered,
          totalQuestions: totalAsked,
          difficulty: match.difficulty,
          category: match.category,
          mode: match.mode,
        });
      }

      socket.to(matchId).emit('opponent_left', {});
      removeMatch(matchId);
    });

    // ── ANSWER ──
    socket.on('submit_answer', async ({ matchId, userId, questionId, selected, responseTime }) => {
      const match = getMatch(matchId);
      if (!match || match.status !== 'playing') return;
      const player = match.players[userId];
      if (!player || player.answers[questionId] !== undefined) return;

      if (match.mode === 'royale') {
        const isCorrect = await checkAnswer(questionId, selected);
        player.answers[questionId] = { selected, correct: isCorrect };
        match.answeredThisRound.add(userId);
        if (!isCorrect) {
          player.alive = false;
          player.eliminatedAt = match.currentQuestionIndex;
          io.to(matchId).emit('player_eliminated', { userId, username: player.username });
        } else {
          io.to(matchId).emit('player_answered', { userId });
        }
        const aliveIds = Object.keys(match.players).filter((id) => match.players[id].alive);
        const aliveAnswered = aliveIds.filter((id) => match.answeredThisRound.has(id));
        if (aliveAnswered.length >= aliveIds.length) {
          if (match.timer) { clearTimeout(match.timer); match.timer = null; }
          sendRoyaleRoundResult(io, match);
        }
        return;
      }

      const isCorrect = await checkAnswer(questionId, selected);
      player.answers[questionId] = { selected, correct: isCorrect, responseTime };

      if (isCorrect) {
        let points = match.difficulty === 'easy' ? 10 : match.difficulty === 'medium' ? 20 : 30;
        if (match.mode === 'race' && match.questionSentAt && typeof responseTime === 'number') {
          const totalMs = match.timePerQuestion * 1000;
          const remaining = Math.max(0, totalMs - responseTime);
          const speedBonus = Math.floor((remaining / totalMs) * 15);
          points += speedBonus;
        }
        if (player.doubleActive) { points *= 2; player.doubleActive = false; }
        player.score += points;
        player.correctCount++;
      } else {
        player.doubleActive = false;
      }

      match.answeredThisRound.add(userId);

      io.to(matchId).emit('player_answered', { userId });

      if (Object.keys(match.players).every((id) => match.answeredThisRound.has(id))) {
        if (match.timer) { clearTimeout(match.timer); match.timer = null; }
        sendRoundResult(io, match);
      }
    });

    // ── EMOJI REACTIONS ──
    socket.on('send_reaction', ({ matchId, userId, emoji }) => {
      const match = getMatch(matchId);
      if (match) io.to(matchId).emit('reaction', { userId, emoji });
    });

    // ── VOICE CHAT (WebRTC Signaling) ──
    socket.on('voice_offer', ({ matchId, userId, offer }) => {
      socket.to(matchId).emit('voice_offer', { userId, offer });
    });
    socket.on('voice_answer', ({ matchId, userId, answer }) => {
      socket.to(matchId).emit('voice_answer', { userId, answer });
    });
    socket.on('voice_ice_candidate', ({ matchId, userId, candidate }) => {
      socket.to(matchId).emit('voice_ice_candidate', { userId, candidate });
    });
    socket.on('voice_toggle', ({ matchId, userId, muted }) => {
      socket.to(matchId).emit('voice_toggle', { userId, muted });
    });

    // ── CONTINUE ROUND VOTING ──
    socket.on('continue_vote', ({ matchId, userId, vote }) => {
      const match = getMatch(matchId);
      if (!match || match.status !== 'voting') return;
      if (!match.votes) match.votes = {};
      match.votes[userId] = vote;

      const playerIds = Object.keys(match.players);
      const allVoted = playerIds.every((id) => match.votes[id] !== undefined);

      if (allVoted) {
        if (match.voteTimer) { clearTimeout(match.voteTimer); match.voteTimer = null; }
        const allAccepted = playerIds.every((id) => match.votes[id] === true);
        if (allAccepted) {
          startNewRound(io, match);
        } else {
          finalizeMatch(io, match);
        }
      } else {
        io.to(matchId).emit('vote_update', { userId, vote });
      }
    });

    // ── DAILY QUESTION ──
    socket.on('get_daily_question', async () => {
      const dq = await getDailyQuestion();
      if (dq) socket.emit('daily_question', { id: dq.id, text: dq.text, options: dq.options, category: dq.category, difficulty: dq.difficulty, date: dq.date });
    });

    socket.on('answer_daily', async ({ questionId, selected }) => {
      const isCorrect = await checkAnswer(questionId, selected);
      const correct = await getCorrectAnswer(questionId);
      socket.emit('daily_result', { correct: isCorrect, correctAnswer: correct });
    });

    // ── FRIENDS ──
    socket.on('friend_request', async ({ toUsername }) => {
      if (!currentUserId) return;
      const result = await friends.sendFriendRequest(currentUserId, toUsername);
      socket.emit('friend_request_result', result);
      if (result.success) {
        if (result.autoAccepted) {
          socket.emit('friends_list', {
            friends: await friends.getFriendList(currentUserId),
            pending: await friends.getPendingRequests(currentUserId),
            sent: await friends.getSentRequests(currentUserId),
          });
          const toSocket = friends.getSocketId(result.toId);
          if (toSocket) {
            const toSock = io.sockets.sockets.get(toSocket);
            if (toSock) {
              toSock.emit('friend_accepted', { userId: currentUserId, username: currentUsername });
              toSock.emit('friends_list', {
                friends: await friends.getFriendList(result.toId),
                pending: await friends.getPendingRequests(result.toId),
                sent: await friends.getSentRequests(result.toId),
              });
            }
          }
        } else {
          socket.emit('friends_list', {
            friends: await friends.getFriendList(currentUserId),
            pending: await friends.getPendingRequests(currentUserId),
            sent: await friends.getSentRequests(currentUserId),
          });
          const toSocket = friends.getSocketId(result.toId);
          if (toSocket) {
            const toSock = io.sockets.sockets.get(toSocket);
            if (toSock) {
              toSock.emit('friend_request_received', { fromId: currentUserId, fromUsername: currentUsername });
              toSock.emit('friends_list', {
                friends: await friends.getFriendList(result.toId),
                pending: await friends.getPendingRequests(result.toId),
                sent: await friends.getSentRequests(result.toId),
              });
            }
          }
        }
      }
    });

    socket.on('friend_accept', async ({ fromId }) => {
      if (!currentUserId) return;
      const result = await friends.acceptFriendRequest(currentUserId, fromId);
      socket.emit('friend_accept_result', result);
      if (result.success) {
        socket.emit('friends_list', {
          friends: await friends.getFriendList(currentUserId),
          pending: await friends.getPendingRequests(currentUserId),
          sent: await friends.getSentRequests(currentUserId),
        });
        const fromSocket = friends.getSocketId(fromId);
        if (fromSocket) {
          const fromSock = io.sockets.sockets.get(fromSocket);
          if (fromSock) {
            fromSock.emit('friend_accepted', { userId: currentUserId, username: currentUsername });
            fromSock.emit('friends_list', {
              friends: await friends.getFriendList(fromId),
              pending: await friends.getPendingRequests(fromId),
              sent: await friends.getSentRequests(fromId),
            });
          }
        }
      }
    });

    socket.on('friend_reject', async ({ fromId }) => {
      if (!currentUserId) return;
      await friends.rejectFriendRequest(currentUserId, fromId);
      socket.emit('friend_reject_result', { success: true });
      socket.emit('friends_list', {
        friends: await friends.getFriendList(currentUserId),
        pending: await friends.getPendingRequests(currentUserId),
        sent: await friends.getSentRequests(currentUserId),
      });
    });

    socket.on('friend_remove', async ({ friendId }) => {
      if (!currentUserId) return;
      await friends.removeFriend(currentUserId, friendId);
      socket.emit('friend_remove_result', { success: true });
      socket.emit('friends_list', {
        friends: await friends.getFriendList(currentUserId),
        pending: await friends.getPendingRequests(currentUserId),
        sent: await friends.getSentRequests(currentUserId),
      });
      const friendSocket = friends.getSocketId(friendId);
      if (friendSocket) {
        const fSock = io.sockets.sockets.get(friendSocket);
        if (fSock) {
          fSock.emit('friend_removed', { userId: currentUserId });
          fSock.emit('friends_list', {
            friends: await friends.getFriendList(friendId),
            pending: await friends.getPendingRequests(friendId),
            sent: await friends.getSentRequests(friendId),
          });
        }
      }
    });

    socket.on('get_friends', async () => {
      if (!currentUserId) return;
      socket.emit('friends_list', {
        friends: await friends.getFriendList(currentUserId),
        pending: await friends.getPendingRequests(currentUserId),
        sent: await friends.getSentRequests(currentUserId),
      });
    });

    socket.on('friend_cancel', async ({ toId }) => {
      if (!currentUserId) return;
      await friends.cancelFriendRequest(currentUserId, toId);
      socket.emit('friend_cancel_result', { success: true });
      socket.emit('friends_list', {
        friends: await friends.getFriendList(currentUserId),
        pending: await friends.getPendingRequests(currentUserId),
        sent: await friends.getSentRequests(currentUserId),
      });
      const toSocket = friends.getSocketId(toId);
      if (toSocket) {
        const toSock = io.sockets.sockets.get(toSocket);
        if (toSock) {
          toSock.emit('friends_list', {
            friends: await friends.getFriendList(toId),
            pending: await friends.getPendingRequests(toId),
            sent: await friends.getSentRequests(toId),
          });
        }
      }
    });

    // ── DIRECT MESSAGES ──
    socket.on('get_conversations', async () => {
      if (!currentUserId) return;
      const { Op } = require('sequelize');
      const msgs = await DirectMessage.findAll({
        where: { [Op.or]: [{ fromUserId: currentUserId }, { toUserId: currentUserId }] },
        order: [['createdAt', 'DESC']],
      });

      const convMap = new Map();
      for (const m of msgs) {
        const peerId = m.fromUserId === currentUserId ? m.toUserId : m.fromUserId;
        if (!convMap.has(peerId)) {
          convMap.set(peerId, {
            peerId,
            lastMessage: m.text,
            lastTime: m.createdAt,
            unread: m.toUserId === currentUserId && !m.read ? 1 : 0,
          });
        } else if (m.toUserId === currentUserId && !m.read) {
          convMap.get(peerId).unread += 1;
        }
      }

      const friendList = await friends.getFriendList(currentUserId);
      const conversations = [];
      for (const [peerId, conv] of convMap) {
        const friendInfo = friendList.find((f) => f.userId === peerId);
        conversations.push({
          ...conv,
          username: friendInfo?.username || 'Bilinmiyor',
          avatar: friendInfo?.avatar || null,
          online: friendInfo?.online || false,
        });
      }
      conversations.sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
      socket.emit('conversations_list', conversations);
    });

    socket.on('get_messages', async ({ peerId }) => {
      if (!currentUserId) return;
      const { Op } = require('sequelize');
      const messages = await DirectMessage.findAll({
        where: {
          [Op.or]: [
            { fromUserId: currentUserId, toUserId: peerId },
            { fromUserId: peerId, toUserId: currentUserId },
          ],
        },
        order: [['createdAt', 'ASC']],
        limit: 100,
      });

      await DirectMessage.update(
        { read: true },
        { where: { fromUserId: peerId, toUserId: currentUserId, read: false } },
      );

      socket.emit('messages_history', {
        peerId,
        messages: messages.map((m) => ({
          id: m.id,
          fromUserId: m.fromUserId,
          text: m.text,
          timestamp: new Date(m.createdAt).getTime(),
        })),
      });
    });

    socket.on('send_dm', async ({ toUserId, text }) => {
      if (!currentUserId || !text?.trim()) return;
      if (await isChatBanned(currentUserId)) {
        socket.emit('dm_error', { error: 'Sohbet yetkiniz geçici olarak kısıtlandı.' });
        return;
      }
      const trimmed = text.trim().slice(0, 500);

      const msg = await DirectMessage.create({
        fromUserId: currentUserId,
        toUserId,
        fromUsername: currentUsername,
        text: trimmed,
      });

      const msgData = {
        id: msg.id,
        fromUserId: currentUserId,
        fromUsername: currentUsername,
        text: trimmed,
        timestamp: new Date(msg.createdAt).getTime(),
      };

      socket.emit('new_dm', { peerId: toUserId, message: msgData });
      const toSocket = friends.getSocketId(toUserId);
      if (toSocket) {
        io.sockets.sockets.get(toSocket)?.emit('new_dm', { peerId: currentUserId, message: msgData });
      }
    });

    socket.on('mark_read', async ({ peerId }) => {
      if (!currentUserId) return;
      await DirectMessage.update(
        { read: true },
        { where: { fromUserId: peerId, toUserId: currentUserId, read: false } },
      );
    });

    // ── GAME INVITES ──
    const pendingInvites = io._pendingInvites || (io._pendingInvites = new Map());
    // { until: timestamp, streak: number } — progressive cooldown per pair
    const inviteCooldowns = io._inviteCooldowns || (io._inviteCooldowns = new Map());
    const BASE_COOLDOWN_MS = 15000;
    const MAX_COOLDOWN_MS  = 120000;

    function applyCooldown(pairKey) {
      const prev = inviteCooldowns.get(pairKey);
      const streak = prev ? prev.streak + 1 : 1;
      const ms = Math.min(BASE_COOLDOWN_MS * Math.pow(2, streak - 1), MAX_COOLDOWN_MS);
      inviteCooldowns.set(pairKey, { until: Date.now() + ms, streak });
    }

    socket.on('invite_friend', async ({ friendId, difficulty, category, mode }) => {
      if (!currentUserId) return;

      const pairKey = [currentUserId, friendId].sort().join(':');
      const cd = inviteCooldowns.get(pairKey);
      if (cd && Date.now() < cd.until) {
        const secs = Math.ceil((cd.until - Date.now()) / 1000);
        socket.emit('invite_error', { error: `Lütfen ${secs} saniye bekleyin` });
        return;
      }
      // Clear expired cooldown so streak resets after a long pause
      if (cd && Date.now() >= cd.until + MAX_COOLDOWN_MS) {
        inviteCooldowns.delete(pairKey);
      }
      for (const [, inv] of pendingInvites) {
        if ((inv.fromId === currentUserId && inv.toId === friendId) || (inv.fromId === friendId && inv.toId === currentUserId)) {
          socket.emit('invite_error', { error: 'Zaten aktif bir davet var' });
          return;
        }
      }

      const friendSocketId = friends.getSocketId(friendId);
      if (!friendSocketId) {
        socket.emit('invite_error', { error: 'Arkadaşınız çevrimdışı' });
        return;
      }

      const inviteId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fromUser = await UserModel.findOne({ where: { oduserId: currentUserId }, attributes: ['avatar'] });

      const invite = {
        inviteId,
        fromId: currentUserId,
        fromUsername: currentUsername,
        fromAvatar: fromUser?.avatar || null,
        fromSocketId: socket.id,
        toId: friendId,
        toSocketId: friendSocketId,
        difficulty: difficulty || 'medium',
        category: category || 'all',
        mode: mode || '1v1',
        createdAt: Date.now(),
      };

      invite.timeout = setTimeout(() => {
        pendingInvites.delete(inviteId);
        applyCooldown([invite.fromId, invite.toId].sort().join(':'));
        socket.emit('invite_expired', { inviteId });
        const tSock = io.sockets.sockets.get(friendSocketId);
        if (tSock) tSock.emit('invite_expired', { inviteId });
      }, 30000);

      pendingInvites.set(inviteId, invite);

      socket.emit('invite_sent', { inviteId, toUsername: friends.isOnline(friendId) ? (await UserModel.findOne({ where: { oduserId: friendId }, attributes: ['username'] }))?.username : friendId });

      const targetSock = io.sockets.sockets.get(friendSocketId);
      if (targetSock) {
        targetSock.emit('match_invite', {
          inviteId,
          fromId: currentUserId,
          fromUsername: currentUsername,
          fromAvatar: invite.fromAvatar,
          difficulty: invite.difficulty,
          category: invite.category,
          mode: invite.mode,
        });
      }
    });

    socket.on('invite_accept', async ({ inviteId }) => {
      const invite = pendingInvites.get(inviteId);
      if (!invite) {
        socket.emit('invite_error', { error: 'Davet bulunamadı veya süresi doldu' });
        return;
      }
      if (invite.toId !== currentUserId) return;

      clearTimeout(invite.timeout);
      pendingInvites.delete(inviteId);

      const hostSocket = io.sockets.sockets.get(invite.fromSocketId);
      if (!hostSocket || !hostSocket.connected) {
        socket.emit('invite_error', { error: 'Davet eden oyuncu artık çevrimiçi değil' });
        return;
      }

      const [hostPw, guestPw] = await Promise.all([loadPlayerPowerups(invite.fromId), loadPlayerPowerups(currentUserId)]);
      const match = await createMatch(
        { socketId: invite.fromSocketId, userId: invite.fromId, username: invite.fromUsername, powerups: hostPw },
        { socketId: socket.id, userId: currentUserId, username: currentUsername, powerups: guestPw },
        invite.difficulty, invite.category, invite.mode,
      );

      hostSocket.join(match.id);
      socket.join(match.id);

      const [p1Data, p2Data] = await Promise.all([
        UserModel.findOne({ where: { oduserId: invite.fromId }, attributes: ['avatar'] }),
        UserModel.findOne({ where: { oduserId: currentUserId }, attributes: ['avatar'] }),
      ]);

      io.to(match.id).emit('match_found', {
        matchId: match.id,
        difficulty: invite.difficulty,
        category: match.category,
        mode: match.mode,
        players: [
          { userId: invite.fromId, username: invite.fromUsername, avatar: p1Data?.avatar || null },
          { userId: currentUserId, username: currentUsername, avatar: p2Data?.avatar || null },
        ],
        totalQuestions: match.questions.length,
        timePerQuestion: match.timePerQuestion,
        playerPowerups: {
          [invite.fromId]: match.players[invite.fromId].powerups,
          [currentUserId]: match.players[currentUserId].powerups,
        },
      });

      setTimeout(() => sendQuestion(io, match.id), 3000);
    });

    socket.on('invite_reject', ({ inviteId }) => {
      const invite = pendingInvites.get(inviteId);
      if (!invite || invite.toId !== currentUserId) return;

      clearTimeout(invite.timeout);
      pendingInvites.delete(inviteId);

      applyCooldown([invite.fromId, invite.toId].sort().join(':'));

      const hostSocket = io.sockets.sockets.get(invite.fromSocketId);
      if (hostSocket) {
        hostSocket.emit('invite_rejected', { inviteId, byUsername: currentUsername });
      }
    });

    // ── LEADERBOARD & STATS ──
    socket.on('get_leaderboard', async ({ type }) => { socket.emit('leaderboard', await getLeaderboard(type || 'rating')); });
    socket.on('get_stats', async ({ userId }) => { socket.emit('player_stats', await getPlayerStats(userId || currentUserId)); });

    // ── NOTIFICATIONS ──
    socket.on('get_notifications', async ({ unreadOnly } = {}) => {
      if (!currentUserId) return;
      const notifs = await getNotifications(currentUserId, 50, !!unreadOnly);
      const unread = await getUnreadCount(currentUserId);
      socket.emit('notifications_list', { notifications: notifs, unreadCount: unread });
    });
    socket.on('mark_notification_read', async ({ notificationId }) => {
      if (!currentUserId) return;
      await markRead(currentUserId, notificationId);
      socket.emit('notification_read_ok', { notificationId });
    });
    socket.on('mark_all_notifications_read', async () => {
      if (!currentUserId) return;
      await markAllRead(currentUserId);
      socket.emit('notifications_all_read_ok');
    });
    socket.on('get_unread_count', async () => {
      if (!currentUserId) return;
      socket.emit('unread_count', { count: await getUnreadCount(currentUserId) });
    });

    // ── QUESTION REPORTS ──
    socket.on('report_question', async ({ questionId, reason, description }) => {
      if (!currentUserId) return;
      try {
        const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
        if (!user) return;
        const question = await QuestionModel.findOne({ where: { id: questionId } });
        if (!question) { socket.emit('report_result', { success: false, error: 'Soru bulunamadı' }); return; }
        const existing = await QuestionReportModel.findOne({ where: { questionId, userId: user.id } });
        if (existing) { socket.emit('report_result', { success: false, error: 'Bu soruyu zaten raporladınız' }); return; }
        await QuestionReportModel.create({ questionId, userId: user.id, reason, description: description || null });
        socket.emit('report_result', { success: true });
      } catch (e) {
        socket.emit('report_result', { success: false, error: 'Raporlama başarısız' });
      }
    });

    // ── SHOP ──
    socket.on('get_shop', async () => {
      if (!currentUserId) return;
      const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
      if (!user) return;
      const dbItems = await ShopItemModel.findAll({ where: { isActive: true }, order: [['id', 'ASC']] });
      const source = dbItems.length ? dbItems : SHOP_ITEMS;
      const items = source.map((item) => {
        const id = item.itemKey || item.id;
        const field = item.userField || item.field;
        const name = item.name;
        const desc = item.description || item.desc;
        const price = item.price;
        const icon = item.icon || 'gift';
        return { id, name, desc, price, icon, owned: field ? (user[field] || 0) : null };
      });
      socket.emit('shop_data', { coins: user.coins, items });
    });

    socket.on('get_balance', async () => {
      if (!currentUserId) return;
      const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
      if (!user) return;
      socket.emit('balance', {
        coins: user.coins,
        powerups: {
          fifty_fifty: user.ownedFiftyFifty || 0,
          time_freeze: user.ownedTimeFreeze || 0,
          double_points: user.ownedDoublePoints || 0,
          hint: user.ownedHint || 0,
        },
      });
    });

    socket.on('buy_item', async ({ itemId }) => {
      if (!currentUserId) return;
      const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
      if (!user) { socket.emit('buy_result', { success: false, error: 'Kullanıcı bulunamadı' }); return; }

      let item = await ShopItemModel.findOne({ where: { itemKey: itemId, isActive: true } });
      if (!item) item = SHOP_ITEMS.find((i) => i.id === itemId);
      if (!item) { socket.emit('buy_result', { success: false, error: 'Ürün bulunamadı' }); return; }

      const price = item.price;
      const name = item.name || item.itemKey;
      const field = item.userField || item.field;

      if (user.coins < price) {
        socket.emit('buy_result', { success: false, error: 'Yetersiz bakiye' });
        return;
      }

      user.coins -= price;

      if (itemId === 'bundle') {
        user.ownedFiftyFifty += 1;
        user.ownedTimeFreeze += 1;
        user.ownedDoublePoints += 1;
        user.ownedHint += 1;
      } else if (field) {
        user[field] += 1;
      }

      await user.save();

      try {
        await PurchaseHistoryModel.create({
          userId: user.id,
          itemKey: itemId,
          itemName: name,
          price,
          quantity: itemId === 'bundle' ? 4 : 1,
        });
      } catch (e) { console.error('PurchaseHistory log:', e.message); }

      socket.emit('buy_result', {
        success: true,
        itemId,
        coins: user.coins,
        powerups: {
          fifty_fifty: user.ownedFiftyFifty,
          time_freeze: user.ownedTimeFreeze,
          double_points: user.ownedDoublePoints,
          hint: user.ownedHint,
        },
      });
    });

    // ── SEASON ──
    socket.on('get_season_info', async () => {
      if (!currentUserId) return;
      const info = await getSeasonInfo(currentUserId);
      socket.emit('season_info', info);
    });
    socket.on('claim_season_reward', async ({ tier }) => {
      if (!currentUserId) return;
      const result = await claimSeasonReward(currentUserId, tier);
      socket.emit('season_reward_claimed', result);
      if (result && result.success) {
        const info = await getSeasonInfo(currentUserId);
        socket.emit('season_info', info);
      }
    });

    // ── QUESTS ──
    socket.on('get_quests', async () => {
      if (!currentUserId) return;
      await generateDailyQuests(currentUserId);
      await generateWeeklyQuests(currentUserId);
      const quests = await getQuests(currentUserId);
      socket.emit('quests_list', quests);
    });
    socket.on('claim_quest_reward', async ({ questId }) => {
      if (!currentUserId) return;
      const result = await claimQuestReward(currentUserId, questId);
      if (result) {
        socket.emit('quest_claimed', { success: true, ...result });
      } else {
        socket.emit('quest_claimed', { success: false, error: 'Ödül alınamadı' });
      }
    });

    // ── COSMETICS ──
    socket.on('get_cosmetics', async () => {
      if (!currentUserId) return;
      try {
        const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
        if (!user) return;
        const owned = await UserCosmeticModel.findAll({ where: { userId: user.id } });
        const ownedKeys = owned.map((c) => c.cosmeticKey);
        const { Achievement } = require('../models');
        const achievements = await Achievement.findAll({ where: { userId: user.id } });
        const achKeys = achievements.map((a) => a.achievementKey);

        let framesList = await CosmeticFrameModel.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
        if (!framesList || framesList.length === 0) {
          framesList = COSMETICS.frames.map((f) => ({ key: f.key, name: f.name, unlockLevel: f.unlockLevel, colors: f.colors || [], style: 'gradient', sortOrder: 0 }));
        } else {
          framesList = framesList.map((f) => ({ key: f.key, name: f.name, unlockLevel: f.unlockLevel, colors: f.colors || [], style: f.style || 'gradient' }));
        }
        const allFrames = framesList.map((f) => ({
          ...f,
          type: 'frame',
          unlocked: user.level >= f.unlockLevel,
          owned: ownedKeys.includes(f.key),
          active: user.activeFrame === f.key,
        }));
        const allBadges = COSMETICS.badges.map((b) => ({
          ...b,
          unlocked: achKeys.includes(b.unlockAchievement),
          owned: ownedKeys.includes(b.key),
          active: user.activeBadge === b.key,
        }));
        socket.emit('cosmetics_list', { frames: allFrames, badges: allBadges, activeFrame: user.activeFrame, activeBadge: user.activeBadge });
      } catch (e) {
        console.error('Cosmetics error:', e.message);
      }
    });

    socket.on('set_active_cosmetic', async ({ cosmeticKey, cosmeticType }) => {
      if (!currentUserId) return;
      try {
        const user = await UserModel.findOne({ where: { oduserId: currentUserId } });
        if (!user) return;

        if (cosmeticKey === null) {
          if (cosmeticType === 'frame') user.activeFrame = null;
          else user.activeBadge = null;
          await user.save();
          socket.emit('cosmetic_updated', { success: true, activeFrame: user.activeFrame, activeBadge: user.activeBadge });
          return;
        }

        let template;
        if (cosmeticType === 'frame') {
          const dbFrame = await CosmeticFrameModel.findOne({ where: { key: cosmeticKey } });
          template = dbFrame ? { key: dbFrame.key, unlockLevel: dbFrame.unlockLevel } : COSMETICS.frames.find((f) => f.key === cosmeticKey);
        } else {
          template = COSMETICS.badges.find((b) => b.key === cosmeticKey);
        }
        if (!template) { socket.emit('cosmetic_updated', { success: false, error: 'Kozmetik bulunamadı' }); return; }

        const unlocked = cosmeticType === 'frame'
          ? user.level >= template.unlockLevel
          : (await (require('../models').Achievement).findOne({ where: { userId: user.id, achievementKey: template.unlockAchievement } })) !== null;
        if (!unlocked) { socket.emit('cosmetic_updated', { success: false, error: 'Bu kozmetik henüz kilidi açılmadı' }); return; }

        await UserCosmeticModel.findOrCreate({ where: { userId: user.id, cosmeticKey }, defaults: { cosmeticType } });
        if (cosmeticType === 'frame') user.activeFrame = cosmeticKey;
        else user.activeBadge = cosmeticKey;
        await user.save();
        socket.emit('cosmetic_updated', { success: true, activeFrame: user.activeFrame, activeBadge: user.activeBadge });
      } catch (e) {
        socket.emit('cosmetic_updated', { success: false, error: 'Hata' });
      }
    });

    // ── DISCONNECT ──
    socket.on('disconnect', () => {
      const prev = botFallbackTimeouts.get(socket.id);
      if (prev) { clearTimeout(prev.timeout); botFallbackTimeouts.delete(socket.id); }
      leaveQueue(socket.id);
      if (currentUserId) {
        friends.unregister(currentUserId);
        // Clean up pending invites from/to this user
        for (const [id, inv] of pendingInvites) {
          if (inv.fromId === currentUserId || inv.toId === currentUserId) {
            clearTimeout(inv.timeout);
            pendingInvites.delete(id);
          }
        }
      }
      handlePlayerDisconnect(io, socket.id);
    });
  });
}

// ── SOLO MODE ──
async function handleSoloMode(socket, userId, username, difficulty, category) {
  const questions = await getRandomQuestions(difficulty, 5, category === 'all' ? null : category);
  const soloState = { questions, current: 0, score: 0, correctCount: 0, difficulty, category, timer: null, finished: false, userId, username };

  socket.emit('solo_start', { totalQuestions: questions.length, timePerQuestion: 15 });
  setTimeout(() => sendSoloQuestion(socket, soloState), 1000);

  const handleSoloAnswer = async ({ questionId, selected }) => {
    if (soloState.finished) return;
    if (soloState.timer) { clearTimeout(soloState.timer); soloState.timer = null; }
    const q = soloState.questions[soloState.current];
    if (!q || q.id !== questionId) return;
    const isCorrect = await checkAnswer(questionId, selected);
    if (isCorrect) {
      const pts = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 30;
      soloState.score += pts;
      soloState.correctCount++;
    }
    const correct = await getCorrectAnswer(questionId);
    socket.emit('solo_round_result', { correct: isCorrect, correctAnswer: correct, score: soloState.score });
    soloState.current++;
    setTimeout(() => {
      if (soloState.current >= soloState.questions.length) {
        finishSolo(socket, soloState, userId, username);
      } else { sendSoloQuestion(socket, soloState); }
    }, 2500);
  };

  socket.on('solo_answer', handleSoloAnswer);
  socket.once('disconnect', () => {
    soloState.finished = true;
    if (soloState.timer) clearTimeout(soloState.timer);
    socket.off('solo_answer', handleSoloAnswer);
  });
}

async function finishSolo(socket, soloState, userId, username) {
  soloState.finished = true;
  socket.emit('solo_finished', { score: soloState.score, correctCount: soloState.correctCount, totalQuestions: soloState.questions.length });
  if (!userId || !username) return;
  await recordMatchResult(userId, username, {
    matchKey: `solo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    won: soloState.correctCount > soloState.questions.length / 2,
    draw: false,
    myScore: soloState.score,
    opponentScore: 0,
    opponentUsername: 'Solo',
    correctAnswers: soloState.correctCount,
    totalQuestions: soloState.questions.length,
    category: soloState.category || 'all',
    difficulty: soloState.difficulty,
    mode: 'solo',
  });
}

function sendSoloQuestion(socket, state) {
  if (state.finished) return;
  const q = state.questions[state.current];
  socket.emit('solo_question', { questionIndex: state.current, totalQuestions: state.questions.length, question: { id: q.id, text: q.text, options: q.options }, timePerQuestion: 15 });

  // Server-side timeout: auto-skip if no answer in 16s
  state.timer = setTimeout(async () => {
    const correct = await getCorrectAnswer(q.id);
    socket.emit('solo_round_result', { correct: false, correctAnswer: correct, score: state.score });
    state.current++;
    setTimeout(() => {
      if (state.current >= state.questions.length) {
        finishSolo(socket, state, state.userId || null, state.username || null);
      } else { sendSoloQuestion(socket, state); }
    }, 2500);
  }, 16000);
}

// ── SURVIVAL MODE ──
async function handleSurvivalMode(socket, userId, username, category) {
  const catFilter = category === 'all' ? null : category;
  // Progressive difficulty: easy → medium → hard
  const easy = await getRandomQuestions('easy', 5, catFilter);
  const medium = await getRandomQuestions('medium', 5, catFilter);
  const hard = await getRandomQuestions('hard', 5, catFilter);
  const ordered = [...easy, ...medium, ...hard];

  const survState = { questions: ordered, current: 0, score: 0, lives: 3, timer: null, finished: false, userId, username, category };
  socket.emit('survival_start', { totalQuestions: ordered.length, lives: 3, timePerQuestion: 12 });
  setTimeout(() => sendSurvivalQuestion(socket, survState), 1000);

  const handleSurvivalAnswer = async ({ questionId, selected }) => {
    if (survState.finished) return;
    if (survState.timer) { clearTimeout(survState.timer); survState.timer = null; }
    const q = survState.questions[survState.current];
    if (!q || q.id !== questionId) return;
    const isCorrect = await checkAnswer(questionId, selected);
    const correct = await getCorrectAnswer(questionId);

    // Scoring: easy=10, medium=20, hard=30
    if (isCorrect) {
      const diff = getDifficultyForSurvivalIndex(survState.current);
      const pts = diff === 'easy' ? 10 : diff === 'medium' ? 20 : 30;
      survState.score += pts;
    } else {
      survState.lives--;
    }

    socket.emit('survival_round_result', { correct: isCorrect, correctAnswer: correct, score: survState.score, lives: survState.lives });
    survState.current++;
    setTimeout(() => checkSurvivalEnd(socket, survState), 2500);
  };

  socket.on('survival_answer', handleSurvivalAnswer);
  socket.once('disconnect', () => {
    survState.finished = true;
    if (survState.timer) clearTimeout(survState.timer);
    socket.off('survival_answer', handleSurvivalAnswer);
  });
}

function getDifficultyForSurvivalIndex(idx) {
  if (idx < 5) return 'easy';
  if (idx < 10) return 'medium';
  return 'hard';
}

async function checkSurvivalEnd(socket, state) {
  if (state.finished) return;
  if (state.lives <= 0) {
    finishSurvival(socket, state, 'no_lives');
  } else if (state.current >= state.questions.length) {
    finishSurvival(socket, state, 'completed');
  } else {
    sendSurvivalQuestion(socket, state);
  }
}

async function finishSurvival(socket, state, reason) {
  state.finished = true;
  socket.emit('survival_finished', { score: state.score, questionsAnswered: state.current, reason });
  if (state.userId) {
    await recordMatchResult(state.userId, state.username, {
      matchKey: `surv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      won: reason === 'completed',
      draw: false,
      myScore: state.score,
      opponentScore: 0,
      opponentUsername: 'Survival',
      correctAnswers: Math.round(state.score / 15),
      totalQuestions: state.current,
      category: state.category || 'all',
      difficulty: 'medium',
      mode: 'survival',
    });
  }
}

function sendSurvivalQuestion(socket, state) {
  if (state.finished) return;
  const q = state.questions[state.current];
  const diff = getDifficultyForSurvivalIndex(state.current);
  socket.emit('survival_question', {
    questionIndex: state.current, question: { id: q.id, text: q.text, options: q.options },
    lives: state.lives, score: state.score, timePerQuestion: 12,
    difficulty: diff,
  });

  // Server-side timeout: auto-wrong if no answer in 13s
  state.timer = setTimeout(async () => {
    const correct = await getCorrectAnswer(q.id);
    state.lives--;
    socket.emit('survival_round_result', { correct: false, correctAnswer: correct, score: state.score, lives: state.lives });
    state.current++;
    setTimeout(() => checkSurvivalEnd(socket, state), 2500);
  }, 13000);
}

// ── BATTLE ROYALE FLOW ──
function sendRoyaleQuestion(io, matchId) {
  const match = getMatch(matchId);
  if (!match || match.status !== 'playing') return;
  const aliveIds = Object.keys(match.players).filter((id) => match.players[id].alive);
  if (aliveIds.length <= 1) {
    endRoyaleMatch(io, match);
    return;
  }
  let idx = match.currentQuestionIndex;
  while (idx < match.questions.length) {
    const question = match.questions[idx];
    match.answeredThisRound = new Set();
    match.questionSentAt = Date.now();
    match.currentQuestionIndex = idx;
    io.to(matchId).emit('new_question', {
      questionIndex: idx,
      totalQuestions: match.questions.length,
      question: { id: question.id, text: question.text, options: question.options },
      timePerQuestion: match.timePerQuestion,
      survivorsCount: aliveIds.length,
    });
    match.timer = setTimeout(() => sendRoyaleRoundResult(io, match), match.timePerQuestion * 1000);
    if (match.isBotMatch) scheduleRoyaleBotAnswers(io, match);
    return;
  }
  endRoyaleMatch(io, match);
}

function scheduleRoyaleBotAnswers(io, match) {
  const botIds = Object.keys(match.players).filter((id) => id.startsWith('bot_') && match.players[id].alive);
  const question = match.questions[match.currentQuestionIndex];
  if (!question) return;
  const correctChance = match.difficulty === 'easy' ? 0.75 : match.difficulty === 'medium' ? 0.6 : 0.45;
  const wrongIndices = question.options ? question.options.map((_, i) => i).filter((i) => i !== question.correct) : [];

  for (const botId of botIds) {
    const isCorrect = Math.random() < correctChance;
    const selected = isCorrect ? question.correct : (wrongIndices.length > 0 ? wrongIndices[Math.floor(Math.random() * wrongIndices.length)] : 0);
    const delayMs = 1500 + Math.random() * 6000;
    setTimeout(async () => {
      const m = getMatch(match.id);
      if (!m || m.status !== 'playing' || m.currentQuestionIndex !== match.currentQuestionIndex) return;
      const bot = m.players[botId];
      if (!bot || !bot.alive || bot.answers[question.id] !== undefined) return;

      bot.answers[question.id] = { selected, correct: isCorrect };
      m.answeredThisRound.add(botId);
      if (!isCorrect) {
        bot.alive = false;
        bot.eliminatedAt = m.currentQuestionIndex;
        io.to(m.id).emit('player_eliminated', { userId: botId, username: bot.username });
      } else {
        io.to(m.id).emit('player_answered', { userId: botId });
      }
      const aliveIds = Object.keys(m.players).filter((id) => m.players[id].alive);
      const aliveAnswered = aliveIds.filter((id) => m.answeredThisRound.has(id));
      if (aliveAnswered.length >= aliveIds.length) {
        if (m.timer) { clearTimeout(m.timer); m.timer = null; }
        sendRoyaleRoundResult(io, m);
      }
    }, delayMs);
  }
}

async function sendRoyaleRoundResult(io, match) {
  if (match.timer) { clearTimeout(match.timer); match.timer = null; }
  const idx = match.currentQuestionIndex;
  const question = match.questions[idx];
  const correctAnswer = await getCorrectAnswer(question.id);

  const aliveIds = Object.keys(match.players).filter((id) => match.players[id].alive);
  for (const pId of aliveIds) {
    const p = match.players[pId];
    const answer = p.answers[question.id];
    if (!answer) {
      p.alive = false;
      p.eliminatedAt = idx;
    } else if (!answer.correct) {
      p.alive = false;
      p.eliminatedAt = idx;
    }
  }

  const eliminatedThisRound = Object.keys(match.players).filter((id) => match.players[id].eliminatedAt === idx);
  const survivors = Object.keys(match.players).filter((id) => match.players[id].alive);

  io.to(match.id).emit('round_result', {
    questionIndex: idx,
    correctAnswer,
    results: Object.fromEntries(
      Object.entries(match.players).map(([id, p]) => [
        id,
        { username: p.username, selected: p.answers[question.id]?.selected ?? -1, correct: p.answers[question.id]?.correct ?? false },
      ])
    ),
    eliminated: eliminatedThisRound.map((id) => ({ userId: id, username: match.players[id].username })),
    survivorsCount: survivors.length,
  });

  match.currentQuestionIndex++;
  if (survivors.length <= 1) {
    setTimeout(() => endRoyaleMatch(io, match), 2500);
  } else {
    setTimeout(() => sendRoyaleQuestion(io, match.id), 2500);
  }
}

async function endRoyaleMatch(io, match) {
  if (match.timer) { clearTimeout(match.timer); match.timer = null; }
  match.status = 'finished';
  const survivors = Object.keys(match.players).filter((id) => match.players[id].alive);
  const winnerId = survivors.length === 1 ? survivors[0] : null;
  const scores = {};
  for (const [id, p] of Object.entries(match.players)) {
    scores[id] = { username: p.username, alive: p.alive, eliminatedAt: p.eliminatedAt };
  }
  const leaderboard = [...Object.entries(match.players)]
    .sort((a, b) => {
      if (a[1].alive && !b[1].alive) return -1;
      if (!a[1].alive && b[1].alive) return 1;
      return (a[1].eliminatedAt ?? 999) - (b[1].eliminatedAt ?? 999);
    })
    .map(([id, p]) => ({ userId: id, username: p.username, alive: p.alive, eliminatedAt: p.eliminatedAt }));

  const coinGains = {};
  for (const pId of Object.keys(match.players)) {
    if (pId.startsWith('bot_')) { coinGains[pId] = 0; continue; }
    const result = await recordMatchResult(pId, match.players[pId].username, {
      matchKey: match.id,
      won: winnerId === pId,
      draw: winnerId === null,
      myScore: winnerId === pId ? 1 : 0,
      opponentScore: 0,
      opponentUsername: 'Battle Royale',
      correctAnswers: Object.values(match.players[pId].answers).filter((a) => a.correct).length,
      totalQuestions: match.currentQuestionIndex,
      category: match.category,
      difficulty: match.difficulty,
      mode: 'royale',
    });
    coinGains[pId] = result?.coinGain || 0;
  }

  io.to(match.id).emit('match_finished', {
    matchId: match.id,
    scores,
    winnerId,
    draw: winnerId === null,
    coinGains,
    leaderboard,
    mode: 'royale',
  });
  setTimeout(() => removeMatch(match.id), 10000);
}

// ── MULTIPLAYER ROUND FLOW ──
function sendQuestion(io, matchId) {
  const match = getMatch(matchId);
  if (!match || match.status !== 'playing') return;
  const idx = match.currentQuestionIndex;
  if (idx >= match.questions.length) { endMatch(io, match); return; }

  const question = match.questions[idx];
  match.answeredThisRound = new Set();
  match.questionSentAt = Date.now();
  if (match.isBotMatch) match.botChatSentThisRound = false;
  io.to(matchId).emit('new_question', {
    questionIndex: idx, totalQuestions: match.questions.length,
    question: { id: question.id, text: question.text, options: question.options },
    timePerQuestion: match.timePerQuestion,
  });
  match.timer = setTimeout(() => sendRoundResult(io, match), match.timePerQuestion * 1000);

  if (match.isBotMatch) {
    if (match.mode === 'race') scheduleRaceBotAnswers(io, match);
    else {
      scheduleBotAnswer(io, match);
      setTimeout(() => maybeSendBotChat(io, match), 4000 + Math.random() * 6000);
    }
  }
}

function scheduleRaceBotAnswers(io, match) {
  const botIds = Object.keys(match.players).filter((id) => id.startsWith('bot_'));
  const question = match.questions[match.currentQuestionIndex];
  if (!question) return;
  const correctChance = match.difficulty === 'easy' ? 0.7 : match.difficulty === 'medium' ? 0.55 : 0.4;
  const wrongIndices = question.options ? question.options.map((_, i) => i).filter((i) => i !== question.correct) : [];

  for (const botId of botIds) {
    const isCorrect = Math.random() < correctChance;
    const selected = isCorrect ? question.correct : (wrongIndices.length > 0 ? wrongIndices[Math.floor(Math.random() * wrongIndices.length)] : 0);
    const delayMs = 2000 + Math.random() * 8000;
    setTimeout(async () => {
      const m = getMatch(match.id);
      if (!m || m.status !== 'playing' || m.currentQuestionIndex !== match.currentQuestionIndex) return;
      const bot = m.players[botId];
      if (!bot || bot.answers[question.id] !== undefined) return;

      const responseTime = delayMs;
      bot.answers[question.id] = { selected, correct: isCorrect, responseTime };
      if (isCorrect) {
        let points = m.difficulty === 'easy' ? 10 : m.difficulty === 'medium' ? 20 : 30;
        const totalMs = m.timePerQuestion * 1000;
        const remaining = Math.max(0, totalMs - responseTime);
        points += Math.floor((remaining / totalMs) * 15);
        bot.score += points;
        bot.correctCount++;
      }
      m.answeredThisRound.add(botId);
      io.to(m.id).emit('player_answered', { userId: botId });

      if (Object.keys(m.players).every((id) => m.answeredThisRound.has(id))) {
        if (m.timer) { clearTimeout(m.timer); m.timer = null; }
        sendRoundResult(io, m);
      }
    }, delayMs);
  }
}

async function scheduleBotAnswer(io, match) {
  const botId = Object.keys(match.players).find((id) => id.startsWith('bot_'));
  if (!botId) return;
  const question = match.questions[match.currentQuestionIndex];
  if (!question) return;

  const correctChance = match.difficulty === 'easy' ? 0.7 : match.difficulty === 'medium' ? 0.55 : 0.4;
  const isCorrect = Math.random() < correctChance;
  const wrongIndices = question.options ? question.options.map((_, i) => i).filter((i) => i !== question.correct) : [];
  const selected = isCorrect ? question.correct : (wrongIndices.length > 0 ? wrongIndices[Math.floor(Math.random() * wrongIndices.length)] : 0);

  const delayMs = 2000 + Math.random() * 5000;
  setTimeout(async () => {
    const m = getMatch(match.id);
    if (!m || m.status !== 'playing' || m.currentQuestionIndex !== match.currentQuestionIndex) return;
    const bot = m.players[botId];
    if (!bot || bot.answers[question.id] !== undefined) return;

    bot.answers[question.id] = { selected, correct: isCorrect };
    if (isCorrect) {
      let points = m.difficulty === 'easy' ? 10 : m.difficulty === 'medium' ? 20 : 30;
      bot.score += points;
      bot.correctCount++;
    }
    m.answeredThisRound.add(botId);
    io.to(match.id).emit('player_answered', { userId: botId });

    if (Object.keys(m.players).every((id) => m.answeredThisRound.has(id))) {
      if (m.timer) { clearTimeout(m.timer); m.timer = null; }
      sendRoundResult(io, m);
    }
  }, delayMs);
}

async function sendRoundResult(io, match) {
  if (match.timer) { clearTimeout(match.timer); match.timer = null; }
  const idx = match.currentQuestionIndex;
  const question = match.questions[idx];
  const playerIds = Object.keys(match.players);

  const results = {};
  for (const pId of playerIds) {
    const p = match.players[pId];
    const answer = p.answers[question.id];
    results[pId] = { username: p.username, selected: answer ? answer.selected : -1, correct: answer ? answer.correct : false, score: p.score };
  }

  const correctAnswer = await getCorrectAnswer(question.id);
  const payload = { questionIndex: idx, correctAnswer, results };
  if (match.mode === 'race') {
    payload.leaderboard = playerIds.sort((a, b) => match.players[b].score - match.players[a].score).map((id) => ({ userId: id, username: match.players[id].username, score: match.players[id].score }));
  }
  io.to(match.id).emit('round_result', payload);

  if (match.isBotMatch && match.mode !== 'race') setTimeout(() => maybeSendBotChat(io, match), 4000 + Math.random() * 5000);

  match.currentQuestionIndex++;
  setTimeout(() => {
    if (match.currentQuestionIndex >= match.questions.length) endMatch(io, match);
    else sendQuestion(io, match.id);
  }, 3000);
}

async function endMatch(io, match) {
  if (match.mode === 'race') {
    finalizeMatch(io, match);
    return;
  }
  if (match.mode === '1v1' || match.mode === 'quick') {
    match.status = 'voting';
    match.votes = {};
    match.roundNumber = (match.roundNumber || 1);

    const playerIds = Object.keys(match.players);
    const scores = {};
    for (const pId of playerIds) scores[pId] = { username: match.players[pId].username, score: match.players[pId].score };

    let winnerId = null;
    if (playerIds.length === 2) {
      const [p1, p2] = playerIds;
      if (match.players[p1].score > match.players[p2].score) winnerId = p1;
      else if (match.players[p2].score > match.players[p1].score) winnerId = p2;
    }

    io.to(match.id).emit('round_complete', {
      matchId: match.id,
      scores,
      winnerId,
      draw: winnerId === null,
      roundNumber: match.roundNumber,
      voteTimeout: 15,
    });

    // Bot maçında bot rastgele oy verir (2-6 saniye sonra)
    if (match.isBotMatch) {
      const botId = Object.keys(match.players).find((id) => id.startsWith('bot_'));
      if (botId) {
        const botVoteDelay = 2000 + Math.random() * 4000;
        setTimeout(() => processBotVote(io, match, botId), botVoteDelay);
      }
    }

    // 15 second timeout: if not all voted, finalize
    match.voteTimer = setTimeout(() => {
      if (match.status === 'voting') {
        finalizeMatch(io, match);
      }
    }, 15000);
    return;
  }

  // For solo/survival, finish directly
  finalizeMatch(io, match);
}

function processBotVote(io, match, botId) {
  if (!match || match.status !== 'voting') return;
  const vote = Math.random() < 0.6;
  if (!match.votes) match.votes = {};
  match.votes[botId] = vote;
  io.to(match.id).emit('vote_update', { userId: botId, vote });

  const playerIds = Object.keys(match.players);
  const allVoted = playerIds.every((id) => match.votes[id] !== undefined);
  if (allVoted) {
    if (match.voteTimer) { clearTimeout(match.voteTimer); match.voteTimer = null; }
    const allAccepted = playerIds.every((id) => match.votes[id] === true);
    if (allAccepted) {
      startNewRound(io, match);
    } else {
      finalizeMatch(io, match);
    }
  }
}

async function startNewRound(io, match) {
  match.roundNumber = (match.roundNumber || 1) + 1;
  match.status = 'playing';
  match.votes = {};

  // Load new questions
  const isQuick = match.mode === 'quick';
  const qCount = isQuick ? 3 : 5;
  const newQuestions = await getRandomQuestions(match.difficulty, qCount, match.category === 'all' ? null : match.category);
  match.questions = [...match.questions, ...newQuestions];
  match.currentQuestionIndex = match.questions.length - newQuestions.length;

  // Reset player answers for new questions but keep scores
  const playerIds = Object.keys(match.players);
  for (const pId of playerIds) {
    match.players[pId].doubleActive = false;
  }

  io.to(match.id).emit('new_round_starting', {
    roundNumber: match.roundNumber,
    totalQuestions: newQuestions.length,
  });

  setTimeout(() => sendQuestion(io, match.id), 2000);
}

async function finalizeMatch(io, match) {
  if (match.voteTimer) { clearTimeout(match.voteTimer); match.voteTimer = null; }
  match.status = 'finished';
  const playerIds = Object.keys(match.players);
  const scores = {};
  for (const pId of playerIds) scores[pId] = { username: match.players[pId].username, score: match.players[pId].score };

  let winnerId = null;
  if (match.mode === 'race') {
    const sorted = playerIds.sort((a, b) => match.players[b].score - match.players[a].score);
    winnerId = sorted[0];
  } else if (playerIds.length === 2) {
    const [p1, p2] = playerIds;
    if (match.players[p1].score > match.players[p2].score) winnerId = p1;
    else if (match.players[p2].score > match.players[p1].score) winnerId = p2;
  }

  const coinGains = {};
  for (const pId of playerIds) {
    if (pId.startsWith('bot_')) { coinGains[pId] = 0; continue; }
    const opId = playerIds.find((id) => id !== pId);
    const result = await recordMatchResult(pId, match.players[pId].username, {
      matchKey: match.id,
      won: winnerId === pId,
      draw: winnerId === null,
      myScore: match.players[pId].score,
      opponentScore: opId ? match.players[opId].score : 0,
      opponentUsername: opId ? match.players[opId].username : '',
      correctAnswers: match.players[pId].correctCount,
      totalQuestions: match.questions.length,
      category: match.category,
      difficulty: match.difficulty,
      mode: match.mode,
    });
    coinGains[pId] = result?.coinGain || 0;
  }

  const payload = { matchId: match.id, scores, winnerId, draw: winnerId === null, coinGains };
  if (match.mode === 'race') {
    payload.leaderboard = playerIds.sort((a, b) => match.players[b].score - match.players[a].score).map((id) => ({ userId: id, username: match.players[id].username, score: match.players[id].score }));
  }
  io.to(match.id).emit('match_finished', payload);
  setTimeout(() => removeMatch(match.id), 10000);
}

function handlePlayerDisconnect(io, socketId) {
  const { activeMatches, removeMatch } = require('../game/matchmaking');
  for (const [matchId, match] of activeMatches) {
    for (const [userId, player] of Object.entries(match.players)) {
      if (player.socketId === socketId) {
        if (match.mode === 'royale' && player.alive) {
          player.alive = false;
          player.eliminatedAt = match.currentQuestionIndex;
          io.to(matchId).emit('player_eliminated', { userId, username: player.username });
          const survivors = Object.keys(match.players).filter((id) => match.players[id].alive);
          if (survivors.length <= 1) {
            match.status = 'finished';
            if (match.timer) clearTimeout(match.timer);
            setTimeout(() => endRoyaleMatch(io, match), 500);
          }
        } else {
          match.status = 'finished';
          if (match.timer) clearTimeout(match.timer);
          if (match.voteTimer) { clearTimeout(match.voteTimer); match.voteTimer = null; }
          io.to(matchId).emit('opponent_left', {});
          removeMatch(matchId);
        }
        return;
      }
    }
  }
}

module.exports = { setupGameSocket };
