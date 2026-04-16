import { Request, Response } from "express";
import { Op } from "sequelize";
import Faq from "../../models/faq.model";

const MAX_FAQ_QUESTION_LENGTH = 140;

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
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les FAQ publiques" });
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
    return res.status(500).json({ success: false, message: error?.message || "Impossible de lister les FAQ" });
  }
}

export async function createFaq(req: Request, res: Response) {
  try {
    const { question, answer, status } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, message: "La question est requise" });
    }
    if (!answer || !String(answer).trim()) {
      return res.status(400).json({ success: false, message: "La reponse est requise" });
    }
    if (String(question).trim().length > MAX_FAQ_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `La question ne doit pas depasser ${MAX_FAQ_QUESTION_LENGTH} characters`,
      });
    }

    const row = await Faq.create({
      question: String(question).trim(),
      answer: String(answer).trim(),
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });

    return res.status(201).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de creer la FAQ" });
  }
}

export async function updateFaq(req: Request, res: Response) {
  try {
    const row = await Faq.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "FAQ introuvable" });

    const { question, answer, status } = req.body || {};

    if (question !== undefined) {
      const value = String(question).trim();
      if (!value) return res.status(400).json({ success: false, message: "La question ne peut pas etre vide" });
      if (value.length > MAX_FAQ_QUESTION_LENGTH) {
        return res.status(400).json({
          success: false,
          message: `La question ne doit pas depasser ${MAX_FAQ_QUESTION_LENGTH} characters`,
        });
      }
      row.set("question", value);
    }

    if (answer !== undefined) {
      const value = String(answer).trim();
      if (!value) return res.status(400).json({ success: false, message: "La reponse ne peut pas etre vide" });
      row.set("answer", value);
    }

    if (status !== undefined) {
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return res.status(400).json({ success: false, message: "Le statut doit etre ACTIVE ou INACTIVE" });
      }
      row.set("status", status);
    }

    await row.save();
    return res.status(200).json({ success: true, data: row });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de mettre a jour la FAQ" });
  }
}

export async function deleteFaq(req: Request, res: Response) {
  try {
    const row = await Faq.findByPk(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "FAQ introuvable" });
    await row.destroy();
    return res.status(200).json({ success: true, message: "FAQ supprimee" });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || "Impossible de supprimer la FAQ" });
  }
}
