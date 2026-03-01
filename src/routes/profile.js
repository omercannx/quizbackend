const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();
const { getAchievementsWithRewards, getLevelTiers } = require('../game/leaderboard');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `avatar_${req.params.userId}_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları kabul edilir (jpg, png, gif, webp)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

// GET achievements & level config (public - for app Başarımlar page)
router.get('/achievements-config', async (req, res) => {
  try {
    res.json({
      achievements: await getAchievementsWithRewards(),
      levelTiers: getLevelTiers(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET profile
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ where: { oduserId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    res.json({
      success: true,
      profile: {
        userId: user.oduserId,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        title: user.title,
        email: user.email,
        favoriteCategory: user.favoriteCategory,
        level: user.level,
        xp: user.xp,
        rating: user.rating,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        totalMatches: user.totalMatches,
        totalCorrect: user.totalCorrect,
        totalQuestions: user.totalQuestions,
        streak: user.streak,
        bestStreak: user.bestStreak,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// UPDATE profile
router.put('/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ where: { oduserId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const { bio, title, email, favoriteCategory, username } = req.body;

    if (username && username !== user.username) {
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter olmalı' });
      }
      const existing = await User.findOne({ where: { username } });
      if (existing) return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
      user.username = username;
    }

    if (bio !== undefined) user.bio = bio ? bio.slice(0, 200) : null;
    if (title !== undefined) user.title = title ? title.slice(0, 50) : null;
    if (email !== undefined) user.email = email || null;
    if (favoriteCategory !== undefined) user.favoriteCategory = favoriteCategory || null;

    await user.save();

    res.json({
      success: true,
      profile: {
        userId: user.oduserId,
        username: user.username,
        avatar: user.avatar,
        bio: user.bio,
        title: user.title,
        email: user.email,
        favoriteCategory: user.favoriteCategory,
      },
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// UPLOAD avatar
router.post('/:userId/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });

    const user = await User.findOne({ where: { oduserId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    // Delete old avatar if exists
    if (user.avatar) {
      const oldFile = path.join(uploadsDir, path.basename(user.avatar));
      if (fs.existsSync(oldFile)) {
        try { fs.unlinkSync(oldFile); } catch {}
      }
    }

    const avatarUrl = `/uploads/${req.file.filename}`;
    user.avatar = avatarUrl;
    await user.save();

    res.json({ success: true, avatar: avatarUrl });
  } catch (err) {
    console.error('Upload avatar error:', err.message);
    res.status(500).json({ error: 'Dosya yüklenemedi' });
  }
});

// DELETE avatar
router.delete('/:userId/avatar', async (req, res) => {
  try {
    const user = await User.findOne({ where: { oduserId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    if (user.avatar) {
      const oldFile = path.join(uploadsDir, path.basename(user.avatar));
      if (fs.existsSync(oldFile)) {
        try { fs.unlinkSync(oldFile); } catch {}
      }
    }

    user.avatar = null;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Delete avatar error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// CHANGE password
router.put('/:userId/password', async (req, res) => {
  try {
    const user = await User.findOne({ where: { oduserId: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Yeni şifre en az 4 karakter olmalı' });
    }

    if (user.password) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Mevcut şifre yanlış' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Şifre başarıyla değiştirildi' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
