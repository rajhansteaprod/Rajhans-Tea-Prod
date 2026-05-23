import { ShipmentRepository } from '../repositories/shipment.repository';
import { OrderRepository } from '../repositories/order.repository';
import { WarehouseRepository } from '../repositories/warehouse.repository';
import { Shipment, IShipmentDoc, ShipmentStatus } from '../models/shipment.model';
import { IOrderDoc } from '../models/order.model';
import { NotFoundError } from '../../../utils/api-error';
import { logger } from '../../../utils/logger';

export class ShipmentService {
  private shipmentRepo: ShipmentRepository;
  private orderRepo: OrderRepository;
  private warehouseRepo: WarehouseRepository;

  constructor() {
    this.shipmentRepo = new ShipmentRepository();
    this.orderRepo = new OrderRepository();
    this.warehouseRepo = new WarehouseRepository();
  }

  async createFromOrder(orderId: string): Promise<IShipmentDoc> {
    logger.info(`Creating shipment document from order: ${orderId}`);

    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');

    // Check if shipment already exists
    const existing = await this.shipmentRepo.findByOrderId(orderId);
    if (existing) {
      logger.info(`Shipment already exists for order: ${orderId}`);
      return existing;
    }

    try {
      const warehouse = await this.warehouseRepo.findById(order.warehouseId.toString());
      if (!warehouse) throw new NotFoundError('Warehouse not found');

      // Create Shipment document from Order shiprocket data
      const shipment = await this.shipmentRepo.create({
        orderId: order._id,
        sessionId: order.userId.toString(),
        shiprocketOrderId: order.shiprocket.orderId,
        shiprocketShipmentId: order.shiprocket.shipmentId,
        awbCode: order.shiprocket.awbCode,
        courierName: order.shiprocket.courierName,
        courierId: order.shiprocket.courierId,
        trackingUrl: order.shiprocket.trackingUrl,
        label: order.shiprocket.label,
        invoiceUrl: null,
        pickupScheduledDate: order.shiprocket.pickupScheduledDate,
        estimatedDeliveryDate: order.shiprocket.estimatedDelivery,
        status: 'pending',
        lastStatusUpdate: new Date(),
        lastStatusEvent: 'Shipment created',
        weight: order.items.reduce((sum, item) => sum + (item.qty * 0.1), 0.5),
        length: 20,
        width: 15,
        height: 10,
        events: [
          {
            status: 'pending',
            timestamp: new Date(),
            location: warehouse.address.city,
            note: 'Shipment created and pickup scheduled',
          },
        ],
      });

      logger.info({ shipmentId: shipment._id, orderId }, 'Shipment document created');
      return shipment;
    } catch (error) {
      logger.error({ error, orderId }, 'Failed to create shipment document');
      throw error;
    }
  }

  async updateStatus(shipmentId: string, status: ShipmentStatus, note?: string): Promise<IShipmentDoc> {
    const shipment = await this.shipmentRepo.updateStatus(shipmentId, status);

    if (note) {
      await this.shipmentRepo.addEvent(shipmentId, {
        status,
        timestamp: new Date(),
        note,
      });
    }

    logger.info({ shipmentId, status, note }, 'Shipment status updated');
    return shipment;
  }

  async addTrackingEvent(shipmentId: string, event: any): Promise<IShipmentDoc> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new NotFoundError('Shipment not found');

    return this.shipmentRepo.addEvent(shipmentId, {
      status: event.status,
      timestamp: new Date(),
      location: event.location,
      note: event.note,
    });
  }

  async getShipmentByOrderId(orderId: string): Promise<IShipmentDoc | null> {
    return this.shipmentRepo.findByOrderId(orderId);
  }

  async getShipmentById(shipmentId: string): Promise<IShipmentDoc | null> {
    return this.shipmentRepo.findById(shipmentId);
  }

  async getPendingShipments(): Promise<IShipmentDoc[]> {
    return this.shipmentRepo.findPending();
  }

  async getShipmentsByStatus(status: ShipmentStatus): Promise<IShipmentDoc[]> {
    return this.shipmentRepo.findByStatus(status);
  }

  async cancelShipment(shipmentId: string): Promise<void> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new NotFoundError('Shipment not found');

    if (shipment.shiprocketOrderId) {
      const provider = getShippingProvider();
      try {
        await provider.cancelOrder(shipment.shiprocketOrderId);
        logger.info({ shipmentId, shiprocketOrderId: shipment.shiprocketOrderId }, 'Shiprocket order cancelled');
      } catch (error) {
        logger.error({ error, shipmentId }, 'Failed to cancel Shiprocket order');
        throw error;
      }
    }

    await this.shipmentRepo.updateStatus(shipmentId, 'failed');
    logger.info({ shipmentId }, 'Shipment cancelled');
  }
}
