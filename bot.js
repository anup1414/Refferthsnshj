const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const { User, Withdrawal, BroadcastLog } = require('./models');
const { CHANNELS, ADMIN_ID, BOT_TOKEN, WELCOME_BONUS, REFER_BONUS, MIN_WITHDRAW } = require('./config');

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

async function checkAllChannels(userId) {
  for (const ch of CHANNELS) {
    try {
      const member = await bot.getChatMember(ch.id, userId);
      if (!['member', 'administrator', 'creator'].includes(member.status)) return false;
    } catch { return false; }
  }
  return true;
}

function channelButtons() {
  const buttons = CHANNELS.map(ch => [{ text: `📢 ${ch.name}`, url: ch.link }]);
  buttons.push([{ text: '✅ Joined — Verify Karo', callback_data: 'verify_join' }]);
  return { inline_keyboard: buttons };
}

function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '💰 Balance', callback_data: 'balance' }, { text: '🔗 Refer Link', callback_data: 'refer' }],
      [{ text: '💸 Withdraw', callback_data: 'withdraw' }, { text: '📊 Status', callback_data: 'status' }],
      [{ text: '🏆 Leaderboard', callback_data: 'leaderboard' }, { text: '📜 History', callback_data: 'history' }],
      [{ text: '🆘 Support', url: 'https://t.me/YourSupportUsername' }]
    ]
  };
}

// /start command
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const referParam = match[1].trim();
  const referrerId = referParam ? referParam.replace('_ref_', '') : null;

  let user = await User.findOne({ telegramId: userId });

  if (!user) {
    user = new User({
      telegramId: userId,
      username: msg.from.username || '',
      firstName: msg.from.first_name || '',
      lastName: msg.from.last_name || '',
      balance: 0,
      referredBy: referrerId && referrerId !== String(userId) ? referrerId : null,
      referCode: String(userId),
      joinedChannels: false,
      pendingReferBonus: referrerId && referrerId !== String(userId) ? referrerId : null,
      deviceInfo: JSON.stringify({ language: msg.from.language_code })
    });
    await user.save();
  }

  const joined = await checkAllChannels(userId);

  if (!joined) {
    return bot.sendMessage(chatId,
      `🎉 *Swagat Hai ${msg.from.first_name}!*\n\n` +
      `💎 *Refer & Earn Bot* mein aapka swagat hai!\n\n` +
      `📌 *Pehle Ye Karo:*\n` +
      `Niche diye saare channels join karo aur *₹${WELCOME_BONUS} instant* pao!\n\n` +
      `🔔 Join karne ke baad *"✅ Joined — Verify Karo"* dabao`,
      { parse_mode: 'Markdown', reply_markup: channelButtons() }
    );
  }

  if (!user.joinedChannels) {
    user.joinedChannels = true;
    user.balance += WELCOME_BONUS;
    user.totalEarned = (user.totalEarned || 0) + WELCOME_BONUS;
    await user.save();
    return bot.sendMessage(chatId,
      `✅ *Verification Successful!*\n\n` +
      `🎁 *₹${WELCOME_BONUS} Welcome Bonus* aapke account mein add!\n\n` +
      `💰 Balance: *₹${user.balance.toFixed(2)}*\n\n` +
      `👥 Refer karo aur *₹${REFER_BONUS}* per refer kamao!`,
      { parse_mode: 'Markdown', reply_markup: mainMenu() }
    );
  }

  return bot.sendMessage(chatId,
    `👋 *Wapas Aaye ${msg.from.first_name}!*\n\n` +
    `💰 Balance: *₹${user.balance.toFixed(2)}*\n` +
    `👥 Total Refers: *${user.referCount || 0}*`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
});

// Callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);
  const user = await User.findOne({ telegramId: userId });

  // VERIFY JOIN
  if (data === 'verify_join') {
    const joined = await checkAllChannels(userId);
    if (!joined) {
      return bot.sendMessage(chatId,
        `❌ *Abhi Join Nahi Kia!*\n\nSaare channels join karo phir verify karo.`,
        { parse_mode: 'Markdown', reply_markup: channelButtons() }
      );
    }
    if (!user) return;
    let replyMsg = `✅ *Verification Ho Gaya!*\n\n`;
    if (!user.joinedChannels) {
      user.joinedChannels = true;
      user.balance += WELCOME_BONUS;
      user.totalEarned = (user.totalEarned || 0) + WELCOME_BONUS;
      await user.save();
      replyMsg += `🎁 *₹${WELCOME_BONUS} Welcome Bonus* diya gaya!\n\n`;
      if (user.pendingReferBonus) {
        const referrer = await User.findOne({ telegramId: user.pendingReferBonus });
        if (referrer && !referrer.banned) {
          referrer.balance += REFER_BONUS;
          referrer.totalEarned = (referrer.totalEarned || 0) + REFER_BONUS;
          referrer.referCount = (referrer.referCount || 0) + 1;
          await referrer.save();
          await bot.sendMessage(referrer.telegramId,
            `🎉 *Refer Bonus Mila!*\n\n` +
            `👤 ${user.firstName} ne aapka link use kiya!\n` +
            `💰 *₹${REFER_BONUS} aapke account mein add!*\n\n` +
            `💎 Total Balance: *₹${referrer.balance.toFixed(2)}*`,
            { parse_mode: 'Markdown' }
          );
        }
        user.pendingReferBonus = null;
        await user.save();
      }
    }
    replyMsg += `💰 Balance: *₹${user.balance.toFixed(2)}*`;
    return bot.sendMessage(chatId, replyMsg, { parse_mode: 'Markdown', reply_markup: mainMenu() });
  }

  if (!user) return bot.sendMessage(chatId, '⚠️ Pehle /start karo!');
  if (user.banned) return bot.sendMessage(chatId, '❌ Aapka account ban ho gaya hai.');

  // BALANCE
  if (data === 'balance') {
    return bot.sendMessage(chatId,
      `💰 *Aapka Wallet*\n\n` +
      `├ Balance: *₹${user.balance.toFixed(2)}*\n` +
      `├ Total Refers: *${user.referCount || 0}*\n` +
      `├ Total Earned: *₹${(user.totalEarned || 0).toFixed(2)}*\n` +
      `└ Withdrawn: *₹${(user.totalWithdrawn || 0).toFixed(2)}*\n\n` +
      `💸 Min Withdrawal: *₹${MIN_WITHDRAW}*`,
      { parse_mode: 'Markdown', reply_markup: mainMenu() }
    );
  }

  // REFER
  if (data === 'refer') {
    const botInfo = await bot.getMe();
    const link = `https://t.me/${botInfo.username}?start=_ref_${user.referCode}`;
    return bot.sendMessage(chatId,
      `🔗 *Aapka Refer Link*\n\n` +
      `\`${link}\`\n\n` +
      `💰 *Per Refer: ₹${REFER_BONUS}*\n` +
      `👥 Aapke Refers: *${user.referCount || 0}*\n\n` +
      `📌 *Kaise Kaam Karta Hai:*\n` +
      `1️⃣ Link share karo\n` +
      `2️⃣ Dost join kare aur channels join kare\n` +
      `3️⃣ ₹${REFER_BONUS} turant aapke account mein!\n\n` +
      `⚠️ Sirf valid refers count honge`,
      { parse_mode: 'Markdown', reply_markup: mainMenu() }
    );
  }

  // WITHDRAW
  if (data === 'withdraw') {
    if (user.balance < MIN_WITHDRAW) {
      return bot.sendMessage(chatId,
        `❌ *Withdrawal Nahi Ho Sakta!*\n\n` +
        `💰 Balance: *₹${user.balance.toFixed(2)}*\n` +
        `📌 Minimum: *₹${MIN_WITHDRAW}*\n\n` +
        `Aur refer karo! 🔥`,
        { parse_mode: 'Markdown' }
      );
    }
    if (user.withdrawPending) {
      return bot.sendMessage(chatId, `⏳ Aapki ek withdrawal already pending hai!\nAdmin se contact karo.`, { parse_mode: 'Markdown' });
    }
    user.awaitingUpi = true;
    await user.save();
    return bot.sendMessage(chatId,
      `💸 *Withdrawal Request*\n\n` +
      `💰 Amount: *₹${user.balance.toFixed(2)}*\n\n` +
      `📲 Apna *UPI ID* type karo:\n_(Example: name@paytm)_`,
      { parse_mode: 'Markdown' }
    );
  }

  // STATUS
  if (data === 'status') {
    const withdrawals = await Withdrawal.find({ userId: userId }).sort({ createdAt: -1 }).limit(5);
    const wText = withdrawals.length
      ? withdrawals.map(w => `• ₹${w.amount} — ${w.status === 'paid' ? '✅ Paid' : w.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'} (${new Date(w.createdAt).toLocaleDateString('en-IN')})`).join('\n')
      : 'Koi withdrawal nahi abhi tak';
    return bot.sendMessage(chatId,
      `📊 *Status*\n\n` +
      `👤 ${user.firstName} ${user.lastName}\n` +
      `🆔 \`${userId}\`\n` +
      `💰 Balance: *₹${user.balance.toFixed(2)}*\n` +
      `👥 Refers: *${user.referCount || 0}*\n` +
      `📅 Joined: ${new Date(user.createdAt).toLocaleDateString('en-IN')}\n\n` +
      `📜 *Recent Withdrawals:*\n${wText}`,
      { parse_mode: 'Markdown' }
    );
  }

  // LEADERBOARD
  if (data === 'leaderboard') {
    const top = await User.find().sort({ referCount: -1 }).limit(10);
    const text = top.map((u, i) =>
      `${['🥇','🥈','🥉'][i] || `${i+1}.`} ${u.firstName} — *${u.referCount || 0} refers*`
    ).join('\n');
    return bot.sendMessage(chatId, `🏆 *Top Referrers*\n\n${text}`, { parse_mode: 'Markdown' });
  }

  // HISTORY
  if (data === 'history') {
    const withdrawals = await Withdrawal.find({ userId: userId }).sort({ createdAt: -1 });
    if (!withdrawals.length) return bot.sendMessage(chatId, '📜 Koi history nahi.');
    const text = withdrawals.map(w =>
      `• *₹${w.amount}* | ${w.upiId} | ${w.status === 'paid' ? '✅' : w.status === 'rejected' ? '❌' : '⏳'}`
    ).join('\n');
    return bot.sendMessage(chatId, `📜 *Withdrawal History:*\n\n${text}`, { parse_mode: 'Markdown' });
  }

  // ADMIN: APPROVE
  if (data.startsWith('approve_') && String(userId) === String(ADMIN_ID)) {
    const wId = data.replace('approve_', '');
    const w = await Withdrawal.findById(wId);
    if (!w) return bot.sendMessage(chatId, '❌ Nahi mila.');
    w.status = 'paid';
    await w.save();
    const wUser = await User.findOne({ telegramId: w.userId });
    if (wUser) {
      wUser.withdrawPending = false;
      await wUser.save();
      await bot.sendMessage(wUser.telegramId,
        `✅ *Withdrawal Approved!*\n\n💰 *₹${w.amount}* aapke UPI *${w.upiId}* pe bhej diya!\n\nShukria! 🙏`,
        { parse_mode: 'Markdown' }
      );
    }
    return bot.editMessageText(`✅ Approved — ₹${w.amount} to ${w.upiId}`, { chat_id: chatId, message_id: query.message.message_id });
  }

  // ADMIN: REJECT
  if (data.startsWith('reject_') && String(userId) === String(ADMIN_ID)) {
    const wId = data.replace('reject_', '');
    const w = await Withdrawal.findById(wId);
    if (!w) return bot.sendMessage(chatId, '❌ Nahi mila.');
    const wUser = await User.findOne({ telegramId: w.userId });
    if (wUser) {
      wUser.balance += w.amount;
      wUser.withdrawPending = false;
      await wUser.save();
      await bot.sendMessage(wUser.telegramId,
        `❌ *Withdrawal Reject Ho Gayi*\n\n₹${w.amount} wapas balance mein add ho gaya.`,
        { parse_mode: 'Markdown' }
      );
    }
    w.status = 'rejected';
    await w.save();
    return bot.editMessageText(`❌ Rejected — ₹${w.amount} refunded`, { chat_id: chatId, message_id: query.message.message_id });
  }

  // ADMIN: FRAUD CHECK
  if (data.startsWith('checkfraud_') && String(userId) === String(ADMIN_ID)) {
    const targetId = data.replace('checkfraud_', '');
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return bot.sendMessage(chatId, 'User nahi mila.');
    const referredUsers = await User.find({ referredBy: targetId });
    const suspicious = [];
    for (const ru of referredUsers) {
      const ruDev = JSON.parse(ru.deviceInfo || '{}');
      const tDev = JSON.parse(targetUser.deviceInfo || '{}');
      if (ruDev.language === tDev.language) suspicious.push(`${ru.firstName} (${ru.telegramId})`);
    }
    const fraudText = suspicious.length
      ? `⚠️ *Suspicious Refers:*\n${suspicious.join('\n')}`
      : `✅ Koi fraud activity nahi`;
    return bot.sendMessage(chatId,
      `🔍 *Fraud Check: ${targetUser.firstName}*\n\nTotal Refers: ${targetUser.referCount || 0}\n\n${fraudText}`,
      { parse_mode: 'Markdown' }
    );
  }
});

