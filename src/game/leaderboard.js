const UserModel = require('../models/User');
const AchievementModel = require('../models/Achievement');
const AchievementRewardModel = require('../models/AchievementReward');
const MatchModel = require('../models/Match');
const MatchPlayerModel = require('../models/MatchPlayer');
const CategoryStatModel = require('../models/CategoryStat');
const { createNotification } = require('./notifications');
const { checkAndCompleteQuests } = require('./quests');
const { addSeasonXp } = require('./seasons');

function calculateXpForLevel(level) {
  // Exponential curve: level 1=80, 5=180, 10=380, 20=1080, 30=2280, 50=5480
  return Math.floor(80 + (level * level * 2) + (level * 20));
}

function getLevelTitle(level) {
  if (level <= 2) return 'Çaylak';
  if (level <= 5) return 'Amatör';
  if (level <= 8) return 'Acemi';
  if (level <= 12) return 'Orta Seviye';
  if (level <= 16) return 'Yetenekli';
  if (level <= 20) return 'Uzman';
  if (level <= 25) return 'Usta';
  if (level <= 30) return 'Grandmaster';
  if (level <= 40) return 'Efsane';
  if (level <= 50) return 'Dahi';
  return 'Tanrısal';
}

const ACHIEVEMENTS = [
  { id: 'first_win', name: 'İlk Galibiyet', desc: 'İlk maçını kazan', check: (p) => p.wins >= 1 },
  { id: 'win_5', name: '5 Galibiyet', desc: '5 maç kazan', check: (p) => p.wins >= 5 },
  { id: 'win_10', name: '10 Galibiyet', desc: '10 maç kazan', check: (p) => p.wins >= 10 },
  { id: 'streak_3', name: '3 Seri', desc: '3 maç üst üste kazan', check: (p) => p.bestStreak >= 3 },
  { id: 'streak_5', name: '5 Seri', desc: '5 maç üst üste kazan', check: (p) => p.bestStreak >= 5 },
  { id: 'perfect', name: 'Mükemmel Maç', desc: 'Bir maçta tüm soruları doğru cevapla', check: (p) => p._perfect },
  { id: 'matches_20', name: 'Deneyimli', desc: '20 maç oyna', check: (p) => p.totalMatches >= 20 },
  { id: 'matches_50', name: 'Veteran', desc: '50 maç oyna', check: (p) => p.totalMatches >= 50 },
  { id: 'level_10', name: 'Seviye 10', desc: 'Seviye 10\'a ulaş', check: (p) => p.level >= 10 },
  { id: 'level_20', name: 'Seviye 20', desc: 'Seviye 20\'ye ulaş', check: (p) => p.level >= 20 },
  { id: 'level_30', name: 'Seviye 30', desc: 'Seviye 30\'a ulaş', check: (p) => p.level >= 30 },
  { id: 'accuracy_80', name: 'Keskin Nişancı', desc: '%80+ doğruluk oranına ulaş', check: (p) => p.totalQuestions >= 20 && (p.totalCorrect / p.totalQuestions) >= 0.8 },
  { id: 'streak_10', name: '10 Seri', desc: '10 maç üst üste kazan', check: (p) => p.bestStreak >= 10 },
  { id: 'win_25', name: '25 Galibiyet', desc: '25 maç kazan', check: (p) => p.wins >= 25 },
  { id: 'win_50', name: '50 Galibiyet', desc: '50 maç kazan', check: (p) => p.wins >= 50 },
  { id: 'matches_100', name: 'Efsane', desc: '100 maç oyna', check: (p) => p.totalMatches >= 100 },
  { id: 'no_abandon', name: 'Centilmen', desc: '50+ maç oyna, hiç terk etme', check: (p) => p.totalMatches >= 50 && (p.abandons || 0) === 0 },
];

