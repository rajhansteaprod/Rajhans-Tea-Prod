import { Page } from '../modules/cms/models/page.model';
import { logger } from '../utils/logger';

export const pagesSeedData = [
  {
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    metaTitle: 'Privacy Policy — Rajhans Tea',
    metaDescription: 'Learn how Rajhans Tea collects, uses, and protects your personal information.',
    content: `
      <h2>Privacy Policy</h2>
      <p>At Rajhans Tea, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.</p>

      <h3>Information We Collect</h3>
      <p>We collect information you provide directly to us, such as when you:</p>
      <ul>
        <li>Create an account</li>
        <li>Place an order</li>
        <li>Contact us for support</li>
        <li>Subscribe to our newsletter</li>
      </ul>

      <h3>How We Use Your Information</h3>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Process and fulfill your orders</li>
        <li>Send transactional emails</li>
        <li>Improve our website and services</li>
        <li>Comply with legal obligations</li>
      </ul>

      <h3>Data Security</h3>
      <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>

      <h3>Contact Us</h3>
      <p>If you have any questions about this Privacy Policy, please contact us at privacy@rajhanstea.com</p>
    `,
    status: 'published',
  },
  {
    title: 'Terms & Conditions',
    slug: 'terms-and-conditions',
    metaTitle: 'Terms & Conditions — Rajhans Tea',
    metaDescription: 'Read our terms and conditions for using Rajhans Tea website and services.',
    content: `
      <h2>Terms & Conditions</h2>
      <p>Welcome to Rajhans Tea. These Terms & Conditions govern your use of our website and services.</p>

      <h3>Use License</h3>
      <p>Permission is granted to temporarily download one copy of the materials on our website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.</p>

      <h3>Disclaimer</h3>
      <p>The materials on our website are provided without warranties of any kind. Rajhans Tea disclaims all warranties, express or implied, including but not limited to warranties of merchantability and fitness for a particular purpose.</p>

      <h3>Limitations</h3>
      <p>In no case shall Rajhans Tea or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption).</p>

      <h3>Accuracy of Materials</h3>
      <p>The materials appearing on our website could include technical, typographical, or photographic errors. Rajhans Tea does not warrant that any of the materials on our website are accurate, complete, or current.</p>

      <h3>Contact Us</h3>
      <p>If you have any questions about these Terms & Conditions, please contact us at support@rajhanstea.com</p>
    `,
    status: 'published',
  },
  {
    title: 'Shipping Policy',
    slug: 'shipping-policy',
    metaTitle: 'Shipping Policy — Rajhans Tea',
    metaDescription: 'Learn about our shipping options, delivery times, and shipping costs.',
    content: `
      <h2>Shipping Policy</h2>
      <p>At Rajhans Tea, we aim to deliver your orders quickly and safely.</p>

      <h3>Shipping Regions</h3>
      <p>We offer Pan India delivery with tracked, insured, and reliable shipping.</p>

      <h3>Delivery Timeline</h3>
      <ul>
        <li><strong>Metro Cities:</strong> 3-5 business days</li>
        <li><strong>Non-Metro Cities:</strong> 5-7 business days</li>
        <li><strong>Remote Areas:</strong> 7-10 business days</li>
      </ul>

      <h3>Shipping Costs</h3>
      <p>Shipping costs vary based on your location and order value. Free shipping is available on orders above Rs. 500.</p>

      <h3>Order Tracking</h3>
      <p>Once your order ships, you will receive a tracking number via email that allows you to monitor your package's journey.</p>

      <h3>Contact Us</h3>
      <p>For shipping inquiries, please contact us at shipping@rajhanstea.com</p>
    `,
    status: 'published',
  },
  {
    title: 'Return & Refund Policy',
    slug: 'return-refund',
    metaTitle: 'Return & Refund Policy — Rajhans Tea',
    metaDescription: 'Understand our return and refund process for your purchases.',
    content: `
      <h2>Return & Refund Policy</h2>
      <p>Your satisfaction is our priority. If you're not happy with your purchase, we offer easy returns and refunds.</p>

      <h3>Return Window</h3>
      <p>You have 7 days from the date of delivery to initiate a return or request a refund.</p>

      <h3>Conditions for Returns</h3>
      <ul>
        <li>Product must be in original condition and packaging</li>
        <li>Product must not have been opened or used</li>
        <li>Product must not be damaged due to customer mishandling</li>
      </ul>

      <h3>Return Process</h3>
      <ol>
        <li>Contact us at returns@rajhanstea.com with your order number</li>
        <li>We will provide you with a return shipping label</li>
        <li>Ship the product back to us using the provided label</li>
        <li>Once received and verified, we will process your refund</li>
      </ol>

      <h3>Refund Timeline</h3>
      <p>Refunds are processed within 5-7 business days after we receive and verify your return.</p>

      <h3>Non-Returnable Items</h3>
      <p>Perishable items and customized products cannot be returned.</p>

      <h3>Contact Us</h3>
      <p>For return and refund inquiries, please contact us at returns@rajhanstea.com</p>
    `,
    status: 'published',
  },
  {
    title: 'FAQs',
    slug: 'faq',
    metaTitle: 'Frequently Asked Questions — Rajhans Tea',
    metaDescription: 'Find answers to common questions about Rajhans Tea products and services.',
    content: `
      <h2>Frequently Asked Questions</h2>

      <h3>What makes Rajhans Tea different?</h3>
      <p>We source directly from Assam's finest CTC gardens, pack within hours of processing, and use zero artificial additives. Every packet delivers the same bold, fresh taste — no compromises.</p>

      <h3>Is Rajhans Tea 100% natural?</h3>
      <p>Yes. We use absolutely no artificial flavours, chemicals, or colouring agents. Just pure, single-origin Assam CTC tea — the way nature intended.</p>

      <h3>How do you ensure freshness?</h3>
      <p>Our tea is sealed within 24 hours of processing. We use airtight packaging to lock in the aroma, colour, and flavour so every cup tastes as fresh as the garden.</p>

      <h3>Do you ship across India?</h3>
      <p>Yes, we deliver Pan India with tracked, insured, and reliable shipping. Your chai reaches you safe, fresh, and on time.</p>

      <h3>What is your return policy?</h3>
      <p>If you're not satisfied with your purchase, reach out to us within 7 days and we'll make it right. Your satisfaction is our promise.</p>

      <h3>How should I store the tea?</h3>
      <p>Store in an airtight container in a cool, dry place away from direct sunlight. Proper storage ensures maximum freshness and flavour.</p>
    `,
    status: 'published',
  },
];

export async function seedPages() {
  try {
    logger.info('🌱 seedPages() started');
    logger.info(`📍 DB Connection State: ${Page.collection.conn.readyState === 1 ? 'Connected ✓' : 'Not Connected ✗'}`);

    const existingCount = await Page.countDocuments();
    logger.info(`📊 Found ${existingCount} existing pages in database`);

    const missingPages: typeof pagesSeedData = [];
    for (const pageData of pagesSeedData) {
      const exists = await Page.findOne({ slug: pageData.slug }).exec();
      if (!exists) {
        missingPages.push(pageData);
      }
    }

    if (missingPages.length === 0) {
      logger.info('✓ All pages already seeded. Skipping insertion...');
      return;
    }

    logger.info(`📝 Inserting ${missingPages.length} missing pages into database...`);
    const result = await Page.insertMany(missingPages);
    logger.info(`✓ Successfully seeded ${result.length} pages`);
    logger.info(`🎯 Slugs created: ${result.map((p) => p.slug).join(', ')}`);
  } catch (error) {
    logger.error({ error }, 'Error seeding pages');
    throw error;
  }
}
