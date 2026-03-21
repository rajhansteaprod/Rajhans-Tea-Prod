import { Banner, IBannerDoc } from '../models/banner.model';

export class BannerRepository {
  async findActive(): Promise<IBannerDoc[]> {
    const now = new Date();
    return Banner.find({
      isActive: true,
      $or: [{ startDate: null }, { startDate: { $lte: now } }],
    })
      .where()
      .or([{ endDate: null }, { endDate: { $gte: now } }])
      .sort({ position: 1 })
      .exec();
  }

  async findAll(): Promise<IBannerDoc[]> {
    return Banner.find().sort({ position: 1 }).exec();
  }

  async findById(id: string): Promise<IBannerDoc | null> {
    return Banner.findById(id).exec();
  }

  async create(data: Partial<IBannerDoc>): Promise<IBannerDoc> {
    return Banner.create(data) as Promise<IBannerDoc>;
  }

  async update(id: string, data: Partial<IBannerDoc>): Promise<IBannerDoc | null> {
    return Banner.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await Banner.findByIdAndDelete(id).exec();
  }
}