const REWARD_LABELS = {
  coin: (v) => `${v} Coin`,
  fifty_fifty: (v) => `${v || 1}x %50 Eleme`,
  time_freeze: (v) => `${v || 1}x Ek Süre`,
  double_points: (v) => `${v || 1}x Çift Puan`,
  hint: (v) => `${v || 1}x İpucu`,
};

async function applyAchievementReward(user, reward) {
  if (!reward || !reward.rewardType) return;
  const type = reward.rewardType;
  const val = Math.max(0, reward.rewardValue || 0);
  if (type === 'coin' && val > 0) {
    user.coins = (user.coins || 0) + val;
  } else if (type === 'fifty_fifty' && val > 0) {
    user.ownedFiftyFifty = (user.ownedFiftyFifty || 0) + val;
  } else if (type === 'time_freeze' && val > 0) {
    user.ownedTimeFreeze = (user.ownedTimeFreeze || 0) + val;
  } else if (type === 'double_points' && val > 0) {
    user.ownedDoublePoints = (user.ownedDoublePoints || 0) + val;
  } else if (type === 'hint' && val > 0) {
    user.ownedHint = (user.ownedHint || 0) + val;
  }
  await user.save();
}

async function getAchievementsWithRewards() {
  const rows = await AchievementRewardModel.findAll();
  const byId = {};
  rows.forEach((r) => { byId[r.achievementId] = r; });
  return ACHIEVEMENTS.map((a) => {
    const r = byId[a.id];
    const rewardType = r ? r.rewardType : null;
    const rewardValue = r ? r.rewardValue : 0;
    const label = rewardType && REWARD_LABELS[rewardType]
      ? REWARD_LABELS[rewardType](rewardValue)
      : '—';
    return {
      id: a.id,
      name: a.name,
      desc: a.desc,
      reward: label,
      rewardType: rewardType || null,
      rewardValue: rewardValue || 0,
    };
  });
}

function getLevelTiers() {
  const maxLevel = 55;
  const tiers = [];
  let levelMin = 1;
  while (levelMin <= maxLevel) {
    const title = getLevelTitle(levelMin);
    let levelMax = levelMin;
    while (levelMax < maxLevel && getLevelTitle(levelMax + 1) === title) levelMax++;
    tiers.push({
      levelMin,
      levelMax,
      levelRange: levelMin === levelMax ? String(levelMin) : `${levelMin}–${levelMax}`,
      title,
      xpToNext: levelMax < maxLevel ? calculateXpForLevel(levelMax) : null,
    });
    levelMin = levelMax + 1;
  }
  return tiers;
}

async function getOrCreatePlayer(oduserId, username) {
  let user = await UserModel.findOne({ where: { oduserId } });
  if (!user) {
    user = await UserModel.create({ oduserId, username });
  } else if (username && user.username !== username) {
    user.username = username;
    await user.save();
  }
  return user;
}

