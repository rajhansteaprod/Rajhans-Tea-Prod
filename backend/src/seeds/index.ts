import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { seedPages } from './pages.seed';
import { seedBlogs } from './blogs.seed';

dotenv.config();

async function runSeeds() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rajhans-tea';

    console.log('🌱 Starting database seeding...');
    console.log(`📍 Connecting to MongoDB: ${mongoUri}`);

    await mongoose.connect(mongoUri);
    console.log('✓ MongoDB connected');

    // Run all seed functions
    await seedPages();
    await seedBlogs();

    console.log('✅ All seeds completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runSeeds();
