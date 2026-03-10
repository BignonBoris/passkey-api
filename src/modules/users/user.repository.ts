import User from '@/models/user.model';

export class UserRepository {
  static findByPhone(phone: string) {
    return User.findOne({ where: { phone } });
  }

  static createUser(phone: string) {
    return User.create({
      data: { phone },
    });
  }
  static async updateFcmToken(userId: string, token: string) {
    return await User.update(
      { fcmToken: token }, 
      { where: { id: userId } }
    );
  }
  
  static async updateUser(userData: Partial<User>) {
  const { id, ...updateData } = userData;

  if (!id) {
    throw new Error("L'ID de l'utilisateur est requis pour la mise à jour.");
  }

  // 1. Exécuter la mise à jour
  // Renvoie [nombre_de_lignes_affectées]
  const [affectedCount] = await User.update(updateData, {
    where: { id: id }
  });

  if (affectedCount === 0) {
    return null; // Ou gérer l'erreur si l'utilisateur n'existe pas
  }

  // 2. Récupérer et retourner l'objet mis à jour 
  return await User.findByPk(id, { raw: true });
}

  static async findById(id: string) {
    return User.findByPk(id);
  }

  static async updateAccountStatus(params: {
    userId: string;
    accountStatus: "active" | "suspended";
    reason?: string;
    actorId?: string;
  }) {
    const { userId, accountStatus, reason, actorId } = params;
    const now = new Date();
    const isSuspended = accountStatus === "suspended";

    const [affectedCount] = await User.update(
      {
        accountStatus,
        suspensionReason: isSuspended ? (reason || null) : null,
        suspendedAt: isSuspended ? now : null,
        suspendedBy: isSuspended ? (actorId || null) : null,
        reactivatedAt: isSuspended ? null : now,
        reactivatedBy: isSuspended ? null : (actorId || null),
      },
      {
        where: { id: userId },
      }
    );

    if (affectedCount === 0) {
      return null;
    }

    return User.findByPk(userId, { raw: true });
  }

  static async updateIdentityVerified(params: {
    userId: string;
    identityVerified: boolean;
    activateDriver?: boolean;
  }) {
    const { userId, identityVerified, activateDriver = false } = params;

    const updatePayload: Record<string, unknown> = {
      identityVerified,
    };

    if (activateDriver && identityVerified) {
      updatePayload.accountStatus = "active";
      updatePayload.isActive = true;
      updatePayload.isAvailable = true;
      updatePayload.suspensionReason = null;
      updatePayload.suspendedAt = null;
      updatePayload.suspendedBy = null;
      updatePayload.reactivatedAt = new Date();
    }

    const [affectedCount] = await User.update(
      updatePayload,
      { where: { id: userId } }
    );

    if (affectedCount === 0) {
      return null;
    }

    return User.findByPk(userId, { raw: true });
  }

  static async deleteById(id: string) {
    return User.destroy({ where: { id } });
  }
}
