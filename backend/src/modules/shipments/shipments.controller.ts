import { Request, Response, NextFunction } from 'express';
import { ShipmentsService } from './shipments.service';
import { ShipmentServiceFactory } from './factories/shipment-service.factory';

export class ShipmentsController {
  private shipmentsService: ShipmentsService;

  constructor(shipmentsService?: ShipmentsService) {
    this.shipmentsService = shipmentsService || ShipmentServiceFactory.createService();
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
      // orderId is expected to come from query params or be looked up
      const orderId = req.query.orderId as string;
      const result = await this.shipmentsService.trackShipment({ shipmentId, orderId });
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
}
