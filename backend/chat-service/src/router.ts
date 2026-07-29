import { Router } from "express";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  sendMessage,
} from "./controller/conversation.js";
import { checkHealth } from "./controller/status.js";
import { register } from "./config/registry.js";
import { requireAuthentication } from "./middlewares/authentication.js";

const router = Router();

router.get("/health", checkHealth);
router.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

router.use(requireAuthentication);
router.post("/conversations", createConversation);
router.get("/conversations", listConversations);
router.get("/conversations/:id", getConversation);
router.patch("/conversations/:id", renameConversation);
router.delete("/conversations/:id", deleteConversation);
router.post("/conversations/:id/messages", sendMessage);

export default router;
