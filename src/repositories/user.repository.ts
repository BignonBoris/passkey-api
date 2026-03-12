import User from '../models/user.model';

export class UserRepository {
  static findByPhone(phone: string) {

    return User.findOne({
      where: { phone },
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
        "otpExpiresAt"
      ],
      raw: true
    });
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
