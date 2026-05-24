import { shipmentLogger } from '../../../utils/shipment-logger';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { OrderRepository } from '../../inventory/repositories/order.repository';

export interface ShiprocketWebhookPayload {
  awb: string;
  courier_name: string;
  current_status: string;
  current_status_id: number;
  shipment_status: string;
  shipment_status_id: number;
  current_timestamp: string;
  order_id: string;
  sr_order_id: number;
  etd?: string;
  scans?: Array<{
    date: string;
    status: string;
    activity: string;
    location: string;
  }>;
}

export class ShiprocketWebhookHandler {
  private shipmentRepo: ShipmentRepository;
  private orderRepo: OrderRepository;

  constructor() {
    this.shipmentRepo = new ShipmentRepository();
    this.orderRepo = new OrderRepository();
  }

  async handleTrackingUpdate(payload: ShiprocketWebhookPayload): Promise<void> {
    try {
      shipmentLogger.info({
        orderId: payload.order_id,
        shipmentId: payload.sr_order_id,
        status: payload.shipment_status,
        statusId: payload.shipment_status_id,
      }, '📦 Received Shiprocket webhook');

      // Update shipment tracking data
      await this.shipmentRepo.updateShipment(payload.sr_order_id, {
        awbCode: payload.awb,
        courierName: payload.courier_name,
        status: payload.shipment_status,
        statusCode: payload.shipment_status_id,
        estimatedDelivery: payload.etd ? new Date(payload.etd) : null,
        trackingActivities: payload.scans || [],
      });

      // Map Shiprocket status to order status
      const orderStatus = this.mapShiprocketStatusToOrderStatus(payload.shipment_status_id);

      if (orderStatus) {
        // Find order by order_id and update its status
        const order = await this.orderRepo.findByOrderNumber(payload.order_id);
        if (order) {
          await this.orderRepo.updateStatus(
            order._id.toString(),
            orderStatus,
            {
              status: orderStatus,
              timestamp: new Date(),
              note: `Tracking update: ${payload.shipment_status}`,
              updatedBy: null,
            },
            {}
          );
        }
      }

      shipmentLogger.info({
        orderId: payload.order_id,
        shipmentId: payload.sr_order_id,
        newStatus: payload.shipment_status,
      }, '✅ Webhook processed successfully');
    } catch (error) {
      shipmentLogger.error({
        orderId: payload.order_id,
        shipmentId: payload.sr_order_id,
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Webhook processing failed');
      throw error;
    }
  }

  private mapShiprocketStatusToOrderStatus(
    shiprocketStatusId: number
  ): 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | null {
    // Shiprocket status IDs mapping
    const statusMapping: Record<number, 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | null> = {
      5: 'shipped', // MANIFEST GENERATED / PICKED UP
      6: 'shipped', // SHIPPED
      18: 'in_transit', // IN TRANSIT
      24: 'out_for_delivery', // OUT FOR DELIVERY
      25: 'delivered', // DELIVERED
    };

    return statusMapping[shiprocketStatusId] || null;
  }
}
