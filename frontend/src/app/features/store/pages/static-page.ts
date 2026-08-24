import { Component, OnInit, inject, signal, ViewEncapsulation } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-static-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './static-page.html',
  styleUrls: ['./static-page.scss'],
  encapsulation: ViewEncapsulation.None, // Disable encapsulation for [innerHTML] styling
})
export class StaticPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  readonly page = signal<any>(null);
  readonly notFound = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const slug = params['slug'];

      // Self-canonical (trailing slash matches the sitemap and the prerendered
      // directory URL the site 301s to). Duplicate policy slugs are 301'd at the
      // edge, so a page that renders here is always its own canonical.
      this.setCanonical(`https://rajhanstea.com/page/${slug}/`);

      // Prioritize updated local fallbacks over old backend DB content
      const fallback = this.getFallbackPage(slug);
      if (fallback) {
        this.page.set(fallback);
        this.titleService.setTitle(`${fallback.title} — Rajhans Tea`);
        this.notFound.set(false);
        return;
      }
      
      // Otherwise, load from backend DB (e.g. about-us, privacy-policy)
      this.http.get<{ data: any }>(`${environment.apiUrl}/pages/${slug}`).subscribe({
        next: (res) => {
          this.page.set(res.data);
          this.titleService.setTitle(`${res.data.metaTitle || res.data.title} — Rajhans Tea`);
          if (res.data.metaDescription) this.meta.updateTag({ name: 'description', content: res.data.metaDescription });
        },
        error: () => {
          this.notFound.set(true);
          this.page.set(null);
        },
      });
    });
  }

  private setCanonical(href: string): void {
    let canonical = this.document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', href);
  }

  private getFallbackPage(slug: string): any {
    const today = new Date().toISOString();
    
    const fallbacks: Record<string, any> = {
      'shipping-policy': {
        title: 'Shipping Policy',
        updatedAt: today,
        content: `
          <div class="policy-content">
            <h2>Overview</h2>
            <p>At Rajhans Tea, we are committed to delivering your favourite teas with care, speed, and reliability. All orders placed on our website are dispatched through Shiprocket — India's trusted logistics platform — giving you real-time tracking and wide pan-India coverage.</p>
            
            <h2>Order Processing</h2>
            <p>Once your payment is confirmed, your order is processed and handed over to our logistics partner within 24–48 business hours. Orders placed on Sundays or public holidays are processed on the next working day.</p>
            
            <h2>Delivery Timelines</h2>
            <ul>
              <li><strong>Metro cities</strong> (Delhi, Mumbai, Bangalore, Chennai, Kolkata, Hyderabad): 2–4 business days</li>
              <li><strong>Tier-II & Tier-III cities</strong>: 4–6 business days</li>
              <li><strong>Remote or difficult-to-access areas</strong>: 6–10 business days</li>
            </ul>
            
            <p class="note"><em>Note: These are estimated timelines. Actual delivery may vary based on your location, weather conditions, courier load, or any force majeure events beyond our control. Rajhans Tea shall not be held liable for courier delays once the shipment has been dispatched.</em></p>
            
            <h2>Shipping Charges</h2>
            <ul>
              <li>Free shipping on all prepaid orders above ₹499</li>
              <li>A flat shipping fee of ₹60 applies to orders below ₹499</li>
              <li><strong>Cash on Delivery (COD) orders</strong>: flat ₹80 handling fee regardless of order value</li>
            </ul>
            
            <h2>Tracking Your Order</h2>
            <p>Once your order is dispatched, you will receive a shipping confirmation message on your registered mobile number and email with a Shiprocket tracking link. You can track your package in real time using the tracking ID provided.</p>
            
            <h2>Cash on Delivery (COD)</h2>
            <p>We offer COD across most serviceable pin codes in India. COD availability is subject to your location and Shiprocket's serviceability. Please ensure someone is available at the delivery address to receive and pay for the order.</p>
            
            <h2>Undelivered or Returned Shipments</h2>
            <p>If a shipment is returned to us due to an incorrect address, failed delivery attempts, or recipient unavailability, we will reach out to you for re-shipment. Additional shipping charges may apply for re-dispatch. Rajhans Tea will not be responsible for loss of order due to incorrect address provided at checkout.</p>
            
            <p class="contact-info"><strong>📌 For shipping-related queries, please email us at <a href="mailto:rajhanstea@gmail.com">rajhanstea@gmail.com</a> with your order ID.</strong></p>
          </div>
        `
      },
      'terms-conditions': {
        title: 'Terms & Conditions',
        updatedAt: today,
        content: `
          <div class="policy-content">
            <h2>Acceptance of Terms</h2>
            <p>By accessing or purchasing from our website (www.rajhans.com), you agree to be bound by these Terms & Conditions. If you do not agree with any part of these terms, please refrain from using our platform. Rajhans Tea reserves the right to update these terms at any time; continued use of the website constitutes your acceptance of the revised terms.</p>
            
            <h2>About Rajhans Tea</h2>
            <p>Rajhans Tea is a brand of fine Indian teas rooted in a family legacy dating back to 1986, based in Bhopal, Madhya Pradesh, India. All transactions made through our website are subject to Indian law.</p>
            
            <h2>Eligibility</h2>
            <ul>
              <li>You must be at least 18 years of age to place an order on our website.</li>
              <li>By placing an order, you confirm that all information provided is accurate and complete.</li>
              <li>Rajhans Tea reserves the right to cancel orders suspected of fraud or misuse.</li>
            </ul>
            
            <h2>Products & Pricing</h2>
            <ul>
              <li>All product descriptions, prices, and availability are subject to change without prior notice.</li>
              <li>Prices on our website are listed in Indian Rupees (INR) and are inclusive of applicable taxes (GST), unless stated otherwise.</li>
              <li>We reserve the right to correct any typographical or pricing errors and to cancel orders placed at incorrect prices.</li>
              <li>Product images are for representational purposes only; actual packaging may vary slightly.</li>
            </ul>
            
            <h2>Order Placement & Confirmation</h2>
            <ul>
              <li>An order is considered confirmed only after you receive an Order Confirmation email or WhatsApp message from Rajhans Tea.</li>
              <li>We reserve the right to cancel or refuse any order at our sole discretion, with a full refund issued to the original payment method.</li>
              <li>Order cancellations by the customer are only accepted before the order has been dispatched. Once dispatched, cancellation requests cannot be entertained.</li>
            </ul>
            
            <h2>Payment</h2>
            <ul>
              <li>We accept all major payment methods including UPI, net banking, debit/credit cards, and Cash on Delivery (COD).</li>
              <li>All online payments are processed through secure, PCI-DSS compliant payment gateways. Rajhans Tea does not store your payment credentials.</li>
              <li>In case of a payment failure, please check with your bank before retrying. Do not place duplicate orders.</li>
            </ul>
            
            <h2>Intellectual Property</h2>
            <p>All content on this website — including the Rajhans Tea name, logo, product images, descriptions, and blog content — is the exclusive intellectual property of Rajhans Tea. Reproduction or commercial use of any content without written consent is strictly prohibited.</p>
            
            <h2>Limitation of Liability</h2>
            <p>Rajhans Tea shall not be liable for any indirect, incidental, or consequential damages arising from product use, delivery delays, or any other circumstances beyond our reasonable control. Our total liability in any matter is limited to the value of the order placed.</p>
            
            <h2>Governing Law</h2>
            <p>These Terms & Conditions are governed by and construed in accordance with the laws of India. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the courts in Bhopal, Madhya Pradesh.</p>
            
            <h2>Contact for Legal Queries</h2>
            <p>For any questions regarding these Terms & Conditions, please write to us at <a href="mailto:rajhanstea@gmail.com">rajhanstea@gmail.com</a>.</p>
          </div>
        `
      },
      'return-refund-policy': {
        title: 'Refund & Returns Policy',
        updatedAt: today,
        content: `
          <div class="policy-content">
            <p class="warning-banner"><strong>📌 IMPORTANT: Rajhans Tea does not offer monetary refunds. Returns are only applicable in the event of damaged goods received at delivery.</strong></p>
            
            <h2>Our Policy at a Glance</h2>
            <p>Tea is a perishable food product. Once dispatched and delivered, we cannot accept returns for change of mind, taste preference, or any reason other than physical damage to the product or packaging caused during transit.</p>
            
            <h2>When Returns Are Accepted</h2>
            <p>A return request will be considered valid ONLY if:</p>
            <ul>
              <li>The product packaging is visibly damaged, crushed, or broken upon delivery.</li>
              <li>The product seal has been broken or tampered with during transit (not by you).</li>
              <li>The wrong product was delivered against your confirmed order.</li>
            </ul>
            
            <p>Returns are <strong>NOT</strong> accepted for:</p>
            <ul>
              <li>Change of mind or taste preference.</li>
              <li>Products that have been used, opened, or partially consumed.</li>
              <li>Damage caused by improper storage after delivery.</li>
              <li>Products without original packaging.</li>
              <li>Claims raised more than 48 hours after delivery.</li>
            </ul>
            
            <h2>How to Raise a Return Request</h2>
            <p>To raise a valid return request, follow these steps:</p>
            <ol>
              <li><strong>Step 1:</strong> Email us at <a href="mailto:rajhanstea@gmail.com">rajhanstea@gmail.com</a> within 48 hours of delivery.</li>
              <li><strong>Step 2:</strong> Use the subject line: 'Return Request – [Your Order ID]'</li>
              <li><strong>Step 3:</strong> Attach clear photographs showing the damaged product and packaging.</li>
              <li><strong>Step 4:</strong> Include your full name, registered mobile number, and order ID in the email body.</li>
            </ol>
            <p>Our team will review your request within 2–3 business days. If approved, we will arrange a replacement shipment of the same product at no additional cost to you.</p>
            <p><em>📌 We do not issue monetary refunds. All approved claims are resolved through replacement only.</em></p>
            
            <h2>Replacement Process</h2>
            <ul>
              <li>Once your return request is approved, a replacement order will be dispatched within 3–5 business days.</li>
              <li>You will receive a new tracking link via SMS or email once the replacement is shipped.</li>
              <li>Rajhans Tea reserves the right to request return of the damaged product before dispatching a replacement.</li>
            </ul>
            
            <h2>Order Cancellations</h2>
            <ul>
              <li>Cancellations are accepted only before the order is dispatched from our facility.</li>
              <li>To cancel, email <a href="mailto:rajhanstea@gmail.com">rajhanstea@gmail.com</a> immediately with your order ID.</li>
              <li>If the order has already been dispatched, cancellation is not possible.</li>
              <li>In the rare case of a pre-dispatch cancellation on a prepaid order, a full refund will be processed to your original payment method within 7–10 business days.</li>
            </ul>
            
            <h2>Contact for Return Queries</h2>
            <p>For all return, replacement, or damage-related queries:</p>
            <p>
              📧 Email: <a href="mailto:rajhanstea@gmail.com">rajhanstea@gmail.com</a><br>
              🕐 Response Time: Within 48–72 business hours
            </p>
          </div>
        `
      }
    };
    
    return fallbacks[slug] || null;
  }
}
