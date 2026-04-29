const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: String,
  firstName: String,
  lastName: String,
  balance: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  totalWithdrawn: { type: Number, default: 0 },
  referCount: { type: Number, default: 0 },
  referCode: { type: String, unique: true },
  referredBy: String,
  pendingReferBonus: String,
  joinedChannels: { type: Boolean, default: false },
  awaitingUpi: { type: Boolean, default: false },
  withdrawPending: { type: Boolean, default: false },
  banned: { type: Boolean, default: false },
  deviceInfo: { type: String, default: '{}' },
  ipHash: String,
}, { timestamps: true });

const withdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  upiId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending' },
}, { timestamps: true });

const broadcastSchema = new mongoose.Schema({
  message: String,
  sentCount: Number,
  failedCount: Number,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
const BroadcastLog = mongoose.model('BroadcastLog', broadcastSchema);

module.exports = { User, Withdrawal, BroadcastLog };
