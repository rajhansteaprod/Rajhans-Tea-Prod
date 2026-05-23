import { Shipment, IShipmentDoc, ShipmentStatus, IShipmentEvent } from '../models/shipment.model';
import { NotFoundError } from '../../../utils/api-error';

export class ShipmentRepository {
  async create(data: Partial<IShipmentDoc>): Promise<IShipmentDoc> {
    const shipment = new Shipment(data);
    return shipment.save();
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
    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      {
        status,
        lastStatusUpdate: new Date(),
      },
      { new: true }
    );
    if (!shipment) throw new NotFoundError('Shipment not found');
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
    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      {
        $push: { events: event },
        lastStatusUpdate: new Date(),
      },
      { new: true }
    );
    if (!shipment) throw new NotFoundError('Shipment not found');
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
