import axios, { AxiosInstance } from 'axios';
import { config } from '../../../config/index';
import { IShippingBase } from '../interfaces/shipping-base';
import { ITokenRepository } from '../interfaces/token-repository';
import {
  AuthenticateResponse,
  CreateShipmentRequest,
  CreateShipmentResponse,
  AssignCourierRequest,
  AssignCourierResponse,
  SchedulePickupRequest,
  SchedulePickupResponse,
  TrackShipmentRequest,
  TrackingData,
  CancelShipmentRequest,
  CancelShipmentResponse,
} from '../interfaces/types';
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

  async assignCourier(request: AssignCourierRequest, token: string): Promise<AssignCourierResponse> {
    try {
      const response = await this.axiosInstance.post('/courier/assign/awb', {
        shipment_id: request.shipmentId,
        courier_id: request.courierId,
        status: request.status,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Unknown error';
      logger.error({
        message: errorMessage,
        status: error.response?.status,
        responseData: errorData,
      }, 'Shiprocket assign courier error');
      throw new Error(`Failed to assign courier: ${errorMessage}`);
    }
  }

  async schedulePickup(request: SchedulePickupRequest, token: string): Promise<SchedulePickupResponse> {
    try {
      const response = await this.axiosInstance.post('/shipments/pickup/schedule', {
        shipment_id: request.shipmentId,
        pickup_date: request.pickupDate,
        pickup_time_slot: request.pickupSlot,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Unknown error';
      logger.error({
        message: errorMessage,
        status: error.response?.status,
        responseData: errorData,
      }, 'Shiprocket schedule pickup error');
      throw new Error(`Failed to schedule pickup: ${errorMessage}`);
    }
  }

  async trackShipment(request: TrackShipmentRequest, token: string): Promise<TrackingData> {
    try {
      const config = require('../../../config').config;
      const channelId = config.shipping.shiprocket.channelId;

      // orderId is the order number (e.g., RJT_KA_948501)
      logger.info({ orderId: request.orderId, channelId, shipmentId: request.shipmentId }, 'Tracking request');

      // Use courier/track endpoint with order_id and channel_id
      const response = await this.axiosInstance.get(`/courier/track`, {
        params: {
          order_id: request.orderId,
          channel_id: channelId
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      logger.info({ status: response.status }, 'Tracking response received');
      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Unknown error';
      logger.error({
        message: errorMessage,
        status: error.response?.status,
        responseData: errorData,
      }, 'Shiprocket track shipment error');
      throw new Error(`Failed to track shipment: ${errorMessage}`);
    }
  }

  async cancelShipment(request: CancelShipmentRequest, token: string): Promise<CancelShipmentResponse> {
    try {
      const response = await this.axiosInstance.post('/shipments/cancel', {
        shipment_id: request.shipmentId,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      return response.data;
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMessage = errorData?.message || error.message || 'Unknown error';
      logger.error({
        message: errorMessage,
        status: error.response?.status,
        responseData: errorData,
      }, 'Shiprocket cancel shipment error');
      throw new Error(`Failed to cancel shipment: ${errorMessage}`);
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
