const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { FlappyUser, FlappyScore, FlappyQuest, FlappySeason, FlappyFriend } = require('../models/flappy');

const BIRDS = [
  { key: 'default', name: 'Klasik Kuş', price: 0, colors: { body: '#F7DC14', beak: '#E67E22', wing: '#E6B800' } },
  { key: 'red', name: 'Kızgın Kuş', price: 200, colors: { body: '#FF5252', beak: '#D32F2F', wing: '#C62828' } },
  { key: 'blue', name: 'Buz Kuşu', price: 200, colors: { body: '#42A5F5', beak: '#1565C0', wing: '#0D47A1' } },
  { key: 'green', name: 'Doğa Kuşu', price: 300, colors: { body: '#66BB6A', beak: '#2E7D32', wing: '#1B5E20' } },
  { key: 'purple', name: 'Mistik Kuş', price: 400, colors: { body: '#AB47BC', beak: '#7B1FA2', wing: '#4A148C' } },
  { key: 'gold', name: 'Altın Kuş', price: 800, colors: { body: '#FFD700', beak: '#FF8F00', wing: '#F57F17' } },
  { key: 'rainbow', name: 'Gökkuşağı', price: 1500, colors: { body: '#FF6D00', beak: '#D500F9', wing: '#00E5FF' } },
  { key: 'ghost', name: 'Hayalet Kuş', price: 1000, colors: { body: 'rgba(255,255,255,0.7)', beak: '#B0BEC5', wing: '#78909C' } },
];

const THEMES = [
  { key: 'day', name: 'Gündüz', price: 0, sky: '#4EC0CA', ground: '#DEB887' },
  { key: 'night', name: 'Gece', price: 300, sky: '#1A237E', ground: '#3E2723' },
  { key: 'sunset', name: 'Gün Batımı', price: 300, sky: '#FF6F00', ground: '#5D4037' },
  { key: 'winter', name: 'Kış', price: 500, sky: '#B3E5FC', ground: '#ECEFF1' },
  { key: 'autumn', name: 'Sonbahar', price: 500, sky: '#FF8A65', ground: '#8D6E63' },
  { key: 'space', name: 'Uzay', price: 1000, sky: '#0D0D2B', ground: '#37474F' },
];

const POWERUPS = [
  { key: 'shield', name: 'Kalkan', desc: '1 boruya çarpmayı affet', price: 100, field: 'shieldCount' },
  { key: 'slow', name: 'Yavaşlatma', desc: 'Borular yavaşlar', price: 80, field: 'slowCount' },
  { key: 'magnet', name: 'Manyetik', desc: 'Boşluğa çekilirsin', price: 120, field: 'magnetCount' },
  { key: 'double', name: 'Çift Skor', desc: '2x puan', price: 100, field: 'doubleCount' },
];

const DAILY_QUEST_POOL = [
  { key: 'play_3', desc: '3 oyun oyna', target: 3, reward: 30, type: 'games' },
  { key: 'play_5', desc: '5 oyun oyna', target: 5, reward: 60, type: 'games' },
  { key: 'play_10', desc: '10 oyun oyna', target: 10, reward: 120, type: 'games' },
  { key: 'score_10', desc: '10 boru geç', target: 10, reward: 40, type: 'score' },
  { key: 'score_25', desc: '25 boru geç', target: 25, reward: 80, type: 'score' },
  { key: 'score_50', desc: '50 boru geç', target: 50, reward: 150, type: 'score' },
  { key: 'win_1', desc: '1 maç kazan', target: 1, reward: 50, type: 'wins' },
  { key: 'win_3', desc: '3 maç kazan', target: 3, reward: 120, type: 'wins' },
];

const DAILY_REWARDS = [20, 30, 40, 60, 80, 100, 200];

async function getOrCreateFlappyUser(userId, username) {
  let user = await FlappyUser.findByPk(userId);
  if (!user) {
    user = await FlappyUser.create({ userId, username });
  } else if (username && user.username !== username) {
    user.username = username;
    await user.save();
  }
  return user;
}

