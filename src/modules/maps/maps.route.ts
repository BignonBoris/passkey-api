import express from 'express';
const router = express.Router();
import * as mapsController from './maps.controller';
import * as priceController from './price.controller';

// POST /api/maps/route
/**
 * @swagger
 * /maps/route:
 *   post:
 *     summary: Calculer un itineraire entre deux points
 *     tags: [Maps]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin, destination]
 *             properties:
 *               origin: { type: string, example: "6.37,2.39" }
 *               destination: { type: string, example: "6.38,2.40" }
 *               waypoint: { type: string, example: "6.375,2.395" }
 *     responses:
 *       200:
 *         description: Itineraire calcule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 polyline: { type: string }
 *                 distance: { type: number }
 */
router.post('/route', mapsController.getRoute);

/**
 * @swagger
 * /maps/geocode:
 *   get:
 *     summary: Obtenir des coordonnees a partir d'une adresse textuelle
 *     tags: [Maps]
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Coordonnees trouvees
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lat: { type: number }
 *                 lng: { type: number }
 *                 formattedAddress: { type: string }
 */
router.get('/geocode', mapsController.getCoordinatesFromAddress);

/**
 * @swagger
 * /maps/reverse-geocode:
 *   get:
 *     summary: Obtenir une adresse a partir de coordonnees GPS
 *     tags: [Maps]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Adresse trouvee
 */
router.get('/reverse-geocode', mapsController.reverseGeocode);
/**
 * @swagger
 * /maps/resolve-location:
 *   post:
 *     tags:
 *       - Maps
 *     summary: Resoudre un lieu lisible a partir de coordonnees GPS
 *     description: |
 *       Fait un reverse geocoding Google Maps a partir d'un couple latitude/longitude.
 *       Si un `place_id` est trouve, l'API tente ensuite de recuperer le nom du lieu via Place Details.
 *       Priorite de restitution cote client: `placeName`, puis `address`, sinon un fallback lisible.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lat
 *               - lng
 *             properties:
 *               lat:
 *                 type: number
 *                 format: double
 *                 example: 6.3703
 *               lng:
 *                 type: number
 *                 format: double
 *                 example: 2.3912
 *     responses:
 *       200:
 *         description: Lieu resolu avec succes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     placeName:
 *                       type: string
 *                       nullable: true
 *                       example: Pharmacie Centrale
 *                     address:
 *                       type: string
 *                       example: Rue 245, Cotonou, Benin
 *                     placeId:
 *                       type: string
 *                       nullable: true
 *                       example: ChIJ1234567890abcdef
 *                     latitude:
 *                       type: number
 *                       format: double
 *                       example: 6.3703
 *                     longitude:
 *                       type: number
 *                       format: double
 *                       example: 2.3912
 *                     country:
 *                       $ref: "#/components/schemas/Country"
 *                     matchedByGps:
 *                       type: boolean
 *       400:
 *         description: Coordonnees invalides
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Les coordonnees sont invalides
 *       500:
 *         description: Erreur lors de la resolution du lieu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Erreur lors de la resolution du lieu
 */
router.post('/resolve-location', mapsController.resolveLocation);

/**
 * @swagger
 * /maps/places/autocomplete:
 *   get:
 *     summary: Suggestions d'adresses Google Places Autocomplete
 *     tags: [Maps]
 *     parameters:
 *       - in: query
 *         name: input
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: countryId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste de suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   description: { type: string }
 *                   placeId: { type: string }
 */
router.get('/places/autocomplete', mapsController.getPlaceSuggestions);

/**
 * @swagger
 * /maps/calculate-trip:
 *   post:
 *     summary: Calculer le prix et les options de vehicules pour une course
 *     tags: [Maps]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pickup, delivery]
 *             properties:
 *               pickup: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *               delivery: { type: object, properties: { lat: { type: number }, lng: { type: number } } }
 *     responses:
 *       200:
 *         description: Options de course calculees
 */
router.post('/calculate-trip', priceController.calculateTrip);

/**
 * @swagger
 * tags:
 *   name: Maps
 *   description: Google Maps, geocoding et resolution de lieux
 */
export default router;
