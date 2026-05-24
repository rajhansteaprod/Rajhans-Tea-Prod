import { Request, Response, NextFunction } from 'express';
import { ShipmentsService } from './shipments.service';
import { ShipmentServiceFactory } from './factories/shipment-service.factory';
import { ShiprocketWebhookHandler } from './webhooks/shiprocket-webhook.handler';

export class ShipmentsController {
  private shipmentsService: ShipmentsService;
  private webhookHandler: ShiprocketWebhookHandler;

  constructor(shipmentsService?: ShipmentsService) {
    this.shipmentsService = shipmentsService || ShipmentServiceFactory.createService();
    this.webhookHandler = new ShiprocketWebhookHandler();
  }

  async authenticate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.shipmentsService.authenticate();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentData } = req.body;
      const result = await this.shipmentsService.createShipment(shipmentData);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async assignCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentId, courierId, status } = req.body;
      const result = await this.shipmentsService.assignCourier({ shipmentId, courierId, status });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async schedulePickup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentId, pickupDate, pickupSlot } = req.body;
      const result = await this.shipmentsService.schedulePickup({ shipmentId, pickupDate, pickupSlot });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async trackShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipmentId = parseInt(req.params.shipmentId as string);
      const result = await this.shipmentsService.trackShipment({ shipmentId });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipmentId = parseInt(req.params.shipmentId as string);
      const result = await this.shipmentsService.cancelShipment({ shipmentId });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async handleShiprocketWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.webhookHandler.handleTrackingUpdate(req.body);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
