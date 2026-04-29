const mongoose = require('mongoose');
const { MONGODB_URI } = require('./config');

console.log('🚀 Bot start ho raha hai...');

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB se connected!');
    require('./bot');
    console.log('✅ Bot chal raha hai!');
  })
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });

process.on('unhandledRejection', (err) => {
  console.error('Error:', err);
});
