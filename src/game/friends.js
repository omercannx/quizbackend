const UserModel = require('../models/User');
const FriendModel = require('../models/Friend');
const FriendRequestModel = require('../models/FriendRequest');

const onlineSockets = new Map();

function register(oduserId, username, socketId) {
  onlineSockets.set(oduserId, { socketId, username });
}

function unregister(oduserId) {
  onlineSockets.delete(oduserId);
}

function getSocketId(oduserId) {
  return onlineSockets.get(oduserId)?.socketId || null;
}

function isOnline(oduserId) {
  return onlineSockets.has(oduserId);
}

function getOnlineUsers() {
  return Array.from(onlineSockets.entries()).map(([userId, data]) => ({
    userId,
    username: data.username,
  }));
}

async function sendFriendRequest(fromOduserId, toUsername) {
  const fromUser = await UserModel.findOne({ where: { oduserId: fromOduserId } });
  if (!fromUser) return { success: false, error: 'Kullanıcı bulunamadı' };

  const toUser = await UserModel.findOne({ where: { username: toUsername } });
  if (!toUser) return { success: false, error: 'Kullanıcı bulunamadı' };
  if (fromUser.id === toUser.id) return { success: false, error: 'Kendinize istek gönderemezsiniz' };

  const existing = await FriendModel.findOne({ where: { userId: fromUser.id, friendId: toUser.id } });
  if (existing) return { success: false, error: 'Zaten arkadaşsınız' };

  const pendingOutgoing = await FriendRequestModel.findOne({
    where: { fromUserId: fromUser.id, toUserId: toUser.id, status: 'pending' },
  });
  if (pendingOutgoing) return { success: false, error: 'Zaten istek gönderilmiş' };

  // Check if the other person already sent us a request - auto accept
  const pendingIncoming = await FriendRequestModel.findOne({
    where: { fromUserId: toUser.id, toUserId: fromUser.id, status: 'pending' },
  });
  if (pendingIncoming) {
    pendingIncoming.status = 'accepted';
    await pendingIncoming.save();
    await FriendModel.findOrCreate({ where: { userId: fromUser.id, friendId: toUser.id } });
    await FriendModel.findOrCreate({ where: { userId: toUser.id, friendId: fromUser.id } });
    return { success: true, autoAccepted: true, toId: toUser.oduserId, toUsername: toUser.username };
  }

  await FriendRequestModel.create({ fromUserId: fromUser.id, toUserId: toUser.id, status: 'pending' });

  return { success: true, toId: toUser.oduserId, toUsername: toUser.username };
}

async function acceptFriendRequest(oduserId, fromOduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  const fromUser = await UserModel.findOne({ where: { oduserId: fromOduserId } });
  if (!user || !fromUser) return { success: false, error: 'Kullanıcı bulunamadı' };

  const req = await FriendRequestModel.findOne({
    where: { fromUserId: fromUser.id, toUserId: user.id, status: 'pending' },
  });
  if (!req) return { success: false, error: 'İstek bulunamadı' };

  req.status = 'accepted';
  await req.save();

  await FriendModel.findOrCreate({ where: { userId: user.id, friendId: fromUser.id } });
  await FriendModel.findOrCreate({ where: { userId: fromUser.id, friendId: user.id } });

  return { success: true };
}

async function rejectFriendRequest(oduserId, fromOduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  const fromUser = await UserModel.findOne({ where: { oduserId: fromOduserId } });
  if (!user || !fromUser) return { success: false };

  await FriendRequestModel.update(
    { status: 'rejected' },
    { where: { fromUserId: fromUser.id, toUserId: user.id, status: 'pending' } },
  );
  return { success: true };
}

async function removeFriend(oduserId, friendOduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  const friend = await UserModel.findOne({ where: { oduserId: friendOduserId } });
  if (!user || !friend) return { success: false };

  await FriendModel.destroy({ where: { userId: user.id, friendId: friend.id } });
  await FriendModel.destroy({ where: { userId: friend.id, friendId: user.id } });
  return { success: true };
}

async function getFriendList(oduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user) return [];

  const friends = await FriendModel.findAll({
    where: { userId: user.id },
    include: [{ model: UserModel, as: 'friendUser' }],
  });

  return friends.map((f) => ({
    userId: f.friendUser.oduserId,
    username: f.friendUser.username,
    avatar: f.friendUser.avatar || null,
    title: f.friendUser.title || null,
    online: isOnline(f.friendUser.oduserId),
  }));
}

async function getPendingRequests(oduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user) return [];

  const requests = await FriendRequestModel.findAll({
    where: { toUserId: user.id, status: 'pending' },
    include: [{ model: UserModel, as: 'fromUser' }],
  });

  return requests.map((r) => ({
    fromId: r.fromUser.oduserId,
    fromUsername: r.fromUser.username,
    fromAvatar: r.fromUser.avatar || null,
  }));
}

async function getSentRequests(oduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  if (!user) return [];

  const requests = await FriendRequestModel.findAll({
    where: { fromUserId: user.id, status: 'pending' },
    include: [{ model: UserModel, as: 'toUser' }],
  });

  return requests.map((r) => ({
    toId: r.toUser.oduserId,
    toUsername: r.toUser.username,
    toAvatar: r.toUser.avatar || null,
    sentAt: r.createdAt,
  }));
}

async function cancelFriendRequest(oduserId, toOduserId) {
  const user = await UserModel.findOne({ where: { oduserId } });
  const toUser = await UserModel.findOne({ where: { oduserId: toOduserId } });
  if (!user || !toUser) return { success: false };

  await FriendRequestModel.destroy({
    where: { fromUserId: user.id, toUserId: toUser.id, status: 'pending' },
  });
  return { success: true };
}

module.exports = {
  register,
  unregister,
  getSocketId,
  isOnline,
  getOnlineUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriendList,
  getPendingRequests,
  getSentRequests,
  cancelFriendRequest,
};
