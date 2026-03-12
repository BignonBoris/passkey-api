import server from "./app";
import sequelize from "./config/database";
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
import "./models/notification-log.model";
import "./models/refund-request.model";
import "./models/promotion.model";
import "./models/promotion-redemption.model";
import "./models/incident.model";
import "./models/service-zone.model";
import "./models/faq.model";
import "./models/app-settings.model";
import "./models/vehicle-pricing-config.model";
import "./models/chat-conversation.model";
import "./models/chat-message.model";
import "./models/user-address.model";
import "./models/pricing-rule.model";
import AppSettings, { normalizeSettingsContent } from "./models/app-settings.model";
import User from "./models/user.model";
import bcrypt from "bcrypt";
import { DataTypes } from "sequelize";

// const PORT = process.env.PORT || 3000;
const PORT = parseInt(process.env.PORT || "3000", 10);

async function startServer() {
  try {
    await sequelize.sync();
    await ensureUserLocationSchema();
    await ensureOrderArchiveColumn();
    await ensureOrderOtpColumns();
    await ensureOrderRevenueColumns();
    await ensureOrderPricingColumns();
    await ensurePricingRulesTable();
    await ensurePaymentSchema();
    await ensureSupportSchema();
    await ensureDefaultAppSettings();
    await seedDefaultAdmin();
    server.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Database sync failed:", error);
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

async function ensureDefaultAppSettings() {
  const defaultSettings = [
    {
      section: "contact",
      content: {
        telephone: "",
        adresse: "",
        email: "",
      },
    },
    {
      section: "about",
      content: {
        "notre mission": "",
        "fiabilité": "",
        version: "",
      },
    },
  ] as const;

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
    const mergedContent = { ...item.content, ...currentContent };

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
