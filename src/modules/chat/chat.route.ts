import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import {
  getConversationMessages,
  getConversations,
  openConversationWithUser,
  readConversation,
  sendMessage,
} from "./chat.controller";

const router = Router();

router.use(authenticate);

router.get("/conversations", getConversations);
router.get("/conversations/:conversationId/messages", getConversationMessages);
router.patch("/conversations/:conversationId/read", readConversation);
router.get("/conversations/with/:otherUserId", openConversationWithUser);
router.post("/messages", sendMessage);

export default router;
