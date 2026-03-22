import { Payment } from '../payments/models/payment.model';
import { Order } from '../inventory/models/order.model';
import { User } from '../auth/models/user.model';
import { Product } from '../catalog/models/product.model';
import { Review } from '../reviews/models/review.model';
import { ProductView } from '../personalization/models/product-view.model';

// ─── User Segmentation ──────────────────────────────────────────────────────

export type UserSegment = 'vip' | 'active' | 'at_risk' | 'churned' | 'new';

export interface SegmentedUser {
  _id: string;
  phone: string;
  firstName?: string;
  segment: UserSegment;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number | null;
}

export class IntelligenceService {
  // ─── User Segmentation ──────────────────────────────────────────────────

  async getUserSegmentation(): Promise<{
    segments: { segment: UserSegment; count: number; totalRevenue: number }[];
    users: SegmentedUser[];
  }> {
    const users = await User.find({ role: 'user', isActive: true })
      .select('phone firstName lastName createdAt')
      .lean()
      .exec();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const orderStats = await Order.aggregate([
      { $match: { status: { $nin: ['cancelled', 'returned'] } } },
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
    ]).exec();

    const orderMap = new Map<
      string,
      { totalOrders: number; totalSpent: number; lastOrderDate: Date }
    >();
    for (const stat of orderStats) {
      orderMap.set(stat._id.toString(), stat);
    }

    const segmentedUsers: SegmentedUser[] = users.map((user) => {
      const stats = orderMap.get(user._id.toString());
      const totalOrders = stats?.totalOrders ?? 0;
      const totalSpent = stats?.totalSpent ?? 0;
      const lastOrderDate = stats?.lastOrderDate ?? null;
      const daysSinceLastOrder = lastOrderDate
        ? Math.floor((now.getTime() - new Date(lastOrderDate).getTime()) / (24 * 60 * 60 * 1000))
        : null;

      let segment: UserSegment;
      if (totalOrders === 0 && new Date(user.createdAt) > sevenDaysAgo) {
        segment = 'new';
      } else if (totalOrders >= 5 || totalSpent >= 10000) {
        segment = 'vip';
      } else if (lastOrderDate && new Date(lastOrderDate) > thirtyDaysAgo) {
        segment = 'active';
      } else if (lastOrderDate && new Date(lastOrderDate) > sixtyDaysAgo) {
        segment = 'at_risk';
      } else if (totalOrders > 0) {
        segment = 'churned';
      } else {
        segment = 'new';
      }

      return {
        _id: user._id.toString(),
        phone: user.phone,
        firstName: user.firstName,
        segment,
        totalOrders,
        totalSpent: +totalSpent.toFixed(2),
        lastOrderDate,
        daysSinceLastOrder,
      };
    });

    // Aggregate by segment
    const segmentCounts = new Map<UserSegment, { count: number; totalRevenue: number }>();
    for (const u of segmentedUsers) {
      const existing = segmentCounts.get(u.segment) || { count: 0, totalRevenue: 0 };
      existing.count++;
      existing.totalRevenue += u.totalSpent;
      segmentCounts.set(u.segment, existing);
    }

    const segments = Array.from(segmentCounts.entries()).map(([segment, data]) => ({
      segment,
      count: data.count,
      totalRevenue: +data.totalRevenue.toFixed(2),
    }));

    return { segments, users: segmentedUsers.slice(0, 100) };
  }

  // ─── Revenue Forecasting (simple linear regression) ────────────────────

