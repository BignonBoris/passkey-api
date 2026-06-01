import "dotenv/config";
import { Sequelize, Op } from "sequelize";

const PHONE = "+2290190909091";

const sequelize = new Sequelize(
  process.env.DATABASE_NAME || "echeetah",
  process.env.DATABASE_USER || "root",
  process.env.DATABASE_PASSWORD || "password",
  {
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: Number(process.env.DATABASE_PORT) || 3306,
    dialect: "mysql",
    logging: false,
  }
);

async function checkDriver() {
  await sequelize.authenticate();
  console.log("\n========================================");
  console.log(`  DIAGNOSTIC LIVREUR: ${PHONE}`);
  console.log("========================================\n");

  // Recherche par numéro de téléphone (tous champs)
  const [rows] = await sequelize.query(
    `SELECT id, name, phone, role, isActive, isAvailable, identityVerified, accountStatus,
            fcmToken, latitude, longitude, createdAt
     FROM User
     WHERE phone = :phone OR phone = :phoneAlt
     LIMIT 5`,
    {
      replacements: {
        phone: PHONE,
        phoneAlt: PHONE.replace("+", ""),
      },
      type: "SELECT" as any,
    }
  );

  if (!rows || (rows as any[]).length === 0) {
    console.log(`❌ AUCUN utilisateur trouvé avec le numéro ${PHONE}`);
    console.log("   → Vérifiez que le numéro est exact (avec ou sans le '+')");
    await sequelize.close();
    return;
  }

  // Debug: afficher la structure brute
  // console.log("🔎 Résultat brut:", JSON.stringify(rows, null, 2));

  // Sequelize raw query retourne l'objet directement ici
  const driver: any = rows;

  console.log("📋 INFORMATIONS DU COMPTE:");
  console.log(`   id            : ${driver.id}`);
  console.log(`   name          : ${driver.name}`);
  console.log(`   phone         : ${driver.phone}`);
  console.log(`   createdAt     : ${driver.createdAt}`);
  console.log();

  const checks: { label: string; ok: boolean; value: any; required: any }[] = [
    {
      label: "role = 'livreur'",
      ok: driver.role === "livreur",
      value: driver.role,
      required: "livreur",
    },
    {
      label: "isActive = true",
      ok: driver.isActive == 1 || driver.isActive === true,
      value: driver.isActive,
      required: 1,
    },
    {
      label: "isAvailable = true",
      ok: driver.isAvailable == 1 || driver.isAvailable === true,
      value: driver.isAvailable,
      required: 1,
    },
    {
      label: "identityVerified = true",
      ok: driver.identityVerified == 1 || driver.identityVerified === true,
      value: driver.identityVerified,
      required: 1,
    },
    {
      label: "accountStatus = 'active'",
      ok: driver.accountStatus === "active",
      value: driver.accountStatus,
      required: "active",
    },
    {
      label: "fcmToken non nul",
      ok: !!driver.fcmToken && driver.fcmToken !== "null" && driver.fcmToken !== "undefined",
      value: driver.fcmToken ? `${String(driver.fcmToken).substring(0, 30)}...` : null,
      required: "non nul",
    },
    {
      label: "latitude/longitude renseignées",
      ok: driver.latitude != null && driver.longitude != null,
      value: `lat=${driver.latitude}, lng=${driver.longitude}`,
      required: "non nul",
    },
  ];

  console.log("🔍 VÉRIFICATION DES CONDITIONS DE NOTIFICATION:");
  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? "✅" : "❌";
    const status = check.ok ? "OK" : `FAIL (valeur: ${JSON.stringify(check.value)}, requis: ${JSON.stringify(check.required)})`;
    if (!check.ok) allOk = false;
    console.log(`   ${icon}  ${check.label} → ${status}`);
  }

  console.log();
  if (!allOk) {
    if (!checks.find(c => c.label === "isAvailable = true")?.ok) {
        console.log("🛠️ FORCAGE de isAvailable = 1 pour le test...");
        await sequelize.query(`UPDATE User SET isAvailable = 1 WHERE id = :id`, {
            replacements: { id: driver.id }
        });
        console.log("   ✅ Forçage terminé. Relancez le test.");
    } else {
        console.log("❌ CONDITIONS NON REMPLIES — le livreur ne recevra PAS de notification.");
        console.log("   → Corrigez les champs marqués ❌ ci-dessus.");
    }
  } else {
    console.log("✅ TOUTES LES CONDITIONS SONT REMPLIES.");
    console.log("   → Le problème vient probablement du token FCM invalide ou d'un bug Firebase.");
    console.log("   → Vérifiez les logs FCM dans la console du serveur lors de la création d'une commande.");
  }

  console.log("\n========================================\n");
  await sequelize.close();
}

checkDriver().catch((err) => {
  console.error("Erreur lors du diagnostic:", err.message);
  process.exit(1);
});
