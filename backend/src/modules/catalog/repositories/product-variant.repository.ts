import { Types } from 'mongoose';
import { ProductVariant, IProductVariantDoc } from '../models/product-variant.model';

export class ProductVariantRepository {
  async create(data: Partial<IProductVariantDoc>): Promise<IProductVariantDoc> {
    return ProductVariant.create(data) as Promise<IProductVariantDoc>;
  }

  async findById(id: string): Promise<IProductVariantDoc | null> {
    return ProductVariant.findById(id).exec();
  }

  async findByProductId(productId: string): Promise<IProductVariantDoc[]> {
    return ProductVariant.find({
      productId: new Types.ObjectId(productId),
      isActive: true,
    }).sort({ position: 1 }).exec();
  }

  async findByProductIdAll(productId: string): Promise<IProductVariantDoc[]> {
    return ProductVariant.find({
      productId: new Types.ObjectId(productId),
    }).sort({ position: 1 }).exec();
  }

  async update(id: string, data: Partial<IProductVariantDoc>): Promise<IProductVariantDoc | null> {
    return ProductVariant.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await ProductVariant.findByIdAndDelete(id).exec();
  }

  async deleteByProductId(productId: string): Promise<void> {
    await ProductVariant.deleteMany({
      productId: new Types.ObjectId(productId),
    }).exec();
  }

  async updatePosition(id: string, position: number): Promise<void> {
    await ProductVariant.findByIdAndUpdate(id, { $set: { position } }).exec();
  }
}
