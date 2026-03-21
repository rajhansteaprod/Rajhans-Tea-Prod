import { Request, Response } from 'express';
import { User } from '../../models/user.model';
import { Order } from '../inventory/models/order.model';
import { Payment } from '../../models/payment.model';
import { Review } from '../reviews/models/review.model';
import { Wallet } from '../../models/wallet.model';
import { WalletTransaction } from '../../models/wallet-transaction.model';
import { Ticket } from '../support/models/ticket.model';
import { sendSuccess } from '../../utils/api-response';
import { NotFoundError } from '../../utils/api-error';
import { logger } from '../../utils/logger';

/**
 * GDPR: Export all user data as JSON.
 */
export const exportMyData = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const [user, orders, payments, reviews, wallet, walletTxns, tickets] = await Promise.all([
    User.findById(userId).select('-__v').lean().exec(),
    Order.find({ userId }).select('-__v').lean().exec(),
    Payment.find({ userId }).select('-__v -razorpaySignature').lean().exec(),
    Review.find({ userId }).select('-__v').lean().exec(),
    Wallet.findOne({ userId }).select('-__v').lean().exec(),
    WalletTransaction.find({ userId }).select('-__v').lean().exec(),
    Ticket.find({ userId }).select('-__v').lean().exec(),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: user,
    orders,
    payments,
    reviews,
    wallet,
    walletTransactions: walletTxns,
    supportTickets: tickets,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=my-data.json');
  res.json(exportData);
};

/**
 * GDPR: Delete/anonymize user account.
 * Keeps order/payment records for legal compliance but anonymizes personal data.
 */
export const deleteMyAccount = async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const user = await User.findById(userId).exec();
  if (!user) throw new NotFoundError('User not found');

  logger.warn({ userId }, 'Account deletion requested');

  // Anonymize user profile
  await User.findByIdAndUpdate(userId, {
    $set: {
      phone: `deleted_${userId.slice(-8)}`,
      firstName: 'Deleted',
      lastName: 'User',
      isActive: false,
      isBanned: true,
    },
  }).exec();

  // Anonymize shipping addresses in orders (keep order data for compliance)
  await Order.updateMany(
    { userId },
    { $set: { 'shippingAddress.name': 'Deleted User', 'shippingAddress.phone': '0000000000' } },
  ).exec();

  // Anonymize payment addresses
  await Payment.updateMany(
    { userId },
    { $set: { 'shippingAddress.name': 'Deleted User', 'shippingAddress.phone': '0000000000' } },
  ).exec();

  // Delete reviews (user content)
  await Review.deleteMany({ userId }).exec();

  // Delete support tickets
  await Ticket.deleteMany({ userId }).exec();

  // Revoke all sessions (tokens in token collection)
  const { Token } = await import('../../models/token.model');
  await Token.deleteMany({ userId }).exec();

  logger.info({ userId }, 'Account deleted and anonymized');

  sendSuccess(res, { deleted: true }, 'Account deleted. Personal data anonymized.');
};
