import { Order } from '../inventory/models/order.model';
import { User } from '../../models/user.model';
import { Product } from '../../models/product.model';

function toCsvRow(fields: string[]): string {
  return fields.map((f) => `"${String(f ?? '').replace(/"/g, '""')}"`).join(',');
}

export class ExportService {
  async exportOrdersCsv(startDate?: string, endDate?: string): Promise<string> {
    const filter: Record<string, unknown> = {};
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      filter.createdAt = dateFilter;
    }

    const orders = await Order.find(filter)
      .populate('userId', 'phone firstName')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();

    const header = toCsvRow(['Order Number', 'Date', 'Customer', 'Phone', 'Status', 'Items', 'Total', 'City', 'State']);
    const rows = orders.map((o: any) =>
      toCsvRow([
        o.orderNumber,
        new Date(o.createdAt).toISOString().slice(0, 10),
        o.userId?.firstName || '',
        o.userId?.phone || '',
        o.status,
        o.items.length.toString(),
        o.total.toFixed(2),
        o.shippingAddress?.city || '',
        o.shippingAddress?.state || '',
      ]),
    );

    return [header, ...rows].join('\n');
  }

  async exportUsersCsv(): Promise<string> {
    const users = await User.find({ role: 'user' })
      .select('phone firstName lastName role isActive createdAt')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();

    const header = toCsvRow(['Phone', 'First Name', 'Last Name', 'Active', 'Joined']);
    const rows = users.map((u) =>
      toCsvRow([
        u.phone,
        u.firstName || '',
        u.lastName || '',
        u.isActive ? 'Yes' : 'No',
        new Date(u.createdAt).toISOString().slice(0, 10),
      ]),
    );

    return [header, ...rows].join('\n');
  }

  async exportProductsCsv(): Promise<string> {
    const products = await Product.find()
      .select('name slug basePrice stock status isFeatured trackInventory createdAt')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean()
      .exec();

    const header = toCsvRow(['Name', 'Slug', 'Price', 'Stock', 'Status', 'Featured', 'Tracking', 'Created']);
    const rows = products.map((p) =>
      toCsvRow([
        p.name,
        p.slug,
        p.basePrice.toString(),
        p.stock.toString(),
        p.status,
        p.isFeatured ? 'Yes' : 'No',
        p.trackInventory ? 'Yes' : 'No',
        new Date(p.createdAt).toISOString().slice(0, 10),
      ]),
    );

    return [header, ...rows].join('\n');
  }
}
