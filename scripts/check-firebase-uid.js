require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://developer.bakh5qk.mongodb.net/mployedin', {
      authSource: 'admin',
    });

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Check if any user has firebaseUid
    const usersWithFirebase = await usersCollection
      .find({ firebaseUid: { $exists: true, $ne: null } })
      .limit(5)
      .toArray();

    console.log(`Found ${usersWithFirebase.length} users with firebaseUid field:\n`);
    usersWithFirebase.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`  Firebase UID: ${user.firebaseUid}`);
      console.log(`  Created: ${user.createdAt}`);
      console.log();
    });

    // Specifically search for the mentioned UID
    const targetUid = 'LWk1osoJzAgzlRlUI3LJg4VDtVl2';
    const targetUser = await usersCollection.findOne({ firebaseUid: targetUid });
    
    console.log('\n--- Searching for specific UID: LWk1osoJzAgzlRlUI3LJg4VDtVl2 ---\n');
    if (targetUser) {
      console.log('✓ Found user with that UID:');
      console.log(`  Email: ${targetUser.email}`);
      console.log(`  Name: ${targetUser.name}`);
      console.log(`  Role: ${targetUser.role}`);
      console.log(`  Created: ${targetUser.createdAt}`);
      console.log(`  isActive: ${targetUser.isActive}`);
    } else {
      console.log('✗ No user found with that Firebase UID in the database');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.disconnect();
  }
})();
