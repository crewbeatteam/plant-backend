import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { plantRouter } from "./endpoints/plant/router";
import { ContentfulStatusCode } from "hono/utils/http-status";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Api-Key'],
}));

app.onError((err, c) => {
  if (err instanceof ApiException) {
    // If it's a Chanfana ApiException, let Chanfana handle the response
    return c.json(
      { success: false, errors: err.buildResponse() },
      err.status as ContentfulStatusCode,
    );
  }

  console.error("Global error handler caught:", err); // Log the error if it's not known

  // For other errors, return a generic 500 response
  return c.json(
    {
      success: false,
      errors: [{ code: 7000, message: "Internal Server Error" }],
    },
    500,
  );
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
  redoc_url: "/redoc",
  schema: {
    info: {
      title: "Plant.ID v3 API",
      version: "3.0.0",
      description: `
# Plant.ID v3 API

AI-powered plant identification and health assessment API compatible with Plant.ID v3.

## Features

- **Plant Identification**: Upload images to identify plant species using multiple AI providers
- **Health Assessment**: Analyze plant images for diseases and health issues
- **Knowledge Base**: Comprehensive plant search with multi-provider biodiversity data
- **API Key Management**: Secure access with API key authentication
- **Usage Tracking**: Monitor API usage and limits

## Enhanced Knowledge Base

Our plant knowledge base integrates multiple authoritative biodiversity databases:

- **GBIF**: Global Biodiversity Information Facility - comprehensive taxonomic data
- **iNaturalist**: Community-driven observations with high-quality photos
- **Perenual**: Plant care guides and growing characteristics
- **Local Database**: Cached data for fast retrieval

## Authentication

All endpoints require an \`Api-Key\` header for authentication. Create an API key using the \`/admin/api-keys\` endpoint.

## Plant Identification Providers

- **Mock**: Built-in plant database for testing
- **PlantNet**: Real plant identification using PlantNet API
- **OpenAI**: AI-powered identification using GPT-4 Vision

## Rate Limits

API usage is tracked and limited based on your subscription plan. Check your usage with the \`/v3/usage_info\` endpoint.
      `.trim(),
      contact: {
        name: "Plant.ID API Support",
        url: "https://github.com/your-repo/plant-id",
        email: "support@plant-id.example.com"
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT"
      }
    },
    servers: [
      {
        url: "https://your-api.example.com",
        description: "Production server"
      },
      {
        url: "http://localhost:8787",
        description: "Development server"
      }
    ],
    tags: [
      {
        name: "Plant Identification",
        description: "AI-powered plant species identification from images"
      },
      {
        name: "Plant Health",
        description: "Plant health assessment and disease detection"
      },
      {
        name: "Plant Knowledge Base",
        description: "Search and retrieve detailed plant information"
      },
      {
        name: "API Management",
        description: "API key management and usage tracking"
      }
    ]
  },
});

// Register Plant API router (main functionality)
openapi.route("/", plantRouter);

// Export the Hono app
export default app;
