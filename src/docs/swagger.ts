import swaggerJSDoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "e-Cheetah API",
      version: "1.0.0",
      description: "Super-app Mobility Backend API",
    },
    servers: [
      {
        url: "http://localhost:3000/api",
        description: "Local server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        PhoneCheckRequest: {
          type: "object",
          required: ["phone", "role"],
          properties: {
            phone: {
              type: "string",
              example: "+22961234567",
            },
            role: {
              type: "string",
              enum: ["usager", "livreur", "admin", "sous-admin"],
              example: "usager",
            },
          },
        },
        PhoneCheckResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Phone check completed" },
            data: {
              type: "object",
              properties: {
                exists: { type: "boolean", example: true },
                matchesProfile: { type: "boolean", example: true },
                foundRole: { type: "string", example: "usager", nullable: true },
                requestedRole: { type: "string", example: "usager" },
                nextStep: { type: "string", example: "LOGIN" },
              },
            },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["phone", "password"],
          properties: {
            phone: { type: "string", example: "+22961234567" },
            password: { type: "string", example: "superSecret123" },
            role: { type: "string", example: "user" },
          },
        },
        PasswordLoginRequest: {
          type: "object",
          required: ["phone", "password"],
          properties: {
            phone: { type: "string", example: "+22961234567" },
            password: { type: "string", example: "superSecret123" },
          },
        },
        AdminSignInRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "admin@echeetah.app" },
            password: { type: "string", example: "superSecret123" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: { type: "string", example: "+22961234567" },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["phone", "otp", "newPassword"],
          properties: {
            phone: { type: "string", example: "+22961234567" },
            otp: { type: "string", example: "123456" },
            newPassword: { type: "string", example: "newStrongPass456" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: {
              type: "string",
              example: "+22961234567",
            },
            password: {
              type: "string",
              example: "superSecret123",
            },
          },
        },

        VerifyOtpRequest: {
          type: "object",
          required: ["phone", "otp"],
          properties: {
            phone: {
              type: "string",
              example: "+22961234567",
            },
            otp: {
              type: "string",
              example: "123456",
            },
          },
        },

        AuthResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Authentication successful",
            },
            data: {
              type: "object",
              properties: {
                token: {
                  type: "string",
                  example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
                user: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    phone: { type: "string" },
                    role: { type: "string" },
                  },
                },
              },
            },
          },
        },
        OtpSentResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "OTP sent" },
            data: {
              type: "object",
              properties: {
                otp: { type: "string", example: "123456" },
              },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            phone: { type: "string" },
            email: { type: "string", nullable: true },
            name: { type: "string", nullable: true },
            role: { type: "string", example: "usager" },
            isActive: { type: "boolean" },
            isAvailable: { type: "boolean" },
            accountStatus: { type: "string", enum: ["active", "suspended"] },
            identityVerified: { type: "boolean" },
            suspensionReason: { type: "string", nullable: true },
            suspendedAt: { type: "string", format: "date-time", nullable: true },
            suspendedBy: { type: "string", nullable: true },
            reactivatedAt: { type: "string", format: "date-time", nullable: true },
            reactivatedBy: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        UserListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            count: { type: "number", example: 1 },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/User" },
            },
          },
        },
        UserResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { $ref: "#/components/schemas/User" },
          },
        },
        Payment: {
          type: "object",
          properties: {
            id: { type: "string", example: "0d4b7db8-6f3b-4bb3-9d96-48f5a7d9f1f0" },
            orderId: { type: "string", example: "a3f93c02-6d27-43ce-9daa-30ef4e5c1ab2" },
            userId: { type: "string", example: "7a2fd4de-4c11-46f2-8715-e9d25efed001" },
            driverId: { type: "string", nullable: true, example: "c8a2d6b2-c0b7-4a4f-9c10-d7c5fd880111" },
            amount: { type: "number", example: 1500 },
            currency: { type: "string", example: "XOF" },
            status: { type: "string", enum: ["PENDING", "PAID", "FAILED", "REFUNDED"], example: "PENDING" },
            method: { type: "string", enum: ["CASH", "CARD", "MOBILE_MONEY"], example: "MOBILE_MONEY" },
            provider: { type: "string", example: "FEDAPAY" },
            providerTransactionId: { type: "string", nullable: true, example: "12345678" },
            providerReference: { type: "string", nullable: true, example: "TXN-REF-001" },
            merchantReference: { type: "string", nullable: true, example: "PAY-0d4b7db8-6f3b-4bb3-9d96-48f5a7d9f1f0" },
            checkoutUrl: { type: "string", nullable: true, example: "https://sandbox-checkout.fedapay.com/..." },
            callbackUrl: { type: "string", nullable: true, example: "http://localhost:3000/api/payments/fedapay/callback?paymentId=..." },
            paidAt: { type: "string", format: "date-time", nullable: true },
            failureReason: { type: "string", nullable: true },
            callbackReceivedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        PaymentCheckoutResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Checkout FedaPay cree" },
            data: {
              type: "object",
              properties: {
                payment: { $ref: "#/components/schemas/Payment" },
                checkoutUrl: {
                  type: "string",
                  nullable: true,
                  example: "https://sandbox-checkout.fedapay.com/..."
                },
                checkoutToken: {
                  type: "string",
                  nullable: true,
                  example: "tok_xxxxxxxxx"
                },
              },
            },
          },
        },
        PaymentStatusResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Statut synchronise" },
            data: { $ref: "#/components/schemas/Payment" },
          },
        },
        UpdateAccountStatusRequest: {
          type: "object",
          required: ["accountStatus"],
          properties: {
            accountStatus: { type: "string", enum: ["active", "suspended"] },
            reason: { type: "string", nullable: true },
          },
        },
        IdentityUpdateRequest: {
          type: "object",
          required: ["identityVerified"],
          properties: {
            identityVerified: { type: "boolean", example: true },
          },
        },
        LocationUpdateRequest: {
          type: "object",
          required: ["latitude", "longitude"],
          properties: {
            latitude: { type: "number", example: 5.3167 },
            longitude: { type: "number", example: -4.0333 },
          },
        },
        StatusHistory: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            actorId: { type: "string", nullable: true },
            action: { type: "string", example: "ACCOUNT_STATUS_CHANGE" },
            before: { type: "object", nullable: true },
            after: { type: "object", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        StatusHistoryListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/StatusHistory" },
            },
          },
        },
        DashboardOverviewResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Dashboard loaded" },
            data: {
              type: "object",
              properties: {
                onlineDriversCount: { type: "number", example: 12 },
                totalUsers: { type: "number", example: 1543 },
                totalDrivers: { type: "number", example: 320 },
                newUsersToday: { type: "number", example: 23 },
                newDriversToday: { type: "number", example: 4 },
                suspendedUsers: { type: "number", example: 10 },
                suspendedDrivers: { type: "number", example: 3 },
                unverifiedUsers: { type: "number", example: 85 },
                unverifiedDrivers: { type: "number", example: 27 },
                activeUsers30d: { type: "number", example: 740 },
                activeDrivers7d: { type: "number", example: 118 },
                identityVerifiedToday: { type: "number", example: 9 },
                ordersTotal: { type: "number", example: 3200 },
                ordersPending: { type: "number", example: 42 },
                ordersAccepted: { type: "number", example: 87 },
                ordersCompleted: { type: "number", example: 3000 },
                ordersCancelled: { type: "number", example: 71 },
                ordersToday: { type: "number", example: 120 },
                paymentsToday: { type: "number", example: 3420000 },
                paymentsFailedToday: { type: "number", example: 6 },
                payoutsPendingCount: { type: "number", example: 18 },
                payoutsPendingAmount: { type: "number", example: 1080000 },
                refundPendingCount: { type: "number", example: 7 },
                refundApprovedToday: { type: "number", example: 3 },
                kycPending: { type: "number", example: 24 },
                kycApprovedToday: { type: "number", example: 11 },
                kycRejectedToday: { type: "number", example: 2 },
                driverDocsPending: { type: "number", example: 15 },
                ticketsOpen: { type: "number", example: 9 },
                ticketsPending: { type: "number", example: 5 },
                ticketsUrgent: { type: "number", example: 1 },
                notificationsSentToday: { type: "number", example: 320 },
                notificationsDeliveredToday: { type: "number", example: 290 },
                notificationsFailedToday: { type: "number", example: 12 },
                promotionsActive: { type: "number", example: 4 },
                promotionsTotal: { type: "number", example: 12 },
                redemptionsToday: { type: "number", example: 58 },
                incidentsOpen: { type: "number", example: 3 },
                incidentsHigh: { type: "number", example: 1 },
                zonesActive: { type: "number", example: 6 },
                zonesInactive: { type: "number", example: 2 },
              },
            },
          },
        },
        KycRequest: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            type: { type: "string", enum: ["KYC", "KYB"] },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "REVIEW"] },
            reason: { type: "string", nullable: true },
            submittedAt: { type: "string", format: "date-time" },
            reviewedAt: { type: "string", format: "date-time", nullable: true },
            reviewedBy: { type: "string", nullable: true },
          },
        },
        DriverDocument: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string" },
            type: { type: "string" },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
            url: { type: "string", nullable: true },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            verifiedAt: { type: "string", format: "date-time", nullable: true },
            verifiedBy: { type: "string", nullable: true },
          },
        },
        SupportTicket: {
          type: "object",
          properties: {
            id: { type: "string" },
            userId: { type: "string", nullable: true },
            orderId: { type: "string", nullable: true },
            status: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED", "CLOSED"] },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
            category: { type: "string", nullable: true },
            assignedTo: { type: "string", nullable: true },
          },
        },
        NotificationLog: {
          type: "object",
          properties: {
            id: { type: "string" },
            recipientId: { type: "string" },
            channel: { type: "string", enum: ["PUSH", "SMS", "EMAIL"] },
            status: { type: "string", enum: ["SENT", "DELIVERED", "FAILED", "OPENED"] },
            templateId: { type: "string", nullable: true },
            eventType: { type: "string", nullable: true },
            sentAt: { type: "string", format: "date-time" },
          },
        },
        RefundRequest: {
          type: "object",
          properties: {
            id: { type: "string" },
            paymentId: { type: "string" },
            orderId: { type: "string" },
            userId: { type: "string" },
            amount: { type: "number" },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "PAID"] },
            reason: { type: "string", nullable: true },
            processedBy: { type: "string", nullable: true },
            processedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        Promotion: {
          type: "object",
          properties: {
            id: { type: "string" },
            code: { type: "string" },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"] },
            validFrom: { type: "string", format: "date-time", nullable: true },
            validTo: { type: "string", format: "date-time", nullable: true },
            usageLimit: { type: "number", nullable: true },
            usedCount: { type: "number" },
          },
        },
        PromotionRedemption: {
          type: "object",
          properties: {
            id: { type: "string" },
            promotionId: { type: "string" },
            userId: { type: "string" },
            orderId: { type: "string", nullable: true },
            amount: { type: "number" },
          },
        },
        Incident: {
          type: "object",
          properties: {
            id: { type: "string" },
            orderId: { type: "string", nullable: true },
            driverId: { type: "string", nullable: true },
            type: { type: "string" },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
            status: { type: "string", enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] },
            resolvedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        ServiceZone: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            city: { type: "string", nullable: true },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            polygon: { type: "object", nullable: true },
          },
        },
        DevResetResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Database reset completed; all tables recreated." },
            error: { type: "string", nullable: true },
          },
        },
      },
    },
    paths: {
      "/payments/test-checkout": {
        post: {
          tags: ["Payments"],
          summary: "Creer un checkout FedaPay de test",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    amount: { type: "number", example: 500 },
                    description: { type: "string", example: "Paiement test PassKey" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Checkout cree",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentCheckoutResponse" },
                },
              },
            },
            401: { description: "Non authentifie" },
            503: { description: "FedaPay non configure" },
          },
        },
      },
      "/payments/orders/{orderId}/checkout": {
        post: {
          tags: ["Payments"],
          summary: "Creer le checkout FedaPay d'une course",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "orderId",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "ID de la course a payer",
            },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    description: { type: "string", example: "Paiement de la course" },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "Checkout cree",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentCheckoutResponse" },
                },
              },
            },
            200: {
              description: "Paiement deja effectue",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentCheckoutResponse" },
                },
              },
            },
            401: { description: "Non authentifie" },
            403: { description: "Acces refuse" },
            404: { description: "Course introuvable" },
          },
        },
      },
      "/payments/{paymentId}": {
        get: {
          tags: ["Payments"],
          summary: "Obtenir le statut d'un paiement",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "paymentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Statut du paiement",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentStatusResponse" },
                },
              },
            },
            401: { description: "Non authentifie" },
            403: { description: "Acces refuse" },
            404: { description: "Paiement introuvable" },
          },
        },
      },
      "/payments/{paymentId}/sync": {
        post: {
          tags: ["Payments"],
          summary: "Synchroniser le statut d'un paiement FedaPay",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              name: "paymentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Paiement synchronise",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentStatusResponse" },
                },
              },
            },
            401: { description: "Non authentifie" },
            403: { description: "Acces refuse" },
            404: { description: "Paiement introuvable" },
          },
        },
      },
      "/payments/fedapay/callback": {
        get: {
          tags: ["Payments"],
          summary: "Callback navigateur FedaPay",
          parameters: [
            {
              name: "paymentId",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "ID interne du paiement PassKey",
            },
          ],
          responses: {
            200: {
              description: "Page HTML de retour application",
              content: {
                "text/html": {
                  schema: {
                    type: "string",
                    example: "<html><body>Paiement traite</body></html>",
                  },
                },
              },
            },
          },
        },
      },
      "/dev/reset-database": {
        post: {
          tags: ["Dev"],
          summary: "Force rebuilds the database schema",
          description:
            "Drops and recreates every table. This is destructive and intended for development/test environments only.",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Database reset completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DevResetResponse" },
                },
              },
            },
            500: {
              description: "Reset failed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DevResetResponse" },
                },
              },
            },
          },
        },
      },
    },

    tags: [
      { name: "Auth", description: "Authentication OTP + JWT" },
      { name: "Users", description: "Users management" },
      { name: "Payments", description: "Paiements et checkout FedaPay" },
      { name: "Dashboard", description: "Dashboard metrics and lists" },
      { name: "Drivers", description: "Drivers & availability" },
      { name: "Bookings", description: "Rides & Deliveries" },
      { name: "KYC", description: "KYC/KYB requests" },
      { name: "DriverDocuments", description: "Driver documents" },
      { name: "Support", description: "Support tickets" },
      { name: "Promotions", description: "Promotions and redemptions" },
      { name: "Refunds", description: "Refund requests" },
      { name: "Notifications", description: "Notification logs" },
      { name: "Incidents", description: "Operational incidents" },
      { name: "Zones", description: "Service zones" },
      { name: "Dev", description: "Development tooling and helpers" },
    ],
  },
  apis: ["src/modules/**/*.routes.ts", "src/modules/**/*.route.ts"],
});
