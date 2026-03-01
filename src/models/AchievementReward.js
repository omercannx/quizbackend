const { DataTypes } = require('sequelize');
const { sequelize } = require('../database/config');

const AchievementReward = sequelize.define('AchievementReward', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  achievementId: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  rewardType: { type: DataTypes.STRING(30), allowNull: false },
  rewardValue: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'achievement_rewards',
  timestamps: true,
});

module.exports = AchievementReward;
