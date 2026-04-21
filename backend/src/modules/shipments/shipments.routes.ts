import { Router } from 'express';
import { ShipmentsController } from './shipments.controller';
import { ShipmentServiceFactory } from './factories/shipment-service.factory';

const router = Router();

const shipmentsController = new ShipmentsController(ShipmentServiceFactory.createService());

router.post(
  '/refresh-token',
  (req, res, next) => shipmentsController.authenticate(req, res, next)
);

router.post(
  '/create',
  (req, res, next) => shipmentsController.createShipment(req, res, next)
);

export default router;