async function recordMatchResult(oduserId, username, result) {
  const user = await getOrCreatePlayer(oduserId, username);

  user.totalMatches += 1;
  user.totalCorrect += result.correctAnswers || 0;
  user.totalQuestions += result.totalQuestions || 0;

  const perfect = (result.correctAnswers === result.totalQuestions) && result.totalQuestions > 0;
  let xpGain = 0;
  let ratingChange = 0;
  let coinGain = 0;

  // Solo ve Survival modlarında XP ve coin verilmez, rating değişmez
  const noRewardMode = result.mode === 'solo' || result.mode === 'survival';

  // Difficulty multiplier for XP and coins
  const diffMultiplier = result.difficulty === 'hard' ? 1.5 : result.difficulty === 'medium' ? 1.2 : 1;

  if (result.won) {
    user.wins += 1;
    user.streak += 1;
    if (user.streak > user.bestStreak) user.bestStreak = user.streak;
    if (!noRewardMode) {
      let baseXp = 60 + (result.correctAnswers || 0) * 12;
      const streakBonus = Math.min(0.5, (user.streak - 1) * 0.1);
      baseXp = Math.floor(baseXp * (1 + streakBonus));
      if (perfect) baseXp += 40;
      xpGain = Math.floor(baseXp * diffMultiplier);
      ratingChange = 25;
      let baseCoins = 50;
      const coinStreakBonus = Math.min(50, (user.streak - 1) * 10);
      baseCoins += coinStreakBonus;
      if (perfect) baseCoins += 20;
      coinGain = Math.floor(baseCoins * diffMultiplier);
    }
  } else if (result.draw) {
    user.draws += 1;
    user.streak = 0;
    if (!noRewardMode) {
      xpGain = Math.floor((25 + (result.correctAnswers || 0) * 6) * diffMultiplier);
      coinGain = Math.floor(20 * diffMultiplier);
    }
  } else {
    user.losses += 1;
    user.streak = 0;
    if (!noRewardMode) {
      xpGain = Math.floor((15 + (result.correctAnswers || 0) * 4) * diffMultiplier);
      ratingChange = -15;
      coinGain = Math.floor(10 * diffMultiplier);
    }
  }

  if (!noRewardMode) {
    user.coins += coinGain;
    user.xp += xpGain;
  }
  let levelsGained = 0;
  while (user.xp >= calculateXpForLevel(user.level)) {
    user.xp -= calculateXpForLevel(user.level);
    user.level += 1;
    levelsGained++;
  }
  user.rating = Math.max(0, user.rating + ratingChange);

  await user.save();

  // Save match to DB
  try {
    const match = await MatchModel.create({
      matchKey: result.matchKey || `m_${Date.now()}`,
      difficulty: result.difficulty || 'easy',
      category: result.category || 'all',
      mode: result.mode || '1v1',
      draw: result.draw || false,
      status: 'finished',
    });

    await MatchPlayerModel.create({
      matchId: match.id,
      userId: user.id,
      score: result.myScore || 0,
      correctCount: result.correctAnswers || 0,
    });

    if (result.won) {
      match.winnerId = user.id;
      await match.save();
    }
  } catch (e) {
    console.error('Match kayıt hatası:', e.message);
  }

  // Update category stats
  const cat = result.category || 'all';
  if (cat && cat !== 'all') {
    try {
      const [catStat] = await CategoryStatModel.findOrCreate({
        where: { userId: user.id, category: cat },
        defaults: { totalAnswered: 0, correctAnswered: 0, totalMatches: 0 },
      });
      catStat.totalAnswered += result.totalQuestions || 0;
      catStat.correctAnswered += result.correctAnswers || 0;
      catStat.totalMatches += 1;
      await catStat.save();
    } catch (e) {
      console.error('Category stat hatası:', e.message);
    }
  }

  // Check achievements
  const existing = await AchievementModel.findAll({ where: { userId: user.id } });
  const existingKeys = existing.map((a) => a.achievementKey);
  const checkData = { ...user.dataValues, _perfect: perfect };
  const newAchievements = [];

  for (const ach of ACHIEVEMENTS) {
    if (!existingKeys.includes(ach.id) && ach.check(checkData)) {
      await AchievementModel.create({ userId: user.id, achievementKey: ach.id });
      newAchievements.push({ id: ach.id, name: ach.name, desc: ach.desc });
      const rewardRow = await AchievementRewardModel.findOne({ where: { achievementId: ach.id } });
      if (rewardRow) await applyAchievementReward(user, rewardRow);
    }
  }

  // Update quest progress
  try {
    await checkAndCompleteQuests(oduserId, 'match');
    if (result.won) await checkAndCompleteQuests(oduserId, 'win');
    if (result.correctAnswers) await checkAndCompleteQuests(oduserId, 'correct', { count: result.correctAnswers });
    if (perfect) await checkAndCompleteQuests(oduserId, 'perfect');
    if (user.streak >= 2) await checkAndCompleteQuests(oduserId, 'streak', { streak: user.streak });
  } catch (e) {
    console.error('Quest update hatası:', e.message);
  }

  // Season XP (same as match XP)
  try {
    const seasonXpGain = Math.floor(xpGain * 0.8);
    if (seasonXpGain > 0) await addSeasonXp(oduserId, seasonXpGain);
  } catch (e) {
    console.error('Season XP hatası:', e.message);
  }

  // Notifications for achievements
  for (const ach of newAchievements) {
    createNotification(oduserId, 'achievement', 'Yeni Başarım!', `"${ach.name}" başarımını kazandın: ${ach.desc}`);
  }
  if (levelsGained > 0) {
    createNotification(oduserId, 'level_up', 'Seviye Atladın!', `Tebrikler! Seviye ${user.level} oldun. (${getLevelTitle(user.level)})`);
  }

  return { player: user, xpGain, ratingChange, levelsGained, newAchievements, coinGain };
}

