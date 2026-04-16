import fs from "fs";
import path from "path";
const multer = require("multer");

const uploadRoot = path.resolve(process.cwd(), "uploads", "driver-documents");
fs.mkdirSync(uploadRoot, { recursive: true });
const userProfileUploadRoot = path.resolve(process.cwd(), "uploads", "user-profiles");
fs.mkdirSync(userProfileUploadRoot, { recursive: true });
const foodMediaUploadRoot = path.resolve(process.cwd(), "uploads", "food-media");
fs.mkdirSync(foodMediaUploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, uploadRoot),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname || "");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

export const driverDocsUpload = multer({ storage });

const userProfileStorage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, userProfileUploadRoot),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname || "");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

export const userProfileUpload = multer({ storage: userProfileStorage });

const foodMediaStorage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, foodMediaUploadRoot),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname || "");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

export const foodMediaUpload = multer({ storage: foodMediaStorage });
