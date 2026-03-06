const { DataTypes } = require('sequelize');
const { flappySequelize } = require('../../database/flappyConfig');

const FlappyMatch = flappySequelize.define(
  'FlappyMatch',
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    seed: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    playerCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    winnerId: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    scores: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'flappy_matches',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
);

module.exports = FlappyMatch;
