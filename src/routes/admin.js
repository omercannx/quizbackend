const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { sequelize } = require('../database/config');
const router = express.Router();
const { getAllQuestions, addQuestion, updateQuestion, deleteQuestion, CATEGORIES } = require('../data/questions');
const QuestionModel = require('../models/Question');
const { getLeaderboard, getLevelTitle, getAchievementsWithRewards, getLevelTiers } = require('../game/leaderboard');
const User = require('../models/User');
const Match = require('../models/Match');
const MatchPlayer = require('../models/MatchPlayer');
const Achievement = require('../models/Achievement');
const AchievementReward = require('../models/AchievementReward');
const ChatMessage = require('../models/ChatMessage');
const CosmeticFrame = require('../models/CosmeticFrame');
const { getCredentials, setCredentials, ensureDefaultCredentials } = require('../data/admin-credentials');

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET || 'quiz-arena-admin-secret-change-in-production';

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Yetkisiz. Giriş yapın.' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token geçersiz veya süresi dolmuş.' });
  }
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }
  ensureDefaultCredentials();
  const cred = getCredentials();
  if (username !== cred.username || password !== cred.password) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });
  }
  const token = jwt.sign(
    { sub: 'admin', role: 'admin' },
    ADMIN_SECRET,
    { expiresIn: '7d' }
  );
  res.json({ success: true, token });
});

router.use(adminAuth);

// ── ADMIN HESAP AYARLARI (giriş yapmış admin kullanıcı adı/şifre değiştirebilir) ──
router.get('/credentials', (req, res) => {
  const cred = getCredentials();
  res.json({ username: cred.username });
});

router.put('/credentials', (req, res) => {
  try {
    const { username, password } = req.body;
    const result = setCredentials(username, password);
    res.json({ success: true, username: result.username, message: 'Admin hesabı güncellendi. Yeni bilgilerle tekrar giriş yapın.' });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Güncellenemedi' });
  }
});

// ── QUESTIONS ──
router.get('/questions', async (req, res) => {
  const { page, limit: lim, category, difficulty, search } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limit = Math.min(100, parseInt(lim) || 20);
  const offset = (pageNum - 1) * limit;

  const where = {};
  if (category) where.category = category;
  if (difficulty) where.difficulty = difficulty;
  if (search && search.trim()) {
    const searchCond = [
      { text: { [Op.like]: `%${search.trim()}%` } },
      { optionA: { [Op.like]: `%${search.trim()}%` } },
      { optionB: { [Op.like]: `%${search.trim()}%` } },
      { optionC: { [Op.like]: `%${search.trim()}%` } },
      { optionD: { [Op.like]: `%${search.trim()}%` } },
    ].filter(Boolean);
    where[Op.or] = searchCond;
  }

  const { count, rows } = await QuestionModel.findAndCountAll({
    where,
    order: [['category', 'ASC'], ['difficulty', 'ASC']],
    limit,
    offset,
  });

  const questions = rows.map((r) => {
    const opts = [r.optionA, r.optionB, r.optionC];
    if (r.optionD) opts.push(r.optionD);
    return {
      id: r.questionKey,
      dbId: r.id,
      text: r.text,
      options: opts,
      correct: r.correct,
      hint: r.hint || '',
      category: r.category,
      difficulty: r.difficulty,
    };
  });

  res.json({ questions, total: count, page: pageNum, totalPages: Math.ceil(count / limit) });
});

router.get('/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

router.post('/questions', async (req, res) => {
  const { category, difficulty, text, options, correct, hint } = req.body;
  if (!category || !difficulty || !text || !options || correct === undefined) {
    return res.status(400).json({ error: 'Eksik alan' });
  }
  const id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const questionData = { id, text, options, correct, hint: hint || '' };
  await addQuestion(category, difficulty, questionData);
  res.json({ success: true, question: { ...questionData, category, difficulty } });
});

router.put('/questions/:id', async (req, res) => {
  const result = await updateQuestion(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: 'Soru bulunamadı' });
  res.json({ success: true });
});

router.delete('/questions/:id', async (req, res) => {
  const result = await deleteQuestion(req.params.id);
  if (!result) return res.status(404).json({ error: 'Soru bulunamadı' });
  res.json({ success: true });
});

// ── LEADERBOARD ──
router.get('/leaderboard', async (req, res) => {
  const type = req.query.type || 'rating';
  res.json({ leaderboard: await getLeaderboard(type) });
});

