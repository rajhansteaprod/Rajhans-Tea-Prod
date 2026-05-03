import { Blog } from '../modules/cms/models/blog.model';
import { User } from '../modules/auth/models/user.model';
import { logger } from '../utils/logger';

export const blogsSeedData = [
  {
    title: 'The Art of Perfect Tea Brewing',
    slug: 'art-of-perfect-tea-brewing',
    excerpt: 'Discover the secrets to brewing the perfect cup of Rajhans Tea. Learn water temperature, steeping times, and pro tips.',
    content: `
      <h2>The Art of Perfect Tea Brewing</h2>
      <p>Making the perfect cup of tea is an art form that combines science, intuition, and passion. Here's our complete guide.</p>

      <h3>Water Temperature</h3>
      <p>The temperature of water is crucial. For black tea like Rajhans CTC, use water heated to 200-212°F (93-100°C). Boiling water works best.</p>

      <h3>Steeping Time</h3>
      <p>Black tea typically requires 3-5 minutes of steeping. Start with 3 minutes and adjust to taste. Remember, longer brewing means stronger flavor.</p>

      <h3>Tea-to-Water Ratio</h3>
      <p>Use 1 teaspoon of loose leaf tea per 8 oz of water. This can be adjusted based on personal preference.</p>

      <h3>Pro Tips</h3>
      <ul>
        <li>Always use fresh, cold water</li>
        <li>Preheat your cup with hot water</li>
        <li>Don't over-brew — it increases bitterness</li>
        <li>Use a timer for consistency</li>
        <li>Store tea in an airtight container</li>
      </ul>
    `,
    coverImage: '/blog-brewing.jpg',
    tags: ['brewing', 'tea-tips', 'guide'],
    metaTitle: 'Perfect Tea Brewing Guide — Rajhans Tea',
    metaDescription: 'Learn how to brew the perfect cup of Rajhans CTC Tea with expert tips on temperature, time, and technique.',
    status: 'published',
    publishedAt: new Date('2026-05-01'),
  },
  {
    title: 'From Garden to Cup: Our Tea Journey',
    slug: 'garden-to-cup-tea-journey',
    excerpt: 'Explore how Rajhans Tea goes from the finest Assam gardens to your cup. Meet our farmers and learn our process.',
    content: `
      <h2>From Garden to Cup: Our Tea Journey</h2>
      <p>Every cup of Rajhans Tea represents a journey that begins in the lush gardens of Assam and ends in your home.</p>

      <h3>The Assam Gardens</h3>
      <p>Our tea comes from the finest CTC (Crush-Tear-Curl) gardens in Assam. These gardens benefit from the region's unique climate and soil.</p>

      <h3>Harvesting</h3>
      <p>We harvest during the first and second flush, when the leaves are at their most flavorful. Expert hands pick only the finest leaves.</p>

      <h3>Processing</h3>
      <p>Within 24 hours of harvest, our tea is processed using traditional methods combined with modern quality control.</p>

      <h3>Our Commitment</h3>
      <p>We work directly with farmers to ensure fair prices, sustainable practices, and the highest quality standards.</p>

      <h3>To Your Doorstep</h3>
      <p>Once processed, tea is sealed in airtight packaging to preserve freshness. We deliver across Pan India with tracked, insured shipping.</p>
    `,
    coverImage: '/blog-journey.jpg',
    tags: ['story', 'sustainability', 'assam'],
    metaTitle: 'Our Tea Journey: From Assam to Your Cup',
    metaDescription: 'Discover how Rajhans Tea travels from the gardens of Assam through our careful process to reach you fresh.',
    status: 'published',
    publishedAt: new Date('2026-04-28'),
  },
  {
    title: 'Why Black Tea? Health Benefits Explained',
    slug: 'black-tea-health-benefits',
    excerpt: 'Understand the science behind black tea benefits. Antioxidants, energy boost, and more explained by experts.',
    content: `
      <h2>Why Black Tea? Health Benefits Explained</h2>
      <p>Black tea is more than just a delicious beverage — it's packed with benefits supported by scientific research.</p>

      <h3>Rich in Antioxidants</h3>
      <p>Black tea contains powerful antioxidants called polyphenols that help protect your cells from damage and aging.</p>

      <h3>Natural Energy Boost</h3>
      <p>The caffeine in black tea provides a gentle energy lift without the jitters. About 40-70mg per cup compared to 95-200mg in coffee.</p>

      <h3>Heart Health</h3>
      <p>Regular black tea consumption has been linked to improved cardiovascular health and lower cholesterol levels.</p>

      <h3>Better Focus</h3>
      <p>The combination of caffeine and L-theanine improves focus and mental clarity without causing anxiety.</p>

      <h3>Digestive Support</h3>
      <p>Black tea can aid digestion and promote a healthy gut microbiome when consumed regularly.</p>

      <h3>A Perfect Daily Ritual</h3>
      <p>Beyond the health benefits, tea is a moment of mindfulness — a pause in your day to reflect and recharge.</p>
    `,
    coverImage: '/blog-benefits.jpg',
    tags: ['health', 'benefits', 'science'],
    metaTitle: 'Health Benefits of Black Tea — Rajhans Tea',
    metaDescription: 'Explore the science-backed health benefits of black tea: antioxidants, energy, heart health, and more.',
    status: 'published',
    publishedAt: new Date('2026-04-25'),
  },
  {
    title: 'Chai Beyond Tradition: Modern Tea Recipes',
    slug: 'modern-chai-recipes',
    excerpt: 'Reimagine chai with modern twists. Cold brew recipes, spiced lattes, and creative tea cocktails.',
    content: `
      <h2>Chai Beyond Tradition: Modern Tea Recipes</h2>
      <p>While traditional chai is beloved, here are creative ways to enjoy Rajhans Tea in the modern kitchen.</p>

      <h3>Cold Brew Iced Tea</h3>
      <p>Steep Rajhans Tea in cold water overnight for a smooth, less bitter iced tea perfect for hot days.</p>

      <h3>Spiced Latte</h3>
      <p>Brew strong tea and combine with milk, honey, and spices like cinnamon, cardamom, and ginger for a café-style drink.</p>

      <h3>Kombucha Base</h3>
      <p>Use Rajhans Tea as the base for homemade kombucha. The robust flavor handles fermentation beautifully.</p>

      <h3>Tea Smoothie</h3>
      <p>Brew and cool Rajhans Tea, then blend with fruits, yogurt, and honey for a nutritious morning drink.</p>

      <h3>Creative Pairings</h3>
      <ul>
        <li>Tea with dark chocolate</li>
        <li>Spiced chai with vanilla desserts</li>
        <li>Cold brew with citrus fruits</li>
        <li>Chai concentrate in cocktails</li>
      </ul>
    `,
    coverImage: '/blog-recipes.jpg',
    tags: ['recipes', 'modern', 'creative'],
    metaTitle: 'Modern Tea Recipes — Creative Ways to Enjoy Rajhans Tea',
    metaDescription: 'Explore creative tea recipes: cold brew, spiced lattes, smoothies, and more modern ways to enjoy tea.',
    status: 'published',
    publishedAt: new Date('2026-04-22'),
  },
];

