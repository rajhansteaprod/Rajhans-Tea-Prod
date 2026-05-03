# Database Seeding

This directory contains seed files for initializing the database with static content and initial data.

## Files

- **pages.seed.ts** — Seeds 5 static pages (Privacy Policy, Terms & Conditions, Shipping Policy, Return & Refund, FAQs)

## Running Seeds

### From Backend Directory

```bash
npm run seed
```

### Directly with ts-node

```bash
ts-node src/seeds/index.ts
```

## How It Works

1. **Automatic MongoDB Connection** — `seeds/index.ts` connects to the database using `MONGODB_URI` from `.env`
2. **Idempotent Execution** — Each seed function checks if data already exists before inserting (prevents duplicates)
3. **Logging** — Console output shows progress and status of each seed

## Example Output

```
🌱 Starting database seeding...
📍 Connecting to MongoDB: mongodb://localhost:27017/rajhans-tea
✓ MongoDB connected
✓ Pages already seeded. Skipping...
✅ All seeds completed successfully!
```

## Adding New Seeds

1. Create a new file (e.g., `products.seed.ts`)
2. Export an async function with seed logic
3. Import and call it in `seeds/index.ts`

Example:
```typescript
export async function seedProducts() {
  try {
    const existing = await Product.countDocuments();
    if (existing > 0) {
      console.log('✓ Products already seeded. Skipping...');
      return;
    }
    
    const result = await Product.insertMany(productsData);
    console.log(`✓ Successfully seeded ${result.length} products`);
  } catch (error) {
    console.error('✗ Error seeding products:', error);
    throw error;
  }
}
```

Then in `seeds/index.ts`:
```typescript
import { seedProducts } from './products.seed';

// Inside runSeeds()
await seedPages();
await seedProducts();
```

## Environment Variables

Make sure your `.env` has:
```
MONGODB_URI=mongodb://localhost:27017/rajhans-tea
```
