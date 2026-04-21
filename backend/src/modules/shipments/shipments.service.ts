import { IShippingBase } from './interfaces/shipping-base';
import { CreateShipmentRequest } from './interfaces/types';
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
}
