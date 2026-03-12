import { Router } from "express";
import { createFaq, deleteFaq, listFaqs, listPublicFaqs, updateFaq } from "./faqs.controller";
import { authenticate, authorize } from "../../middlewares/auth.middleware";
import { PRIVILEGED_ROLES } from "../../constants/roles";

const router = Router();

router.get("/public", authenticate, listPublicFaqs);
router.get("/", authenticate, authorize(PRIVILEGED_ROLES), listFaqs);
router.post("/", authenticate, authorize(PRIVILEGED_ROLES), createFaq);
router.patch("/:id", authenticate, authorize(PRIVILEGED_ROLES), updateFaq);
router.delete("/:id", authenticate, authorize(PRIVILEGED_ROLES), deleteFaq);

export default router;
