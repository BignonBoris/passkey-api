import { Request, Response } from "express";
import { Op, WhereOptions } from "sequelize";
import bcrypt from "bcrypt";
import Order from "../../models/order.model";
import Payment from "../../models/payment.model";
import FoodHomeCategory from "../../models/food-home-category.model";
import FoodHomeProduct from "../../models/food-home-product.model";
import FoodHomePromo from "../../models/food-home-promo.model";
import FoodHomeRestaurant from "../../models/food-home-restaurant.model";
import User from "../../models/user.model";
import UserAddress from "../../models/user-address.model";
import { AuthenticatedRequest } from "../../types/auth-request";

function buildPublicUploadUrl(req: Request, folder: string, storedName: string) {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/uploads/${folder}/${storedName}`;
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean);
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch (_error) {
    return [];
  }
}

function serializeRestaurant(restaurant: FoodHomeRestaurant) {
  return {
    id: restaurant.get("id"),
    ownerUserId: restaurant.get("ownerUserId"),
    name: restaurant.get("name"),
    description: restaurant.get("description"),
    categoryId: restaurant.get("categoryId"),
    categoryLabel: restaurant.get("categoryLabel"),
    rating: restaurant.get("rating"),
    ratingCount: restaurant.get("ratingCount"),
    deliveryMinutes: restaurant.get("deliveryMinutes"),
    deliveryFee: restaurant.get("deliveryFee"),
    isOpen: restaurant.get("isOpen"),
    isPopular: restaurant.get("isPopular"),
    isRecommended: restaurant.get("isRecommended"),
    isNearby: restaurant.get("isNearby"),
    imageUrl: restaurant.get("imageUrl"),
    accentColor: restaurant.get("accentColorHex"),
    icon: restaurant.get("iconKey"),
    tags: parseTags(restaurant.get("tags")),
    sortOrder: Number(restaurant.get("sortOrder") || 0),
    isActive: restaurant.get("isActive") !== false,
  };
}

function serializeManager(user: User | null) {
  if (!user) return null;
  return {
    id: String(user.get("id")),
    name: String(user.get("name") || "").trim(),
    phone: String(user.get("phone") || "").trim(),
    email: String(user.get("email") || "").trim(),
    role: String(user.get("role") || "").trim(),
    isActive: user.get("isActive") === true,
  };
}

function serializeProduct(product: FoodHomeProduct) {
  return {
    id: product.get("id"),
    restaurantId: product.get("restaurantId"),
    categoryId: product.get("categoryId"),
    name: product.get("name"),
    description: product.get("description"),
    imageUrl: product.get("imageUrl"),
    price: product.get("price"),
    originalPrice: product.get("originalPrice"),
    isAvailable: product.get("isAvailable"),
    isPopular: product.get("isPopular"),
    isActive: product.get("isActive") !== false,
    tags: parseTags(product.get("tags")),
  };
}

function serializeCategory(category: FoodHomeCategory) {
  return {
    id: category.get("id"),
    restaurantId: category.get("restaurantId"),
    name: category.get("name"),
    icon: category.get("iconKey"),
    color: category.get("colorHex"),
    sortOrder: Number(category.get("sortOrder") || 0),
    isActive: category.get("isActive") !== false,
  };
}

function buildFoodId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugifyRestaurantName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "restaurant";
}

function generateRestaurantManagerPassword() {
  return `PkResto!${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function buildUniqueRestaurantManagerEmail(baseName: string) {
  const base = slugifyRestaurantName(baseName);
  let attempt = 0;
  while (attempt < 50) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const email = `${base}${suffix}@restaurant.passkey.local`;
    const exists = await User.findOne({ where: { email } });
    if (!exists) return email;
    attempt += 1;
  }
  return `${base}-${Date.now()}@restaurant.passkey.local`;
}

async function buildUniqueRestaurantManagerPhone() {
  let attempt = 0;
  while (attempt < 50) {
    const phone = `970${Date.now().toString().slice(-6)}${attempt}`;
    const exists = await User.findOne({ where: { phone } });
    if (!exists) return phone;
    attempt += 1;
  }
  return `971${Date.now().toString().slice(-7)}`;
}

async function ensureRestaurantManagerAccount(options: {
  restaurantName: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
  managerPassword?: string;
}) {
  const managerName = String(options.managerName || `${options.restaurantName} Manager`).trim();
  const managerEmail = String(options.managerEmail || "").trim().toLowerCase() ||
    await buildUniqueRestaurantManagerEmail(options.restaurantName);
  const managerPhone = String(options.managerPhone || "").trim() || await buildUniqueRestaurantManagerPhone();
  const managerPassword = String(options.managerPassword || "").trim() || generateRestaurantManagerPassword();

  const existingEmail = await User.findOne({ where: { email: managerEmail } });
  if (existingEmail) {
    throw new Error("L'email du gestionnaire est déjà utilisé.");
  }
  const existingPhone = await User.findOne({ where: { phone: managerPhone } });
  if (existingPhone) {
    throw new Error("Le numéro du gestionnaire est déjà utilisé.");
  }

  const manager = await User.create({
    name: managerName,
    phone: managerPhone,
    email: managerEmail,
    password: await bcrypt.hash(managerPassword, 10),
    role: "restaurant",
    isActive: true,
    accountStatus: "active",
  } as any);

  return {
    manager,
    plainPassword: managerPassword,
  };
}

function isPrivilegedFoodRole(role?: string) {
  return role === "admin" || role === "sous-admin";
}

async function resolveManagedRestaurant(req: AuthenticatedRequest, restaurantId: string) {
  const restaurant = await FoodHomeRestaurant.findByPk(restaurantId);
  if (!restaurant) return null;
  const role = req.user?.role;
  const userId = req.user?.id;
  if (isPrivilegedFoodRole(role)) return restaurant;
  if (role === "restaurant" && String(restaurant.get("ownerUserId") || "") === String(userId || "")) {
    return restaurant;
  }
  return null;
}

function generateCompletionOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function parseJsonObject(raw: unknown) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch (_error) {
    return null;
  }
}