// UPI input listener
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const user = await User.findOne({ telegramId: userId });
  if (!user || !user.awaitingUpi) return;

  const upiId = msg.text.trim();
  if (!upiId.includes('@')) {
    return bot.sendMessage(chatId, `❌ Valid UPI ID daalo (example: name@paytm)`);
  }

  const amount = user.balance;
  user.balance = 0;
  user.awaitingUpi = false;
  user.withdrawPending = true;
  user.totalWithdrawn = (user.totalWithdrawn || 0) + amount;
  await user.save();

  const withdrawal = new Withdrawal({ userId, upiId, amount, status: 'pending' });
  await withdrawal.save();

  await bot.sendMessage(chatId,
    `✅ *Request Bhej Di!*\n\n💰 Amount: *₹${amount.toFixed(2)}*\n📲 UPI: *${upiId}*\n⏳ 24 ghante mein process hoga.`,
    { parse_mode: 'Markdown' }
  );

  await bot.sendMessage(ADMIN_ID,
    `🔔 *Naya Withdrawal!*\n\n👤 ${msg.from.first_name} (@${msg.from.username || 'N/A'})\n🆔 \`${userId}\`\n💰 *₹${amount.toFixed(2)}*\n📲 *${upiId}*\n👥 Refers: ${user.referCount || 0}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Approve', callback_data: `approve_${withdrawal._id}` },
          { text: '❌ Reject', callback_data: `reject_${withdrawal._id}` }
        ],[
          { text: '🔍 Fraud Check', callback_data: `checkfraud_${userId}` }
        ]]
      }
    }
  );
});

// Admin commands
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const text = match[1];
  const users = await User.find({});
  let sent = 0, failed = 0;
  await bot.sendMessage(msg.chat.id, `📡 Sending to ${users.length} users...`);
  for (const u of users) {
    try {
      await bot.sendMessage(u.telegramId, `📢 *Message:*\n\n${text}`, { parse_mode: 'Markdown' });
      sent++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  bot.sendMessage(msg.chat.id, `✅ Done!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
});

