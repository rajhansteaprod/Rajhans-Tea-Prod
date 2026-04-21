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
}