function mapFoodOrderStatus(status: string) {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
      return "DELIVERED";
    case "IN_TRANSIT":
    case "PICKED_UP":
    case "DRIVER_LEFT_PICKUP":
    case "DRIVER_ARRIVED_PICKUP":
    case "DRIVER_ASSIGNED":
      return "ON_THE_WAY";
    case "ACCEPTED":
      return "PREPARING";
    case "CANCELLED":
      return "CANCELLED";
    case "PENDING":
    default:
      return "PENDING";
  }
}

function serializePayment(payment: Payment | null) {
  if (!payment) return null;
  return {
    id: String(payment.get("id")),
    orderId: String(payment.get("orderId")),
    amount: Number(payment.get("amount") || 0),
    currency: String(payment.get("currency") || "XOF"),
    status: String(payment.get("status") || "PENDING"),
    method: String(payment.get("method") || "CASH"),
    provider: payment.get("provider"),
    checkoutUrl: payment.get("checkoutUrl"),
    paidAt: payment.get("paidAt"),
    createdAt: payment.get("createdAt"),
    updatedAt: payment.get("updatedAt"),
  };
}

function serializeFoodOrder(
  order: Order,
  options?: {
    restaurant?: FoodHomeRestaurant | null;
    payment?: Payment | null;
    address?: UserAddress | null;
    driver?: User | null;
  }
) {
  const payload = parseJsonObject(order.get("foodOrderPayloadJson")) || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const restaurant =
    options?.restaurant ||
    (payload.restaurant && typeof payload.restaurant === "object"
      ? payload.restaurant
      : null);
  const address =
    options?.address
      ? {
          id: String(options.address.get("id")),
          label: String(options.address.get("label") || ""),
          mapLabel: String(options.address.get("mapLabel") || ""),
          latitude: Number(options.address.get("latitude") || 0),
          longitude: Number(options.address.get("longitude") || 0),
        }
      : payload.address ?? null;
  const payment = options?.payment ? serializePayment(options.payment) : payload.payment ?? null;
  const driver = options?.driver
    ? {
        id: String(options.driver.get("id")),
        name: String(options.driver.get("name") || "").trim() || "Livreur PassKey",
        phone: String(options.driver.get("phone") || "").trim(),
      }
    : payload.driver ?? {
        id: null,
        name: "Livreur PassKey",
        phone: "",
      };

  return {
    id: String(order.get("id")),
    orderType: String(order.get("orderType") || "food"),
    status: String(order.get("status") || "PENDING"),
    foodStatus: mapFoodOrderStatus(String(order.get("status") || "PENDING")),
    createdAt: order.get("createdAt"),
    updatedAt: order.get("updatedAt"),
    itemCount: Number(order.get("itemCount") || items.length || 0),
    subtotal: Number(payload.subtotal || 0),
    deliveryFee: Number(order.get("platformCommission") || 0),
    serviceFee: Number(order.get("serviceFee") || 0),
    total: Number(order.get("price") || 0),
    estimatedDeliveryMinutes: Number(payload.estimatedDeliveryMinutes || 0),
    pickupAddress: String(order.get("pickupAddress") || ""),
    destinationAddress: String(order.get("destinationAddress") || ""),
    restaurant,
    items,
    address,
    payment,
    driver,
    completionOtp: String(order.get("completionOtp") || ""),
  };
}