bot.onText(/\/stats/, async (msg) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const total = await User.countDocuments();
  const joined = await User.countDocuments({ joinedChannels: true });
  const pending = await Withdrawal.countDocuments({ status: 'pending' });
  const paid = await Withdrawal.countDocuments({ status: 'paid' });
  const paidAmt = await Withdrawal.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
  bot.sendMessage(msg.chat.id,
    `📊 *Bot Stats*\n\n👥 Users: *${total}*\n✅ Joined: *${joined}*\n⏳ Pending Withdrawals: *${pending}*\n✅ Paid: *${paid}*\n💰 Total Paid: *₹${paidAmt[0]?.total?.toFixed(2) || '0'}*`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/users/, async (msg) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const users = await User.find().sort({ createdAt: -1 }).limit(20);
  const text = users.map(u => `• ${u.firstName} | ₹${u.balance.toFixed(2)} | ${u.referCount || 0} refers`).join('\n');
  bot.sendMessage(msg.chat.id, `👥 *Recent Users:*\n\n${text}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/userinfo (.+)/, async (msg, match) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const user = await User.findOne({ telegramId: match[1].trim() });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ Nahi mila.');
  bot.sendMessage(msg.chat.id,
    `👤 *User Info*\n\nName: ${user.firstName}\nUsername: @${user.username || 'N/A'}\nID: \`${user.telegramId}\`\nBalance: ₹${user.balance.toFixed(2)}\nRefers: ${user.referCount || 0}\nJoined: ${user.joinedChannels ? '✅' : '❌'}\nBanned: ${user.banned ? '✅' : '❌'}`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/addbalance (.+) (.+)/, async (msg, match) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const user = await User.findOne({ telegramId: match[1].trim() });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ Nahi mila.');
  const amount = parseFloat(match[2]);
  user.balance += amount;
  await user.save();
  bot.sendMessage(msg.chat.id, `✅ ₹${amount} add. New Balance: ₹${user.balance.toFixed(2)}`);
  bot.sendMessage(user.telegramId, `🎁 Admin ne *₹${amount}* add kiya!\n💰 Balance: *₹${user.balance.toFixed(2)}*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const user = await User.findOne({ telegramId: match[1].trim() });
  if (!user) return bot.sendMessage(msg.chat.id, '❌ Nahi mila.');
  user.banned = true;
  await user.save();
  bot.sendMessage(msg.chat.id, `✅ ${user.firstName} ban ho gaya.`);
});

bot.onText(/\/pendingwithdrawals/, async (msg) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  const pending = await Withdrawal.find({ status: 'pending' }).sort({ createdAt: 1 });
  if (!pending.length) return bot.sendMessage(msg.chat.id, '✅ Koi pending nahi!');
  for (const w of pending.slice(0, 10)) {
    const u = await User.findOne({ telegramId: w.userId });
    bot.sendMessage(msg.chat.id,
      `⏳ *Pending*\n👤 ${u?.firstName || 'Unknown'} (\`${w.userId}\`)\n💰 ₹${w.amount}\n📲 ${w.upiId}`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `approve_${w._id}` }, { text: '❌ Reject', callback_data: `reject_${w._id}` }]] } }
    );
  }
});

