const mongoose = require('mongoose');

const MONGO_URL = 'mongodb+srv://balbhadrartc_db_user:5yLwbBqXeGaMsGct@rajhansnonprod.kok02ek.mongodb.net/rajhans-tea?appName=RajhansNonProd';
const PRODUCT_ID = '6a37b7de410a46715c2d1a6d'; // TETST product

// Pre-generated valid ObjectIds for test users
const TEST_USER_IDS = [
  '507f1f77bcf86cd799439011',
  '507f1f77bcf86cd799439012',
  '507f1f77bcf86cd799439013',
  '507f1f77bcf86cd799439014',
  '507f1f77bcf86cd799439015',
  '507f1f77bcf86cd799439016',
  '507f1f77bcf86cd799439017',
  '507f1f77bcf86cd799439018',
  '507f1f77bcf86cd799439019',
  '507f1f77bcf86cd79943901a',
];

const ADMIN_ID = '507f1f77bcf86cd799439020';

const reviewTemplates = [
  { rating: 5, title: 'Best tea I\'ve ever had!', body: 'Absolutely amazing quality. The flavor is rich and authentic. Perfect for morning tea sessions. Highly recommended to all tea lovers!' },
  { rating: 5, title: 'Exceptional taste and aroma', body: 'The aroma is incredible. As soon as you open the packet, you can smell the quality. Brewed perfectly every time. Worth every penny.' },
  { rating: 4, title: 'Very good, but a bit pricey', body: 'Great taste and quality, but the price is slightly higher than expected. Still worth buying for special occasions. Would buy again.' },
  { rating: 5, title: 'Premium quality product', body: 'This is premium tea at its finest. The leaves are fresh and the taste is consistent. Customer service was excellent too.' },
  { rating: 4, title: 'Good for daily drinking', body: 'Good quality tea that\'s perfect for daily consumption. Not too expensive, good taste. Packaging could be better though.' },
  { rating: 5, title: 'Exceeded my expectations', body: 'I ordered this on a whim and it completely exceeded my expectations. The flavor profile is complex and delightful. Will definitely order more.' },
  { rating: 3, title: 'Decent but not spectacular', body: 'It\'s a decent tea, nothing bad about it. But I was expecting something more special given the price point. Still okay for the price.' },
  { rating: 5, title: 'Perfect for tea enthusiasts', body: 'If you\'re a tea lover, this is a must-buy. The quality is evident in every sip. The freshness is unmatched. Highly recommended!' },
  { rating: 4, title: 'Good quality, fast delivery', body: 'Product is good quality and delivery was super fast. Packaging is nice. Only issue is the amount of tea you get for the price.' },
  { rating: 5, title: 'Life changing tea experience', body: 'This is hands down the best tea I\'ve purchased online. The flavor is incredible and it stays fresh for weeks. Already recommended to friends!' }
];

async function seedReviews() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Connected\n');

    const db = mongoose.connection;
    const reviewsCollection = db.collection('reviews');

    // Delete old reviews
    console.log('🗑️  Deleting old reviews...');
    const deleteResult = await reviewsCollection.deleteMany({
      productId: new mongoose.Types.ObjectId(PRODUCT_ID)
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} old reviews\n`);

    // Create reviews with proper ObjectId types
    console.log('📝 Adding 10 reviews with proper ObjectId types...\n');

    const reviewsToInsert = reviewTemplates.map((template, index) => ({
      userId: new mongoose.Types.ObjectId(TEST_USER_IDS[index]),
      productId: new mongoose.Types.ObjectId(PRODUCT_ID),
      rating: template.rating,
      title: template.title,
      body: template.body,
      images: [],
      isVerifiedPurchase: Math.random() > 0.3,
      status: 'approved',
      rejectionReason: null,
      helpfulVotes: Math.floor(Math.random() * 20),
      reportCount: 0,
      adminReply: index % 3 === 0 ? {
        body: 'Thank you for your feedback! We appreciate your review.',
        repliedBy: new mongoose.Types.ObjectId(ADMIN_ID),
        repliedAt: new Date()
      } : null,
      isPinned: index === 0,
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date()
    }));

    const result = await reviewsCollection.insertMany(reviewsToInsert);
    console.log(`✅ ${result.insertedCount} reviews created!\n`);

    reviewsToInsert.forEach((review, i) => {
      console.log(`  ${i + 1}. ⭐ ${review.rating} - "${review.title}"`);
    });

    // Compute rating summary
    console.log('\n⚙️  Computing rating summary...');
    const summaryCollection = db.collection('ratingsummaries');

    const [agg] = await reviewsCollection.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(PRODUCT_ID), status: 'approved' } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          total: { $sum: 1 },
          r1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          r2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          r3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          r4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          r5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        },
      },
    ]).toArray();

    const summary = {
      averageRating: agg ? +agg.avg.toFixed(1) : 0,
      totalReviews: agg?.total ?? 0,
      distribution: {
        1: agg?.r1 ?? 0,
        2: agg?.r2 ?? 0,
        3: agg?.r3 ?? 0,
        4: agg?.r4 ?? 0,
        5: agg?.r5 ?? 0,
      },
    };

    await summaryCollection.findOneAndUpdate(
      { productId: new mongoose.Types.ObjectId(PRODUCT_ID) },
      { $set: summary },
      { upsert: true }
    );

    console.log(`✅ Rating summary: ${summary.totalReviews} reviews, ⭐ ${summary.averageRating}`);

    console.log('\n✨ Done! Refresh browser now.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedReviews();