export async function seedBlogs() {
  try {
    logger.info('🌱 seedBlogs() started');

    // Check if any blogs exist
    const existingCount = await Blog.countDocuments();
    logger.info(`📊 Found ${existingCount} existing blogs in database`);

    // Check for each blog individually
    const missingBlogs: typeof blogsSeedData = [];
    for (const blogData of blogsSeedData) {
      const exists = await Blog.findOne({ slug: blogData.slug }).exec();
      if (!exists) {
        missingBlogs.push(blogData);
      }
    }

    if (missingBlogs.length === 0) {
      logger.info('✓ All blogs already seeded. Skipping insertion...');
      return;
    }

    // Get admin user for author
    const adminUser = await User.findOne({ role: 'admin' }).exec();
    if (!adminUser) {
      logger.warn('⚠ No admin user found, skipping blog seeding');
      return;
    }

    // Add author ID to each blog
    const blogsWithAuthor = missingBlogs.map((blog) => ({
      ...blog,
      author: adminUser._id,
    }));

    logger.info(`📝 Inserting ${missingBlogs.length} missing blogs into database...`);
    const result = await Blog.insertMany(blogsWithAuthor);
    logger.info(`✓ Successfully seeded ${result.length} blogs`);
    logger.info(`🎯 Slugs created: ${result.map((b) => b.slug).join(', ')}`);
  } catch (error) {
    logger.error({ error }, 'Error seeding blogs');
    throw error;
  }
}
