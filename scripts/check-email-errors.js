require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://developer.bakh5qk.mongodb.net/mployedin', {
      authSource: 'admin',
    });

    const db = mongoose.connection.db;
    const emailLogs = db.collection('emaillogs');
    
    // Get failed emails from the last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedLogs = await emailLogs
      .find({ status: 'failed', createdAt: { $gte: yesterday } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    console.log(`Found ${failedLogs.length} failed emails in the last 24 hours:\n`);
    
    failedLogs.forEach((log, idx) => {
      console.log(`${idx + 1}. To: ${log.to}`);
      console.log(`   Subject: ${log.subject}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Source: ${log.source}`);
      console.log(`   Error: ${log.errorMessage || '[NO ERROR MESSAGE]'}`);
      console.log(`   Created: ${log.createdAt}`);
      console.log();
    });

    // Also check password reset emails specifically
    console.log('\n\n--- Checking password reset emails (password-reset template) ---\n');
    const resetEmails = await emailLogs
      .find({ subject: { $regex: 'Reset Your Password' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    console.log(`Found ${resetEmails.length} password reset emails:\n`);
    resetEmails.forEach((log, idx) => {
      console.log(`${idx + 1}. To: ${log.to}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Error: ${log.errorMessage || '[NO ERROR MESSAGE]'}`);
      console.log(`   Created: ${log.createdAt}`);
      console.log();
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