bot.onText(/\/help/, async (msg) => {
  if (String(msg.from.id) !== String(ADMIN_ID)) return;
  bot.sendMessage(msg.chat.id,
    `🛠 *Admin Commands:*\n\n/stats\n/users\n/userinfo <id>\n/addbalance <id> <amount>\n/ban <id>\n/pendingwithdrawals\n/broadcast <message>`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/balance/, async (msg) => {
  const user = await User.findOne({ telegramId: msg.from.id });
  if (!user) return bot.sendMessage(msg.chat.id, '⚠️ Pehle /start karo!');
  bot.sendMessage(msg.chat.id, `💰 Balance: *₹${user.balance.toFixed(2)}*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/refer/, async (msg) => {
  const user = await User.findOne({ telegramId: msg.from.id });
  if (!user) return bot.sendMessage(msg.chat.id, '⚠️ Pehle /start karo!');
  const botInfo = await bot.getMe();
  const link = `https://t.me/${botInfo.username}?start=_ref_${user.referCode}`;
  bot.sendMessage(msg.chat.id, `🔗 *Refer Link:*\n\`${link}\`\n\n💰 Per refer: *₹${REFER_BONUS}*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/withdraw/, async (msg) => {
  const user = await User.findOne({ telegramId: msg.from.id });
  if (!user) return bot.sendMessage(msg.chat.id, '⚠️ Pehle /start karo!');
  if (user.balance < MIN_WITHDRAW) return bot.sendMessage(msg.chat.id, `❌ Balance kam hai! Min: ₹${MIN_WITHDRAW}`);
  user.awaitingUpi = true;
  await user.save();
  bot.sendMessage(msg.chat.id, `💸 Apna UPI ID daalo:`);
});

bot.onText(/\/status/, async (msg) => {
  const user = await User.findOne({ telegramId: msg.from.id });
  if (!user) return bot.sendMessage(msg.chat.id, '⚠️ Pehle /start karo!');
  bot.sendMessage(msg.chat.id,
    `📊 Balance: ₹${user.balance.toFixed(2)}\n👥 Refers: ${user.referCount || 0}`,
    { parse_mode: 'Markdown' }
  );
});
