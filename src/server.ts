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
import AppSettings, { normalizeSettingsContent } from "./models/app-settings.model";
import User from "./models/user.model";
import bcrypt from "bcrypt";
import { DataTypes } from "sequelize";

// const PORT = process.env.PORT || 3000;
const PORT = parseInt(process.env.PORT || "3000", 10);

async function startServer() {
  try {
    await sequelize.sync();
    await ensureOrderArchiveColumn();
    await ensureSupportSchema();
    await ensureDefaultAppSettings();
    await seedDefaultAdmin();
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database sync failed:", error);
    process.exit(1);
  }
}

startServer();

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
