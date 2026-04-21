import { Request, Response, NextFunction } from 'express';
import { ShipmentsService } from './shipments.service';
import { ShipmentServiceFactory } from './factories/shipment-service.factory';

export class ShipmentsController {
  private shizmentsService: ShipmentsService;

  constructor(shipmentsService?: ShipmentsService) {
    this.shizmentsService = shipmentsService || ShipmentServiceFactory.createService();
  }

  async authenticate(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.shizmentsService.authenticate();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async createShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentData } = req.body;
      const result = await this.shizmentsService.createShipment(shipmentData);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async assignCourier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentId, courierId, status } = req.body;
      const result = await this.shizmentsService.assignCourier({ shipmentId, courierId, status });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async schedulePickup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shipmentId, pickupDate, pickupSlot } = req.body;
      const result = await this.shizmentsService.schedulePickup({ shipmentId, pickupDate, pickupSlot });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async trackShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipmentId = parseInt(req.params.shipmentId as string);
      const result = await this.shizmentsService.trackShipment({ shipmentId });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async cancelShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const shipmentId = parseInt(req.params.shipmentId as string);
      const result = await this.shizmentsService.cancelShipment({ shipmentId });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
