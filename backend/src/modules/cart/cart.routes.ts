import { Router } from 'express';
import { authenticate, authenticateOptional } from '../../middleware/auth.middleware';
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
// CART — public (guest + logged-in, identified by userId or X-Session-ID)
// ===========================================================================

router.get('/cart', authenticateOptional, cart.getCart);
router.post('/cart/items', authenticateOptional, validate(addItemSchema), cart.addItem);
router.put('/cart/items/:productId', authenticateOptional, validate(updateItemSchema), cart.updateItem);
router.delete('/cart/items/:productId', authenticateOptional, validate(removeItemSchema), cart.removeItem);
router.delete('/cart', authenticateOptional, cart.clearCart);

// Merge requires authentication — called right after login
router.post('/cart/merge', authenticate, validate(mergeCartSchema), cart.mergeCart);

// ===========================================================================
// WISHLIST — public (guest + logged-in, identified by userId or X-Session-ID)
// ===========================================================================

router.get('/wishlist', authenticateOptional, cart.getWishlist);

// Merge requires authentication
router.post('/wishlist/merge', authenticate, validate(mergeWishlistSchema), cart.mergeWishlist);
router.post('/wishlist/:productId', authenticateOptional, validate(toggleWishlistSchema), cart.toggleWishlist);

// ===========================================================================
// CHECKOUT — public (guest + logged-in, identified by userId or X-Session-ID)
// ===========================================================================

router.post('/checkout/summary', authenticateOptional, cart.getCheckoutSummary);
router.post('/checkout/reserve', authenticateOptional, cart.reserveStock);
router.delete('/checkout/reserve', authenticateOptional, cart.releaseReservation);

export default router;
