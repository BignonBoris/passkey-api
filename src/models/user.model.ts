import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class User extends Model {
  public id!: string;
  public phone!: string;
  public email?: string;
  public name?: string;
  public role!: string;
  public password!: string;
  public fcmToken?: string | null;
  public isActive!: boolean;
  public isAvailable!: boolean;
  public latitude?: number;
  public longitude?: number;
  public city?: string | null;
  public dateOfBirth?: Date | null;
  public avatarUrl?: string | null;
  public accountStatus!: 'active' | 'suspended';
  public suspensionReason?: string | null;
  public suspendedAt?: Date | null;
  public suspendedBy?: string | null;
  public reactivatedAt?: Date | null;
  public reactivatedBy?: string | null;
  public identityVerified!: boolean;
  public hasSubmittedOnboarding!: boolean;
  public otpCode?: string | null;
  public otpExpiresAt?: Date | null;
}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
  },
  fcmToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'usager',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  accountStatus: {
    type: DataTypes.ENUM('active', 'suspended'),
    defaultValue: 'active',
    allowNull: false,
  },
  suspensionReason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  suspendedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  suspendedBy: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  reactivatedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reactivatedBy: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  identityVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  hasSubmittedOnboarding: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  otpCode: {
    type: DataTypes.STRING(6),
    allowNull: true,
  },
  otpExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  sequelize,
  modelName: 'User',
  freezeTableName: true, // Désactive la pluralisation automatique
});

export default User;
