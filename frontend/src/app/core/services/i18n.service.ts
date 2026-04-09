import { Injectable, signal, inject } from '@angular/core';
import { PlatformService } from './platform.service';

export type Language = 'en' | 'hi';

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // Header
    'search.placeholder': 'Search products...',
    'nav.orders': 'Orders',
    'nav.wallet': 'Wallet',
    'nav.admin': 'Admin',
    'nav.signin': 'Sign In',

    // Cart
    'cart.title': 'Cart',
    'cart.empty': 'Your cart is empty',
    'cart.add': 'Add to Cart',
    'cart.checkout': 'Proceed to Checkout',
    'cart.subtotal': 'Subtotal',
    'cart.clear': 'Clear cart',

    // Product
    'product.addToCart': 'Add to Cart',
    'product.inStock': 'In Stock',
    'product.outOfStock': 'Out of Stock',
    'product.share': 'Share',
    'product.description': 'Description',
    'product.reviews': 'Reviews',

    // Checkout
    'checkout.cart': 'Cart',
    'checkout.address': 'Address',
    'checkout.summary': 'Summary',
    'checkout.placeOrder': 'Place Order',
    'checkout.orderPlaced': 'Order Placed!',

    // Common
    'common.loading': 'Loading...',
    'common.noResults': 'No results found',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.viewAll': 'View All',
    'common.continueShopping': 'Continue Shopping',

    // Footer
    'footer.shop': 'Shop',
    'footer.company': 'Company',
    'footer.support': 'Support',
    'footer.connect': 'Connect',

    // Pages
    'page.blog': 'Blog',
    'page.contact': 'Contact Us',
    'page.wishlist': 'Wishlist',
    'page.loyalty': 'Loyalty Points',
    'page.referral': 'Refer & Earn',
    'page.notifications': 'Notifications',
    'page.support': 'Support',
  },
  hi: {
    // Header
    'search.placeholder': 'उत्पाद खोजें...',
    'nav.orders': 'ऑर्डर',
    'nav.wallet': 'वॉलेट',
    'nav.admin': 'एडमिन',
    'nav.signin': 'साइन इन',

    // Cart
    'cart.title': 'कार्ट',
    'cart.empty': 'आपका कार्ट खाली है',
    'cart.add': 'कार्ट में जोड़ें',
    'cart.checkout': 'चेकआउट करें',
    'cart.subtotal': 'कुल राशि',
    'cart.clear': 'कार्ट खाली करें',

    // Product
    'product.addToCart': 'कार्ट में जोड़ें',
    'product.inStock': 'स्टॉक में',
    'product.outOfStock': 'स्टॉक में नहीं',
    'product.share': 'शेयर करें',
    'product.description': 'विवरण',
    'product.reviews': 'समीक्षाएं',

    // Checkout
    'checkout.cart': 'कार्ट',
    'checkout.address': 'पता',
    'checkout.summary': 'सारांश',
    'checkout.placeOrder': 'ऑर्डर करें',
    'checkout.orderPlaced': 'ऑर्डर हो गया!',

    // Common
    'common.loading': 'लोड हो रहा है...',
    'common.noResults': 'कोई परिणाम नहीं मिला',
    'common.save': 'सेव करें',
    'common.cancel': 'रद्द करें',
    'common.delete': 'हटाएं',
    'common.edit': 'संपादित करें',
    'common.create': 'बनाएं',
    'common.back': 'वापस',
    'common.next': 'आगे',
    'common.viewAll': 'सभी देखें',
    'common.continueShopping': 'खरीदारी जारी रखें',

    // Footer
    'footer.shop': 'शॉप',
    'footer.company': 'कंपनी',
    'footer.support': 'सहायता',
    'footer.connect': 'संपर्क',

    // Pages
    'page.blog': 'ब्लॉग',
    'page.contact': 'संपर्क करें',
    'page.wishlist': 'विशलिस्ट',
    'page.loyalty': 'लॉयल्टी पॉइंट्स',
    'page.referral': 'रेफर और कमाएं',
    'page.notifications': 'सूचनाएं',
    'page.support': 'सहायता',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly platform = inject(PlatformService);
  readonly language = signal<Language>(this.getInitialLanguage());

  t(key: string): string {
    return TRANSLATIONS[this.language()][key] || TRANSLATIONS['en'][key] || key;
  }

  setLanguage(lang: Language): void {
    this.language.set(lang);
    this.platform.localStorage.setItem('language', lang);
    // Only update DOM in browser
    if (this.platform.document) {
      this.platform.document.documentElement.setAttribute('lang', lang);
    }
  }

  toggle(): void {
    this.setLanguage(this.language() === 'en' ? 'hi' : 'en');
  }

  private getInitialLanguage(): Language {
    const saved = this.platform.localStorage.getItem('language') as Language | null;
    if (saved === 'en' || saved === 'hi') return saved;
    return 'en';
  }
}
