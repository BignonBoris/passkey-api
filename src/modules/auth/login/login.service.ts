import "dotenv/config";
import { generateOTP } from "../../../utils/otp";
import { UserService } from "../../users/user.service"; 
import bcrypt from "bcrypt";
import { UserRepository } from "../../../repositories/user.repository";
import User from '../../../models/user.model';

export class LoginService {
  static async login(phone: string, password: string, role: string){ 
    let user = await UserRepository.findByPhone(phone);
    if (user) {
      if(user.password){
        const isValid = await bcrypt.compare(password, user.password!);
        if (!isValid) {
          return { success: false, message: "Invalid password" };
        }
      }
    }else {
      const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
      
      user = await User.create({ phone, password: hashedPassword, role });
       
    }
    
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await User.update(
      { otpCode: otp, otpExpiresAt },
      { where: { id: user.id } }
    );

    return {
      userId : user.id,
      otp : process.env.NODE_ENV === "development" ? otp : undefined
    }
  }
  
  static async sendOTP(phone: string, password: string) {
    const user = await UserService.getOrCreateUser(phone);

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await User.update(
      { otpCode: otp, otpExpiresAt },
      { where: { id: user.id } }
    );

    return {
      userId: user.id,
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    };
  }
}
