import { WarehouseRepository } from '../repositories/warehouse.repository';
import { BadRequestError, NotFoundError } from '../../../utils/api-error';

export class WarehouseService {
  private repo = new WarehouseRepository();

  async getAll() {
    return this.repo.findAll();
  }

  async getDefault() {
    const warehouse = await this.repo.findDefault();
    if (!warehouse) throw new NotFoundError('No default warehouse configured');
    return warehouse;
  }

  async getById(id: string) {
    const warehouse = await this.repo.findById(id);
    if (!warehouse) throw new NotFoundError('Warehouse not found');
    return warehouse;
  }

  async create(data: { name: string; address: any; isDefault?: boolean }) {
    return this.repo.create(data);
  }

  async update(id: string, data: Partial<{ name: string; address: any; isDefault: boolean; isActive: boolean }>) {
    const warehouse = await this.repo.findById(id);
    if (!warehouse) throw new NotFoundError('Warehouse not found');
    return this.repo.update(id, data);
  }

  async delete(id: string) {
    const warehouse = await this.repo.findById(id);
    if (!warehouse) throw new NotFoundError('Warehouse not found');
    if (warehouse.isDefault) throw new BadRequestError('Cannot delete default warehouse');
    await this.repo.delete(id);
  }
}
