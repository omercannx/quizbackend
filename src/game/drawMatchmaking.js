// Çiz ve Bil - 5 oyuncu lobisi
const { getRandomDrawWords } = require('../data/drawWords');

const DRAW_LOBBY_KEY = 'draw_lobby';
const DRAW_PLAYERS_REQUIRED = 5;
const DRAW_LOBBY_TIMEOUT_MS = 60000; // 1 dakika bekleme
const DRAW_ROUND_TIME_MS = 60000; // 1 dakika çizim süresi
const DRAW_POINTS_CORRECT = 100; // Doğru tahmin puanı
const DRAW_POINTS_DRAWER = 50; // Çizen oyuncuya (kelime tamamlandıysa)

const drawLobbies = new Map();
const drawMatches = new Map();
const drawLobbyTimers = new Map();

function getDrawLobbyKey() {
  return DRAW_LOBBY_KEY;
}

function joinDrawLobby(playerData) {
  const key = getDrawLobbyKey();
  let lobby = drawLobbies.get(key);
  if (!lobby) lobby = { players: [] };

  if (lobby.players.some((p) => p.userId === playerData.userId)) {
    return { error: 'Zaten lobidesin' };
  }
  if (lobby.players.length >= DRAW_PLAYERS_REQUIRED) {
    return { error: 'Lobi dolu' };
  }

  lobby.players.push(playerData);
  drawLobbies.set(key, lobby);
  const count = lobby.players.length;

  if (count >= DRAW_PLAYERS_REQUIRED) {
    const toStart = [...lobby.players];
    drawLobbies.delete(key);
    return { started: true, players: toStart };
  }
  return { joined: true, count, key };
}

function leaveDrawLobby(socketId) {
  const key = getDrawLobbyKey();
  const lobby = drawLobbies.get(key);
  if (!lobby) return false;
  const idx = lobby.players.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) {
    lobby.players.splice(idx, 1);
    if (lobby.players.length === 0) drawLobbies.delete(key);
    return { left: true, key };
  }
  return false;
}

function createDrawMatch(players) {
  const matchId = `draw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const words = getRandomDrawWords(50);
  const playerOrder = players.map((p) => p.userId);
  // Karıştır
  for (let i = playerOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerOrder[i], playerOrder[j]] = [playerOrder[j], playerOrder[i]];
  }

  const match = {
    id: matchId,
    players: {},
    playerOrder,
    currentDrawerIndex: 0,
    words,
    currentWordIndex: 0,
    status: 'playing',
    roundStartTime: null,
    roundTimer: null,
    strokes: [],
    guesses: {},
    scores: {},
  };

  for (const p of players) {
    match.players[p.userId] = {
      socketId: p.socketId,
      userId: p.userId,
      username: p.username,
      score: 0,
    };
    match.scores[p.userId] = 0;
  }

  drawMatches.set(matchId, match);
  return match;
}

function getDrawMatch(matchId) {
  return drawMatches.get(matchId);
}

function removeDrawMatch(matchId) {
  const match = drawMatches.get(matchId);
  if (match && match.roundTimer) clearTimeout(match.roundTimer);
  drawMatches.delete(matchId);
}

function getCurrentDrawer(match) {
  const drawerId = match.playerOrder[match.currentDrawerIndex];
  return match.players[drawerId];
}

function getCurrentWord(match) {
  return match.words[match.currentWordIndex];
}

function normalizeGuess(text) {
  return (text || '').trim().toLowerCase().replace(/[ığüşöç]/g, (c) => {
    const map = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' };
    return map[c] || c;
  });
}

function checkGuess(guess, word) {
  const g = normalizeGuess(guess);
  const w = normalizeGuess(word);
  return g === w || g === word.replace(/\s/g, '');
}

module.exports = {
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
  DRAW_LOBBY_TIMEOUT_MS,
  DRAW_ROUND_TIME_MS,
  DRAW_POINTS_CORRECT,
  DRAW_POINTS_DRAWER,
  getRandomDrawWords,
};
