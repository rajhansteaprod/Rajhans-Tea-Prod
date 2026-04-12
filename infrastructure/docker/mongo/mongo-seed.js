// Seed default hero slides for development
const db = db.getSiblingDB('rajhans-tea');

// Check if hero slides already exist
const heroSlideCount = db.heroslides.countDocuments();
if (heroSlideCount === 0) {
  db.heroslides.insertMany([
    {
      _id: ObjectId('65a1b2c3d4e5f6a7b8c9d0e1'),
      title: 'Premium Whole Leaf Tea',
      subtitle: 'Experience the richness of authentic Indian tea',
      ctaText: 'Shop Now',
      ctaLink: '/products',
      desktopImage: '/assets/images/hero-desktop-1.jpg',
      mobileImage: '/assets/images/hero-mobile-1.jpg',
      textAlign: 'left',
      order: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      _id: ObjectId('65a1b2c3d4e5f6a7b8c9d0e2'),
      title: 'Crafted for Tea Lovers',
      subtitle: 'Discover handpicked blends from around the world',
      ctaText: 'Explore Collection',
      ctaLink: '/products',
      desktopImage: '/assets/images/hero-desktop-2.jpg',
      mobileImage: '/assets/images/hero-mobile-2.jpg',
      textAlign: 'center',
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  print('Hero slides seeded successfully');
} else {
  print('Hero slides already exist, skipping seed');
}
