import { Router } from 'express';
import { ShipmentsController } from './shipments.controller';
import { ShipmentServiceFactory } from './factories/shipment-service.factory';

const router = Router();

const shipmentsController = new ShipmentsController(ShipmentServiceFactory.createService());

router.post(
  '/shipments/refresh-token',
  (req, res, next) => shipmentsController.authenticate(req, res, next)
);

router.post(
  '/shipments/create',
  (req, res, next) => shipmentsController.createShipment(req, res, next)
);

router.post(
  '/shipments/assign-courier',
  (req, res, next) => shipmentsController.assignCourier(req, res, next)
);

router.post(
  '/shipments/schedule-pickup',
  (req, res, next) => shipmentsController.schedulePickup(req, res, next)
);

router.get(
  '/shipments/track/:shipmentId',
  (req, res, next) => shipmentsController.trackShipment(req, res, next)
);

router.delete(
  '/shipments/:shipmentId',
  (req, res, next) => shipmentsController.cancelShipment(req, res, next)
);

router.post(
  '/webhooks/shiprocket',
  (req, res, next) => shipmentsController.handleShiprocketWebhook(req, res, next)
);

export default router;