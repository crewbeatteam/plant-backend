import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";
import { apiKeyAuth } from "../../middleware/auth";

const UsageInfoResponseSchema = z.object({
  active: z.boolean(),
  credit_limits: z.object({
    day: z.number().nullable(),
    week: z.number().nullable(),
    month: z.number().nullable(),
    total: z.number().nullable(),
  }),
  used: z.object({
    day: z.number(),
    week: z.number(),
    month: z.number(),
    total: z.number(),
  }),
  can_use_credits: z.object({
    value: z.boolean(),
    reason: z.string().nullable(),
  }),
  remaining: z.object({
    day: z.number().nullable(),
    week: z.number().nullable(),
    month: z.number().nullable(),
    total: z.number().nullable(),
  }),
});

export class UsageInfo extends OpenAPIRoute {
  schema = {
    tags: ["API Management"],
    summary: "Get API key usage information",
    description: "Retrieve status, limits, usage statistics, and remaining credits for your API key",
    request: {
      headers: z.object({
        "Api-Key": z.string().describe("API key for authentication"),
      }),
    },
    responses: {
      "200": {
        description: "Usage information retrieved successfully",
        content: {
          "application/json": {
            schema: UsageInfoResponseSchema,
          },
        },
      },
      "401": {
        description: "Authentication failed",
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
      // Apply authentication middleware
      const authResponse = await apiKeyAuth(c, async () => {
        return null; // Continue to handler
      });
      
      if (authResponse) {
        return authResponse;
      }

      const apiKeyInfo = c.get("apiKey");
      if (!apiKeyInfo) {
        return c.json({ error: "Authentication failed" }, 401);
      }

      // Get usage statistics from database
      const usageStats = await this.getUsageStats(c.env.DB, apiKeyInfo.id);
      
      const creditLimits = {
        day: null,
        week: null,
        month: null,
        total: 1000, // Default limit
      };

      const remaining = {
        day: null,
        week: null,
        month: null,
        total: Math.max(0, creditLimits.total - usageStats.total),
      };

      const canUseCredits = {
        value: remaining.total > 0,
        reason: remaining.total <= 0 ? "Credit limit reached" : null,
      };

      return c.json({
        active: true,
        credit_limits: creditLimits,
        used: usageStats,
        can_use_credits: canUseCredits,
        remaining: remaining,
      });

    } catch (error) {
      console.error("Usage info error:", error);
      return c.json({ error: "Failed to retrieve usage information" }, 500);
    }
  }

  private async getUsageStats(db: D1Database, apiKeyId: number) {
    // Get counts from identification and health assessment tables
    const identificationCount = await db.prepare(
      "SELECT COUNT(*) as count FROM plant_identifications WHERE api_key_id = ?"
    ).bind(apiKeyId).first();

    const healthCount = await db.prepare(
      "SELECT COUNT(*) as count FROM plant_health_assessments WHERE api_key_id = ?"
    ).bind(apiKeyId).first();

    const totalUsed = (identificationCount?.count || 0) + (healthCount?.count || 0);

    // For now, return simple mock stats
    // In a real implementation, you'd track daily, weekly, monthly usage
    return {
      day: Math.min(totalUsed, 10),
      week: Math.min(totalUsed, 50),
      month: totalUsed,
      total: totalUsed,
    };
  }
}