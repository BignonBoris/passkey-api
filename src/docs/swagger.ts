import swaggerJSDoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PassKey API",
      version: "1.0.0",
      description: "Super-app Mobility Backend API",
    },
    servers: [
      {
        url: "https://passkey-api.onrender.com/api",
        description: "Render server",
      },
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
            phone: { type: "string", example: "+22961234567" },
            role: { type: "string", enum: ["usager", "livreur", "admin", "sous-admin"], example: "usager" },
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
            phone: { type: "string", example: "+22961234567" },
            password: { type: "string", example: "superSecret123" },
          },
        },
        VerifyOtpRequest: {
          type: "object",
          required: ["phone", "otp"],
          properties: {
            phone: { type: "string", example: "+22961234567" },
            otp: { type: "string", example: "123456" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Authentication successful" },
            data: {
              type: "object",
              properties: {
                token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
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
            countryId: { type: "string", format: "uuid" },
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
            rating: { type: "number", example: 4.8 },
            ratingCount: { type: "integer", example: 120 },
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
        Order: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            countryId: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            driverId: { type: "string", format: "uuid", nullable: true },
            pickupLocation: { type: "string", example: "6.37,2.39" },
            pickupAddress: { type: "string", example: "Rue 123, Cotonou" },
            destinationLocation: { type: "string", example: "6.38,2.40" },
            destinationAddress: { type: "string", example: "Rue 456, Cotonou" },
            price: { type: "number", example: 1500 },
            distance: { type: "string", example: "5.2 km" },
            driverRating: { type: "number", example: 5, nullable: true },
            driverRatingComment: { type: "string", nullable: true },
            driverRatedAt: { type: "string", format: "date-time", nullable: true },
            ratedByUserId: { type: "string", format: "uuid", nullable: true },
            status: {
              type: "string",
              enum: ["PENDING", "ACCEPTED", "DRIVER_ASSIGNED", "DRIVER_ARRIVED_PICKUP", "DRIVER_LEFT_PICKUP", "PICKED_UP", "IN_TRANSIT", "COMPLETED", "CANCELLED"]
            },
            vehicleType: { type: "string", example: "moto" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        OrderResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { $ref: "#/components/schemas/Order" },
          },
        },
        OrderListResponse: {
          type: "array",
          items: { $ref: "#/components/schemas/Order" },
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
            paidAt: { type: "string", format: "date-time", nullable: true },
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
                checkoutUrl: { type: "string", nullable: true, example: "https://sandbox-checkout.fedapay.com/..." },
                checkoutToken: { type: "string", nullable: true, example: "tok_xxxxxxxxx" },
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
        Country: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            code: { type: "string", example: "benin" },
            iso2: { type: "string", example: "BJ" },
            iso3: { type: "string", example: "BEN" },
            name: { type: "string", example: "Benin" },
            phoneCode: { type: "string", example: "+229" },
            currencyCode: { type: "string", example: "XOF" },
            minLatitude: { type: "number", nullable: true },
            maxLatitude: { type: "number", nullable: true },
            minLongitude: { type: "number", nullable: true },
            maxLongitude: { type: "number", nullable: true },
            centerLatitude: { type: "number", nullable: true },
            centerLongitude: { type: "number", nullable: true },
            isActive: { type: "boolean" },
            isDefault: { type: "boolean" },
          },
        },
        ServiceZone: {
          type: "object",
          properties: {
            id: { type: "string" },
            countryId: { type: "string", format: "uuid" },
            name: { type: "string" },
            city: { type: "string", nullable: true },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            polygon: { type: "object", nullable: true },
          },
        },
        Address: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            label: { type: "string", example: "Maison" },
            mapLabel: { type: "string", example: "Rue 123, Cotonou" },
            latitude: { type: "number", example: 6.37 },
            longitude: { type: "number", example: 2.39 },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        AddressListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            count: { type: "number", example: 1 },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/Address" },
            },
          },
        },
        Conversation: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            orderId: { type: "string", format: "uuid", nullable: true },
            lastMessage: { type: "string", nullable: true },
            lastMessageAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ChatMessage: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            conversationId: { type: "string", format: "uuid" },
            senderId: { type: "string", format: "uuid" },
            recipientId: { type: "string", format: "uuid" },
            content: { type: "string" },
            isRead: { type: "boolean" },
            readAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        DriverDocument: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            type: { type: "string", enum: ["ID_CARD", "DRIVER_LICENSE", "ID_PHOTO", "VEHICLE_REGISTRATION", "VEHICLE_INSURANCE"] },
            status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "MISSING"] },
            url: { type: "string", nullable: true },
            expiresAt: { type: "string", format: "date-time", nullable: true },
            verifiedAt: { type: "string", format: "date-time", nullable: true },
            verifiedBy: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        DriverOnboardingStatus: {
          type: "object",
          properties: {
            identityVerified: { type: "boolean" },
            accountStatus: { type: "string" },
            isActive: { type: "boolean" },
            isAvailable: { type: "boolean" },
            hasSubmittedOnboarding: { type: "boolean" },
            hasAllDocuments: { type: "boolean" },
            allApproved: { type: "boolean" },
            canAccessCourier: { type: "boolean" },
            onboardingState: { type: "string", enum: ["APPROVED", "REJECTED", "PENDING", "INCOMPLETE"] },
            driver: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                email: { type: "string" },
                city: { type: "string" },
                dateOfBirth: { type: "string" },
              },
            },
            vehicle: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                brand: { type: "string" },
                year: { type: "number" },
                plateNumber: { type: "string" },
              },
            },
            documents: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  status: { type: "string" },
                  url: { type: "string", nullable: true },
                  updatedAt: { type: "string", format: "date-time", nullable: true },
                },
              },
            },
          },
        },
        DriverVehicle: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            driverId: { type: "string", format: "uuid" },
            type: { type: "string", example: "moto" },
            plateNumber: { type: "string", example: "AB 1234 RB" },
            brand: { type: "string", nullable: true },
            model: { type: "string", nullable: true },
            year: { type: "number", nullable: true },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            isPrimary: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Faq: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            question: { type: "string" },
            answer: { type: "string" },
            category: { type: "string", nullable: true },
            isActive: { type: "boolean" },
            order: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        FoodHomePromo: {
          type: "object",
          properties: {
            id: { type: "string", example: "promo-1" },
            title: { type: "string", example: "-30% sur votre premier repas" },
            subtitle: { type: "string", example: "Code BIENVENUE, valable sur une selection de restaurants." },
            ctaLabel: { type: "string", example: "Commander maintenant" },
            imageUrl: { type: "string", example: "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg" },
            colors: { type: "array", items: { type: "string" }, example: ["#FF6A3D", "#FF9A3D"] },
            icon: { type: "string", example: "local_fire_department_rounded" },
          },
        },
        FoodHomeCategory: {
          type: "object",
          properties: {
            id: { type: "string", example: "burger" },
            name: { type: "string", example: "Burgers" },
            icon: { type: "string", example: "lunch_dining_rounded" },
            color: { type: "string", example: "#FF8A3D" },
          },
        },
        FoodHomeRestaurant: {
          type: "object",
          properties: {
            id: { type: "string", example: "resto-1" },
            name: { type: "string", example: "Burger Factory" },
            description: { type: "string", example: "Smash burgers, frites maison et sauces signatures." },
            categoryId: { type: "string", example: "burger" },
            categoryLabel: { type: "string", example: "Burgers" },
            rating: { type: "number", example: 4.8 },
            ratingCount: { type: "integer", example: 420 },
            deliveryMinutes: { type: "integer", example: 24 },
            deliveryFee: { type: "number", example: 800 },
            isOpen: { type: "boolean", example: true },
            isPopular: { type: "boolean", example: true },
            isRecommended: { type: "boolean", example: true },
            isNearby: { type: "boolean", example: true },
            imageUrl: { type: "string", example: "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg" },
            accentColor: { type: "string", example: "#FF8A3D" },
            icon: { type: "string", example: "lunch_dining_rounded" },
            tags: { type: "array", items: { type: "string" }, example: ["Best seller", "Livraison rapide"] },
          },
        },
        FoodHomeProduct: {
          type: "object",
          properties: {
            id: { type: "string", example: "prod-1" },
            restaurantId: { type: "string", example: "resto-1" },
            name: { type: "string", example: "Double Smash Bacon" },
            description: { type: "string", example: "Deux steaks smash, cheddar fondant, bacon grille et sauce maison." },
            imageUrl: { type: "string", example: "https://images.pexels.com/photos/1639562/pexels-photo-1639562.jpeg" },
            price: { type: "number", example: 4500 },
            originalPrice: { type: "number", nullable: true, example: 5200 },
            isAvailable: { type: "boolean", example: true },
            isPopular: { type: "boolean", example: true },
            tags: { type: "array", items: { type: "string" }, example: ["Best seller", "Boeuf"] },
          },
        },
        FoodHomeFeedResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                promos: { type: "array", items: { $ref: "#/components/schemas/FoodHomePromo" } },
                categories: { type: "array", items: { $ref: "#/components/schemas/FoodHomeCategory" } },
                restaurants: { type: "array", items: { $ref: "#/components/schemas/FoodHomeRestaurant" } },
              },
            },
          },
        },
        FoodCatalogSearchResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                restaurants: { type: "array", items: { $ref: "#/components/schemas/FoodHomeRestaurant" } },
                products: {
                  type: "array",
                  items: {
                    allOf: [
                      { $ref: "#/components/schemas/FoodHomeProduct" },
                      {
                        type: "object",
                        properties: {
                          restaurant: { $ref: "#/components/schemas/FoodHomeRestaurant" },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        FoodRestaurantDetailResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              allOf: [
                { $ref: "#/components/schemas/FoodHomeRestaurant" },
                {
                  type: "object",
                  properties: {
                    products: { type: "array", items: { $ref: "#/components/schemas/FoodHomeProduct" } },
                  },
                },
              ],
            },
          },
        },
        FoodProductDetailResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              allOf: [
                { $ref: "#/components/schemas/FoodHomeProduct" },
                {
                  type: "object",
                  properties: {
                    restaurant: { $ref: "#/components/schemas/FoodHomeRestaurant" },
                  },
                },
              ],
            },
          },
        },
        VehiclePricingConfig: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            countryId: { type: "string", format: "uuid" },
            vehicleType: { type: "string" },
            baseFare: { type: "number" },
            perKmRate: { type: "number" },
            perMinuteRate: { type: "number" },
            bookingFee: { type: "number" },
            minimumFare: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        PricingRule: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            countryId: { type: "string", format: "uuid" },
            name: { type: "string" },
            type: { type: "string", enum: ["SURGE", "DISCOUNT", "FIXED"] },
            value: { type: "number" },
            condition: { type: "object", nullable: true },
            isActive: { type: "boolean" },
            priority: { type: "number" },
            startDate: { type: "string", format: "date-time", nullable: true },
            endDate: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        DriverRevenueConfig: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            countryId: { type: "string", format: "uuid" },
            vehicleType: { type: "string" },
            baseFare: { type: "number" },
            perKmRate: { type: "number" },
            perMinuteRate: { type: "number" },
            commissionPercent: { type: "number" },
            serviceFeePercent: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        GlobalSettings: {
          type: "object",
          properties: {
            contact: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                  icon: { type: "string", nullable: true },
                },
              },
            },
            about: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                  icon: { type: "string", nullable: true },
                },
              },
            },
            operations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  key: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
          },
        },
        SupportCategory: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            isActive: { type: "boolean" },
            sortOrder: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SupportMessage: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            ticketId: { type: "string", format: "uuid" },
            senderId: { type: "string", format: "uuid" },
            senderRole: { type: "string" },
            message: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            sender: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                phone: { type: "string" },
                role: { type: "string" },
              },
            },
          },
        },
        SupportTicket: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            orderId: { type: "string", format: "uuid", nullable: true },
            subject: { type: "string", nullable: true },
            status: { type: "string", enum: ["OPEN", "PENDING", "RESOLVED", "CLOSED"] },
            priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
            category: { type: "string", nullable: true },
            isArchived: { type: "boolean" },
            assignedTo: { type: "string", format: "uuid", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            lastMessageAt: { type: "string", format: "date-time" },
            requester: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                phone: { type: "string" },
                role: { type: "string" },
              },
            },
            assignedAdmin: {
              type: "object",
              nullable: true,
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                phone: { type: "string" },
                role: { type: "string" },
              },
            },
            messages: {
              type: "array",
              items: { $ref: "#/components/schemas/SupportMessage" },
            },
          },
        },
        VehicleType: {
          type: "object",
          properties: {
            id: { type: "string" },
            countryId: { type: "string", format: "uuid" },
            code: { type: "string" },
            name: { type: "string" },
            label: { type: "string" },
            iconKey: { type: "string" },
            sortOrder: { type: "number" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
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
    },

    tags: [
      { name: "Auth", description: "Authentication OTP + JWT" },
      { name: "Maps", description: "Google Maps, geocoding et resolution de lieux" },
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
      { name: "VehicleTypes", description: "Types de vehicules par pays" },
      { name: "Countries", description: "Pays et resolution GPS" },
      { name: "FoodHome", description: "Contenu de l'accueil Eats" },
      { name: "Sms", description: "SMS & OTP Testing" },
    ],
  },
  apis: [
    "src/**/*.routes.ts",
    "src/**/*.route.ts"
  ],
});
