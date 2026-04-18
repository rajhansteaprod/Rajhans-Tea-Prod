/**
 * Shipments Service - ShipRocket Integration
 *
 * TODO: Add ShipRocket API credentials:
 * - SHIPROCKET_API_KEY: Your ShipRocket API key
 * - SHIPROCKET_API_URL: https://apiv2.shiprocket.in
 *
 * Get credentials from: https://dashboard.shiprocket.in
 */

export interface EstimateDeliveryRequest {
  pincode: string;
  cartItems: Array<{
    productId: string;
    name: string;
    qty: number;
    basePrice: number;
  }>;
}

export interface DeliveryEstimateResponse {
  estimatedDays: number;
  serviceType?: string;
  remark?: string;
}

export class ShiprocketService {
  private readonly apiKey = process.env.SHIPROCKET_API_KEY;

  /**
   * Check delivery estimate for a given pincode
   * Uses ShipRocket's courier assignment API to determine estimated delivery days
   *
   * TODO: Implement actual ShipRocket API call once credentials are available:
   * 1. Call /v1/serviceability/postcodes endpoint with pincode
   * 2. Parse response to get estimated delivery days for available couriers
   * 3. Return the fastest/default option
   */
  async estimateDelivery(request: EstimateDeliveryRequest): Promise<DeliveryEstimateResponse> {
    const { pincode } = request;

    if (!this.apiKey) {
      // Fallback: Return dummy estimate based on pincode
      // This will be replaced with actual ShipRocket API call
      const daysMap: Record<string, number> = {
        // Metro areas: 1-2 days
        '400001': 1, // Mumbai
        '110001': 1, // Delhi
        '560001': 1, // Bangalore
        '700001': 1, // Kolkata
        '600001': 1, // Chennai
        // Tier 2 cities: 2-3 days
        '411001': 2, // Pune
        '380001': 2, // Ahmedabad
        '201301': 2, // Noida
        // Default: 3-4 days
      };

      const estimatedDays = daysMap[pincode] || 3;

      return {
        estimatedDays,
        serviceType: 'Standard',
        remark: '(Using fallback estimate - add ShipRocket credentials for actual rates)',
      };
    }

    // TODO: Actual ShipRocket implementation:
    // const response = await fetch(`${this.apiUrl}/v1/serviceability/postcodes`, {
    //   method: 'GET',
    //   headers: {
    //     'Authorization': `Bearer ${this.apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     postcode: pincode,
    //     cod: 0,
    //     weight: this.calculateWeight(request.cartItems),
    //   }),
    // });
    //
    // const data = await response.json();
    // if (data.data?.available_courier_services?.length > 0) {
    //   const service = data.data.available_courier_services[0];
    //   return {
    //     estimatedDays: service.etd || 3,
    //     serviceType: service.courier_name,
    //   };
    // }
    //
    // throw new Error('No couriers available for this pincode');

    // Placeholder return
    return {
      estimatedDays: 3,
      serviceType: 'Standard',
      remark: 'ShipRocket API call pending credentials',
    };
  }

  /**
   * Calculate total weight of cart items
   * TODO: Add weight field to product model for accurate calculation
   * TODO: Use this method in actualShipRocket API call
   */
  // private calculateWeight(items: EstimateDeliveryRequest['cartItems']): number {
  //   // Placeholder: assume 500g per item
  //   return items.reduce((total, item) => total + item.qty * 0.5, 0);
  // }

  /**
   * Validate pincode serviceability
   * TODO: Implement once credentials are available
   */
  async validatePincode(pincode: string): Promise<boolean> {
    if (!this.apiKey) {
      // Fallback validation (basic check)
      return /^\d{6}$/.test(pincode);
    }

    // TODO: Call ShipRocket /v1/serviceability/postcodes to validate
    return true;
  }
}
