// Run: docker exec rajhans-tea-mongo mongosh "mongodb://localhost:27017/rajhans-tea?replicaSet=rs0" /seeds/seed-admin.js

db.users.updateOne(
  { phone: '6266303713' },
  {
    $set: {
      phone: '6266303713',
      role: 'admin',
      isPhoneVerified: true,
      isActive: true,
      addresses: [],
      updatedAt: new Date(),
    },
    $setOnInsert: {
      createdAt: new Date(),
    },
  },
  { upsert: true },
);

print('Admin user seeded: +91 6266303713');
