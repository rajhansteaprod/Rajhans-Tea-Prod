import { Shipment, IShipmentDoc, ShipmentStatus, IShipmentEvent } from '../models/shipment.model';
import { NotFoundError } from '../../../utils/api-error';
import { shipmentLogger } from '../../../utils/shipment-logger';

export class ShipmentRepository {
  async create(data: Partial<IShipmentDoc>): Promise<IShipmentDoc> {
    shipmentLogger.debug({ orderId: data.orderId, awbCode: data.awbCode }, '💾 Creating shipment in DB');
    const shipment = new Shipment(data);
    const saved = await shipment.save();
    shipmentLogger.info({ shipmentId: saved._id, awbCode: saved.awbCode }, '✅ Shipment created in DB');
    return saved;
  }

  async findById(shipmentId: string): Promise<IShipmentDoc | null> {
    return Shipment.findById(shipmentId).lean();
  }

  async findByOrderId(orderId: string): Promise<IShipmentDoc | null> {
    return Shipment.findOne({ orderId }).lean();
  }

  async findByAwbCode(awbCode: string): Promise<IShipmentDoc | null> {
    return Shipment.findOne({ awbCode }).lean();
  }

  async findByShiprocketShipmentId(shiprocketShipmentId: number): Promise<IShipmentDoc | null> {
    return Shipment.findOne({ shiprocketShipmentId }).lean();
  }

  async updateStatus(shipmentId: string, status: ShipmentStatus): Promise<IShipmentDoc> {
    shipmentLogger.debug({ shipmentId, newStatus: status }, '🔄 Updating shipment status');

    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      {
        status,
        lastStatusUpdate: new Date(),
      },
      { new: true }
    );

    if (!shipment) {
      shipmentLogger.error({ shipmentId }, '❌ Shipment not found when updating status');
      throw new NotFoundError('Shipment not found');
    }

    shipmentLogger.info({ shipmentId, status }, '✅ Shipment status updated');
    return shipment;
  }

  async updateShiprocketInfo(shipmentId: string, data: Partial<IShipmentDoc>): Promise<IShipmentDoc> {
    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      { ...data, lastStatusUpdate: new Date() },
      { new: true }
    );
    if (!shipment) throw new NotFoundError('Shipment not found');
    return shipment;
  }

  async addEvent(shipmentId: string, event: IShipmentEvent): Promise<IShipmentDoc> {
    shipmentLogger.debug({
      shipmentId,
      eventStatus: event.status,
      location: event.location,
      note: event.note,
    }, '📌 Adding tracking event to shipment');

    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      {
        $push: { events: event },
        lastStatusUpdate: new Date(),
      },
      { new: true }
    );

    if (!shipment) {
      shipmentLogger.error({ shipmentId }, '❌ Shipment not found when adding event');
      throw new NotFoundError('Shipment not found');
    }

    shipmentLogger.info({
      shipmentId,
      eventStatus: event.status,
      totalEvents: shipment.events.length,
    }, '✅ Tracking event added successfully');

    return shipment;
  }

  async delete(shipmentId: string): Promise<void> {
    const result = await Shipment.findByIdAndDelete(shipmentId);
    if (!result) throw new NotFoundError('Shipment not found');
  }

  async findPending(): Promise<IShipmentDoc[]> {
    return Shipment.find({ status: 'pending' }).lean();
  }

  async findByStatus(status: ShipmentStatus): Promise<IShipmentDoc[]> {
    return Shipment.find({ status }).sort({ createdAt: -1 }).lean();
  }
}
