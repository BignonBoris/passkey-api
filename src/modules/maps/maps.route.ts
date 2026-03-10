const express = require('express');
const router = express.Router();
const mapsController = require('./maps.controller');
const priceController = require('./price.controller');

// POST /api/maps/route
router.post('/route', mapsController.getRoute);
router.get('/geocode', mapsController.getCoordinatesFromAddress);
router.get('/geocode', mapsController.geocodeAddress);
router.get('/reverse-geocode', mapsController.reverseGeocode);
router.get('/places/autocomplete', mapsController.getPlaceSuggestions);
router.post('/calculate-trip', priceController.calculateTrip);

/**
 * @swagger
 * tags:
 *   name: Maps
 */
module.exports = router;
