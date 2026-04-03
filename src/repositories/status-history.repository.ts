import StatusHistory from "../models/status-history.model";

export class StatusHistoryRepository {
  static createEntry(params: {
    userId: string;
    actorId?: string;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }) {
    const { userId, actorId, action, before, after } = params;
    return StatusHistory.create({
      userId,
      actorId: actorId || null,
      action,
      before: before ?? null,
      after: after ?? null,
    });
  }

  static listByUserId(userId: string) {
    return StatusHistory.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
  }
}
