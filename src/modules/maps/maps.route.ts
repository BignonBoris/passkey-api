import { Router } from "express";
import * as mapsController from "./maps.controller";
import * as priceController from "./price.controller";

const router = Router();

// POST /api/maps/route
router.post("/route", mapsController.getRoute);
router.get("/geocode", mapsController.getCoordinatesFromAddress);
router.get("/geocode", mapsController.geocodeAddress);
router.get("/reverse-geocode", mapsController.reverseGeocode);
router.get("/places/autocomplete", mapsController.getPlaceSuggestions);
router.post("/calculate-trip", priceController.calculateTrip);

/**
 * @swagger
 * tags:
 *   name: Maps
 */
export default router;
