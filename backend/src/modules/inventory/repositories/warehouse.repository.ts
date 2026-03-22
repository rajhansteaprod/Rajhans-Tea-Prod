import { Warehouse, IWarehouseDoc } from '../models/warehouse.model';

export class WarehouseRepository {
  async findAll(): Promise<IWarehouseDoc[]> {
    return Warehouse.find({ isActive: true }).sort({ isDefault: -1, name: 1 }).exec();
  }

  async findDefault(): Promise<IWarehouseDoc | null> {
    return Warehouse.findOne({ isDefault: true, isActive: true }).exec();
  }

  async findById(id: string): Promise<IWarehouseDoc | null> {
    return Warehouse.findById(id).exec();
  }

  async create(data: Partial<IWarehouseDoc>): Promise<IWarehouseDoc> {
    if (data.isDefault) {
      await Warehouse.updateMany({ isDefault: true }, { $set: { isDefault: false } }).exec();
    }
    return Warehouse.create(data) as Promise<IWarehouseDoc>;
  }

  async update(id: string, data: Partial<IWarehouseDoc>): Promise<IWarehouseDoc | null> {
    if (data.isDefault) {
      await Warehouse.updateMany(
        { _id: { $ne: id }, isDefault: true },
        { $set: { isDefault: false } },
      ).exec();
    }
    return Warehouse.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await Warehouse.findByIdAndDelete(id).exec();
  }

  async setShiprocketId(id: string, shiprocketPickupLocationId: string): Promise<void> {
    await Warehouse.findByIdAndUpdate(id, { $set: { shiprocketPickupLocationId } }).exec();
  }
}
