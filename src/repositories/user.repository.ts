import User from '@/models/user.model';

export class UserRepository {
  static findOne(where: any) {
    return User.findOne({
      where,
      attributes: [
        "id",
        "phone",
        "name",
        "role",
        "isActive",
        "isAvailable",
        "latitude",
        "longitude",
        "createdAt",
        "updatedAt",
        "password",
        "otpCode",
        "otpExpiresAt",
        "accountStatus" // N'oublie pas d'ajouter ce champ si tu l'utilises pour les suspensions
      ],
      raw: true
    });
  }

  // Tu peux garder findByPhone pour la compatibilité, en appelant findOne
  static findByPhone(phone: string) {
    return this.findOne({ phone });
  }

  // Nouvelle méthode spécifique pour ton besoin actuel
  static findByPhoneAndRole(phone: string, role: string) {
    return this.findOne({ phone, role });
  }

  static findByEmail(email: string) {
    return User.findOne({
      where: { email },
      attributes: [
        "id",
        "phone",
        "email",
        "name",
        "role",
        "isActive",
        "isAvailable",
        "latitude",
        "longitude",
        "createdAt",
        "updatedAt",
        "password",
        "otpCode",
        "otpExpiresAt"
      ],
      raw: true
    });
  }

  static createUser(phone: string) {
    return User.create({
      data: { phone },
    });
  }


  static async updateUser(user: User) {
    const { id, ...updateData } = user;
    return await User.update(updateData, {
      where: { id: id }
    });
  }

}
