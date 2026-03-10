import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "e-Cheetah API",
      version: "1.0.0",
      description: "Super-app Mobility & Delivery API",
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
        LoginRequest: {
          type: "object",
          required: ["phone"],
          properties: {
            phone: {
              type: "string",
              example: "+22961234567",
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
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Authentication successful" },
            data: {
              type: "object",
              properties: {
                token: { type: "string" },
                user: { type: "object" },
              },
            },
          },
        },
      },
    },

    tags: [
      { name: "Auth", description: "Authentication OTP + JWT" },
      { name: "Users", description: "Users management" },
      { name: "Drivers", description: "Drivers & availability" },
      { name: "Bookings", description: "Rides & Deliveries" },
    ],
  },

  apis: ["src/modules/**/*.routes.ts"],
});
