const { DataTypes } = require('sequelize');
const { flappySequelize } = require('../../database/flappyConfig');

const FlappyUser = flappySequelize.define(
  'FlappyUser',
  {
    userId: {
      type: DataTypes.STRING(128),
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    coins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    bestScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalGames: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    wins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Power-up envanteri
    shieldCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    slowCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    magnetCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    doubleCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    // Sahip olunan kuşlar (JSON array of bird keys)
    ownedBirds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['default'],
    },
    activeBird: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'default',
    },
    // Sahip olunan temalar
    ownedThemes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['day'],
    },
    activeTheme: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'day',
    },
    // Günlük ödül
    dailyStreak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastDailyClaim: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      defaultValue: null,
    },
    // Sezon
    seasonXp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'flappy_users',
    timestamps: true,
  }
);

module.exports = FlappyUser;
