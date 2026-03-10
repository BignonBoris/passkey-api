import sequelize from "./config/database";
import User from "./models/user.model";

async function test() {
  await sequelize.authenticate();
  const usersCount = await User.count();
  console.log("Database OK (Sequelize)", usersCount);
}

test();
