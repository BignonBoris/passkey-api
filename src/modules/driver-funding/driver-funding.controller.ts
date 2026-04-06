import { Request, Response } from "express";
import * as DriverFundingService from "./driver-funding.service";
import { AuthenticatedRequest } from "../../types/auth-request";

export async function getMyBalance(req: AuthenticatedRequest, res: Response) {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }
    const balance = await DriverFundingService.getOrCreateBalance(driverId);
    return res.status(200).json({ success: true, data: balance });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur lors de la recuperation du solde",
    });
  }
}

export async function getMyFundingHistory(req: AuthenticatedRequest, res: Response) {
  try {
    const driverId = req.user?.id;
    if (!driverId) {
      return res.status(401).json({ success: false, message: "Non authentifie" });
    }
    const history = await DriverFundingService.getFundingHistory(driverId);
    return res.status(200).json({ success: true, data: history });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur lors de la recuperation de l'historique",
    });
  }
}

export async function getDriverBalance(req: Request, res: Response) {
  try {
    const { driverId } = req.params;
    const balance = await DriverFundingService.getOrCreateBalance(driverId);
    return res.status(200).json({ success: true, data: balance });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur lors de la recuperation du solde",
    });
  }
}

export async function fundDriver(req: Request, res: Response) {
  try {
    const { driverId } = req.params;
    const { amount, action } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Le montant doit etre superieur a 0",
      });
    }

    if (action && action !== "ADD" && action !== "SUBTRACT") {
      return res.status(400).json({ success: false, message: "Action invalide" });
    }

    const result = await DriverFundingService.fundDriver(driverId, amount, action || "ADD");
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur lors de l'approvisionnement",
    });
  }
}

export async function getFundingHistory(req: Request, res: Response) {
  try {
    const { driverId } = req.params;
    const history = await DriverFundingService.getFundingHistory(driverId);
    return res.status(200).json({ success: true, data: history });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || "Erreur lors de la recuperation de l'historique",
    });
  }
}
