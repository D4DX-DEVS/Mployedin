require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://developer.bakh5qk.mongodb.net/mployedin', {
      authSource: 'admin',
    });

    const db = mongoose.connection.db;
    const settingsCollection = db.collection('systemsettings');
    const settings = await settingsCollection.findOne({});

    console.log('SystemSettings document exists:', !!settings);
    if (settings) {
      console.log('Has smtp field:', !!settings.smtp);
      if (settings.smtp) {
        console.log('SMTP config present:');
        console.log('  - smtpEmail:', settings.smtp.smtpEmail ? settings.smtp.smtpEmail.substring(0, 20) + '...' : 'MISSING');
        console.log('  - smtpHost:', settings.smtp.smtpHost || 'MISSING/default');
        console.log('  - smtpPort:', settings.smtp.smtpPort || 'MISSING/default');
        console.log('  - smtpSecure:', settings.smtp.smtpSecure);
        console.log('  - smtpAppPassword:', settings.smtp.smtpAppPassword ? '[present, length=' + settings.smtp.smtpAppPassword.length + ']' : 'MISSING');
      }
    } else {
      console.log('No SystemSettings document found');
    }

    // Also check recent audit logs for email sends
    const emailLogs = db.collection('emaillogs');
    const recentLogs = await emailLogs
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    console.log('\nRecent email logs (last 10):');
    recentLogs.forEach(log => {
      console.log(`  - To: ${log.to}, Status: ${log.status}, Subject: ${log.subject?.substring(0, 40)}...`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
