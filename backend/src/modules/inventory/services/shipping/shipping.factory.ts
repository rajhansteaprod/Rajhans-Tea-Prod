import { config } from '../../../../config';
import { ShippingProvider } from './shipping.interface';
import { ShiprocketProvider } from './shiprocket.provider';

let cachedProvider: ShippingProvider | null = null;

export function getShippingProvider(): ShippingProvider {
  if (cachedProvider) return cachedProvider;

  switch (config.shipping.provider) {
    case 'shiprocket':
      cachedProvider = new ShiprocketProvider();
      break;
    // Future providers:
    // case 'delhivery':
    //   cachedProvider = new DelhiveryProvider();
    //   break;
    default:
      cachedProvider = new ShiprocketProvider();
  }

  return cachedProvider;
}
