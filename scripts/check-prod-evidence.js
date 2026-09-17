require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://developer.bakh5qk.mongodb.net/mployedin', {
      authSource: 'admin',
    });

    const db = mongoose.connection.db;
    const activityLogs = db.collection('activitylogs');
    
    // Find Google sign-in failures
    console.log('--- Recent Google Sign-In Attempts ---\n');
    const googleLogins = await activityLogs
      .find({ 'meta.provider': 'google' })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    if (googleLogins.length === 0) {
      console.log('No Google sign-in attempts found in activity logs');
    } else {
      console.log(`Found ${googleLogins.length} Google sign-in attempts:\n`);
      googleLogins.forEach(log => {
        console.log(`Action: ${log.action}`);
        console.log(`  Actor: ${log.actorId || 'anonymous'}`);
        console.log(`  Meta: ${JSON.stringify(log.meta)}`);
        console.log(`  Created: ${log.createdAt}`);
        console.log();
      });
    }

    // Check for Firebase-related errors
    console.log('\n--- Recent Auth Failures ---\n');
    const authFailures = await activityLogs
      .find({ action: 'login.failed' })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    if (authFailures.length === 0) {
      console.log('No auth failures found');
    } else {
      console.log(`Found ${authFailures.length} recent auth failures:\n`);
      authFailures.forEach(log => {
        console.log(`Email: ${log.meta?.email || 'unknown'}`);
        console.log(`  Reason: ${log.meta?.reason || 'unknown'}`);
        console.log(`  Created: ${log.createdAt}`);
        console.log();
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
