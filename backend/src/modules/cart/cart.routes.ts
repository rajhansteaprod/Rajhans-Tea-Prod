import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import * as cart from './cart.controller';
import {
  addItemSchema,
  updateItemSchema,
  removeItemSchema,
  mergeCartSchema,
  toggleWishlistSchema,
  mergeWishlistSchema,
} from './cart.validator';

const router = Router();

// ===========================================================================
// CART — public (guest + logged-in, identified by X-Session-ID header)
// ===========================================================================

router.get('/cart', cart.getCart);
router.post('/cart/items', validate(addItemSchema), cart.addItem);
router.put('/cart/items/:productId', validate(updateItemSchema), cart.updateItem);
router.delete('/cart/items/:productId', validate(removeItemSchema), cart.removeItem);
router.delete('/cart', cart.clearCart);

// Merge requires authentication — called right after login
router.post('/cart/merge', authenticate, validate(mergeCartSchema), cart.mergeCart);

// ===========================================================================
// WISHLIST — public (guest + logged-in, identified by X-Session-ID header)
// ===========================================================================

router.get('/wishlist', cart.getWishlist);

// Merge requires authentication
router.post('/wishlist/merge', authenticate, validate(mergeWishlistSchema), cart.mergeWishlist);
router.post('/wishlist/:productId', validate(toggleWishlistSchema), cart.toggleWishlist);

// ===========================================================================
// CHECKOUT — public (guest + logged-in, identified by X-Session-ID header)
// ===========================================================================

router.get('/checkout/summary',authenticate, cart.getCheckoutSummary);
router.post('/checkout/reserve',authenticate, cart.reserveStock);
router.delete('/checkout/reserve',authenticate, cart.releaseReservation);

export default router;
