import { HeroSlide, IHeroSlideDoc } from '../models/hero-slide.model';
import { NotFoundError } from '../../../utils/api-error';

export class HeroSlideService {
  // ─── Public ───────────────────────────────────────────────────────────────

  async getActiveSlides() {
    return HeroSlide.find({ isActive: true }).sort({ order: 1 }).exec();
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async listAll() {
    return HeroSlide.find().sort({ order: 1 }).exec();
  }

  async create(data: Partial<IHeroSlideDoc>) {
    // Auto-set order to last position
    if (data.order === undefined) {
      const count = await HeroSlide.countDocuments().exec();
      data.order = count;
    }
    return HeroSlide.create(data);
  }

  async update(id: string, data: Partial<IHeroSlideDoc>) {
    const slide = await HeroSlide.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    if (!slide) throw new NotFoundError('Hero slide not found');
    return slide;
  }

  async delete(id: string) {
    const slide = await HeroSlide.findByIdAndDelete(id).exec();
    if (!slide) throw new NotFoundError('Hero slide not found');
  }

  async reorder(orderedIds: string[]) {
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { order: index } },
      },
    }));
    await HeroSlide.bulkWrite(ops);
    return HeroSlide.find().sort({ order: 1 }).exec();
  }
}
