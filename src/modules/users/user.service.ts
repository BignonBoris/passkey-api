import { UserRepository } from "./user.repository";

export class UserService {
  static async getOrCreateUser(phone: string) {
    let user = await UserRepository.findByPhone(phone);

    if (!user) {
      user = await UserRepository.createUser(phone);
    }

    return user;
  }
}
