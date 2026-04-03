import express from "express";
import {
  assignRestaurantManager,
  createFoodOrder,
  createManagedCategory,
  createManagedProduct,
  createManagedRestaurant,
  ensureRestaurantManagers,
  getFoodHomeFeed,
  getMyFoodOrderDetail,
  getMyFoodOrderTracking,
  getFoodProductDetail,
  listFoodProducts,
  getFoodRestaurantDetail,
  getRestaurantWorkspace,
  deleteManagedCategory,
  deleteManagedProduct,
  listFoodPaymentMethods,
  listMyFoodOrders,
  listManagedCategories,
  listManagedProducts,
  listManagedRestaurants,
  listFoodRestaurants,
  searchFoodCatalog,
  uploadFoodMedia,
  updateManagedCategory,
  updateManagedProduct,
  updateManagedRestaurant,
} from "./food-home.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { foodMediaUpload } from "@/middlewares/upload.middleware";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: FoodHome
 *     description: Catalogue alimentaire (Accueil Eats)
 *   - name: FoodHomeAdmin
 *     description: Gestion du catalogue alimentaire (Admin/Manager)
 *   - name: FoodHomeManager
 *     description: Espace de travail du manager
 *   - name: FoodHomeOrders
 *     description: Commandes de repas
 */

/**
 * @swagger
 * /food-home:
 *   get:
 *     tags: [FoodHome]
 *     summary: Recuperer les donnees de l'accueil Eats
 *     responses:
 *       200:
 *         description: Flux d'accueil retourne
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodHomeFeedResponse'
 */
router.get("/", getFoodHomeFeed);

/**
 * @swagger
 * /food-home/search:
 *   get:
 *     tags: [FoodHome]
 *     summary: Rechercher des restaurants et produits
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Texte de recherche
 *     responses:
 *       200:
 *         description: Resultats de recherche
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodCatalogSearchResponse'
 */
router.get("/search", searchFoodCatalog);

/**
 * @swagger
 * /food-home/payment-methods:
 *   get:
 *     tags: [FoodHome]
 *     summary: Lister les methodes de paiement autorisees pour le Food
 *     responses:
 *       200:
 *         description: Liste des methodes
 */
router.get("/payment-methods", listFoodPaymentMethods);

/**
 * @swagger
 * /food-home/restaurants:
 *   get:
 *     tags: [FoodHome]
 *     summary: Lister les restaurants du catalogue
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: categoryId
 *         schema: { type: string }
 *       - in: query
 *         name: section
 *         schema: { type: string, enum: [popular, nearby, recommended, open] }
 *     responses:
 *       200:
 *         description: Liste des restaurants
 */
router.get("/restaurants", listFoodRestaurants);

/**
 * @swagger
 * /food-home/restaurants/{id}:
 *   get:
 *     tags: [FoodHome]
 *     summary: Detail d'un restaurant et de ses produits
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Detail restaurant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodRestaurantDetailResponse'
 *       404:
 *         description: Restaurant introuvable
 */
router.get("/restaurants/:id", getFoodRestaurantDetail);

/**
 * @swagger
 * /food-home/products:
 *   get:
 *     tags: [FoodHome]
 *     summary: Lister les produits (Filtres possibles)
 *     parameters:
 *       - in: query
 *         name: restaurantId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des produits
 */
router.get("/products", listFoodProducts);

/**
 * @swagger
 * /food-home/products/{id}:
 *   get:
 *     tags: [FoodHome]
 *     summary: Detail d'un produit
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Detail produit
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FoodProductDetailResponse'
 *       404:
 *         description: Produit introuvable
 */
router.get("/products/:id", getFoodProductDetail);

/**
 * @swagger
 * /food-home/admin/uploads/image:
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: Uploader une image pour le catalogue (Admin/Manager)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Image uploadee
 */
router.post("/admin/uploads/image", authenticate, foodMediaUpload.single("image"), uploadFoodMedia);

/**
 * @swagger
 * /food-home/admin/restaurants:
 *   get:
 *     tags: [FoodHomeAdmin]
 *     summary: Liste des restaurants geres (Admin/Manager)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Liste des restaurants
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: Creer un restaurant (Admin only)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, categoryId]
 *             properties:
 *               name: { type: string }
 *               categoryId: { type: string }
 *               description: { type: string }
 *               imageUrl: { type: string }
 *     responses:
 *       201:
 *         description: Restaurant cree
 */
router.get("/admin/restaurants", authenticate, listManagedRestaurants);
router.post("/admin/restaurants", authenticate, createManagedRestaurant);

/**
 * @swagger
 * /food-home/admin/restaurants/ensure-managers:
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: S'assurer que les restaurateurs ont des comptes (Admin only)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Succes
 */
router.post("/admin/restaurants/ensure-managers", authenticate, ensureRestaurantManagers);

