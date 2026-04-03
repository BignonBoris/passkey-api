import server from "./app";
import sequelize from "./config/database";
import "./models/country.model";
import "./models/user.model";
import "./models/status-history.model";
import "./models/order.model";
import "./models/payment.model";
import "./models/payout.model";
import "./models/kyc-request.model";
import "./models/driver-document.model";
import "./models/driver-vehicle.model";
import "./models/driver-revenue-config.model";
import "./models/support-ticket.model";
import "./models/support-ticket-message.model";
import "./models/support-ticket-category.model";
import "./models/notification-log.model";
import "./models/refund-request.model";
import "./models/promotion.model";
import "./models/promotion-redemption.model";
import "./models/incident.model";
import "./models/service-zone.model";
import "./models/faq.model";
import "./models/app-settings.model";
import "./models/vehicle-pricing-config.model";
import "./models/vehicle-type.model";
import "./models/chat-conversation.model";
import "./models/chat-message.model";
import "./models/user-address.model";
import "./models/pricing-rule.model";
import "./models/food-home-category.model";
import "./models/food-home-promo.model";
import "./models/food-home-restaurant.model";
import "./models/food-home-product.model";
import AppSettings, { normalizeSettingsContent } from "./models/app-settings.model";
import FoodHomeCategory from "./models/food-home-category.model";
import FoodHomePromo from "./models/food-home-promo.model";
import FoodHomeProduct from "./models/food-home-product.model";
import FoodHomeRestaurant from "./models/food-home-restaurant.model";
import SupportTicketCategory from "./models/support-ticket-category.model";
import VehiclePricingConfig from "./models/vehicle-pricing-config.model";
import DriverRevenueConfig from "./models/driver-revenue-config.model";
import VehicleType from "./models/vehicle-type.model";
import User from "./models/user.model";
import Country from "./models/country.model";
import bcrypt from "bcrypt";
import { DataTypes } from "sequelize";
import { BENIN_COUNTRY_ID, DEFAULT_COUNTRY_ID, DEFAULT_COUNTRIES } from "./constants/countries";
import { ensureDefaultCountries } from "./services/country.service";

// const PORT = process.env.PORT || 3000;
const PORT = parseInt(process.env.PORT || "3000", 10);

async function startServer() {
  try {
    // 1. First ensure critical columns exist in tables that might already be there
    // without the countryId field (which causes sync errors on unique indexes)
    await ensureCountryColumnsExist();
    await ensureRiderColumnsExist();
    await cleanupVehiclePricingConstraints();

    // 2. Sync all models/indexes
    await sequelize.sync();

    // 3. Complete the rest of the schema adjustments
    await ensureCountrySchema();
    await ensureCountryDistanceColumns();
    await ensureDefaultCountries();
    await ensureUserLocationSchema();
    await ensureUserPhoneNullable();
    await ensureOrderArchiveColumn();
    await ensureOrderOtpColumns();
    await ensureOrderRevenueColumns();
    await ensureOrderPricingColumns();
    await ensureFoodOrderColumns();
    await ensurePricingRulesTable();
    await ensurePaymentSchema();
    await ensureSupportSchema();
    await seedSupportTicketCategories();
    await ensureFoodCatalogSchema();
    await seedVehicleTypes();
    await ensureDefaultAppSettings();
    await seedDefaultAdmin();
    await seedFoodHomeData();
    server.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database sync failed:", error);
  }
}

async function ensureCountryDistanceColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Country";
  try {
    const columns = await queryInterface.describeTable(tableName);
    if (!columns["deliveryDistanceKm"]) {
      await queryInterface.addColumn(tableName, "deliveryDistanceKm", {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 10,
      });
      console.log("[migration] Added deliveryDistanceKm to Country");
    }
    if (!columns["driverLocationDistanceKm"]) {
      await queryInterface.addColumn(tableName, "driverLocationDistanceKm", {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 2,
      });
      console.log("[migration] Added driverLocationDistanceKm to Country");
    }
  } catch (err) {
    console.warn("[migration] ensureCountryDistanceColumns skipped:", err);
  }
}