async function recordAbandon(oduserId, username, matchData) {
  const user = await getOrCreatePlayer(oduserId, username);

  user.abandons += 1;
  user.losses += 1;
  user.totalMatches += 1;
  user.streak = 0;

  // Penalties: double rating loss, zero XP, zero coins
  const ratingPenalty = -30;
  user.rating = Math.max(0, user.rating + ratingPenalty);

  if (matchData.correctAnswers) user.totalCorrect += matchData.correctAnswers;
  if (matchData.totalQuestions) user.totalQuestions += matchData.totalQuestions;

  await user.save();

  // Save match to DB as abandoned
  try {
    const match = await MatchModel.create({
      matchKey: matchData.matchKey || `abn_${Date.now()}`,
      difficulty: matchData.difficulty || 'easy',
      category: matchData.category || 'all',
      mode: matchData.mode || '1v1',
      draw: false,
      status: 'abandoned',
    });

    await MatchPlayerModel.create({
      matchId: match.id,
      userId: user.id,
      score: matchData.myScore || 0,
      correctCount: matchData.correctAnswers || 0,
    });
  } catch (e) {
    console.error('Abandon kayıt hatası:', e.message);
  }

  return { player: user, ratingPenalty };
}

async function recordAbandonWin(oduserId, username, matchData) {
  const user = await getOrCreatePlayer(oduserId, username);

  user.wins += 1;
  user.totalMatches += 1;
  user.streak += 1;
  if (user.streak > user.bestStreak) user.bestStreak = user.streak;

  // Award XP and coins as if won
  const xpGain = 60 + (matchData.correctAnswers || 0) * 12;
  const coinGain = 50;
  user.xp += xpGain;
  user.coins += coinGain;
  while (user.xp >= calculateXpForLevel(user.level)) {
    user.xp -= calculateXpForLevel(user.level);
    user.level += 1;
  }
  user.rating = Math.max(0, user.rating + 25);

  if (matchData.correctAnswers) user.totalCorrect += matchData.correctAnswers;
  if (matchData.totalQuestions) user.totalQuestions += matchData.totalQuestions;

  await user.save();

  try {
    const match = await MatchModel.create({
      matchKey: matchData.matchKey || `abn_${Date.now()}`,
      difficulty: matchData.difficulty || 'easy',
      category: matchData.category || 'all',
      mode: matchData.mode || '1v1',
      draw: false,
      status: 'abandoned',
    });

    await MatchPlayerModel.create({
      matchId: match.id,
      userId: user.id,
      score: matchData.myScore || 0,
      correctCount: matchData.correctAnswers || 0,
    });

    match.winnerId = user.id;
    await match.save();
  } catch (e) {
    console.error('Abandon win kayıt hatası:', e.message);
  }

  return { player: user, xpGain, coinGain };
}

