import { Payment } from '../../models/payment.model';
import { Order } from '../inventory/models/order.model';
import { User } from '../../models/user.model';
import { Review } from '../reviews/models/review.model';
import { ProductView } from '../personalization/models/product-view.model';

export class AnalyticsService {
  async getRevenueTimeSeries(period: 'daily' | 'weekly' | 'monthly' = 'daily', days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let dateFormat: string;
    if (period === 'daily') dateFormat = '%Y-%m-%d';
    else if (period === 'weekly') dateFormat = '%Y-W%V';
    else dateFormat = '%Y-%m';

    return Payment.aggregate([
      { $match: { status: 'captured', createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, revenue: { $sum: { $divide: ['$amountPaise', 100] } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: { $round: ['$revenue', 2] }, count: 1 } },
    ]).exec();
  }

  async getOrdersByStatus() {
    return Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]).exec();
  }

  async getTopSellingProducts(limit = 10) {
    return Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'returned'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', name: { $first: '$items.name' }, totalQty: { $sum: '$items.qty' }, totalRevenue: { $sum: '$items.totalPrice' } } },
      { $sort: { totalQty: -1 } },
      { $limit: limit },
      { $project: { _id: 0, productId: '$_id', name: 1, totalQty: 1, totalRevenue: { $round: ['$totalRevenue', 2] } } },
    ]).exec();
  }

  async getCustomerAcquisition(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]).exec();
  }

  async getConversionFunnel() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [views, cartsCreated, paymentsCreated, paymentsCaptured, ordersCreated] = await Promise.all([
      ProductView.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }).exec(),
      (await import('../../models/cart.model')).Cart.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }).exec(),
      Payment.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }).exec(),
      Payment.countDocuments({ status: 'captured', createdAt: { $gte: thirtyDaysAgo } }).exec(),
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }).exec(),
    ]);

    return [
      { stage: 'Product Views', count: views },
      { stage: 'Carts Created', count: cartsCreated },
      { stage: 'Payments Initiated', count: paymentsCreated },
      { stage: 'Payments Captured', count: paymentsCaptured },
      { stage: 'Orders Created', count: ordersCreated },
    ];
  }

  async getKPIs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalRevenue, todayRevenue, totalOrders, todayOrders, aov, avgRating] = await Promise.all([
      Payment.aggregate([{ $match: { status: 'captured' } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]).exec(),
      Payment.aggregate([{ $match: { status: 'captured', createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]).exec(),
      Order.countDocuments({ status: { $nin: ['cancelled'] } }).exec(),
      Order.countDocuments({ createdAt: { $gte: today } }).exec(),
      Order.aggregate([{ $match: { status: { $nin: ['cancelled', 'returned'] } } }, { $group: { _id: null, avg: { $avg: '$total' } } }]).exec(),
      Review.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]).exec(),
    ]);

    return {
      totalRevenue: (totalRevenue[0]?.total ?? 0) / 100,
      todayRevenue: (todayRevenue[0]?.total ?? 0) / 100,
      totalOrders,
      todayOrders,
      averageOrderValue: aov[0]?.avg ? +aov[0].avg.toFixed(2) : 0,
      averageRating: avgRating[0]?.avg ? +avgRating[0].avg.toFixed(1) : 0,
    };
  }
}
