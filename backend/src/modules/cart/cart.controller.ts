import { Request, Response } from 'express';
import { CartService } from './services/cart.service';
import { WishlistService } from './services/wishlist.service';
import { CheckoutService } from './services/checkout.service';
import { sendSuccess, sendNoContent } from '../../utils/api-response';
import { BadRequestError } from '../../utils/api-error';

const cartService = new CartService();
const wishlistService = new WishlistService();
const checkoutService = new CheckoutService();

// ---------------------------------------------------------------------------
// Helper — extract session identifier (userId if logged in, else sessionId)
// ---------------------------------------------------------------------------

function getSessionIdentifier(req: Request): { type: 'userId' | 'sessionId'; value: string } {
  // If user is authenticated, use userId
  if (req.user?.userId) {
    return { type: 'userId', value: req.user.userId };
  }

  // Otherwise use X-Session-ID header for guest
  const sid = req.headers['x-session-id'];
  if (!sid || typeof sid !== 'string' || sid.trim() === '') {
    throw new BadRequestError('X-Session-ID header is required for guests');
  }
  return { type: 'sessionId', value: sid.trim() };
}

// ---------------------------------------------------------------------------
// CART controllers
// ---------------------------------------------------------------------------

export const getCart = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const data = identifier.type === 'userId'
    ? await cartService.getCartByUserId(identifier.value)
    : await cartService.getCart(identifier.value);
  sendSuccess(res, data);
};

export const addItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const { productId, variantId, qty } = req.body as { productId: string; variantId?: string; qty: number };
  const data = identifier.type === 'userId'
    ? await cartService.addItemForUser(identifier.value, productId, qty, variantId)
    : await cartService.addItem(identifier.value, productId, qty, variantId);
  sendSuccess(res, data, 'Item added to cart');
};

export const updateItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const productId = req.params['productId'] as string;
  const { qty, variantId } = req.body as { qty: number; variantId?: string };
  const data = identifier.type === 'userId'
    ? await cartService.updateItemForUser(identifier.value, productId, qty, variantId)
    : await cartService.updateItem(identifier.value, productId, qty, variantId);
  sendSuccess(res, data, 'Cart updated');
};

export const removeItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const productId = req.params['productId'] as string;
  const { variantId } = req.body as { variantId?: string };
  const data = identifier.type === 'userId'
    ? await cartService.removeItemForUser(identifier.value, productId, variantId)
    : await cartService.removeItem(identifier.value, productId, variantId);
  sendSuccess(res, data, 'Item removed from cart');
};

export const clearCart = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  identifier.type === 'userId'
    ? await cartService.clearCartForUser(identifier.value)
    : await cartService.clearCart(identifier.value);
  sendNoContent(res);
};

export const mergeCart = async (req: Request, res: Response) => {
  const { guestSessionId } = req.body as { guestSessionId: string };
  const userId = req.user!.userId;
  const data = await cartService.mergeOnLogin(guestSessionId, userId);
  sendSuccess(res, data, 'Cart merged');
};

// ---------------------------------------------------------------------------
// WISHLIST controllers
// ---------------------------------------------------------------------------

export const getWishlist = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = identifier.value; // Use value for both userId and sessionId
  const data = await wishlistService.getWishlist(sessionId);
  sendSuccess(res, data);
};

export const toggleWishlist = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = identifier.value;
  const productId = req.params['productId'] as string;
  const result = await wishlistService.toggle(sessionId, productId);
  sendSuccess(
    res,
    result.wishlist,
    result.action === 'added' ? 'Added to wishlist' : 'Removed from wishlist',
  );
};

export const mergeWishlist = async (req: Request, res: Response) => {
  const { guestSessionId } = req.body as { guestSessionId: string };
  const userId = req.user!.userId;
  const data = await wishlistService.mergeOnLogin(guestSessionId, userId);
  sendSuccess(res, data, 'Wishlist merged');
};

// ---------------------------------------------------------------------------
// CHECKOUT controllers
// ---------------------------------------------------------------------------

export const getCheckoutSummary = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = identifier.value;
  const { items, promoCode } = req.body as { items?: any[]; promoCode?: string };
  const data = await checkoutService.getSummary(sessionId, items, promoCode);
  sendSuccess(res, data);
};

export const reserveStock = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = identifier.value;
  const result = await checkoutService.reserveStock(sessionId);
  if (result.issues.length > 0) {
    res.status(409).json({
      success: false,
      statusCode: 409,
      message: 'Some items are out of stock',
      data: { issues: result.issues },
    });
    return;
  }
  sendSuccess(res, { reserved: true }, 'Stock reserved for 15 minutes');
};

export const releaseReservation = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = identifier.value;
  await checkoutService.releaseReservation(sessionId);
  sendNoContent(res);
};