export async function getFoodHomeFeed(_req: Request, res: Response) {
  try {
    const [promos, categories, restaurants] = await Promise.all([
      FoodHomePromo.findAll({
        where: { isActive: true },
        order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      }),
      FoodHomeCategory.findAll({
        where: {
          restaurantId: null,
          isActive: true,
        },
        order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      }),
      FoodHomeRestaurant.findAll({
        where: { isActive: true },
        order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        promos: promos.map((promo) => ({
          id: promo.get("id"),
          title: promo.get("title"),
          subtitle: promo.get("subtitle"),
          ctaLabel: promo.get("ctaLabel"),
          imageUrl: promo.get("imageUrl"),
          colors: [promo.get("primaryColorHex"), promo.get("secondaryColorHex")],
          icon: promo.get("iconKey"),
        })),
        categories: categories.map((category) => ({
          id: category.get("id"),
          name: category.get("name"),
          icon: category.get("iconKey"),
          color: category.get("colorHex"),
        })),
        restaurants: restaurants.map(serializeRestaurant),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load home feed",
    });
  }
}

export async function searchFoodCatalog(req: Request, res: Response) {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) {
      return res.status(200).json({
        success: true,
        data: {
          restaurants: [],
          products: [],
        },
      });
    }

    const searchFilter = {
      [Op.or]: [
        { name: { [Op.like]: `%${query}%` } },
        { description: { [Op.like]: `%${query}%` } },
        { categoryLabel: { [Op.like]: `%${query}%` } },
        { tags: { [Op.like]: `%${query}%` } },
      ],
    };

    const [restaurants, products] = await Promise.all([
      FoodHomeRestaurant.findAll({
        where: {
          isActive: true,
          ...searchFilter,
        },
        order: [["isPopular", "DESC"], ["rating", "DESC"], ["sortOrder", "ASC"]],
        limit: 12,
      }),
      FoodHomeProduct.findAll({
        where: {
          isActive: true,
          isAvailable: true,
          [Op.or]: [
            { name: { [Op.like]: `%${query}%` } },
            { description: { [Op.like]: `%${query}%` } },
            { tags: { [Op.like]: `%${query}%` } },
          ],
        },
        order: [["isPopular", "DESC"], ["sortOrder", "ASC"]],
        limit: 12,
      }),
    ]);

    const restaurantIds = products.map((product) => String(product.get("restaurantId")));
    const relatedRestaurants = restaurantIds.length
      ? await FoodHomeRestaurant.findAll({ where: { id: { [Op.in]: restaurantIds } } })
      : [];
    const restaurantMap = new Map(
      relatedRestaurants.map((restaurant) => [String(restaurant.get("id")), serializeRestaurant(restaurant)])
    );

    return res.status(200).json({
      success: true,
      data: {
        restaurants: restaurants.map(serializeRestaurant),
        products: products.map((product) => ({
          ...serializeProduct(product),
          restaurant: restaurantMap.get(String(product.get("restaurantId"))) ?? null,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to search catalog",
    });
  }
}

export async function listFoodRestaurants(req: Request, res: Response) {
  try {
    const query = String(req.query.q || "").trim();
    const categoryId = String(req.query.categoryId || "").trim();
    const section = String(req.query.section || "").trim();

    const where: WhereOptions = { isActive: true };

    if (query) {
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${query}%` } },
          { description: { [Op.like]: `%${query}%` } },
          { categoryLabel: { [Op.like]: `%${query}%` } },
          { tags: { [Op.like]: `%${query}%` } },
        ],
      });
    }

    if (categoryId) {
      Object.assign(where, { categoryId });
    }

    if (section === "popular") Object.assign(where, { isPopular: true });
    if (section === "nearby") Object.assign(where, { isNearby: true });
    if (section === "recommended") Object.assign(where, { isRecommended: true });
    if (section === "open") Object.assign(where, { isOpen: true });

    const restaurants = await FoodHomeRestaurant.findAll({
      where,
      order: [["isPopular", "DESC"], ["rating", "DESC"], ["sortOrder", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants.map(serializeRestaurant),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to list restaurants",
    });
  }
}

export async function getFoodRestaurantDetail(req: Request, res: Response) {
  try {
    const restaurant = await FoodHomeRestaurant.findByPk(req.params.id);
    if (!restaurant || !restaurant.get("isActive")) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const products = await FoodHomeProduct.findAll({
      where: { restaurantId: req.params.id, isActive: true },
      order: [["isPopular", "DESC"], ["sortOrder", "ASC"]],
    });

    return res.status(200).json({
      success: true,
      data: {
        ...serializeRestaurant(restaurant),
        products: products.map(serializeProduct),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load restaurant detail",
    });
  }
}

export async function listFoodProducts(req: Request, res: Response) {
  try {
    const query = String(req.query.q || "").trim();
    const categoryId = String(req.query.categoryId || "").trim();
    const restaurantId = String(req.query.restaurantId || "").trim();

    const where: WhereOptions = {
      isActive: true,
      isAvailable: true,
    };

    if (query) {
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${query}%` } },
          { description: { [Op.like]: `%${query}%` } },
          { tags: { [Op.like]: `%${query}%` } },
        ],
      });
    }

    if (categoryId) {
      Object.assign(where, { categoryId });
    }

    if (restaurantId) {
      Object.assign(where, { restaurantId });
    }

    const products = await FoodHomeProduct.findAll({
      where,
      order: [["isPopular", "DESC"], ["sortOrder", "ASC"], ["createdAt", "DESC"]],
    });

    const restaurantIds = [...new Set(products.map((product) => String(product.get("restaurantId"))))];
    const restaurants = restaurantIds.length
        ? await FoodHomeRestaurant.findAll({
            where: {
              id: { [Op.in]: restaurantIds },
              isActive: true,
            },
          })
        : [];
    const restaurantMap = new Map(
      restaurants.map((restaurant) => [String(restaurant.get("id")), serializeRestaurant(restaurant)])
    );

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products.map((product) => ({
        ...serializeProduct(product),
        restaurant: restaurantMap.get(String(product.get("restaurantId"))) ?? null,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to list products",
    });
  }
}

export async function getFoodProductDetail(req: Request, res: Response) {
  try {
    const product = await FoodHomeProduct.findByPk(req.params.id);
    if (!product || product.get("isActive") === false) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const restaurant = await FoodHomeRestaurant.findByPk(String(product.get("restaurantId")));
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...serializeProduct(product),
        restaurant: serializeRestaurant(restaurant),
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load product detail",
    });
  }
}