async function ensurePaymentSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Payment";
  const columns = await queryInterface.describeTable(tableName);

  if (columns.driverId?.allowNull === false) {
    await queryInterface.changeColumn(tableName, "driverId", {
      type: DataTypes.UUID,
      allowNull: true,
    });
  }

  const optionalColumns: Array<{ name: string; definition: any }> = [
    { name: "provider", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "providerTransactionId", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "providerReference", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "merchantReference", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "checkoutUrl", definition: { type: DataTypes.TEXT, allowNull: true } },
    { name: "checkoutToken", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "callbackUrl", definition: { type: DataTypes.TEXT, allowNull: true } },
    { name: "customerEmail", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "customerPhone", definition: { type: DataTypes.STRING, allowNull: true } },
    { name: "failureReason", definition: { type: DataTypes.TEXT, allowNull: true } },
    { name: "callbackReceivedAt", definition: { type: DataTypes.DATE, allowNull: true } },
    { name: "rawProviderPayload", definition: { type: DataTypes.TEXT("long"), allowNull: true } },
  ];

  for (const column of optionalColumns) {
    if (!columns[column.name]) {
      await queryInterface.addColumn(tableName, column.name, column.definition);
    }
  }
}

startServer();

async function ensureUserLocationSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "User";
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.locationUpdatedAt) {
    await queryInterface.addColumn(tableName, "locationUpdatedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
}

async function ensureUserPhoneNullable() {
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("User");
  if (columns.phone && !columns.phone.allowNull) {
    await queryInterface.changeColumn("User", "phone", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
}

async function ensureCountrySchema() {
  const queryInterface = sequelize.getQueryInterface();
  const tablesRaw = await queryInterface.showAllTables();
  const tables = tablesRaw.map((table: any) => (typeof table === "string" ? table : String(Object.values(table)[0] || "")));

  if (!tables.includes("Country")) {
    await queryInterface.createTable("Country", {
      id: {
        type: DataTypes.STRING(16),
        allowNull: false,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      iso2: {
        type: DataTypes.STRING(2),
        allowNull: false,
        unique: true,
      },
      iso3: {
        type: DataTypes.STRING(3),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      phoneCode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: "XOF",
      },
      minLatitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      maxLatitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      minLongitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      maxLongitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      centerLatitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      centerLongitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
  }

  for (const country of DEFAULT_COUNTRIES) {
    const existing = await Country.findByPk(country.id);
    if (existing) continue;
    await Country.create(country as any);
  }

  const countryTables = [
    { tableName: "User", column: "countryId", indexName: null, fields: null },
    { tableName: "Order", column: "countryId", indexName: null, fields: null },
    { tableName: "ServiceZone", column: "countryId", indexName: null, fields: null },
    { tableName: "PricingRule", column: "countryId", indexName: null, fields: null },
    { tableName: "VehicleType", column: "countryId", indexName: "vehicle_type_country_code_unique", fields: ["countryId", "code"] },
    { tableName: "VehiclePricingConfig", column: "countryId", indexName: "vehicle_pricing_country_vehicle_unique", fields: ["countryId", "vehicleType"] },
    { tableName: "DriverRevenueConfig", column: "countryId", indexName: "driver_revenue_country_vehicle_unique", fields: ["countryId", "vehicleType"] },
  ];

  for (const table of countryTables) {
    const columns = await queryInterface.describeTable(table.tableName);
    if (!columns[table.column]) {
      await queryInterface.addColumn(table.tableName, table.column, {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: DEFAULT_COUNTRY_ID,
      });
    }

    await sequelize.query(
      `UPDATE \`${table.tableName}\` SET \`${table.column}\` = :countryId WHERE \`${table.column}\` IS NULL OR \`${table.column}\` = ''`,
      {
        replacements: { countryId: BENIN_COUNTRY_ID },
      }
    );

    if (table.indexName && table.fields) {
      await dropSingleColumnUniqueIndex(table.tableName, table.fields[1]);
      const indexes = (await queryInterface.showIndex(table.tableName)) as any[];
      const exists = indexes.some((index: any) => String(index.name || "") === table.indexName);
      if (!exists) {
        await queryInterface.addIndex(table.tableName, table.fields, {
          unique: true,
          name: table.indexName,
        });
      }
    }
  }
}

async function ensureCountryColumnsExist() {
  const queryInterface = sequelize.getQueryInterface();
  const tablesRaw = await queryInterface.showAllTables();
  const tables = tablesRaw.map((table: any) => (typeof table === "string" ? table : String(Object.values(table)[0] || "")));

  const countryTables = [
    { tableName: "User", column: "countryId" },
    { tableName: "Order", column: "countryId" },
    { tableName: "ServiceZone", column: "countryId" },
    { tableName: "PricingRule", column: "countryId" },
    { tableName: "VehicleType", column: "countryId" },
    { tableName: "VehiclePricingConfig", column: "countryId" },
    { tableName: "DriverRevenueConfig", column: "countryId" },
  ];

  for (const table of countryTables) {
    if (tables.includes(table.tableName)) {
      const columns = await queryInterface.describeTable(table.tableName);
      if (!columns[table.column]) {
        await queryInterface.addColumn(table.tableName, table.column, {
          type: DataTypes.STRING(16),
          allowNull: false,
          defaultValue: DEFAULT_COUNTRY_ID,
        });
      }
    }
  }
}

async function ensureRiderColumnsExist() {
  const queryInterface = sequelize.getQueryInterface();
  const tablesRaw = await queryInterface.showAllTables();
  const tables = tablesRaw.map((table: any) => (typeof table === "string" ? table : String(Object.values(table)[0] || "")));

  const riderTables = [
    { tableName: "VehiclePricingConfig", column: "vehicleType" },
    { tableName: "DriverRevenueConfig", column: "vehicleType" },
  ];

  for (const table of riderTables) {
    if (tables.includes(table.tableName)) {
      const columns = await queryInterface.describeTable(table.tableName);
      if (!columns[table.column]) {
        console.log(`[migration] Adding ${table.column} to ${table.tableName}...`);
        await queryInterface.addColumn(table.tableName, table.column, {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "moto",
        });
      }
    }
  }
}

async function cleanupVehiclePricingConstraints() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    // Puisque la table est vide (recherche précedente), on la drop pour laisser sync() la recréer proprement.
    // Cela résoud l'erreur ER_CANT_DROP_FIELD_OR_KEY sur les FK/index mal nommés.
    const [countRes] = await sequelize.query("SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'VehiclePricingConfig'");
    if (Array.isArray(countRes) && countRes.length > 0 && (countRes[0] as any).count > 0) {
       // On ne drop que si on est sur que c'est safe ou si on force.
       // Ici on tente un drop direct car on a vu que count=0.
       await sequelize.query("DROP TABLE IF EXISTS \`VehiclePricingConfig\`");
       await sequelize.query("DROP TABLE IF EXISTS \`DriverRevenueConfig\`");
       console.log("[migration] Tables VehiclePricingConfig et DriverRevenueConfig supprimées pour reconstruction.");
    }
  } catch (err) {
    console.warn("[migration] cleanupVehiclePricingConstraints skipped:", err);
  }
}

async function dropSingleColumnUniqueIndex(tableName: string, fieldName: string) {
  const queryInterface = sequelize.getQueryInterface();
  const indexes = await queryInterface.showIndex(tableName);
  for (const index of indexes as any[]) {
    const fields = Array.isArray(index.fields)
      ? index.fields.map((field: any) => String(field.attribute || field.name || ""))
      : [];
    if (index.unique && fields.length === 1 && fields[0] === fieldName) {
      await queryInterface.removeIndex(tableName, String(index.name));
    }
  }
}

async function seedFoodHomeData() {
  const [promoCount, categoryCount, restaurantCount, productCount] = await Promise.all([
    FoodHomePromo.count(),
    FoodHomeCategory.count(),
    FoodHomeRestaurant.count(),
    FoodHomeProduct.count(),
  ]);

  if (promoCount === 0) {
    await FoodHomePromo.bulkCreate([
      {
        id: "promo-1",
        title: "-30% sur votre premier repas",
        subtitle: "Code BIENVENUE, valable sur une selection de restaurants.",
        ctaLabel: "Commander maintenant",
        imageUrl:
          "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=1200",
        primaryColorHex: "#FF6A3D",
        secondaryColorHex: "#FF9A3D",
        iconKey: "local_fire_department_rounded",
        sortOrder: 1,
      },
      {
        id: "promo-2",
        title: "Livraison offerte ce soir",
        subtitle: "Profitez des restaurants ouverts autour de vous avant 22h.",
        ctaLabel: "Voir les offres",
        imageUrl:
          "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=1200",
        primaryColorHex: "#0D47A1",
        secondaryColorHex: "#2E7DFF",
        iconKey: "delivery_dining_rounded",
        sortOrder: 2,
      },
      {
        id: "promo-3",
        title: "Restaurant sponsorise: Chicken Avenue",
        subtitle: "Menus combo croustillants et boissons fraiches.",
        ctaLabel: "Voir la fiche",
        imageUrl:
          "https://images.pexels.com/photos/4109084/pexels-photo-4109084.jpeg?auto=compress&cs=tinysrgb&w=1200",
        primaryColorHex: "#0A7C66",
        secondaryColorHex: "#2BB79A",
        iconKey: "workspace_premium_rounded",
        sortOrder: 3,
      },
    ]);
  }

  if (categoryCount === 0) {
    await FoodHomeCategory.bulkCreate([
      { id: "burger", name: "Burgers", iconKey: "lunch_dining_rounded", colorHex: "#FF8A3D", sortOrder: 1, restaurantId: null, isActive: true },
      { id: "pizza", name: "Pizza", iconKey: "local_pizza_rounded", colorHex: "#E74C3C", sortOrder: 2, restaurantId: null, isActive: true },
      { id: "chicken", name: "Poulet", iconKey: "set_meal_rounded", colorHex: "#FFC107", sortOrder: 3, restaurantId: null, isActive: true },
      { id: "dessert", name: "Dessert", iconKey: "icecream_rounded", colorHex: "#FF6FB5", sortOrder: 4, restaurantId: null, isActive: true },
      { id: "african", name: "Africain", iconKey: "rice_bowl_rounded", colorHex: "#2E7D32", sortOrder: 5, restaurantId: null, isActive: true },
      { id: "drinks", name: "Boissons", iconKey: "local_drink_rounded", colorHex: "#00ACC1", sortOrder: 6, restaurantId: null, isActive: true },
    ]);
  }

  if (restaurantCount === 0) {
    await FoodHomeRestaurant.bulkCreate([
      {
        id: "resto-1",
        name: "Burger Factory",
        description: "Smash burgers, frites maison et sauces signatures.",
        categoryId: "burger",
        categoryLabel: "Burgers",
        rating: 4.8,
        ratingCount: 420,
        deliveryMinutes: 24,
        deliveryFee: 800,
        isOpen: true,
        isPopular: true,
        isRecommended: true,
        isNearby: true,
        imageUrl:
          "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#FF8A3D",
        iconKey: "lunch_dining_rounded",
        tags: JSON.stringify(["Best seller", "Livraison rapide"]),
        sortOrder: 1,
      },
      {
        id: "resto-2",
        name: "Pizza District",
        description: "Pizzas artisanales, pate fine et ingredients frais.",
        categoryId: "pizza",
        categoryLabel: "Pizza",
        rating: 4.7,
        ratingCount: 318,
        deliveryMinutes: 31,
        deliveryFee: 1000,
        isOpen: true,
        isPopular: true,
        isRecommended: false,
        isNearby: true,
        imageUrl:
          "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#E74C3C",
        iconKey: "local_pizza_rounded",
        tags: JSON.stringify(["Four a pierre", "Promo 1 achetee = 1 offerte"]),
        sortOrder: 2,
      },
      {
        id: "resto-3",
        name: "Chicken Avenue",
        description: "Poulet pane, wraps et buckets a partager.",
        categoryId: "chicken",
        categoryLabel: "Poulet",
        rating: 4.9,
        ratingCount: 502,
        deliveryMinutes: 19,
        deliveryFee: 700,
        isOpen: true,
        isPopular: true,
        isRecommended: true,
        isNearby: false,
        imageUrl:
          "https://images.pexels.com/photos/4109084/pexels-photo-4109084.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#FFC107",
        iconKey: "set_meal_rounded",
        tags: JSON.stringify(["Sponsorise", "Menus combo"]),
        sortOrder: 3,
      },
      {
        id: "resto-4",
        name: "Douce Heure",
        description: "Gaufres, crepes, glaces et desserts a emporter.",
        categoryId: "dessert",
        categoryLabel: "Dessert",
        rating: 4.6,
        ratingCount: 189,
        deliveryMinutes: 16,
        deliveryFee: 500,
        isOpen: true,
        isPopular: false,
        isRecommended: true,
        isNearby: true,
        imageUrl:
          "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#FF6FB5",
        iconKey: "icecream_rounded",
        tags: JSON.stringify(["Sucre", "Ouvert tard"]),
        sortOrder: 4,
      },
      {
        id: "resto-5",
        name: "Saveurs du Terroir",
        description: "Plats africains, braises et recettes familiales.",
        categoryId: "african",
        categoryLabel: "Africain",
        rating: 4.8,
        ratingCount: 274,
        deliveryMinutes: 27,
        deliveryFee: 900,
        isOpen: false,
        isPopular: false,
        isRecommended: true,
        isNearby: false,
        imageUrl:
          "https://images.pexels.com/photos/139746/pexels-photo-139746.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#2E7D32",
        iconKey: "rice_bowl_rounded",
        tags: JSON.stringify(["Authentique", "Plats copieux"]),
        sortOrder: 5,
      },
      {
        id: "resto-6",
        name: "Fresh Corner",
        description: "Smoothies, bubble tea, boissons glacees et snacks.",
        categoryId: "drinks",
        categoryLabel: "Boissons",
        rating: 4.5,
        ratingCount: 144,
        deliveryMinutes: 14,
        deliveryFee: 400,
        isOpen: true,
        isPopular: false,
        isRecommended: false,
        isNearby: true,
        imageUrl:
          "https://images.pexels.com/photos/2983101/pexels-photo-2983101.jpeg?auto=compress&cs=tinysrgb&w=1200",
        accentColorHex: "#00ACC1",
        iconKey: "local_drink_rounded",
        tags: JSON.stringify(["Fraicheur", "Petit prix"]),
        sortOrder: 6,
      },
    ]);
  }

  if (productCount === 0) {
    await FoodHomeProduct.bulkCreate([
      {
        id: "prod-1",
        restaurantId: "resto-1",
        categoryId: "burger",
        name: "Double Smash Bacon",
        description: "Deux steaks smash, cheddar fondant, bacon grille et sauce maison.",
        imageUrl: "https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 4500,
        originalPrice: 5200,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Best seller", "Boeuf"]),
        sortOrder: 1,
      },
      {
        id: "prod-2",
        restaurantId: "resto-1",
        categoryId: "burger",
        name: "Burger Chicken Crispy",
        description: "Poulet croustillant, salade croquante et mayonnaise epicee.",
        imageUrl: "https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 3900,
        originalPrice: null,
        isAvailable: true,
        isPopular: false,
        tags: JSON.stringify(["Croustillant", "Nouveau"]),
        sortOrder: 2,
      },
      {
        id: "prod-3",
        restaurantId: "resto-2",
        categoryId: "pizza",
        name: "Pizza Regina",
        description: "Sauce tomate, jambon, champignons et mozzarella genereuse.",
        imageUrl: "https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 5800,
        originalPrice: null,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Classique", "Four a pierre"]),
        sortOrder: 1,
      },
      {
        id: "prod-4",
        restaurantId: "resto-2",
        categoryId: "pizza",
        name: "Pizza Pepperoni XXL",
        description: "Pepperoni, fromage filant et pate fine doree.",
        imageUrl: "https://images.pexels.com/photos/708587/pexels-photo-708587.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 7200,
        originalPrice: 8000,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Promo", "Famille"]),
        sortOrder: 2,
      },
      {
        id: "prod-5",
        restaurantId: "resto-3",
        categoryId: "chicken",
        name: "Bucket Mix 8 pieces",
        description: "Assortiment de poulet pane avec frites et sauce spicy.",
        imageUrl: "https://images.pexels.com/photos/4109111/pexels-photo-4109111.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 6900,
        originalPrice: null,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["A partager", "Sponsorise"]),
        sortOrder: 1,
      },
      {
        id: "prod-6",
        restaurantId: "resto-3",
        categoryId: "chicken",
        name: "Wrap Chicken Hot",
        description: "Wrap au poulet pane, crudites et sauce pimentee.",
        imageUrl: "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 3400,
        originalPrice: null,
        isAvailable: true,
        isPopular: false,
        tags: JSON.stringify(["Epicé", "Rapide"]),
        sortOrder: 2,
      },
      {
        id: "prod-7",
        restaurantId: "resto-4",
        categoryId: "dessert",
        name: "Crepe Chocolat Banane",
        description: "Crepe moelleuse garnie de chocolat noisette et banane fraiche.",
        imageUrl: "https://images.pexels.com/photos/376464/pexels-photo-376464.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 2800,
        originalPrice: null,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Dessert", "Sucre"]),
        sortOrder: 1,
      },
      {
        id: "prod-8",
        restaurantId: "resto-4",
        categoryId: "dessert",
        name: "Gaufre Caramel",
        description: "Gaufre tiede avec caramel beurre sale et eclats croustillants.",
        imageUrl: "https://images.pexels.com/photos/2135/food-france-morning-breakfast.jpg?auto=compress&cs=tinysrgb&w=1200",
        price: 2600,
        originalPrice: null,
        isAvailable: true,
        isPopular: false,
        tags: JSON.stringify(["Gourmand", "Dessert"]),
        sortOrder: 2,
      },
      {
        id: "prod-9",
        restaurantId: "resto-5",
        categoryId: "african",
        name: "Poulet braise attieke",
        description: "Poulet braise tendre accompagne d'attieke et legumes frais.",
        imageUrl: "https://images.pexels.com/photos/5710176/pexels-photo-5710176.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 5200,
        originalPrice: null,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Africain", "Copieux"]),
        sortOrder: 1,
      },
      {
        id: "prod-10",
        restaurantId: "resto-5",
        categoryId: "african",
        name: "Riz sauce arachide",
        description: "Riz parfumé servi avec sauce arachide maison et boeuf mijote.",
        imageUrl: "https://images.pexels.com/photos/5835353/pexels-photo-5835353.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 4700,
        originalPrice: null,
        isAvailable: false,
        isPopular: false,
        tags: JSON.stringify(["Tradition", "Savoureux"]),
        sortOrder: 2,
      },
      {
        id: "prod-11",
        restaurantId: "resto-6",
        categoryId: "drinks",
        name: "Smoothie Mangue Passion",
        description: "Mix tropical glace, mangue fraiche et touche de passion.",
        imageUrl: "https://images.pexels.com/photos/1337825/pexels-photo-1337825.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 2200,
        originalPrice: null,
        isAvailable: true,
        isPopular: true,
        tags: JSON.stringify(["Fraicheur", "Fruit"]),
        sortOrder: 1,
      },
      {
        id: "prod-12",
        restaurantId: "resto-6",
        categoryId: "drinks",
        name: "Bubble Tea Vanille",
        description: "Bubble tea cremeux avec perles moelleuses et vanille douce.",
        imageUrl: "https://images.pexels.com/photos/8805097/pexels-photo-8805097.jpeg?auto=compress&cs=tinysrgb&w=1200",
        price: 2600,
        originalPrice: 3000,
        isAvailable: true,
        isPopular: false,
        tags: JSON.stringify(["Boisson", "Tendance"]),
        sortOrder: 2,
      },
    ]);
  }
}

async function ensureOrderArchiveColumn() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Order";
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.isArchived) {
    await queryInterface.addColumn(tableName, "isArchived", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }
}

async function ensureOrderOtpColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Order";
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.completionOtp) {
    await queryInterface.addColumn(tableName, "completionOtp", {
      type: DataTypes.STRING(6),
      allowNull: false,
      defaultValue: "000000",
    });
  }

  if (!columns.completionOtpValidatedAt) {
    await queryInterface.addColumn(tableName, "completionOtpValidatedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }
}

async function ensureOrderRevenueColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Order";
  const columns = await queryInterface.describeTable(tableName);

  if (!columns.revenuePerDelivery) {
    await queryInterface.addColumn(tableName, "revenuePerDelivery", {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
  }

  if (!columns.platformCommission) {
    await queryInterface.addColumn(tableName, "platformCommission", {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
  }

  if (!columns.serviceFee) {
    await queryInterface.addColumn(tableName, "serviceFee", {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    });
  }
}

async function ensureOrderPricingColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Order";
  const columns = await queryInterface.describeTable(tableName);

  const addColumn = (name: string, definition: any) => {
    if (!columns[name]) {
      return queryInterface.addColumn(tableName, name, definition);
    }
    return Promise.resolve();
  };

  await addColumn("peakSurcharge", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("nightSurcharge", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("earlyMorningSurcharge", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("pricingSnapshotJson", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
  await addColumn("parcelNature", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await addColumn("packageDescription", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await addColumn("driverArrivedPickupAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumn("driverLeftPickupAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumn("waitingDurationSeconds", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("waitingBillableSeconds", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("waitingFee", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("cancelledAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await addColumn("cancelledBy", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumn("cancellationFee", {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
}

async function ensureFoodOrderColumns() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "Order";
  const columns = await queryInterface.describeTable(tableName);

  const addColumn = (name: string, definition: any) => {
    if (!columns[name]) {
      return queryInterface.addColumn(tableName, name, definition);
    }
    return Promise.resolve();
  };

  await addColumn("orderType", {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "mobility",
  });
  await addColumn("merchantId", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumn("merchantName", {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumn("itemCount", {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumn("foodOrderPayloadJson", {
    type: DataTypes.TEXT("long"),
    allowNull: true,
  });
}

async function ensurePricingRulesTable() {
  const queryInterface = sequelize.getQueryInterface();
  const tableName = "PricingRule";
  const tablesRaw = await queryInterface.showAllTables();
  const tables = tablesRaw.map((table: any) => (typeof table === "string" ? table : String(Object.values(table)[0] || "")));
  if (tables.includes(tableName)) {
    return;
  }
  await queryInterface.createTable(tableName, {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    countryId: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DEFAULT_COUNTRY_ID,
    },
    ruleType: {
      type: DataTypes.ENUM(
        "WAITING",
        "PEAK",
        "NIGHT",
        "EARLY_MORNING",
        "CANCELLATION_BEFORE_ARRIVAL",
        "CANCELLATION_AFTER_ARRIVAL"
      ),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    daysOfWeek: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    adjustmentType: {
      type: DataTypes.ENUM("PERCENTAGE", "FIXED", "PER_MINUTE"),
      allowNull: false,
    },
    adjustmentValue: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    freeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    fixedFee: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
}

async function ensureSupportSchema() {
  const queryInterface = sequelize.getQueryInterface();
  const ticketTable = "SupportTicket";
  const messageTable = "SupportTicketMessage";
  const categoryTable = "SupportTicketCategory";
  const ticketColumns = await queryInterface.describeTable(ticketTable);

  if (!ticketColumns.subject) {
    await queryInterface.addColumn(ticketTable, "subject", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }

  if (!ticketColumns.lastMessageAt) {
    await queryInterface.addColumn(ticketTable, "lastMessageAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
  }

  const allTablesRaw = await queryInterface.showAllTables();
  const allTables = allTablesRaw.map((item: any) =>
    typeof item === "string" ? item : String(Object.values(item)[0] || "")
  );

  if (!allTables.includes(messageTable)) {
    await queryInterface.createTable(messageTable, {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ticketId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: ticketTable, key: "id" },
        onDelete: "CASCADE",
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "User", key: "id" },
        onDelete: "CASCADE",
      },
      senderRole: {
        type: DataTypes.ENUM("usager", "livreur", "admin", "sous-admin"),
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
  }

  if (!allTables.includes(categoryTable)) {
    await queryInterface.createTable(categoryTable, {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
  }
}

async function ensureFoodCatalogSchema() {
  const queryInterface = sequelize.getQueryInterface();

  const restaurantColumns = await queryInterface.describeTable("FoodHomeRestaurant");
  if (!restaurantColumns.ownerUserId) {
    await queryInterface.addColumn("FoodHomeRestaurant", "ownerUserId", {
      type: DataTypes.UUID,
      allowNull: true,
    });
  }

  const categoryColumns = await queryInterface.describeTable("FoodHomeCategory");
  if (!categoryColumns.restaurantId) {
    await queryInterface.addColumn("FoodHomeCategory", "restaurantId", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!categoryColumns.isActive) {
    await queryInterface.addColumn("FoodHomeCategory", "isActive", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

  const productColumns = await queryInterface.describeTable("FoodHomeProduct");
  if (!productColumns.categoryId) {
    await queryInterface.addColumn("FoodHomeProduct", "categoryId", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  }
  if (!productColumns.isActive) {
    await queryInterface.addColumn("FoodHomeProduct", "isActive", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  }

}

async function seedSupportTicketCategories() {
  const existingCount = await SupportTicketCategory.count();
  if (existingCount > 0) return;

  await SupportTicketCategory.bulkCreate([
    { name: "Paiement", description: "Problemes de paiement ou remboursement.", sortOrder: 1, isActive: true },
    { name: "Course", description: "Incident sur une course ou une livraison.", sortOrder: 2, isActive: true },
    { name: "Compte", description: "Problemes de compte, connexion ou profil.", sortOrder: 3, isActive: true },
    { name: "Support technique", description: "Anomalies techniques et bugs.", sortOrder: 4, isActive: true },
  ]);
}

async function ensureVehicleTypeConfig(code: string, countryId: string = DEFAULT_COUNTRY_ID) {
  const normalizedCode = String(code ?? "").trim().toLowerCase();
  if (!normalizedCode) return;

  const pricing = await VehiclePricingConfig.findOne({ where: { vehicleType: normalizedCode, countryId } });
  if (!pricing) {
    await VehiclePricingConfig.create({
      countryId,
      vehicleType: normalizedCode,
      baseFare: 0,
      perKmRate: 0,
      perMinuteRate: 0,
      bookingFee: 0,
      minimumFare: 0,
    });
  }

  const revenue = await DriverRevenueConfig.findOne({ where: { vehicleType: normalizedCode, countryId } });
  if (!revenue) {
    await DriverRevenueConfig.create({
      countryId,
      vehicleType: normalizedCode,
      baseFare: 0,
      perKmRate: 0,
      perMinuteRate: 0,
      commissionPercent: 25,
      serviceFeePercent: 5,
    });
  }
}

async function seedVehicleTypes() {
  const defaults = [
    { code: "moto", name: "Moto", iconKey: "two_wheeler_rounded", sortOrder: 1, isActive: true },
    { code: "tricycle", name: "Tricycle", iconKey: "electric_rickshaw_rounded", sortOrder: 2, isActive: true },
    { code: "voiture", name: "Voiture", iconKey: "directions_car_filled_rounded", sortOrder: 3, isActive: true },
  ];

  for (const item of defaults) {
    const existing = await VehicleType.findOne({ where: { code: item.code, countryId: DEFAULT_COUNTRY_ID } });
    if (!existing) {
      await VehicleType.create({ ...item, countryId: DEFAULT_COUNTRY_ID });
    } else {
      let changed = false;
      if (!String(existing.get("name") || "").trim()) {
        existing.set("name", item.name);
        changed = true;
      }
      if (!String(existing.get("iconKey") || "").trim()) {
        existing.set("iconKey", item.iconKey);
        changed = true;
      }
      if (Number(existing.get("sortOrder") ?? 0) === 0 && item.sortOrder > 0) {
        existing.set("sortOrder", item.sortOrder);
        changed = true;
      }
      if (changed) await existing.save();
    }

    await ensureVehicleTypeConfig(item.code, DEFAULT_COUNTRY_ID);
  }
}

async function seedDefaultAdmin() {
  const email = "admin@admin.com";
  const password = "password";
  const phone = "0000000000";
  const name = "Admin";

  const existing = await User.findOne({ where: { email } });
  if (existing) return;

  const hashedPassword = await bcrypt.hash(password, 10);
  await User.create({
    countryId: DEFAULT_COUNTRY_ID,
    email,
    phone,
    name,
    password: hashedPassword,
    role: "admin",
    isActive: true,
    accountStatus: "active",
  });

  console.log("Default admin created:", email);
}

function getSettingsEntryValue(entry: unknown) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    return String((entry as Record<string, unknown>).value ?? "").trim();
  }
  return String(entry ?? "").trim();
}

function getSettingsEntryIcon(entry: unknown) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "";
  return String((entry as Record<string, unknown>).icon ?? "").trim();
}

async function ensureDefaultAppSettings() {
  const defaultSettings: Array<{
    section: "contact" | "about" | "operations";
    content: Record<string, any>;
  }> = [
      {
        section: "contact",
        content: {
          telephone: { value: "(229) 01 95 62 19 19", icon: "phone_outlined" },
          email: { value: "akasi-group@akasigroup.com", icon: "email_outlined" },
          adresse: {
            value: "Lot 3151G, Agla Cotonou, 4eme batiment, derriere le Commissariat Agla, les pilones",
            icon: "location_on_outlined",
          },
        },
      },
      {
        section: "about",
        content: {
          mission: {
            value: "Aider les livreurs a travailler plus efficacement avec des outils simples et fiables au quotidien.",
            icon: "track_changes_outlined",
          },
          fiabilite: {
            value: "Les informations de courses et de revenus sont synchronisees pour garder une vision claire de vos performances.",
            icon: "verified_user_outlined",
          },
          version: { value: "1.0.0", icon: "info_outline" },
        },
      },
      {
        section: "operations",
        content: {
          deliveryDistanceKm: "10",
          driverLocationDistanceKm: "2",
        },
      },
    ];

  for (const item of defaultSettings) {
    const row = await AppSettings.findOne({ where: { section: item.section } });
    if (!row) {
      await AppSettings.create({
        section: item.section,
        content: item.content,
      });
      continue;
    }

    const currentContent = normalizeSettingsContent(row.get("content"));
    const mergedContent: Record<string, any> = { ...currentContent };

    for (const [key, defaultValue] of Object.entries(item.content)) {
      const currentValue = currentContent[key];
      if (item.section === "operations") {
        mergedContent[key] = getSettingsEntryValue(currentValue) || String(defaultValue ?? "").trim();
        continue;
      }

      const dynamicDefault = defaultValue as { value: string; icon?: string };
      const value = getSettingsEntryValue(currentValue) || dynamicDefault.value;
      const icon = getSettingsEntryIcon(currentValue) || String(dynamicDefault.icon ?? "").trim();
      mergedContent[key] = icon ? { value, icon } : { value };
    }

    if (item.section === "about") {
      if (!getSettingsEntryValue(currentContent.mission) && getSettingsEntryValue(currentContent["notre mission"])) {
        mergedContent.mission = {
          value: getSettingsEntryValue(currentContent["notre mission"]),
          icon: getSettingsEntryIcon(currentContent.mission) || "track_changes_outlined",
        };
      }
      if (!String(currentContent.fiabilite ?? "").trim() && String(currentContent["fiabilité"] ?? "").trim()) {
        mergedContent.fiabilite = String(currentContent["fiabilité"]);
      }
      delete (mergedContent as any)["notre mission"];
      delete (mergedContent as any)["fiabilité"];
    }

    for (const [key, value] of Object.entries(item.content)) {
      const currentValue = String(mergedContent[key] ?? "").trim();
      if (!currentValue) {
        mergedContent[key] = value;
      }
    }

    if (JSON.stringify(currentContent) !== JSON.stringify(mergedContent)) {
      row.set("content", mergedContent);
      await row.save();
    }
  }
}


// async function resetDatabase() {
//   try {
//     // ATTENTION : force: true supprime toutes les données !
//     await sequelize.sync({ force: true });
//     console.log("✅ Base de données réinitialisée et tables recréées !");
//   } catch (error) {
//     console.error("❌ Erreur lors de la réinitialisation :", error);
//   }
// }

// resetDatabase();
