const { DataTypes } = require('sequelize');
const { flappySequelize } = require('../../database/flappyConfig');

const FlappyFriend = flappySequelize.define(
  'FlappyFriend',
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
    friendId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted'),
      allowNull: false,
      defaultValue: 'pending',
    },
  },
  {
    tableName: 'flappy_friends',
    timestamps: true,
  }
);

module.exports = FlappyFriend;
