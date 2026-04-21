import { IShippingBase } from './interfaces/shipping-base';
import {
  CreateShipmentRequest,
  AssignCourierRequest,
  SchedulePickupRequest,
  TrackShipmentRequest,
  CancelShipmentRequest,
} from './interfaces/types';
import { ShipmentRepository } from './repositories/shipment.repository';

export class ShipmentsService {
  private shipmentRepository: ShipmentRepository;

  constructor(private readonly shippingProvider: IShippingBase) {
    this.shipmentRepository = new ShipmentRepository();
  }

  async authenticate() {
    try {
      const authResponse = await this.shippingProvider.authenticate();

      return {
        success: true,
        message: 'Shipment provider authentication successful',
        data: authResponse,
      };
    } catch (error) {
      throw error;
    }
  }

  async createShipment(shipmentData: CreateShipmentRequest) {
    try {
      const authResponse = await this.shippingProvider.authenticate();
      const token = authResponse.token;

      const response = await this.shippingProvider.createShipment(shipmentData, token);

      await this.shipmentRepository.saveShipment(
        shipmentData.orderId,
        shipmentData.orderNumber,
        response
      );

      return {
        success: true,
        message: 'Shipment created successfully',
        data: response,
      };
    } catch (error) {
      throw error;
    }
  }

  async assignCourier(request: AssignCourierRequest) {
    try {
      const authResponse = await this.shippingProvider.authenticate();
      const token = authResponse.token;

      const response = await this.shippingProvider.assignCourier(request, token);

      await this.shipmentRepository.updateShipment(request.shipmentId, {
        awbCode: response.response.data.awb_code,
        courierName: response.response.data.courier_name,
        courierCompanyId: response.response.data.courier_company_id,
        status: 'ASSIGNED',
      });

      return {
        success: true,
        message: 'Courier assigned successfully',
        data: response,
      };
    } catch (error) {
      throw error;
    }
  }

  async schedulePickup(request: SchedulePickupRequest) {
    try {
      const authResponse = await this.shippingProvider.authenticate();
      const token = authResponse.token;

      const response = await this.shippingProvider.schedulePickup(request, token);

      await this.shipmentRepository.updateShipment(request.shipmentId, {
        status: 'PICKUP_SCHEDULED',
      });

      return {
        success: true,
        message: 'Pickup scheduled successfully',
        data: response,
      };
    } catch (error) {
      throw error;
    }
  }

  async trackShipment(request: TrackShipmentRequest) {
    try {
      const authResponse = await this.shippingProvider.authenticate();
      const token = authResponse.token;

      const response = await this.shippingProvider.trackShipment(request, token);

      return {
        success: true,
        message: 'Shipment tracking retrieved successfully',
        data: response,
      };
    } catch (error) {
      throw error;
    }
  }

  async cancelShipment(request: CancelShipmentRequest) {
    try {
      const authResponse = await this.shippingProvider.authenticate();
      const token = authResponse.token;

      const response = await this.shippingProvider.cancelShipment(request, token);

      await this.shipmentRepository.updateShipment(request.shipmentId, {
        status: 'CANCELLED',
      });

      return {
        success: true,
        message: 'Shipment cancelled successfully',
        data: response,
      };
    } catch (error) {
      throw error;
    }
  }
}
