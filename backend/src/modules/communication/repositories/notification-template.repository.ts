import { NotificationTemplate, INotificationTemplateDoc } from '../models/notification-template.model';

export class NotificationTemplateRepository {
  async findByType(type: string): Promise<INotificationTemplateDoc | null> {
    return NotificationTemplate.findOne({ type, isActive: true }).exec();
  }

  async findAll(): Promise<INotificationTemplateDoc[]> {
    return NotificationTemplate.find().sort({ type: 1 }).exec();
  }

  async findById(id: string): Promise<INotificationTemplateDoc | null> {
    return NotificationTemplate.findById(id).exec();
  }

  async create(data: Partial<INotificationTemplateDoc>): Promise<INotificationTemplateDoc> {
    return NotificationTemplate.create(data) as Promise<INotificationTemplateDoc>;
  }

  async update(id: string, data: Partial<INotificationTemplateDoc>): Promise<INotificationTemplateDoc | null> {
    return NotificationTemplate.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
  }

  async delete(id: string): Promise<void> {
    await NotificationTemplate.findByIdAndDelete(id).exec();
  }

  async upsertByType(type: string, data: Partial<INotificationTemplateDoc>): Promise<void> {
    await NotificationTemplate.findOneAndUpdate({ type }, { $set: data }, { upsert: true }).exec();
  }
}
