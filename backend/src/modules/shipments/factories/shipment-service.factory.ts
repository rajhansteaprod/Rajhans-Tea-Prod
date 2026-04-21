import { ShipmentsService } from '../shipments.service';
import { ShiprocketService } from '../services/shiprocket.service';
import { TokenRepository } from '../repositories/token.repository';
import { IShippingBase } from '../interfaces/shipping-base';

export class ShipmentServiceFactory {
  static createService(provider?: IShippingBase): ShipmentsService {
    const shippingProvider = provider || this.createShiprocketService();
    return new ShipmentsService(shippingProvider);
  }

  private static createShiprocketService(): ShiprocketService {
    const tokenRepository = new TokenRepository();
    return new ShiprocketService(tokenRepository);
  }
}
