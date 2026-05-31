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

import { Types } from 'mongoose';

function getSessionIdentifier(req: Request): string | Types.ObjectId {
  // If user is authenticated, use userId
  if (req.user?.userId) {
    return new Types.ObjectId(req.user.userId);
  }

  // Otherwise use X-Session-ID header for guest
  const sid = req.headers['x-session-id'];
  if (!sid || typeof sid !== 'string' || sid.trim() === '') {
    throw new BadRequestError('X-Session-ID header is required for guests');
  }
  return sid.trim();
}

// ---------------------------------------------------------------------------
// CART controllers
// ---------------------------------------------------------------------------

export const getCart = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const data = await cartService.getCart(identifier);
  sendSuccess(res, data);
};

export const addItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const { productId, variantId, qty, slug } = req.body as { productId: string; variantId?: string; qty: number; slug?: string };
  const data = await cartService.addItem(identifier, productId, qty, variantId, slug);
  sendSuccess(res, data, 'Item added to cart');
};

export const updateItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const productId = req.params['productId'] as string;
  const { qty, variantId, slug } = req.body as { qty: number; variantId?: string; slug?: string };
  const data = await cartService.addItem(identifier, productId, qty, variantId, slug);
  sendSuccess(res, data, 'Cart updated');
};

export const removeItem = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const productId = req.params['productId'] as string;
  const { variantId } = req.body as { variantId?: string };
  const data = await cartService.removeItem(identifier, productId, variantId);
  sendSuccess(res, data, 'Item removed from cart');
};

export const clearCart = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  await cartService.clearCart(identifier);
  sendNoContent(res);
};

export const mergeCart = async (req: Request, res: Response) => {
  const { guestSessionId } = req.body as { guestSessionId: string };
  const userId = req.user!.userId;
  const data = await cartService.mergeOnLogin(guestSessionId, userId);
  sendSuccess(res, data, 'Cart merged successfully');
};

// ---------------------------------------------------------------------------
// WISHLIST controllers
// ---------------------------------------------------------------------------

export const getWishlist = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = typeof identifier === 'string' ? identifier : identifier.toString();
  const data = await wishlistService.getWishlist(sessionId);
  sendSuccess(res, data);
};

export const toggleWishlist = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = typeof identifier === 'string' ? identifier : identifier.toString();
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
  const sessionId = typeof identifier === 'string' ? identifier : identifier.toString();
  const { items, promoCode } = req.body as { items?: any[]; promoCode?: string };
  const data = await checkoutService.getSummary(sessionId, items, promoCode);
  sendSuccess(res, data);
};

export const reserveStock = async (req: Request, res: Response) => {
  const identifier = getSessionIdentifier(req);
  const sessionId = typeof identifier === 'string' ? identifier : identifier.toString();
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
  const sessionId = typeof identifier === 'string' ? identifier : identifier.toString();
  await checkoutService.releaseReservation(sessionId);
  sendNoContent(res);
};
