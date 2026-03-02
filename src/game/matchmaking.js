const { getRandomQuestions } = require('../data/questions');

const QUESTIONS_PER_MATCH = 5;

// Türk isimleri - karışık kadın ve erkek
const BOT_NAMES = [
  'Zeynep', 'Ahmet', 'Elif', 'Mehmet', 'Ayşe', 'Mustafa', 'Fatma', 'Ali', 'Merve', 'Hüseyin',
  'Selin', 'Emre', 'Deniz', 'Burak', 'Özlem', 'Can', 'Esra', 'Kerem', 'Dilara', 'Oğuz',
  'Sude', 'Barış', 'Melis', 'Yusuf', 'Ece', 'Murat', 'Ceren', 'Berk', 'Aslı', 'Eren',
  'İrem', 'Kaan', 'Begüm', 'Serkan', 'Defne', 'Onur', 'Naz', 'Tolga', 'Ela', 'Batuhan',
];

function getRandomBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

function createBotPlayer() {
  const name = getRandomBotName();
  return {
    socketId: null,
    userId: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    username: name,
    powerups: { fifty_fifty: 0, time_freeze: 0, double_points: 0, hint: 0 },
    isBot: true,
  };
}
const TIME_PER_QUESTION = 15;
const QUICK_QUESTIONS = 3;
const QUICK_TIME = 8;

const waitingQueues = {};
const activeMatches = new Map();
const privateInvites = new Map();

// Sıralı Yarış (Race) lobileri: 3-8 oyuncu, 15 sn bekleme
const MIN_RACE_PLAYERS = 3;
const MAX_RACE_PLAYERS = 8;
const RACE_LOBBY_TIMEOUT_MS = 15000;
const raceLobbies = new Map();

// Battle Royale / Hayatta Kal: 10+ oyuncu, tek yanlış = elenme
const MIN_ROYALE_PLAYERS = 10;
const MAX_ROYALE_PLAYERS = 30;
const ROYALE_LOBBY_TIMEOUT_MS = 25000;
const ROYALE_TIME_PER_QUESTION = 10;
const royaleLobbies = new Map();

function getQueueKey(difficulty, category, mode) {
  return `${mode || '1v1'}_${difficulty}_${category || 'all'}`;
}

async function createMatch(player1, player2, difficulty, category, mode) {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const isQuick = mode === 'quick';
  const qCount = isQuick ? QUICK_QUESTIONS : QUESTIONS_PER_MATCH;
  const tPerQ = isQuick ? QUICK_TIME : TIME_PER_QUESTION;
  const questions = await getRandomQuestions(difficulty, qCount, category === 'all' ? null : category);

  const p1pw = player1.powerups || { fifty_fifty: 0, time_freeze: 0, double_points: 0, hint: 0 };
  const p2pw = player2.powerups || { fifty_fifty: 0, time_freeze: 0, double_points: 0, hint: 0 };

  const match = {
    id: matchId,
    difficulty,
    category: category || 'all',
    mode: mode || '1v1',
    players: {
      [player1.userId]: {
        socketId: player1.socketId, score: 0, answers: {}, username: player1.username,
        correctCount: 0, powerups: { ...p1pw }, doubleActive: false,
      },
      [player2.userId]: {
        socketId: player2.socketId, score: 0, answers: {}, username: player2.username,
        correctCount: 0, powerups: { ...p2pw }, doubleActive: false,
      },
    },
    questions,
    currentQuestionIndex: 0,
    status: 'playing',
    answeredThisRound: new Set(),
    timer: null,
    questionsPerMatch: qCount,
    timePerQuestion: tPerQ,
  };

  activeMatches.set(matchId, match);
  return match;
}

function joinQueue(playerData, difficulty, category, mode) {
  const key = getQueueKey(difficulty, category, mode);
  if (waitingQueues[key]) {
    const opponent = waitingQueues[key];
    waitingQueues[key] = null;
    return { matched: true, opponent };
  }
  waitingQueues[key] = playerData;
  return { matched: false };
}

function leaveQueue(socketId) {
  for (const key of Object.keys(waitingQueues)) {
    if (waitingQueues[key] && waitingQueues[key].socketId === socketId) {
      waitingQueues[key] = null;
      return true;
    }
  }
  return false;
}

function getWaitingPlayer(key, socketId) {
  const wp = waitingQueues[key];
  if (wp && wp.socketId === socketId) return wp;
  return null;
}

function createPrivateInvite(hostPlayer, difficulty, category, mode) {
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  privateInvites.set(inviteCode, { host: hostPlayer, difficulty, category, mode, createdAt: Date.now() });
  return inviteCode;
}

function joinPrivateInvite(inviteCode) {
  const invite = privateInvites.get(inviteCode);
  if (!invite) return { success: false, error: 'Davet kodu geçersiz' };
  privateInvites.delete(inviteCode);
  return { success: true, host: invite.host, difficulty: invite.difficulty, category: invite.category, mode: invite.mode };
}

function getMatch(matchId) { return activeMatches.get(matchId); }

function removeMatch(matchId) {
  const match = activeMatches.get(matchId);
  if (match && match.timer) clearTimeout(match.timer);
  if (match && match.voteTimer) clearTimeout(match.voteTimer);
  activeMatches.delete(matchId);
}

// ── SIRALI YARIŞ (RACE) MODE ──
function getRaceLobbyKey(difficulty, category) {
  return `race_${difficulty}_${category || 'all'}`;
}