// ── PROFIL ──
router.get('/profile/:userId', async (req, res) => {
  try {
    const user = await FlappyUser.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/profile/init', async (req, res) => {
  try {
    const { userId, username } = req.body;
    if (!userId || !username) return res.status(400).json({ error: 'userId ve username gerekli' });
    const user = await getOrCreateFlappyUser(userId, username);
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── MAĞAZA ──
router.get('/shop', (_req, res) => {
  res.json({ birds: BIRDS, themes: THEMES, powerups: POWERUPS });
});

router.post('/shop/buy', async (req, res) => {
  try {
    const { userId, itemType, itemKey } = req.body;
    const user = await FlappyUser.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (itemType === 'bird') {
      const bird = BIRDS.find((b) => b.key === itemKey);
      if (!bird) return res.status(400).json({ error: 'Kuş bulunamadı' });
      const owned = user.ownedBirds || [];
      if (owned.includes(itemKey)) return res.status(400).json({ error: 'Zaten sahipsin' });
      if (user.coins < bird.price) return res.status(400).json({ error: 'Yeterli coin yok' });
      user.coins -= bird.price;
      user.ownedBirds = [...owned, itemKey];
      await user.save();
    } else if (itemType === 'theme') {
      const theme = THEMES.find((t) => t.key === itemKey);
      if (!theme) return res.status(400).json({ error: 'Tema bulunamadı' });
      const owned = user.ownedThemes || [];
      if (owned.includes(itemKey)) return res.status(400).json({ error: 'Zaten sahipsin' });
      if (user.coins < theme.price) return res.status(400).json({ error: 'Yeterli coin yok' });
      user.coins -= theme.price;
      user.ownedThemes = [...owned, itemKey];
      await user.save();
    } else if (itemType === 'powerup') {
      const pu = POWERUPS.find((p) => p.key === itemKey);
      if (!pu) return res.status(400).json({ error: 'Power-up bulunamadı' });
      if (user.coins < pu.price) return res.status(400).json({ error: 'Yeterli coin yok' });
      user.coins -= pu.price;
      user[pu.field] = (user[pu.field] || 0) + 1;
      await user.save();
    } else {
      return res.status(400).json({ error: 'Geçersiz item tipi' });
    }

    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/shop/equip', async (req, res) => {
  try {
    const { userId, itemType, itemKey } = req.body;
    const user = await FlappyUser.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (itemType === 'bird') {
      if (!(user.ownedBirds || []).includes(itemKey)) return res.status(400).json({ error: 'Bu kuşa sahip değilsin' });
      user.activeBird = itemKey;
    } else if (itemType === 'theme') {
      if (!(user.ownedThemes || []).includes(itemKey)) return res.status(400).json({ error: 'Bu temaya sahip değilsin' });
      user.activeTheme = itemKey;
    } else {
      return res.status(400).json({ error: 'Geçersiz item tipi' });
    }
    await user.save();
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LİDERLİK TABLOSU ──
router.get('/leaderboard/:period', async (req, res) => {
  try {
    const { period } = req.params;
    let where = {};
    const now = new Date();

    if (period === 'daily') {
      const today = now.toISOString().slice(0, 10);
      where.createdAt = { [Op.gte]: new Date(today) };
    } else if (period === 'weekly') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      where.createdAt = { [Op.gte]: weekAgo };
    }

    if (period === 'alltime') {
      const users = await FlappyUser.findAll({
        order: [['bestScore', 'DESC']],
        limit: 50,
        attributes: ['userId', 'username', 'bestScore', 'totalGames', 'wins'],
      });
      return res.json({ leaderboard: users });
    }

    const scores = await FlappyScore.findAll({
      where,
      attributes: ['userId', 'username', 'score'],
      order: [['score', 'DESC']],
      limit: 50,
    });
    res.json({ leaderboard: scores });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GÜNLÜK GÖREVLER ──
router.get('/quests/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    let quests = await FlappyQuest.findAll({ where: { userId, questDate: today } });

    if (quests.length === 0) {
      const shuffled = [...DAILY_QUEST_POOL].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 3);
      quests = await Promise.all(
        selected.map((q) =>
          FlappyQuest.create({
            userId,
            questKey: q.key,
            target: q.target,
            reward: q.reward,
            rewardType: 'coin',
            questDate: today,
          })
        )
      );
    }

    const questDefs = {};
    DAILY_QUEST_POOL.forEach((q) => { questDefs[q.key] = q; });
    const result = quests.map((q) => ({
      ...q.toJSON(),
      desc: questDefs[q.questKey]?.desc || q.questKey,
      type: questDefs[q.questKey]?.type || 'games',
    }));

    res.json({ quests: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/quests/claim', async (req, res) => {
  try {
    const { userId, questId } = req.body;
    const quest = await FlappyQuest.findByPk(questId);
    if (!quest || quest.userId !== userId) return res.status(404).json({ error: 'Görev bulunamadı' });
    if (!quest.completed) return res.status(400).json({ error: 'Görev tamamlanmadı' });
    if (quest.claimed) return res.status(400).json({ error: 'Ödül zaten alındı' });

    quest.claimed = true;
    await quest.save();

    const user = await FlappyUser.findByPk(userId);
    if (user) {
      user.coins += quest.reward;
      await user.save();
    }

    res.json({ success: true, reward: quest.reward, coins: user?.coins || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GÜNLÜK ÖDÜL ──
router.post('/daily-reward', async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await FlappyUser.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const today = new Date().toISOString().slice(0, 10);
    if (user.lastDailyClaim === today) {
      return res.status(400).json({ error: 'Bugünkü ödül zaten alındı', streak: user.dailyStreak });
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.lastDailyClaim === yesterday) {
      user.dailyStreak = Math.min(user.dailyStreak + 1, 7);
    } else {
      user.dailyStreak = 1;
    }

    const reward = DAILY_REWARDS[user.dailyStreak - 1] || 20;
    user.coins += reward;
    user.lastDailyClaim = today;
    await user.save();

    res.json({ success: true, reward, streak: user.dailyStreak, coins: user.coins });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SEZON ──
router.get('/season', async (_req, res) => {
  try {
    let season = await FlappySeason.findOne({ where: { active: true } });
    if (!season) {
      const now = new Date();
      const end = new Date(now.getTime() + 14 * 86400000);
      season = await FlappySeason.create({
        name: 'Sezon 1',
        startDate: now.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        active: true,
      });
    }
    res.json({ season });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/season/leaderboard', async (req, res) => {
  try {
    const users = await FlappyUser.findAll({
      order: [['seasonXp', 'DESC']],
      limit: 50,
      attributes: ['userId', 'username', 'seasonXp', 'bestScore'],
    });
    res.json({ leaderboard: users });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ARKADAŞLAR ──
router.get('/friends/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const friends = await FlappyFriend.findAll({
      where: {
        [Op.or]: [
          { userId, status: 'accepted' },
          { friendId: userId, status: 'accepted' },
        ],
      },
    });
    const friendIds = friends.map((f) => (f.userId === userId ? f.friendId : f.userId));
    const friendUsers = friendIds.length > 0 ? await FlappyUser.findAll({ where: { userId: friendIds } }) : [];
    res.json({ friends: friendUsers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/friends/add', async (req, res) => {
  try {
    const { userId, friendUsername } = req.body;
    const friend = await FlappyUser.findOne({ where: { username: friendUsername } });
    if (!friend) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (friend.userId === userId) return res.status(400).json({ error: 'Kendini ekleyemezsin' });

    const existing = await FlappyFriend.findOne({
      where: {
        [Op.or]: [
          { userId, friendId: friend.userId },
          { userId: friend.userId, friendId: userId },
        ],
      },
    });
    if (existing) return res.status(400).json({ error: 'Zaten arkadaşsınız veya istek gönderilmiş' });

    await FlappyFriend.create({ userId, friendId: friend.userId, status: 'accepted' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.getOrCreateFlappyUser = getOrCreateFlappyUser;
module.exports.DAILY_QUEST_POOL = DAILY_QUEST_POOL;
module.exports.BIRDS = BIRDS;
module.exports.THEMES = THEMES;
module.exports.POWERUPS = POWERUPS;
module.exports.DAILY_REWARDS = DAILY_REWARDS;