export async function listManagedRestaurants(req: AuthenticatedRequest, res: Response) {
  try {
    const role = req.user?.role;
    const userId = req.user?.id;
    if (!role || !userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const where: WhereOptions = {};
    if (!isPrivilegedFoodRole(role)) {
      if (role !== "restaurant") {
        return res.status(403).json({ success: false, message: "Acces refuse" });
      }
      Object.assign(where, { ownerUserId: userId });
    }

    const restaurants = await FoodHomeRestaurant.findAll({
      where,
      order: [["sortOrder", "ASC"], ["createdAt", "DESC"]],
    });
    const ownerIds = restaurants
      .map((restaurant) => String(restaurant.get("ownerUserId") || "").trim())
      .filter(Boolean);
    const owners = ownerIds.length
      ? await User.findAll({ where: { id: { [Op.in]: ownerIds } } })
      : [];
    const ownerMap = new Map(owners.map((owner) => [String(owner.get("id")), owner]));

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants.map((restaurant) => ({
        ...serializeRestaurant(restaurant),
        ownerUserId: restaurant.get("ownerUserId"),
        manager: serializeManager(ownerMap.get(String(restaurant.get("ownerUserId") || "")) || null),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load restaurants" });
  }
}

export async function uploadFoodMedia(req: AuthenticatedRequest, res: Response) {
  try {
    const role = req.user?.role;
    if (!role || (role !== "restaurant" && !isPrivilegedFoodRole(role))) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const file = (req as any).file as { filename?: string } | undefined;
    if (!file?.filename) {
      return res.status(400).json({ success: false, message: "Image file is required" });
    }

    return res.status(200).json({
      success: true,
      data: {
        fileName: file.filename,
        url: buildPublicUploadUrl(req, "food-media", file.filename),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to upload image" });
  }
}

export async function createManagedRestaurant(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isPrivilegedFoodRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const categoryId = String(req.body?.categoryId || "restaurant").trim();
    const categoryLabel = String(req.body?.categoryLabel || "Restaurant").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const accentColor = String(req.body?.accentColor || "#0D47A1").trim();
    const icon = String(req.body?.icon || "restaurant_rounded").trim();
    const deliveryMinutes = Math.max(5, Number(req.body?.deliveryMinutes || 25));
    const deliveryFee = Math.max(0, Number(req.body?.deliveryFee || 0));
    const managerEmail = String(req.body?.managerEmail || "").trim().toLowerCase();
    const managerPhone = String(req.body?.managerPhone || "").trim();
    const managerPassword = String(req.body?.managerPassword || "").trim();
    const managerName = String(req.body?.managerName || name).trim();

    if (!name || !description || !managerEmail || !managerPhone || managerPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Restaurant and manager fields are required" });
    }

    const { manager, plainPassword } = await ensureRestaurantManagerAccount({
      restaurantName: name,
      managerName,
      managerEmail,
      managerPhone,
      managerPassword,
    });

    const restaurant = await FoodHomeRestaurant.create({
      id: buildFoodId("resto"),
      ownerUserId: String(manager.get("id")),
      name,
      description,
      categoryId,
      categoryLabel,
      rating: 0,
      ratingCount: 0,
      deliveryMinutes,
      deliveryFee,
      isOpen: req.body?.isOpen !== false,
      isPopular: req.body?.isPopular === true,
      isRecommended: req.body?.isRecommended === true,
      isNearby: req.body?.isNearby === true,
      imageUrl: imageUrl || "https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=1200",
      accentColorHex: accentColor,
      iconKey: icon,
      tags: JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
      sortOrder: Number(req.body?.sortOrder || 0),
      isActive: req.body?.isActive !== false,
    } as any);

    return res.status(201).json({
      success: true,
      message: "Restaurant created",
      data: {
        ...serializeRestaurant(restaurant),
        ownerUserId: restaurant.get("ownerUserId"),
        manager: {
          id: manager.get("id"),
          name: manager.get("name"),
          phone: manager.get("phone"),
          email: manager.get("email"),
          role: manager.get("role"),
          plainPassword,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create restaurant" });
  }
}

export async function updateManagedRestaurant(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.id || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const updates: Record<string, any> = {};
    const fields = [
      ["name", "name"],
      ["description", "description"],
      ["categoryId", "categoryId"],
      ["categoryLabel", "categoryLabel"],
      ["imageUrl", "imageUrl"],
      ["accentColor", "accentColorHex"],
      ["icon", "iconKey"],
    ] as const;
    for (const [input, field] of fields) {
      if (typeof req.body?.[input] === "string") updates[field] = String(req.body[input]).trim();
    }
    if (typeof req.body?.deliveryMinutes !== "undefined") updates.deliveryMinutes = Math.max(5, Number(req.body.deliveryMinutes || 0));
    if (typeof req.body?.deliveryFee !== "undefined") updates.deliveryFee = Math.max(0, Number(req.body.deliveryFee || 0));
    if (typeof req.body?.sortOrder !== "undefined") updates.sortOrder = Number(req.body.sortOrder || 0);
    if (typeof req.body?.isOpen === "boolean") updates.isOpen = req.body.isOpen;
    if (typeof req.body?.isPopular === "boolean") updates.isPopular = req.body.isPopular;
    if (typeof req.body?.isRecommended === "boolean") updates.isRecommended = req.body.isRecommended;
    if (typeof req.body?.isNearby === "boolean") updates.isNearby = req.body.isNearby;
    if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;
    if (Array.isArray(req.body?.tags)) updates.tags = JSON.stringify(req.body.tags);

    restaurant.set(updates);
    await restaurant.save();

    return res.status(200).json({
      success: true,
      message: "Restaurant updated",
      data: {
        ...serializeRestaurant(restaurant),
        ownerUserId: restaurant.get("ownerUserId"),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update restaurant" });
  }
}

export async function assignRestaurantManager(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isPrivilegedFoodRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const restaurant = await FoodHomeRestaurant.findByPk(String(req.params.id || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const managerEmail = String(req.body?.managerEmail || "").trim().toLowerCase();
    if (!managerEmail) {
      return res.status(400).json({ success: false, message: "managerEmail is required" });
    }

    const manager = await User.findOne({ where: { email: managerEmail } });
    if (!manager) {
      return res.status(404).json({ success: false, message: "Manager not found" });
    }

    manager.set({
      role: "restaurant",
      isActive: true,
      accountStatus: "active",
    });
    await manager.save();

    restaurant.set("ownerUserId", String(manager.get("id")));
    await restaurant.save();

    return res.status(200).json({
      success: true,
      message: "Manager assigned",
      data: {
        ...serializeRestaurant(restaurant),
        ownerUserId: restaurant.get("ownerUserId"),
        manager: serializeManager(manager),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to assign manager" });
  }
}

export async function ensureRestaurantManagers(req: AuthenticatedRequest, res: Response) {
  try {
    if (!isPrivilegedFoodRole(req.user?.role)) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const restaurants = await FoodHomeRestaurant.findAll({
      order: [["createdAt", "ASC"]],
    });

    const ownerIds = restaurants
      .map((restaurant) => String(restaurant.get("ownerUserId") || "").trim())
      .filter(Boolean);
    const existingOwners = ownerIds.length
      ? await User.findAll({ where: { id: { [Op.in]: ownerIds } } })
      : [];
    const ownerMap = new Map(existingOwners.map((owner) => [String(owner.get("id")), owner]));

    const created: Array<Record<string, any>> = [];

    for (const restaurant of restaurants) {
      const ownerId = String(restaurant.get("ownerUserId") || "").trim();
      if (ownerId && ownerMap.has(ownerId)) {
        continue;
      }

      const { manager, plainPassword } = await ensureRestaurantManagerAccount({
        restaurantName: String(restaurant.get("name") || "Restaurant"),
      });

      restaurant.set("ownerUserId", String(manager.get("id")));
      await restaurant.save();

      created.push({
        restaurantId: String(restaurant.get("id")),
        restaurantName: String(restaurant.get("name") || ""),
        manager: {
          ...serializeManager(manager),
          plainPassword,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: created.length ? "Managers created" : "All restaurants already have managers",
      count: created.length,
      data: created,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to ensure managers" });
  }
}

export async function listManagedCategories(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const categories = await FoodHomeCategory.findAll({
      where: {
        [Op.or]: [
          { restaurantId: String(restaurant.get("id")) },
          { restaurantId: null },
        ],
      },
      order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
    });
    return res.status(200).json({
      success: true,
      count: categories.length,
      data: categories.map(serializeCategory),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load categories" });
  }
}

export async function createManagedCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Category Le nom est requis" });
    }
    const category = await FoodHomeCategory.create({
      id: buildFoodId("cat"),
      restaurantId: String(restaurant.get("id")),
      name,
      iconKey: String(req.body?.icon || "restaurant_rounded").trim() || "restaurant_rounded",
      colorHex: String(req.body?.color || "#0D47A1").trim() || "#0D47A1",
      sortOrder: Number(req.body?.sortOrder || 0),
      isActive: true,
    } as any);
    return res.status(201).json({
      success: true,
      message: "Category created",
      data: serializeCategory(category),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create category" });
  }
}

export async function updateManagedCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const category = await FoodHomeCategory.findOne({
      where: { id: String(req.params.categoryId || "").trim(), restaurantId: String(restaurant.get("id")) },
    });
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    if (typeof req.body?.name === "string") category.set("name", String(req.body.name).trim());
    if (typeof req.body?.icon === "string") category.set("iconKey", String(req.body.icon).trim());
    if (typeof req.body?.color === "string") category.set("colorHex", String(req.body.color).trim());
    if (typeof req.body?.sortOrder !== "undefined") category.set("sortOrder", Number(req.body.sortOrder || 0));
    if (typeof req.body?.isActive === "boolean") category.set("isActive", req.body.isActive);
    await category.save();
    return res.status(200).json({
      success: true,
      message: "Category updated",
      data: serializeCategory(category),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update category" });
  }
}

export async function deleteManagedCategory(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const categoryId = String(req.params.categoryId || "").trim();
    const productCount = await FoodHomeProduct.count({
      where: { restaurantId: String(restaurant.get("id")), categoryId, isActive: true },
    });
    if (productCount > 0) {
      return res.status(400).json({ success: false, message: "Category still used by products" });
    }
    const archived = await FoodHomeCategory.update(
      { isActive: false },
      { where: { id: categoryId, restaurantId: String(restaurant.get("id")) } }
    );
    if (!archived[0]) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }
    return res.status(200).json({ success: true, message: "Category archived" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to archive category" });
  }
}

export async function listManagedProducts(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const products = await FoodHomeProduct.findAll({
      where: { restaurantId: String(restaurant.get("id")) },
      order: [["isActive", "DESC"], ["sortOrder", "ASC"], ["createdAt", "ASC"]],
    });
    return res.status(200).json({
      success: true,
      count: products.length,
      data: products.map(serializeProduct),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load products" });
  }
}

export async function createManagedProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Product Le nom est requis" });
    }
    const product = await FoodHomeProduct.create({
      id: buildFoodId("prod"),
      restaurantId: String(restaurant.get("id")),
      categoryId: String(req.body?.categoryId || "").trim() || null,
      name,
      description: String(req.body?.description || "").trim(),
      imageUrl: String(req.body?.imageUrl || "").trim() || "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200",
      price: Math.max(0, Number(req.body?.price || 0)),
      originalPrice: req.body?.originalPrice ? Number(req.body.originalPrice) : null,
      isAvailable: req.body?.isAvailable !== false,
      isPopular: req.body?.isPopular === true,
      isActive: req.body?.isActive !== false,
      tags: JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []),
      sortOrder: Number(req.body?.sortOrder || 0),
    } as any);
    return res.status(201).json({
      success: true,
      message: "Product created",
      data: serializeProduct(product),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create product" });
  }
}

export async function updateManagedProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const product = await FoodHomeProduct.findOne({
      where: { id: String(req.params.productId || "").trim(), restaurantId: String(restaurant.get("id")) },
    });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const stringFields = [
      ["name", "name"],
      ["description", "description"],
      ["imageUrl", "imageUrl"],
      ["categoryId", "categoryId"],
    ] as const;
    for (const [input, field] of stringFields) {
      if (typeof req.body?.[input] === "string") product.set(field, String(req.body[input]).trim() || null);
    }
    if (typeof req.body?.price !== "undefined") product.set("price", Math.max(0, Number(req.body.price || 0)));
    if (typeof req.body?.originalPrice !== "undefined") {
      product.set("originalPrice", req.body.originalPrice ? Number(req.body.originalPrice) : null);
    }
    if (typeof req.body?.isAvailable === "boolean") product.set("isAvailable", req.body.isAvailable);
    if (typeof req.body?.isPopular === "boolean") product.set("isPopular", req.body.isPopular);
    if (typeof req.body?.isActive === "boolean") product.set("isActive", req.body.isActive);
    if (typeof req.body?.sortOrder !== "undefined") product.set("sortOrder", Number(req.body.sortOrder || 0));
    if (Array.isArray(req.body?.tags)) product.set("tags", JSON.stringify(req.body.tags));
    await product.save();
    return res.status(200).json({
      success: true,
      message: "Product updated",
      data: serializeProduct(product),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update product" });
  }
}

export async function deleteManagedProduct(req: AuthenticatedRequest, res: Response) {
  try {
    const restaurant = await resolveManagedRestaurant(req, String(req.params.restaurantId || "").trim());
    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }
    const archived = await FoodHomeProduct.update(
      { isActive: false },
      { where: { id: String(req.params.productId || "").trim(), restaurantId: String(restaurant.get("id")) } }
    );
    if (!archived[0]) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    return res.status(200).json({ success: true, message: "Product archived" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to archive product" });
  }
}

export async function getRestaurantWorkspace(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId || !role) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }
    if (role !== "restaurant" && !isPrivilegedFoodRole(role)) {
      return res.status(403).json({ success: false, message: "Acces refuse" });
    }

    const restaurantId = String(req.query.restaurantId || "").trim();
    const restaurant = role === "restaurant"
      ? await FoodHomeRestaurant.findOne({ where: { ownerUserId: userId } })
      : restaurantId
          ? await FoodHomeRestaurant.findByPk(restaurantId)
          : null;

    if (!restaurant) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const [categories, products] = await Promise.all([
      FoodHomeCategory.findAll({
        where: {
          [Op.or]: [
            { restaurantId: String(restaurant.get("id")) },
            { restaurantId: null },
          ],
        },
        order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      }),
      FoodHomeProduct.findAll({
        where: { restaurantId: String(restaurant.get("id")) },
        order: [["isActive", "DESC"], ["sortOrder", "ASC"], ["createdAt", "ASC"]],
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        restaurant: {
          ...serializeRestaurant(restaurant),
          ownerUserId: restaurant.get("ownerUserId"),
        },
        categories: categories.map(serializeCategory),
        products: products.map(serializeProduct),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to load workspace" });
  }
}

export async function listFoodPaymentMethods(_req: Request, res: Response) {
  return res.status(200).json({
    success: true,
    data: [
      {
        id: "mobile_money",
        label: "Mobile Money",
        subtitle: "MTN / Moov, validation instantanee",
        method: "MOBILE_MONEY",
        provider: "FEDAPAY",
        color: "#FFC107",
        icon: "phone_android_rounded",
        isRecommended: true,
      },
      {
        id: "card",
        label: "Carte bancaire",
        subtitle: "Visa, Mastercard",
        method: "CARD",
        provider: "FEDAPAY",
        color: "#1565C0",
        icon: "credit_card_rounded",
        isRecommended: false,
      },
      {
        id: "cash",
        label: "Paiement a la livraison",
        subtitle: "Reglement au moment de la remise",
        method: "CASH",
        provider: null,
        color: "#2E7D32",
        icon: "payments_rounded",
        isRecommended: false,
      },
    ],
  });
}

export async function createFoodOrder(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const restaurantId = String(req.body?.restaurantId || "").trim();
    const addressId = String(req.body?.addressId || "").trim();
    const paymentMethodId = String(req.body?.paymentMethodId || "cash").trim().toLowerCase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!restaurantId || !addressId || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "restaurantId, addressId and items are required",
      });
    }

    const restaurant = await FoodHomeRestaurant.findByPk(restaurantId);
    if (!restaurant || !restaurant.get("isActive")) {
      return res.status(404).json({ success: false, message: "Restaurant not found" });
    }

    const address = await UserAddress.findOne({
      where: { id: addressId, userId },
    });
    if (!address) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

    const normalizedItems = items
      .map((item: any) => ({
        productId: String(item?.productId || item?.id || "").trim(),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        note: String(item?.note || "").trim(),
      }))
      .filter((item: any) => item.productId);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ success: false, message: "At least one valid item is required" });
    }

    const productIds = normalizedItems.map((item: any) => item.productId);
    const products = await FoodHomeProduct.findAll({
      where: {
        id: { [Op.in]: productIds },
        restaurantId,
        isActive: true,
        isAvailable: true,
      },
    });

    const productMap = new Map(products.map((product) => [String(product.get("id")), product]));
    if (productMap.size !== normalizedItems.length) {
      return res.status(400).json({
        success: false,
        message: "Some selected products are unavailable",
      });
    }

    const serializedItems = normalizedItems.map((item: any) => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Number(product.get("price") || 0);
      return {
        productId: String(product.get("id")),
        name: String(product.get("name") || ""),
        imageUrl: String(product.get("imageUrl") || ""),
        quantity: item.quantity,
        note: item.note,
        unitPrice,
        totalPrice: unitPrice * item.quantity,
      };
    });

    const subtotal = serializedItems.reduce((sum: number, item: any) => sum + item.totalPrice, 0);
    const deliveryFee = Number(restaurant.get("deliveryFee") || 0);
    const serviceFee = Math.max(250, Math.round(subtotal * 0.05));
    const total = subtotal + deliveryFee + serviceFee;

    const paymentMethodMap: Record<string, { method: string; provider: string | null; label: string }> = {
      mobile_money: { method: "MOBILE_MONEY", provider: "FEDAPAY", label: "Mobile Money" },
      card: { method: "CARD", provider: "FEDAPAY", label: "Carte bancaire" },
      cash: { method: "CASH", provider: null, label: "Paiement a la livraison" },
    };
    const selectedPayment = paymentMethodMap[paymentMethodId] || paymentMethodMap.cash;

    const estimatedDeliveryMinutes = Number(restaurant.get("deliveryMinutes") || 0);
    const order = await Order.create({
      userId,
      pickupLocation: "0,0",
      pickupAddress: String(restaurant.get("name") || "Restaurant"),
      destinationLocation: `${Number(address.get("latitude") || 0)},${Number(address.get("longitude") || 0)}`,
      destinationAddress: String(address.get("mapLabel") || ""),
      distance: `${estimatedDeliveryMinutes} min`,
      price: total,
      revenuePerDelivery: 0,
      platformCommission: deliveryFee,
      serviceFee,
      completionOtp: generateCompletionOtp(),
      vehicleType: "food",
      orderType: "food",
      merchantId: String(restaurant.get("id")),
      merchantName: String(restaurant.get("name") || ""),
      itemCount: serializedItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
      foodOrderPayloadJson: JSON.stringify({
        restaurant: serializeRestaurant(restaurant),
        items: serializedItems,
        address: {
          id: String(address.get("id")),
          label: String(address.get("label") || ""),
          mapLabel: String(address.get("mapLabel") || ""),
          latitude: Number(address.get("latitude") || 0),
          longitude: Number(address.get("longitude") || 0),
        },
        payment: {
          id: paymentMethodId,
          label: selectedPayment.label,
          method: selectedPayment.method,
          provider: selectedPayment.provider,
        },
        subtotal,
        estimatedDeliveryMinutes,
      }),
      status: selectedPayment.method === "CASH" ? "ACCEPTED" : "PENDING",
      isArchived: false,
    } as any);

    let payment: Payment | null = null;
    if (selectedPayment.method) {
      payment = await Payment.create({
        orderId: String(order.get("id")),
        userId,
        driverId: null,
        amount: total,
        currency: "XOF",
        status: selectedPayment.method === "CASH" ? "PENDING" : "PENDING",
        method: selectedPayment.method,
        provider: selectedPayment.provider,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Food order created",
      data: serializeFoodOrder(order, {
        restaurant,
        payment,
        address,
      }),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to create food order",
    });
  }
}

export async function listMyFoodOrders(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const orders = await Order.findAll({
      where: {
        userId,
        orderType: "food",
        isArchived: false,
      },
      order: [["createdAt", "DESC"]],
    });

    const orderIds = orders.map((order) => String(order.get("id")));
    const merchantIds = orders
      .map((order) => String(order.get("merchantId") || "").trim())
      .filter(Boolean);
    const addressIds = orders
      .map((order) => {
        const payload = parseJsonObject(order.get("foodOrderPayloadJson"));
        return String(payload?.address?.id || "").trim();
      })
      .filter(Boolean);

    const [payments, restaurants, addresses] = await Promise.all([
      orderIds.length
        ? Payment.findAll({
            where: { orderId: { [Op.in]: orderIds } },
            order: [["createdAt", "DESC"]],
          })
        : Promise.resolve([] as Payment[]),
      merchantIds.length
        ? FoodHomeRestaurant.findAll({ where: { id: { [Op.in]: merchantIds } } })
        : Promise.resolve([] as FoodHomeRestaurant[]),
      addressIds.length
        ? UserAddress.findAll({ where: { id: { [Op.in]: addressIds }, userId } })
        : Promise.resolve([] as UserAddress[]),
    ]);

    const paymentMap = new Map<string, Payment>();
    for (const payment of payments) {
      const key = String(payment.get("orderId"));
      if (!paymentMap.has(key)) paymentMap.set(key, payment);
    }
    const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant.get("id")), restaurant]));
    const addressMap = new Map(addresses.map((address) => [String(address.get("id")), address]));

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: orders.map((order) => {
        const payload = parseJsonObject(order.get("foodOrderPayloadJson"));
        return serializeFoodOrder(order, {
          restaurant: restaurantMap.get(String(order.get("merchantId") || "")) || null,
          payment: paymentMap.get(String(order.get("id"))) || null,
          address: addressMap.get(String(payload?.address?.id || "")) || null,
        });
      }),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load orders",
    });
  }
}

export async function getMyFoodOrderDetail(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const order = await Order.findOne({
      where: {
        id: String(req.params.id || "").trim(),
        userId,
        orderType: "food",
      },
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const payload = parseJsonObject(order.get("foodOrderPayloadJson"));
    const [payment, restaurant, address, driver] = await Promise.all([
      Payment.findOne({
        where: { orderId: String(order.get("id")) },
        order: [["createdAt", "DESC"]],
      }),
      FoodHomeRestaurant.findByPk(String(order.get("merchantId") || "")),
      payload?.address?.id
        ? UserAddress.findOne({ where: { id: String(payload.address.id), userId } })
        : Promise.resolve(null),
      order.get("driverId") ? User.findByPk(String(order.get("driverId"))) : Promise.resolve(null),
    ]);

    return res.status(200).json({
      success: true,
      data: serializeFoodOrder(order, { restaurant, payment, address, driver }),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load order detail",
    });
  }
}

export async function getMyFoodOrderTracking(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }

    const order = await Order.findOne({
      where: {
        id: String(req.params.id || "").trim(),
        userId,
        orderType: "food",
      },
    });
    if (!order) {
      return res.status(404).json({ success: false, message: "Course introuvable" });
    }

    const payload = parseJsonObject(order.get("foodOrderPayloadJson"));
    const driver = order.get("driverId") ? await User.findByPk(String(order.get("driverId"))) : null;
    const createdAt = new Date(String(order.get("createdAt")));
    const status = String(order.get("status") || "PENDING").toUpperCase();
    const timeline = [
      {
        key: "created",
        title: "Commande recue",
        subtitle: "Le restaurant a bien recu votre demande.",
        timeLabel: createdAt.toISOString(),
        completed: true,
        active: status === "PENDING",
      },
      {
        key: "preparing",
        title: "Preparation",
        subtitle: "Le restaurant prepare votre commande.",
        timeLabel: new Date(createdAt.getTime() + 6 * 60000).toISOString(),
        completed: ["ACCEPTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED_PICKUP", "DRIVER_LEFT_PICKUP", "PICKED_UP", "IN_TRANSIT", "COMPLETED"].includes(status),
        active: status === "ACCEPTED",
      },
      {
        key: "delivery",
        title: "Livreur en route",
        subtitle: "Votre livreur se dirige vers vous.",
        timeLabel: new Date(createdAt.getTime() + 15 * 60000).toISOString(),
        completed: ["DRIVER_ASSIGNED", "DRIVER_ARRIVED_PICKUP", "DRIVER_LEFT_PICKUP", "PICKED_UP", "IN_TRANSIT", "COMPLETED"].includes(status),
        active: ["DRIVER_ASSIGNED", "DRIVER_ARRIVED_PICKUP", "DRIVER_LEFT_PICKUP", "PICKED_UP", "IN_TRANSIT"].includes(status),
      },
      {
        key: "delivered",
        title: "Livraison terminee",
        subtitle: "Commande remise a votre adresse.",
        timeLabel: status === "COMPLETED"
          ? new Date(createdAt.getTime() + 28 * 60000).toISOString()
          : "",
        completed: status === "COMPLETED",
        active: status === "COMPLETED",
      },
    ];

    return res.status(200).json({
      success: true,
      data: {
        order: serializeFoodOrder(order, { driver }),
        timeline,
        driver: driver
          ? {
              id: String(driver.get("id")),
              name: String(driver.get("name") || "").trim() || "Livreur PassKey",
              phone: String(driver.get("phone") || "").trim(),
            }
          : payload?.driver ?? null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to load tracking",
    });
  }
}
