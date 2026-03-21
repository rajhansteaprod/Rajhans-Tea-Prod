import { Types } from 'mongoose';
import { StockMovement, IStockMovementDoc } from '../models/stock-movement.model';
import { parsePagination, buildPaginationMeta } from '../../../utils/pagination';

export class StockMovementRepository {
  async create(data: Partial<IStockMovementDoc>): Promise<IStockMovementDoc> {
    return StockMovement.create(data) as Promise<IStockMovementDoc>;
  }

  async findByProduct(
    productId: string,
    query: { page?: number; limit?: number } = {},
  ) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { productId: new Types.ObjectId(productId) };
    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .populate('performedBy', 'phone firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      StockMovement.countDocuments(filter).exec(),
    ]);
    return { movements, meta: buildPaginationMeta(page, limit, total) };
  }
}