// ── BAŞARIMLAR & SEVİYE SİSTEMİ ──
router.get('/achievements-and-levels', async (req, res) => {
  try {
    res.json({
      achievements: await getAchievementsWithRewards(),
      levelTiers: getLevelTiers(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ACHIEVEMENT_REWARD_TYPES = ['coin', 'fifty_fifty', 'time_freeze', 'double_points', 'hint'];

router.put('/achievement-rewards/:achievementId', adminAuth, async (req, res) => {
  try {
    const { achievementId } = req.params;
    const { rewardType, rewardValue } = req.body || {};
    if (!rewardType || !ACHIEVEMENT_REWARD_TYPES.includes(rewardType)) {
      return res.status(400).json({ error: 'Geçerli rewardType gerekli: coin, fifty_fifty, time_freeze, double_points, hint' });
    }
    const value = Math.max(0, parseInt(rewardValue, 10) || 0);
    const [row, created] = await AchievementReward.findOrCreate({
      where: { achievementId },
      defaults: { achievementId, rewardType, rewardValue: value },
    });
    if (!created) {
      row.rewardType = rewardType;
      row.rewardValue = value;
      await row.save();
    }
    res.json({ success: true, reward: { achievementId: row.achievementId, rewardType: row.rewardType, rewardValue: row.rewardValue } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DASHBOARD ──
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalMatches = await Match.count();
    const totalMessages = await ChatMessage.count();
    const { getAllQuestions: gq } = require('../data/questions');
    const allQ = await gq();
    const totalQuestions = allQ.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await User.count({ where: { createdAt: { [Op.gte]: today } } });
    const matchesToday = await Match.count({ where: { createdAt: { [Op.gte]: today } } });

    const topPlayer = await User.findOne({ order: [['rating', 'DESC']] });
    const mostActive = await User.findOne({ order: [['totalMatches', 'DESC']] });

    res.json({
      totalUsers,
      totalMatches,
      totalQuestions,
      totalMessages,
      newUsersToday,
      matchesToday,
      topPlayer: topPlayer ? { username: topPlayer.username, rating: topPlayer.rating } : null,
      mostActive: mostActive ? { username: mostActive.username, totalMatches: mostActive.totalMatches } : null,
    });
  } catch (e) {
    console.error('Dashboard error:', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── USERS ──
router.get('/users', async (req, res) => {
  try {
    const { search, sort, order, page, limit: lim } = req.query;
    const where = {};
    if (search) {
      where.username = { [Op.like]: `%${search}%` };
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = Math.min(100, parseInt(lim) || 25);
    const offset = (pageNum - 1) * limit;

    const orderBy = [];
    if (sort) {
      orderBy.push([sort, (order || 'DESC').toUpperCase()]);
    } else {
      orderBy.push(['createdAt', 'DESC']);
    }

    const { count, rows } = await User.findAndCountAll({ where, order: orderBy, limit, offset });

    const users = rows.map((u) => ({
      id: u.id,
      oduserId: u.oduserId,
      username: u.username,
      coins: u.coins || 0,
      rating: u.rating,
      level: u.level,
      levelTitle: getLevelTitle(u.level),
      xp: u.xp,
      wins: u.wins,
      losses: u.losses,
      draws: u.draws,
      totalMatches: u.totalMatches,
      totalCorrect: u.totalCorrect,
      totalQuestions: u.totalQuestions,
      streak: u.streak,
      bestStreak: u.bestStreak,
      winRate: u.totalMatches > 0 ? Math.round((u.wins / u.totalMatches) * 100) : 0,
      accuracy: u.totalQuestions > 0 ? Math.round((u.totalCorrect / u.totalQuestions) * 100) : 0,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    res.json({ users, total: count, page: pageNum, totalPages: Math.ceil(count / limit) });
  } catch (e) {
    console.error('Users error:', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const achievements = await Achievement.findAll({ where: { userId: user.id } });
    const matchPlayers = await MatchPlayer.findAll({
      where: { userId: user.id },
      include: [{ model: Match }],
      order: [[Match, 'createdAt', 'DESC']],
      limit: 50,
    });

    const matchHistory = matchPlayers.map((mp) => {
      const m = mp.Match;
      return {
        matchId: m.id,
        matchKey: m.matchKey,
        mode: m.mode,
        difficulty: m.difficulty,
        category: m.category,
        score: mp.score,
        correctCount: mp.correctCount,
        won: m.winnerId === user.id,
        draw: m.draw,
        date: m.createdAt,
      };
    });

    res.json({
      user: {
        id: user.id,
        oduserId: user.oduserId,
        username: user.username,
        rating: user.rating,
        level: user.level,
        levelTitle: getLevelTitle(user.level),
        xp: user.xp,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        totalMatches: user.totalMatches,
        totalCorrect: user.totalCorrect,
        totalQuestions: user.totalQuestions,
        streak: user.streak,
        bestStreak: user.bestStreak,
        winRate: user.totalMatches > 0 ? Math.round((user.wins / user.totalMatches) * 100) : 0,
        accuracy: user.totalQuestions > 0 ? Math.round((user.totalCorrect / user.totalQuestions) * 100) : 0,
        createdAt: user.createdAt,
      },
      achievements: achievements.map((a) => a.achievementKey),
      matchHistory,
    });
  } catch (e) {
    console.error('User detail error:', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    await Achievement.destroy({ where: { userId: user.id } });
    await MatchPlayer.destroy({ where: { userId: user.id } });
    await user.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── MATCHES ──
router.get('/matches', async (req, res) => {
  try {
    const { page, limit: lim, mode } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limit = Math.min(100, parseInt(lim) || 25);
    const offset = (pageNum - 1) * limit;

    const where = {};
    if (mode) where.mode = mode;

    const { count, rows } = await Match.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [{ model: MatchPlayer, include: [{ model: User, attributes: ['username'] }] }],
    });

    const matches = rows.map((m) => ({
      id: m.id,
      matchKey: m.matchKey,
      mode: m.mode,
      difficulty: m.difficulty,
      category: m.category,
      draw: m.draw,
      status: m.status,
      winnerId: m.winnerId,
      date: m.createdAt,
      players: m.MatchPlayers.map((mp) => ({
        username: mp.User?.username || '?',
        score: mp.score,
        correctCount: mp.correctCount,
        isWinner: mp.userId === m.winnerId,
      })),
    }));

    res.json({ matches, total: count, page: pageNum, totalPages: Math.ceil(count / limit) });
  } catch (e) {
    console.error('Matches error:', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── REPORTS ──
const QuestionReport = require('../models/QuestionReport');
const Question = require('../models/Question');

router.get('/reports', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const reports = await QuestionReport.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [
        { model: User, attributes: ['username'] },
        { model: Question, attributes: ['text'] },
      ],
    });
    res.json({
      reports: reports.map((r) => ({
        id: r.id,
        questionId: r.questionId,
        questionText: r.Question?.text || '?',
        userId: r.userId,
        username: r.User?.username || '?',
        reason: r.reason,
        description: r.description,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    console.error('Reports error:', e.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.put('/reports/:id', async (req, res) => {
  try {
    const report = await QuestionReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı' });
    report.status = req.body.status || 'reviewed';
    await report.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── ANALYTICS ──
const DirectMessage = require('../models/DirectMessage');
const Friend = require('../models/Friend');
const FriendRequest = require('../models/FriendRequest');
const PurchaseHistory = require('../models/PurchaseHistory');
const Quest = require('../models/Quest');
const Season = require('../models/Season');
const ChatBan = require('../models/ChatBan');
const ShopItem = require('../models/ShopItem');
const QuestTemplate = require('../models/QuestTemplate');
const { defaultQuestTemplates, defaultShopItems, defaultSeasons } = require('../database/seed');

router.get('/analytics/dms', async (req, res) => {
  try {
    const { userId, limit } = req.query;
    const where = {};
    if (userId) {
      where[Op.or] = [{ fromUserId: userId }, { toUserId: userId }];
    }
    const dms = await DirectMessage.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(parseInt(limit) || 200, 500),
    });
    res.json({ dms: dms.map((d) => ({ id: d.id, from: d.fromUserId, fromName: d.fromUsername, to: d.toUserId, text: d.text || '', date: d.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/match-chat', async (req, res) => {
  try {
    const msgs = await ChatMessage.findAll({
      where: { room: { [Op.like]: 'match_%' } },
      order: [['createdAt', 'DESC']],
      limit: 300,
    });
    res.json({ messages: msgs.map((m) => ({ id: m.id, userId: m.oduserId, username: m.username, room: m.room, text: m.text || '', date: m.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/friends', async (req, res) => {
  try {
    const [friends, requests] = await Promise.all([
      Friend.findAll({ include: [{ model: User, as: 'ownerUser', attributes: ['username', 'oduserId'] }, { model: User, as: 'friendUser', attributes: ['username', 'oduserId'] }], limit: 500 }),
      FriendRequest.findAll({ where: { status: { [Op.in]: ['pending', 'rejected'] } }, include: [{ model: User, as: 'fromUser', attributes: ['username'] }, { model: User, as: 'toUser', attributes: ['username'] }], order: [['createdAt', 'DESC']], limit: 200 }),
    ]);
    res.json({
      friends: friends.map((f) => ({ user: f.ownerUser?.username, friend: f.friendUser?.username, date: f.createdAt })),
      requests: requests.map((r) => ({ from: r.fromUser?.username, to: r.toUser?.username, status: r.status, date: r.createdAt })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/purchases', async (req, res) => {
  try {
    const { userId } = req.query;
    const where = {};
    if (userId) {
      const u = await User.findOne({ where: { oduserId: userId } });
      if (u) where.userId = u.id;
    }
    const list = await PurchaseHistory.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 300,
      include: [{ model: User, attributes: ['username', 'oduserId'] }],
    });
    res.json({ purchases: list.map((p) => ({ id: p.id, username: p.User?.username, itemKey: p.itemKey, itemName: p.itemName, price: p.price, qty: p.quantity, date: p.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/quests', async (req, res) => {
  try {
    const { userId } = req.query;
    const where = {};
    if (userId) {
      const u = await User.findOne({ where: { oduserId: userId } });
      if (u) where.userId = u.id;
    }
    const list = await Quest.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 200,
      include: [{ model: User, attributes: ['username'] }],
    });
    res.json({ quests: list.map((q) => ({ id: q.id, username: q.User?.username, title: q.title, type: q.questType, progress: q.progress, target: q.target, completed: q.completed, claimed: q.claimed, xp: q.xpReward, expires: q.expiresAt, date: q.createdAt })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SEASONS ──
router.get('/seasons', async (req, res) => {
  try {
    const list = await Season.findAll({ order: [['seasonNumber', 'DESC']], limit: 50 });
    res.json({ seasons: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/seasons', async (req, res) => {
  try {
    const { name, seasonNumber, startDate, endDate, isActive } = req.body;
    if (!name || !seasonNumber) return res.status(400).json({ error: 'name ve seasonNumber gerekli' });
    const existing = await Season.findOne({ where: { seasonNumber } });
    if (existing) return res.status(400).json({ error: 'Bu sezon numarası zaten var' });
    const s = await Season.create({
      name: name || `Sezon ${seasonNumber}`,
      seasonNumber: parseInt(seasonNumber),
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: !!isActive,
    });
    res.json({ success: true, season: s });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/seasons/:id', async (req, res) => {
  try {
    const s = await Season.findByPk(req.params.id);
    if (!s) return res.status(404).json({ error: 'Sezon bulunamadı' });
    const { name, startDate, endDate, isActive } = req.body;
    if (name) s.name = name;
    if (startDate) s.startDate = new Date(startDate);
    if (endDate) s.endDate = new Date(endDate);
    if (typeof isActive === 'boolean') {
      if (isActive) await Season.update({ isActive: false }, { where: {} });
      s.isActive = isActive;
    }
    await s.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/seasons/reset', async (req, res) => {
  try {
    await Season.destroy({ where: {} });
    await Season.bulkCreate(defaultSeasons);
    res.json({ success: true, count: defaultSeasons.length, message: `${defaultSeasons.length} varsayılan sezon yüklendi. Silinen sezonlar dahil hepsi geri geldi.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SHOP ──
router.get('/shop', async (req, res) => {
  try {
    const items = await ShopItem.findAll({ order: [['id', 'ASC']] });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/shop/:id', async (req, res) => {
  try {
    const item = await ShopItem.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Ürün bulunamadı' });
    const { name, description, price, isActive } = req.body;
    if (name) item.name = name;
    if (description !== undefined) item.description = description;
    if (typeof price === 'number') item.price = price;
    if (typeof isActive === 'boolean') item.isActive = isActive;
    await item.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/shop/reset', async (req, res) => {
  try {
    await ShopItem.destroy({ where: {} });
    await ShopItem.bulkCreate(defaultShopItems.map((i) => ({ ...i, isActive: true })));
    res.json({ success: true, count: defaultShopItems.length, message: 'Varsayılan mağaza ürünleri yüklendi. Silinen ürünler dahil hepsi geri geldi.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── COIN TRANSFER ──
router.post('/transfer-coins', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    if (!userId || (typeof amount !== 'number' && isNaN(parseFloat(amount))) || parseFloat(amount) <= 0) return res.status(400).json({ error: 'userId ve pozitif amount gerekli' });
    const amt = Math.floor(parseFloat(amount));
    const conds = [{ oduserId: String(userId) }, { username: String(userId) }];
    if (!isNaN(parseInt(userId))) conds.push({ id: parseInt(userId) });
    const user = await User.findOne({ where: { [Op.or]: conds } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    user.coins = (user.coins || 0) + amt;
    await user.save();
    res.json({ success: true, coins: user.coins });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHAT BAN ──
router.get('/chat-bans', async (req, res) => {
  try {
    const list = await ChatBan.findAll({ where: { bannedUntil: { [Op.gt]: new Date() } }, order: [['bannedUntil', 'DESC']] });
    res.json({ bans: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/chat-ban', async (req, res) => {
  try {
    const { oduserId, username, hours, reason } = req.body;
    const user = await User.findOne({ where: { [Op.or]: [{ oduserId: oduserId || username }, { username: oduserId || username }] } });
    const targetId = user ? user.oduserId : (oduserId || username);
    if (!targetId) return res.status(400).json({ error: 'Kullanıcı bulunamadı' });
    const h = Math.min(parseInt(hours) || 24, 720);
    const bannedUntil = new Date(Date.now() + h * 60 * 60 * 1000);
    await ChatBan.create({ oduserId: targetId, bannedUntil, reason: reason || 'Admin kararı' });
    res.json({ success: true, bannedUntil });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/chat-bans/:id', async (req, res) => {
  try {
    await ChatBan.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── QUEST TEMPLATES ──
router.get('/quest-templates', async (req, res) => {
  try {
    const { type } = req.query;
    const where = {};
    if (type) where.questType = type;
    const list = await QuestTemplate.findAll({
      where,
      order: [['questType', 'ASC'], ['sortOrder', 'ASC'], ['id', 'ASC']],
    });
    res.json({ templates: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/quest-templates', async (req, res) => {
  try {
    const { questKey, questType, title, description, target, xpReward, event, sortOrder } = req.body;
    if (!questKey || !questType || !title || !event) return res.status(400).json({ error: 'questKey, questType, title, event gerekli' });
    const t = await QuestTemplate.create({
      questKey: String(questKey).trim(),
      questType: questType === 'weekly' ? 'weekly' : 'daily',
      title: title.trim(),
      description: (description || '').trim(),
      target: Math.max(1, parseInt(target) || 1),
      xpReward: Math.max(0, parseInt(xpReward) || 50),
      event: String(event).trim(),
      sortOrder: parseInt(sortOrder) || 0,
      isActive: true,
    });
    res.json({ success: true, template: t });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/quest-templates/:id', async (req, res) => {
  try {
    const t = await QuestTemplate.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: 'Şablon bulunamadı' });
    const { questKey, questType, title, description, target, xpReward, event, sortOrder, isActive } = req.body;
    if (questKey) t.questKey = String(questKey).trim();
    if (questType) t.questType = questType === 'weekly' ? 'weekly' : 'daily';
    if (title) t.title = title.trim();
    if (description !== undefined) t.description = String(description).trim();
    if (typeof target === 'number' || (typeof target === 'string' && target !== '')) t.target = Math.max(1, parseInt(target) || 1);
    if (typeof xpReward === 'number' || (typeof xpReward === 'string' && xpReward !== '')) t.xpReward = Math.max(0, parseInt(xpReward) || 50);
    if (event) t.event = String(event).trim();
    if (typeof sortOrder === 'number' || (typeof sortOrder === 'string' && sortOrder !== '')) t.sortOrder = parseInt(sortOrder) || 0;
    if (typeof isActive === 'boolean') t.isActive = isActive;
    await t.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/quest-templates/:id', async (req, res) => {
  try {
    const t = await QuestTemplate.findByPk(req.params.id);
    if (!t) return res.status(404).json({ error: 'Şablon bulunamadı' });
    await t.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/quest-templates/reset', async (req, res) => {
  try {
    await QuestTemplate.destroy({ where: {} });
    await QuestTemplate.bulkCreate(defaultQuestTemplates.map((t) => ({ ...t, isActive: true })));
    res.json({ success: true, count: defaultQuestTemplates.length, message: 'Varsayılan görevler yüklendi. Silinen görevler dahil hepsi geri geldi.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── TEST: Kullanıcı görevlerini tamamla (ödül alınabilir hale getir)
// ── COSMETIC FRAMES (Çerçeveler) ──
router.get('/frames', async (req, res) => {
  try {
    const frames = await CosmeticFrame.findAll({ order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    res.json({ frames: frames.map((f) => ({ id: f.id, key: f.key, name: f.name, unlockLevel: f.unlockLevel, colors: f.colors || [], style: f.style || 'gradient', sortOrder: f.sortOrder })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/frames', async (req, res) => {
  try {
    const { key, name, unlockLevel, colors, style, sortOrder } = req.body;
    if (!key || !name) return res.status(400).json({ error: 'Anahtar ve ad gerekli' });
    const colorsArr = Array.isArray(colors) ? colors : (typeof colors === 'string' ? colors.split(',').map((c) => c.trim()).filter(Boolean) : ['#7C4DFF', '#00E5FF']);
    const frame = await CosmeticFrame.create({
      key: key.trim(),
      name: name.trim(),
      unlockLevel: parseInt(unlockLevel, 10) || 1,
      colors: colorsArr,
      style: (style || 'gradient').trim(),
      sortOrder: parseInt(sortOrder, 10) || 0,
    });
    res.json({ success: true, frame: { id: frame.id, key: frame.key, name: frame.name, unlockLevel: frame.unlockLevel, colors: frame.colors, style: frame.style, sortOrder: frame.sortOrder } });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') return res.status(400).json({ error: 'Bu anahtar zaten kullanılıyor' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/frames/:key', async (req, res) => {
  try {
    const frame = await CosmeticFrame.findOne({ where: { key: req.params.key } });
    if (!frame) return res.status(404).json({ error: 'Çerçeve bulunamadı' });
    const { name, unlockLevel, colors, style, sortOrder } = req.body;
    if (name !== undefined) frame.name = name.trim();
    if (unlockLevel !== undefined) frame.unlockLevel = parseInt(unlockLevel, 10) || 1;
    if (colors !== undefined) frame.colors = Array.isArray(colors) ? colors : (typeof colors === 'string' ? colors.split(',').map((c) => c.trim()).filter(Boolean) : frame.colors);
    if (style !== undefined) frame.style = (style || 'gradient').trim();
    if (sortOrder !== undefined) frame.sortOrder = parseInt(sortOrder, 10) || 0;
    await frame.save();
    res.json({ success: true, frame: { id: frame.id, key: frame.key, name: frame.name, unlockLevel: frame.unlockLevel, colors: frame.colors, style: frame.style, sortOrder: frame.sortOrder } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/frames/:key', async (req, res) => {
  try {
    const frame = await CosmeticFrame.findOne({ where: { key: req.params.key } });
    if (!frame) return res.status(404).json({ error: 'Çerçeve bulunamadı' });
    await frame.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/test/complete-user-quests', async (req, res) => {
  try {
    const { username } = req.body;
    const uname = (username || 'omercan').trim().toLowerCase();
    if (!uname) return res.status(400).json({ error: 'Kullanıcı adı gerekli' });

    const user = await User.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('username')), uname) });
    if (!user) return res.status(404).json({ error: `"${uname}" kullanıcısı bulunamadı` });

    const { generateDailyQuests, generateWeeklyQuests } = require('../game/quests');
    await generateDailyQuests(user.oduserId);
    await generateWeeklyQuests(user.oduserId);

    const now = new Date();
    const quests = await Quest.findAll({
      where: { userId: user.id, expiresAt: { [Op.gt]: now }, claimed: false },
    });

    let completed = 0;
    for (const q of quests) {
      q.progress = q.target;
      q.completed = true;
      await q.save();
      completed++;
    }

    res.json({ success: true, completed, message: `${user.username} için ${completed} görev tamamlandı. Uygulamada "Ödülü Al" ile XP alabilir.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