async function getLeaderboard(type = 'rating', limit = 20) {
  let order;
  if (type === 'rating') order = [['rating', 'DESC']];
  else if (type === 'wins') order = [['wins', 'DESC']];
  else order = [['level', 'DESC'], ['xp', 'DESC']];

  const users = await UserModel.findAll({ order, limit });
  return users.map((u, i) => ({
    rank: i + 1,
    userId: u.oduserId,
    username: u.username,
    avatar: u.avatar,
    title: u.title,
    rating: u.rating,
    level: u.level,
    levelTitle: getLevelTitle(u.level),
    wins: u.wins,
    losses: u.losses,
    totalMatches: u.totalMatches,
  }));
}

async function getPlayerStats(oduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user) return null;

  const achievements = await AchievementModel.findAll({ where: { userId: user.id } });
  const achKeys = achievements.map((a) => a.achievementKey);

  const matchPlayers = await MatchPlayerModel.findAll({
    where: { userId: user.id },
    include: [{ model: MatchModel }],
    order: [[MatchModel, 'createdAt', 'DESC']],
    limit: 20,
  });

  const matchIds = matchPlayers.map((mp) => mp.matchId);
  const allMatchPlayers = matchIds.length > 0
    ? await MatchPlayerModel.findAll({
        where: { matchId: matchIds },
        include: [{ model: UserModel, attributes: ['id', 'username', 'avatar'] }],
      })
    : [];

  const matchHistory = matchPlayers.map((mp) => {
    const m = mp.Match;
    const opponent = allMatchPlayers.find(
      (op) => op.matchId === mp.matchId && op.userId !== user.id
    );
    return {
      date: m.createdAt,
      myScore: mp.score,
      opponentScore: opponent ? opponent.score : 0,
      opponent: opponent?.User?.username || 'Solo',
      difficulty: m.difficulty,
      category: m.category,
      mode: m.mode,
      won: m.winnerId === user.id,
      draw: m.draw,
    };
  });

  // Category stats
  const catStats = await CategoryStatModel.findAll({ where: { userId: user.id } });
  const categoryStats = catStats.map((cs) => ({
    category: cs.category,
    totalAnswered: cs.totalAnswered,
    correctAnswered: cs.correctAnswered,
    totalMatches: cs.totalMatches,
    accuracy: cs.totalAnswered > 0 ? Math.round((cs.correctAnswered / cs.totalAnswered) * 100) : 0,
  }));

  return {
    userId: user.oduserId,
    username: user.username,
    avatar: user.avatar,
    bio: user.bio,
    title: user.title,
    activeFrame: user.activeFrame,
    activeBadge: user.activeBadge,
    coins: user.coins,
    rating: user.rating,
    level: user.level,
    levelTitle: getLevelTitle(user.level),
    xp: user.xp,
    xpNeeded: calculateXpForLevel(user.level),
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    totalMatches: user.totalMatches,
    totalCorrect: user.totalCorrect,
    totalQuestions: user.totalQuestions,
    streak: user.streak,
    bestStreak: user.bestStreak,
    abandons: user.abandons || 0,
    abandonRate: user.totalMatches > 0 ? Math.round(((user.abandons || 0) / user.totalMatches) * 100) : 0,
    winRate: user.totalMatches > 0 ? Math.round((user.wins / user.totalMatches) * 100) : 0,
    accuracy: user.totalQuestions > 0 ? Math.round((user.totalCorrect / user.totalQuestions) * 100) : 0,
    nextLevelXp: calculateXpForLevel(user.level),
    achievements: achKeys,
    achievementDetails: ACHIEVEMENTS.filter((a) => achKeys.includes(a.id)),
    matchHistory,
    categoryStats,
  };
}

module.exports = {
  getOrCreatePlayer,
  recordMatchResult,
  recordAbandon,
  recordAbandonWin,
  getLeaderboard,
  getPlayerStats,
  getLevelTitle,
  calculateXpForLevel,
  ACHIEVEMENTS,
  getAchievementsWithRewards,
  getLevelTiers,
};
