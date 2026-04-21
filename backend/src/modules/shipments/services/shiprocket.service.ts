import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config/index';
import { IShippingBase } from '../interfaces/shipping-base';
import { ITokenRepository } from '../interfaces/token-repository';
import { AuthenticateResponse, CreateShipmentRequest, CreateShipmentResponse } from '../interfaces/types';
import { logger } from '../../../utils/logger';
import { camelToSnakeCase } from '../../../utils/transformer';

export class ShiprocketService implements IShippingBase {
  private readonly baseUrl = config.shipping.shiprocket.baseUrl;
  private readonly email = config.shipping.shiprocket.email;
  private readonly password = config.shipping.shiprocket.password;
  private axiosInstance: AxiosInstance;

  constructor(private readonly tokenRepository: ITokenRepository) {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  async authenticate(): Promise<AuthenticateResponse> {
    try {
      const cachedToken = await this.tokenRepository.getValidToken();
      if (cachedToken) {
        logger.info('Using cached Shiprocket token from repository');
        return cachedToken;
      }

      logger.info('Fetching new token from Shiprocket API');
      const newToken = await this.callShiprocketAuthAPI();

      await this.tokenRepository.saveToken(newToken);

      return newToken;
    } catch (error: any) {
      logger.error(`Shiprocket authentication failed: ${error.message}`);
      throw new Error(`Failed to authenticate with Shiprocket: ${error.message}`);
    }
  }

  async createShipment(shipmentData: CreateShipmentRequest, token: string): Promise<CreateShipmentResponse> {
    try {
      const transformedData = camelToSnakeCase(shipmentData);

      const response = await this.axiosInstance.post('/orders/create/adhoc', transformedData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Unknown error';
      logger.error({
        message: errorMessage,
        errors: errorData?.errors,
        status: error.response?.status,
        responseData: errorData,
      }, 'Shiprocket create shipment error');
      throw new Error(`Failed to create shipment: ${errorMessage}`);
    }
  }

  private async callShiprocketAuthAPI(): Promise<AuthenticateResponse> {
    try {
      const response = await this.axiosInstance.post('/auth/login', {
        email: this.email,
        password: this.password,
      });

      const { token, expires_in } = response.data;

      if (!token) {
        throw new Error('No token received from Shiprocket API');
      }

      const expiresAt = new Date(Date.now() + (expires_in || 24 * 60 * 60) * 1000);

      return {
        token,
        expiresAt,
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      logger.error(`Shiprocket API error: ${errorMessage}`);
      throw new Error(`Shiprocket API error: ${errorMessage}`);
    }
  }
}
