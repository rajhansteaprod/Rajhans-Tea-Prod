import { shipmentLogger } from '../../../utils/shipment-logger';
import { ShipmentRepository } from '../repositories/shipment.repository';
import { OrderRepository } from '../../inventory/repositories/order.repository';
import { getShippingProvider } from '../../inventory/services/shipping/shipping.factory';

export class TrackingSchedulerService {
  private shipmentRepo: ShipmentRepository;
  private orderRepo: OrderRepository;

  constructor() {
    this.shipmentRepo = new ShipmentRepository();
    this.orderRepo = new OrderRepository();
  }

  async fetchAndUpdateTrackingForAllOrders(): Promise<void> {
    try {
      shipmentLogger.info({}, '📅 Tracking scheduler started');

      // Find all orders with active shipments (not delivered, not cancelled)
      const Order = require('../../inventory/models/order.model').Order;
      const orders = await Order.find({
        status: { $in: ['processing', 'shipped', 'in_transit', 'out_for_delivery'] },
        'shiprocket.shipmentId': { $exists: true, $ne: null },
      }).exec();

      if (!orders || orders.length === 0) {
        shipmentLogger.info({}, '✅ No orders to track');
        return;
      }

      shipmentLogger.info({
        orderCount: orders.length,
      }, `📦 Found ${orders.length} orders to track`);

      const provider = getShippingProvider();

      for (const order of orders) {
        if (!order.shiprocket?.shipmentId) {
          continue;
        }

        try {
          // Fetch tracking from Shiprocket
          const tracking = await provider.trackShipment(order.shiprocket.shipmentId);

          // Update Shipment document
          await this.shipmentRepo.updateShipment(order.shiprocket.shipmentId, {
            status: tracking.currentStatus,
            trackingUrl: tracking.trackingUrl,
            estimatedDelivery: tracking.estimatedDelivery,
            trackingActivities: tracking.activities,
          });

          // Map Shiprocket status to Order status
          const orderStatus = this.mapTrackingStatusToOrderStatus(tracking.currentStatus);

          if (orderStatus && order.status !== orderStatus) {
            // Update Order status
            await this.orderRepo.updateStatus(
              order._id.toString(),
              orderStatus,
              {
                status: orderStatus,
                timestamp: new Date(),
                note: `Tracking update: ${tracking.currentStatus}`,
                updatedBy: null,
              },
              {}
            );

            shipmentLogger.info({
              orderId: order._id,
              orderNumber: order.orderNumber,
              newStatus: orderStatus,
            }, `✅ Order status updated via scheduler`);
          }
        } catch (error) {
          shipmentLogger.error({
            orderId: order._id,
            shipmentId: order.shiprocket?.shipmentId,
            error: error instanceof Error ? error.message : String(error),
          }, `❌ Failed to update tracking for order`);
        }
      }

      shipmentLogger.info({
        processedOrders: orders.length,
      }, '✅ Tracking scheduler completed');
    } catch (error) {
      shipmentLogger.error({
        error: error instanceof Error ? error.message : String(error),
      }, '❌ Tracking scheduler failed');
      throw error;
    }
  }

  private mapTrackingStatusToOrderStatus(
    trackingStatus: string
  ): 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | null {
    const statusMapping: Record<string, 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | null> = {
      'MANIFEST GENERATED': 'shipped',
      'PICKED UP': 'shipped',
      'SHIPPED': 'shipped',
      'IN TRANSIT': 'in_transit',
      'OUT FOR DELIVERY': 'out_for_delivery',
      'DELIVERED': 'delivered',
    };

    return statusMapping[trackingStatus] || null;
  }
}
