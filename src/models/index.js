const User = require('./User');
const Question = require('./Question');
const Match = require('./Match');
const MatchPlayer = require('./MatchPlayer');
const Achievement = require('./Achievement');
const Friend = require('./Friend');
const FriendRequest = require('./FriendRequest');
const ChatMessage = require('./ChatMessage');
const DirectMessage = require('./DirectMessage');
const CategoryStat = require('./CategoryStat');
const Notification = require('./Notification');
const QuestionReport = require('./QuestionReport');
const UserCosmetic = require('./UserCosmetic');
const Quest = require('./Quest');
const Season = require('./Season');
const SeasonProgress = require('./SeasonProgress');
const PurchaseHistory = require('./PurchaseHistory');
const ChatBan = require('./ChatBan');
const ShopItem = require('./ShopItem');
const QuestTemplate = require('./QuestTemplate');
const CosmeticFrame = require('./CosmeticFrame');
const AchievementReward = require('./AchievementReward');

// Relations
Match.belongsTo(User, { as: 'winner', foreignKey: 'winnerId' });

MatchPlayer.belongsTo(Match, { foreignKey: 'matchId', onDelete: 'CASCADE' });
MatchPlayer.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
Match.hasMany(MatchPlayer, { foreignKey: 'matchId' });
User.hasMany(MatchPlayer, { foreignKey: 'userId' });

Achievement.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Achievement, { foreignKey: 'userId' });

Friend.belongsTo(User, { as: 'ownerUser', foreignKey: 'userId', onDelete: 'CASCADE' });
Friend.belongsTo(User, { as: 'friendUser', foreignKey: 'friendId', onDelete: 'CASCADE' });

FriendRequest.belongsTo(User, { as: 'fromUser', foreignKey: 'fromUserId', onDelete: 'CASCADE' });
FriendRequest.belongsTo(User, { as: 'toUser', foreignKey: 'toUserId', onDelete: 'CASCADE' });

CategoryStat.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(CategoryStat, { foreignKey: 'userId' });

Notification.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Notification, { foreignKey: 'userId' });

QuestionReport.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
QuestionReport.belongsTo(Question, { foreignKey: 'questionId', onDelete: 'CASCADE' });

UserCosmetic.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(UserCosmetic, { foreignKey: 'userId' });

Quest.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Quest, { foreignKey: 'userId' });

SeasonProgress.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
SeasonProgress.belongsTo(Season, { foreignKey: 'seasonId', onDelete: 'CASCADE' });

PurchaseHistory.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(PurchaseHistory, { foreignKey: 'userId' });

module.exports = {
  User,
  Question,
  Match,
  MatchPlayer,
  Achievement,
  Friend,
  FriendRequest,
  ChatMessage,
  DirectMessage,
  CategoryStat,
  Notification,
  QuestionReport,
  UserCosmetic,
  Quest,
  Season,
  SeasonProgress,
  PurchaseHistory,
  ChatBan,
  ShopItem,
  QuestTemplate,
  CosmeticFrame,
  AchievementReward,
};
