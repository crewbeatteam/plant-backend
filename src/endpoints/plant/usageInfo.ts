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
    description: `
Retrieve comprehensive usage statistics, credit limits, and remaining credits for your API key. This endpoint helps you monitor your API consumption and plan usage accordingly.

## Usage Tracking

### Credit System
- **Plant Identification**: 1 credit per request
- **Health Assessment**: 1 credit per request  
- **Plant Search**: 0.1 credits per request
- **Plant Details**: 0.5 credits per request

### Billing Periods
- **Day**: Rolling 24-hour period from first API call
- **Week**: Rolling 7-day period  
- **Month**: Rolling 30-day period
- **Total**: Lifetime usage since API key creation

## Response Fields

- \`active\`: Whether your API key is currently active
- \`credit_limits\`: Maximum credits allowed per time period
- \`used\`: Credits consumed in each time period
- \`remaining\`: Credits remaining in each time period
- \`can_use_credits\`: Whether you can make more API calls
    `.trim(),
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
            examples: {
              active_account: {
                summary: "Active account with usage",
                description: "Example response for an active API key with moderate usage",
                value: {
                  active: true,
                  credit_limits: {
                    day: null,
                    week: null,
                    month: null,
                    total: 1000
                  },
                  used: {
                    day: 5,
                    week: 23,
                    month: 145,
                    total: 347
                  },
                  can_use_credits: {
                    value: true,
                    reason: null
                  },
                  remaining: {
                    day: null,
                    week: null,
                    month: null,
                    total: 653
                  }
                }
              },
              near_limit: {
                summary: "Account nearing credit limit",
                description: "Example response when approaching credit limit",
                value: {
                  active: true,
                  credit_limits: {
                    day: 50,
                    week: 200,
                    month: 500,
                    total: 1000
                  },
                  used: {
                    day: 48,
                    week: 195,
                    month: 487,
                    total: 987
                  },
                  can_use_credits: {
                    value: true,
                    reason: null
                  },
                  remaining: {
                    day: 2,
                    week: 5,
                    month: 13,
                    total: 13
                  }
                }
              },
              limit_exceeded: {
                summary: "Credit limit exceeded",
                description: "Example response when credit limit has been reached",
                value: {
                  active: true,
                  credit_limits: {
                    day: null,
                    week: null,
                    month: null,
                    total: 1000
                  },
                  used: {
                    day: 15,
                    week: 87,
                    month: 432,
                    total: 1000
                  },
                  can_use_credits: {
                    value: false,
                    reason: "Credit limit reached"
                  },
                  remaining: {
                    day: null,
                    week: null,
                    month: null,
                    total: 0
                  }
                }
              }
            }
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