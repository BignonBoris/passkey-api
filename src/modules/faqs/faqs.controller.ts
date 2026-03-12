import { Request, Response } from "express";
import { Op } from "sequelize";
import Faq from "../../models/faq.model";

export async function listPublicFaqs(req: Request, res: Response) {
  try {
    const { search } = req.query as Record<string, string | undefined>;
    const whereClause: any = { status: "ACTIVE" };

    if (search && search.trim()) {
      const q = search.trim();
      whereClause[Op.or] = [
        { question: { [Op.like]: `%${q}%` } },
        { answer: { [Op.like]: `%${q}%` } },
      ];
    }

    const rows = await Faq.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list public faqs" });
  }
}

export async function listFaqs(req: Request, res: Response) {
  try {
    const { search, status } = req.query as Record<string, string | undefined>;
    const whereClause: any = {};

    if (status) whereClause.status = status;
    if (search && search.trim()) {
      const q = search.trim();
      whereClause[Op.or] = [
        { question: { [Op.like]: `%${q}%` } },
        { answer: { [Op.like]: `%${q}%` } },
      ];
    }

    const rows = await Faq.findAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to list faqs" });
  }
}

export async function createFaq(req: Request, res: Response) {
  try {
    const { question, answer, status } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }
    if (!answer || !String(answer).trim()) {
      return res.status(400).json({ success: false, message: "answer is required" });
    }

    const row = await Faq.create({
      question: String(question).trim(),
      answer: String(answer).trim(),
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to create faq" });
  }
}

export async function updateFaq(req: Request, res: Response) {
  try {
    const row = await Faq.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Faq not found" });

    const { question, answer, status } = req.body || {};

    if (question !== undefined) {
      const value = String(question).trim();
      if (!value) return res.status(400).json({ success: false, message: "question cannot be empty" });
      row.set("question", value);
    }

    if (answer !== undefined) {
      const value = String(answer).trim();
      if (!value) return res.status(400).json({ success: false, message: "answer cannot be empty" });
      row.set("answer", value);
    }

    if (status !== undefined) {
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return res.status(400).json({ success: false, message: "status must be ACTIVE or INACTIVE" });
      }
      row.set("status", status);
    }

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to update faq" });
  }
}

export async function deleteFaq(req: Request, res: Response) {
  try {
    const row = await Faq.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Faq not found" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "Faq deleted" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Failed to delete faq" });
  }
}
