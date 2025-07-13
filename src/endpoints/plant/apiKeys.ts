import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { createApiKey } from "../../middleware/auth";

export class CreateApiKey extends OpenAPIRoute {
  schema = {
    tags: ["API Management"],
    summary: "Create a new API key",
    description: "Generate a new API key for accessing the Plant.ID API",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(100).describe("Descriptive name for the API key"),
            }),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "API key created successfully",
        content: {
          "application/json": {
            schema: z.object({
              id: z.number(),
              name: z.string(),
              api_key: z.string(),
              created_at: z.string(),
            }),
          },
        },
      },
      "400": {
        description: "Invalid request parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      // Parse and validate request body
      const body = await c.req.json();
      const validation = z.object({
        name: z.string().min(1).max(100),
      }).safeParse(body);
      
      if (!validation.success) {
        return c.json({
          error: "Invalid request parameters: " + validation.error.issues[0].message
        }, 400);
      }

      const { name } = validation.data;

      // Create new API key
      const { key, id } = await createApiKey(c.env.DB, name);

      return c.json({
        id,
        name,
        api_key: key,
        created_at: new Date().toISOString(),
      }, 201);

    } catch (error) {
      console.error("API key creation error:", error);
      return c.json({ error: "Failed to create API key" }, 500);
    }
  }
}