  async getRevenueForecast(forecastDays = 7): Promise<{
    historical: { date: string; revenue: number }[];
    forecast: { date: string; predicted: number }[];
    trend: 'up' | 'down' | 'stable';
    growthRate: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const historical = await Payment.aggregate([
      { $match: { status: 'captured', createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: { $divide: ['$amountPaise', 100] } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', revenue: { $round: ['$revenue', 2] } } },
    ]).exec();

    // Simple linear regression: y = mx + b
    const n = historical.length;
    if (n < 3) {
      return { historical, forecast: [], trend: 'stable', growthRate: 0 };
    }

    const xs = historical.map((_, i) => i);
    const ys = historical.map((h) => h.revenue);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumXX = xs.reduce((a, x) => a + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate forecast
    const forecast: { date: string; predicted: number }[] = [];
    const lastDate = new Date(historical[n - 1].date);
    for (let i = 1; i <= forecastDays; i++) {
      const futureDate = new Date(lastDate);
      futureDate.setDate(futureDate.getDate() + i);
      const predicted = Math.max(0, +(slope * (n - 1 + i) + intercept).toFixed(2));
      forecast.push({
        date: futureDate.toISOString().slice(0, 10),
        predicted,
      });
    }

    // Determine trend
    const firstWeekAvg = ys.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(7, n);
    const lastWeekAvg = ys.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, n);
    const growthRate =
      firstWeekAvg > 0 ? +(((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100).toFixed(1) : 0;
    const trend: 'up' | 'down' | 'stable' =
      growthRate > 5 ? 'up' : growthRate < -5 ? 'down' : 'stable';

    return { historical, forecast, trend, growthRate };
  }

  // ─── KPI Comparison (this week vs last week) ──────────────────────────

  async getKPIComparison(): Promise<{
    revenue: { current: number; previous: number; change: number };
    orders: { current: number; previous: number; change: number };
    newUsers: { current: number; previous: number; change: number };
    avgOrderValue: { current: number; previous: number; change: number };
  }> {
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 14);

    const [
      thisRevenue,
      lastRevenue,
      thisOrders,
      lastOrders,
      thisUsers,
      lastUsers,
      thisAOV,
      lastAOV,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'captured', createdAt: { $gte: thisWeekStart } } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]).exec(),
      Payment.aggregate([
        { $match: { status: 'captured', createdAt: { $gte: lastWeekStart, $lt: thisWeekStart } } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]).exec(),
      Order.countDocuments({
        createdAt: { $gte: thisWeekStart },
        status: { $nin: ['cancelled'] },
      }).exec(),
      Order.countDocuments({
        createdAt: { $gte: lastWeekStart, $lt: thisWeekStart },
        status: { $nin: ['cancelled'] },
      }).exec(),
      User.countDocuments({ createdAt: { $gte: thisWeekStart } }).exec(),
      User.countDocuments({ createdAt: { $gte: lastWeekStart, $lt: thisWeekStart } }).exec(),
      Order.aggregate([
        { $match: { createdAt: { $gte: thisWeekStart }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: null, avg: { $avg: '$total' } } },
      ]).exec(),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: lastWeekStart, $lt: thisWeekStart },
            status: { $nin: ['cancelled'] },
          },
        },
        { $group: { _id: null, avg: { $avg: '$total' } } },
      ]).exec(),
    ]);

    const calc = (curr: number, prev: number) => ({
      current: +curr.toFixed(2),
      previous: +prev.toFixed(2),
      change: prev > 0 ? +(((curr - prev) / prev) * 100).toFixed(1) : 0,
    });

    return {
      revenue: calc((thisRevenue[0]?.total ?? 0) / 100, (lastRevenue[0]?.total ?? 0) / 100),
      orders: calc(thisOrders, lastOrders),
      newUsers: calc(thisUsers, lastUsers),
      avgOrderValue: calc(thisAOV[0]?.avg ?? 0, lastAOV[0]?.avg ?? 0),
    };
  }

  // ─── Product Performance Score ────────────────────────────────────────

  async getProductPerformance(limit = 20): Promise<
    {
      _id: string;
      name: string;
      score: number;
      salesQty: number;
      viewCount: number;
      avgRating: number;
      stock: number;
    }[]
  > {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Sales
    const sales = await Order.aggregate([
      {
        $match: { status: { $nin: ['cancelled', 'returned'] }, createdAt: { $gte: thirtyDaysAgo } },
      },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', salesQty: { $sum: '$items.qty' } } },
    ]).exec();
    const salesMap = new Map(sales.map((s) => [s._id, s.salesQty]));

    // Views
    const views = await ProductView.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$productId', viewCount: { $sum: 1 } } },
    ]).exec();
    const viewMap = new Map(views.map((v) => [v._id.toString(), v.viewCount]));

    // Ratings
    const ratings = await Review.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$productId', avgRating: { $avg: '$rating' } } },
    ]).exec();
    const ratingMap = new Map(ratings.map((r) => [r._id.toString(), +r.avgRating.toFixed(1)]));

    // Products
    const products = await Product.find({ status: 'active' }).select('name stock').lean().exec();

    const scored = products.map((p) => {
      const id = p._id.toString();
      const salesQty = salesMap.get(id) || 0;
      const viewCount = viewMap.get(id) || 0;
      const avgRating = ratingMap.get(id) || 0;
      // Composite score: sales * 3 + views * 0.1 + rating * 10
      const score = +(salesQty * 3 + viewCount * 0.1 + avgRating * 10).toFixed(1);
      return { _id: id, name: p.name, score, salesQty, viewCount, avgRating, stock: p.stock };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  // ─── Churn Risk ───────────────────────────────────────────────────────

  async getChurnRiskUsers(limit = 50): Promise<SegmentedUser[]> {
    const segmentation = await this.getUserSegmentation();
    return segmentation.users
      .filter((u) => u.segment === 'at_risk' || u.segment === 'churned')
      .sort((a, b) => (b.daysSinceLastOrder ?? 999) - (a.daysSinceLastOrder ?? 999))
      .slice(0, limit);
  }

  // ─── Cohort Analysis ──────────────────────────────────────────────────

  async getCohortAnalysis(): Promise<
    {
      cohort: string;
      totalUsers: number;
      orderedUsers: number;
      retentionRate: number;
    }[]
  > {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Users grouped by signup month
    const userCohorts = await User.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, role: 'user' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          users: { $push: '$_id' },
          totalUsers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).exec();

    const cohorts: {
      cohort: string;
      totalUsers: number;
      orderedUsers: number;
      retentionRate: number;
    }[] = [];

    for (const cohort of userCohorts) {
      const orderedUsers = await Order.aggregate([
        { $match: { userId: { $in: cohort.users }, status: { $nin: ['cancelled'] } } },
        { $group: { _id: '$userId' } },
      ]).exec();

      const retentionRate =
        cohort.totalUsers > 0 ? +((orderedUsers.length / cohort.totalUsers) * 100).toFixed(1) : 0;

      cohorts.push({
        cohort: cohort._id,
        totalUsers: cohort.totalUsers,
        orderedUsers: orderedUsers.length,
        retentionRate,
      });
    }

    return cohorts;
  }

  // ─── Real-time Connected Users ────────────────────────────────────────

  async getRealTimeStats(): Promise<{ connectedUsers: number; activeCarts: number }> {
    let connectedUsers = 0;
    try {
      const { getConnectedUserCount } = await import('../../loaders/socket.loader');
      connectedUsers = getConnectedUserCount();
    } catch {
      /* socket not available */
    }

    const { Cart } = await import('../cart/models/cart.model');
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const activeCarts = await Cart.countDocuments({
      updatedAt: { $gte: fifteenMinAgo },
      'items.0': { $exists: true },
    }).exec();

    return { connectedUsers, activeCarts };
  }
}