/**
 * @swagger
 * /food-home/admin/restaurants/{id}:
 *   patch:
 *     tags: [FoodHomeAdmin]
 *     summary: Modifier un restaurant (Admin only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Restaurant modifie
 */
router.patch("/admin/restaurants/:id", authenticate, updateManagedRestaurant);

/**
 * @swagger
 * /food-home/admin/restaurants/{id}/assign-manager:
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: Assigner un manager a un restaurant (Admin only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string }
 *     responses:
 *       200:
 *         description: Manager assigne
 */
router.post("/admin/restaurants/:id/assign-manager", authenticate, assignRestaurantManager);

/**
 * @swagger
 * /food-home/admin/restaurants/{restaurantId}/categories:
 *   get:
 *     tags: [FoodHomeAdmin]
 *     summary: Liste des categories d'un restaurant
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des categories
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: Creer une categorie dans un restaurant
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               order: { type: number }
 *     responses:
 *       201:
 *         description: Categorie creee
 */
router.get("/admin/restaurants/:restaurantId/categories", authenticate, listManagedCategories);
router.post("/admin/restaurants/:restaurantId/categories", authenticate, createManagedCategory);

/**
 * @swagger
 * /food-home/admin/restaurants/{restaurantId}/categories/{categoryId}:
 *   patch:
 *     tags: [FoodHomeAdmin]
 *     summary: Modifier une categorie
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Categorie modifiee
 *   delete:
 *     tags: [FoodHomeAdmin]
 *     summary: Supprimer une categorie
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Categorie supprimee
 */
router.patch("/admin/restaurants/:restaurantId/categories/:categoryId", authenticate, updateManagedCategory);
router.delete("/admin/restaurants/:restaurantId/categories/:categoryId", authenticate, deleteManagedCategory);

/**
 * @swagger
 * /food-home/admin/restaurants/{restaurantId}/products:
 *   get:
 *     tags: [FoodHomeAdmin]
 *     summary: Liste des produits d'un restaurant (Admin/Manager)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Liste des produits
 *   post:
 *     tags: [FoodHomeAdmin]
 *     summary: Creer un produit dans un restaurant
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, categoryId]
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               categoryId: { type: string }
 *               description: { type: string }
 *               imageUrl: { type: string }
 *               isAvailable: { type: boolean }
 *     responses:
 *       201:
 *         description: Produit cree
 */
router.get("/admin/restaurants/:restaurantId/products", authenticate, listManagedProducts);
router.post("/admin/restaurants/:restaurantId/products", authenticate, createManagedProduct);

/**
 * @swagger
 * /food-home/admin/restaurants/{restaurantId}/products/{productId}:
 *   patch:
 *     tags: [FoodHomeAdmin]
 *     summary: Modifier un produit
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Produit modifie
 *   delete:
 *     tags: [FoodHomeAdmin]
 *     summary: Supprimer un produit
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: restaurantId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Produit supprime
 */
router.patch("/admin/restaurants/:restaurantId/products/:productId", authenticate, updateManagedProduct);
router.delete("/admin/restaurants/:restaurantId/products/:productId", authenticate, deleteManagedProduct);

/**
 * @swagger
 * /food-home/restaurant/workspace:
 *   get:
 *     tags: [FoodHomeManager]
 *     summary: Obtenir l'espace de travail du manager connecte
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Donnees du restaurant du manager
 */
router.get("/restaurant/workspace", authenticate, getRestaurantWorkspace);

/**
 * @swagger
 * /food-home/orders:
 *   get:
 *     tags: [FoodHomeOrders]
 *     summary: Lister mes commandes de repas
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Liste des commandes
 *   post:
 *     tags: [FoodHomeOrders]
 *     summary: Passer une commande de repas
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [restaurantId, items, deliveryAddress, paymentMethod]
 *             properties:
 *               restaurantId: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId: { type: string }
 *                     quantity: { type: number }
 *               deliveryAddress: { type: string }
 *               paymentMethod: { type: string }
 *               notes: { type: string }
 *     responses:
 *       201:
 *         description: Commande passee
 */
router.post("/orders", authenticate, createFoodOrder);
router.get("/orders", authenticate, listMyFoodOrders);

/**
 * @swagger
 * /food-home/orders/{id}:
 *   get:
 *     tags: [FoodHomeOrders]
 *     summary: Detail d'une commande de repas
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Detail commande
 */
router.get("/orders/:id", authenticate, getMyFoodOrderDetail);

/**
 * @swagger
 * /food-home/orders/{id}/tracking:
 *   get:
 *     tags: [FoodHomeOrders]
 *     summary: Suivi en temps reel d'une commande de repas
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Etat du suivi
 */
router.get("/orders/:id/tracking", authenticate, getMyFoodOrderTracking);

export default router;
