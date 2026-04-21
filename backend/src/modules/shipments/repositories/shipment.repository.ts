import { Shipment } from '../models/shipment.model';
import { CreateShipmentResponse } from '../interfaces/types';
import { logger } from '../../../utils/logger';

export class ShipmentRepository {
  async saveShipment(orderId: string, orderNumber: string, shipmentData: CreateShipmentResponse) {
    try {
      const shipment = await Shipment.create({
        orderId,
        orderNumber,
        shipmentId: shipmentData.shipment_id,
        status: shipmentData.status,
        statusCode: shipmentData.status_code,
        awbCode: shipmentData.awb_code,
        courierCompanyId: shipmentData.courier_company_id,
        courierName: shipmentData.courier_name,
        onboardingCompletedNow: shipmentData.onboarding_completed_now,
      });

      logger.info(`Shipment saved: ${shipment._id}`);
      return shipment;
    } catch (error: any) {
      logger.error(`Error saving shipment: ${error.message}`);
      throw error;
    }
  }

  async getShipmentByOrderId(orderId: string) {
    try {
      return await Shipment.findOne({ orderId });
    } catch (error: any) {
      logger.error(`Error fetching shipment: ${error.message}`);
      throw error;
    }
  }

  async updateShipment(shipmentId: number, updates: any) {
    try {
      return await Shipment.findOneAndUpdate({ shipmentId }, updates, { new: true });
    } catch (error: any) {
      logger.error(`Error updating shipment: ${error.message}`);
      throw error;
    }
  }
}