function joinRaceLobby(playerData, difficulty, category) {
  const key = getRaceLobbyKey(difficulty, category);
  let lobby = raceLobbies.get(key);
  if (!lobby) lobby = { players: [] };
  if (lobby.players.some((p) => p.userId === playerData.userId)) return { joined: false, error: 'Zaten lobidesin' };
  if (lobby.players.length >= MAX_RACE_PLAYERS) return { joined: false, error: 'Lobi dolu' };
  lobby.players.push(playerData);
  raceLobbies.set(key, lobby);
  const count = lobby.players.length;
  if (count >= MIN_RACE_PLAYERS) {
    const toStart = [...lobby.players];
    raceLobbies.delete(key);
    return { started: true, players: toStart };
  }
  return { joined: true, count, key };
}

function leaveRaceLobby(socketId) {
  for (const [key, lobby] of raceLobbies) {
    const idx = lobby.players.findIndex((p) => p.socketId === socketId);
    if (idx >= 0) {
      lobby.players.splice(idx, 1);
      if (lobby.players.length === 0) raceLobbies.delete(key);
      return { left: true, key };
    }
  }
  return false;
}

function takeRaceLobbyForStart(key) {
  const lobby = raceLobbies.get(key);
  if (!lobby || lobby.players.length === 0) return null;
  const toStart = [...lobby.players];
  raceLobbies.delete(key);
  if (toStart.length < MIN_RACE_PLAYERS) {
    while (toStart.length < MIN_RACE_PLAYERS) toStart.push(createBotPlayer());
  }
  return toStart;
}

function getRaceLobby(key) { return raceLobbies.get(key); }

async function createRaceMatch(players, difficulty, category) {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const questions = await getRandomQuestions(difficulty, QUESTIONS_PER_MATCH, category === 'all' ? null : category);
  const matchPlayers = {};
  for (const p of players) {
    const pw = p.powerups || { fifty_fifty: 0, time_freeze: 0, double_points: 0, hint: 0 };
    matchPlayers[p.userId] = {
      socketId: p.socketId, score: 0, answers: {}, username: p.username,
      correctCount: 0, powerups: { ...pw }, doubleActive: false,
    };
  }
  const match = {
    id: matchId,
    difficulty,
    category: category || 'all',
    mode: 'race',
    players: matchPlayers,
    questions,
    currentQuestionIndex: 0,
    status: 'playing',
    answeredThisRound: new Set(),
    timer: null,
    questionsPerMatch: QUESTIONS_PER_MATCH,
    timePerQuestion: TIME_PER_QUESTION,
    questionSentAt: null,
  };
  activeMatches.set(matchId, match);
  return match;
}

// ── BATTLE ROYALE / HAYATTA KAL ──
function getRoyaleLobbyKey(difficulty, category) {
  return `royale_${difficulty}_${category || 'all'}`;
}

function joinRoyaleLobby(playerData, difficulty, category) {
  const key = getRoyaleLobbyKey(difficulty, category);
  let lobby = royaleLobbies.get(key);
  if (!lobby) lobby = { players: [] };
  if (lobby.players.some((p) => p.userId === playerData.userId)) return { joined: false, error: 'Zaten lobidesin' };
  if (lobby.players.length >= MAX_ROYALE_PLAYERS) return { joined: false, error: 'Lobi dolu' };
  lobby.players.push(playerData);
  royaleLobbies.set(key, lobby);
  const count = lobby.players.length;
  if (count >= MIN_ROYALE_PLAYERS) {
    const toStart = [...lobby.players];
    royaleLobbies.delete(key);
    return { started: true, players: toStart };
  }
  return { joined: true, count, key };
}

function leaveRoyaleLobby(socketId) {
  for (const [key, lobby] of royaleLobbies) {
    const idx = lobby.players.findIndex((p) => p.socketId === socketId);
    if (idx >= 0) {
      lobby.players.splice(idx, 1);
      if (lobby.players.length === 0) royaleLobbies.delete(key);
      return { left: true, key };
    }
  }
  return false;
}

function takeRoyaleLobbyForStart(key) {
  const lobby = royaleLobbies.get(key);
  if (!lobby || lobby.players.length === 0) return null;
  const toStart = [...lobby.players];
  royaleLobbies.delete(key);
  if (toStart.length < MIN_ROYALE_PLAYERS) {
    while (toStart.length < MIN_ROYALE_PLAYERS) toStart.push(createBotPlayer());
  }
  return toStart;
}

async function createRoyaleMatch(players, difficulty, category) {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const questions = await getRandomQuestions(difficulty, 50, category === 'all' ? null : category);
  const matchPlayers = {};
  for (const p of players) {
    matchPlayers[p.userId] = {
      socketId: p.socketId, username: p.username, alive: true,
      answers: {}, eliminatedAt: null,
    };
  }
  const match = {
    id: matchId,
    difficulty,
    category: category || 'all',
    mode: 'royale',
    players: matchPlayers,
    questions,
    currentQuestionIndex: 0,
    status: 'playing',
    answeredThisRound: new Set(),
    timer: null,
    timePerQuestion: ROYALE_TIME_PER_QUESTION,
    questionSentAt: null,
  };
  activeMatches.set(matchId, match);
  return match;
}

module.exports = {
  joinQueue, leaveQueue, createMatch, getMatch, removeMatch, activeMatches,
  createPrivateInvite, joinPrivateInvite, createBotPlayer, getQueueKey, getWaitingPlayer,
  joinRaceLobby, leaveRaceLobby, takeRaceLobbyForStart, createRaceMatch, getRaceLobby, getRaceLobbyKey,
  raceLobbies, MIN_RACE_PLAYERS, RACE_LOBBY_TIMEOUT_MS,
  joinRoyaleLobby, leaveRoyaleLobby, takeRoyaleLobbyForStart, createRoyaleMatch,
  royaleLobbies, MIN_ROYALE_PLAYERS, ROYALE_LOBBY_TIMEOUT_MS, ROYALE_TIME_PER_QUESTION,
  QUESTIONS_PER_MATCH, TIME_PER_QUESTION,
};
