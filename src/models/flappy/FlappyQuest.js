const { DataTypes } = require('sequelize');
const { flappySequelize } = require('../../database/flappyConfig');

const FlappyQuest = flappySequelize.define(
  'FlappyQuest',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    questKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    target: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    reward: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    rewardType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'coin',
    },
    completed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    claimed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    questDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
  },
  {
    tableName: 'flappy_quests',
    timestamps: true,
  }
);

module.exports = FlappyQuest;
