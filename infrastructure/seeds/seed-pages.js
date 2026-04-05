// Run: docker exec rajhans-tea-mongo mongosh "mongodb://localhost:27017/rajhans-tea?replicaSet=rs0" /seeds/seed-pages.js

db.pages.insertMany(
  [
    {
      title: 'Terms of Service',
      slug: 'terms-of-service',
      content: `<div class="page-content">
  <h1>Terms of Service</h1>

  <h2>1. Introduction</h2>
  <p>Welcome to Rajhans Tea. These Terms of Service govern your use of our website and services. By accessing and using this site, you accept and agree to be bound by the terms and provision of this agreement.</p>

  <h2>2. Use License</h2>
  <p>Permission is granted to temporarily download one copy of the materials (information or software) on Rajhans Tea's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
  <ul>
    <li>Modify or copy the materials</li>
    <li>Use the materials for any commercial purpose or for any public display</li>
    <li>Attempt to decompile or reverse engineer any software contained on Rajhans Tea's website</li>
    <li>Remove any copyright or other proprietary notations from the materials</li>
    <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
  </ul>

  <h2>3. Disclaimer</h2>
  <p>The materials on Rajhans Tea's website are provided on an 'as is' basis. Rajhans Tea makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

  <h2>4. Limitations</h2>
  <p>In no event shall Rajhans Tea or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Rajhans Tea's website, even if Rajhans Tea or an authorized representative has been notified orally or in writing of the possibility of such damage.</p>

  <h2>5. Accuracy of Materials</h2>
  <p>The materials appearing on Rajhans Tea's website could include technical, typographical, or photographic errors. Rajhans Tea does not warrant that any of the materials on its website are accurate, complete, or current. Rajhans Tea may make changes to the materials contained on its website at any time without notice.</p>

  <h2>6. Links</h2>
  <p>Rajhans Tea has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Rajhans Tea of the site. Use of any such linked website is at the user's own risk.</p>

  <h2>7. Modifications</h2>
  <p>Rajhans Tea may revise these terms of service for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms of service.</p>

  <h2>8. Governing Law</h2>
  <p>These terms and conditions are governed by and construed in accordance with the laws of India, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.</p>

  <h2>9. Contact Information</h2>
  <p>If you have any questions about these Terms of Service, please contact us at support@rajhanstea.com</p>
</div>`,
      metaTitle: 'Terms of Service — Rajhans Tea',
      metaDescription: 'Read our Terms of Service to understand the rules and regulations governing the use of Rajhans Tea website.',
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      title: 'Privacy Policy',
      slug: 'privacy-policy',
      content: `<div class="page-content">
  <h1>Privacy Policy</h1>

  <h2>1. Introduction</h2>
  <p>At Rajhans Tea, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.</p>

  <h2>2. Information We Collect</h2>
  <p>We may collect information about you in a variety of ways. The information we may collect on the site includes:</p>

  <h3>Personal Data</h3>
  <ul>
    <li>Name</li>
    <li>Email address</li>
    <li>Phone number</li>
    <li>Shipping and billing address</li>
    <li>Payment information</li>
  </ul>

  <h3>Derivative Data</h3>
  <p>Information our servers automatically collect when you access the Site, such as your IP address, browser type, operating system, your access times, and the pages you have viewed directly before and after accessing the Site.</p>

  <h3>Financial Data</h3>
  <p>Financial information, such as data related to your payment method (e.g., valid credit card number, card brand, expiration date) that we may collect when you purchase, order, return, exchange, or request information about our services from the Site.</p>

  <h2>3. Use of Your Information</h2>
  <p>Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Site to:</p>
  <ul>
    <li>Generate a personal profile about you so that future visits to the Site are personalized</li>
    <li>Increase the efficiency and operation of the Site</li>
    <li>Monitor and analyze usage and trends to improve your experience with the Site</li>
    <li>Notify you of updates to the Site</li>
    <li>Process your transactions and send related information</li>
    <li>Email you regarding your account or order</li>
  </ul>

  <h2>4. Disclosure of Your Information</h2>
  <p>We may share your information in the following situations:</p>
  <ul>
    <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information is necessary to comply with the law, enforce our agreements, or protect the rights, property, and safety of our company, our customers, or others.</li>
    <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us, including payment processing, data analysis, email delivery, hosting services, customer service, and marketing assistance.</li>
  </ul>

  <h2>5. Security of Your Information</h2>
  <p>We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are impenetrable.</p>

  <h2>6. Contact Us</h2>
  <p>If you have questions or comments about this Privacy Policy, please contact us at:</p>
  <p>
    Email: privacy@rajhanstea.com<br/>
    Address: Rajhans Tea, India
  </p>

  <h2>7. Changes to This Privacy Policy</h2>
  <p>We reserve the right to modify this privacy policy at any time. You will be notified of any changes by updating the "Last Updated" date of this Privacy Policy, and you waive the right to receive specific notice of each such change or modification.</p>
</div>`,
      metaTitle: 'Privacy Policy — Rajhans Tea',
      metaDescription: 'Learn how Rajhans Tea collects, uses, and protects your personal information with our comprehensive Privacy Policy.',
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  { ordered: false }
);

print('Pages seeded successfully: Terms of Service, Privacy Policy');
