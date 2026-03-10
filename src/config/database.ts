import "dotenv/config";
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
  process.env.DATABASE_NAME || '',
  process.env.DATABASE_USER || '',
  process.env.DATABASE_PASSWORD || '',
  {
    host: process.env.DATABASE_HOST || '',
    port: Number(process.env.DATABASE_PORT) || 3306,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false, // Nécessaire pour les connexions SSL Aiven
      }
    },
    logging: false,
  }
);

export default sequelize;
