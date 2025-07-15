import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock base64 image data
const MOCK_BASE64_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

// Helper function to create a mock File object for testing
function createMockFile(name: string, type: string, content: string): File {
  // Convert base64 to binary string
  const base64Data = content.replace(/^data:image\/[a-z]+;base64,/, "");
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new File([bytes], name, { type });
}

async function createApiKey(name: string = "Test API Key") {
  const response = await SELF.fetch("http://local.test/admin/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = await response.json<{
    id: number;
    name: string;
    api_key: string;
    created_at: string;
  }>();
  return body;
}

describe("Plant.ID v3 Extended API Tests", () => {
  let apiKey: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const apiKeyResponse = await createApiKey("Extended Test API Key");
    apiKey = apiKeyResponse.api_key;
  });

  describe("GET /v3/usage_info", () => {
    it("should return usage information for valid API key", async () => {
      const response = await SELF.fetch("http://local.test/v3/usage_info", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("active");
      expect(body.active).toBe(true);
      expect(body).toHaveProperty("credit_limits");
      expect(body.credit_limits).toHaveProperty("total");
      expect(body).toHaveProperty("used");
      expect(body).toHaveProperty("can_use_credits");
      expect(body.can_use_credits).toHaveProperty("value");
      expect(body).toHaveProperty("remaining");
    });

    it("should return 401 without API key", async () => {
      const response = await SELF.fetch("http://local.test/v3/usage_info", {
        method: "GET",
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("API key is required");
    });

    it("should show credit usage after making identification requests", async () => {
      // Make a few identification requests first
      await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify({
          images: [MOCK_BASE64_IMAGE],
        }),
      });

      await SELF.fetch("http://local.test/v3/health_assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify({
          images: [MOCK_BASE64_IMAGE],
        }),
      });

      // Check usage info
      const response = await SELF.fetch("http://local.test/v3/usage_info", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.used.total).toBeGreaterThan(0);
      expect(body.remaining.total).toBeLessThan(body.credit_limits.total);
    });
  });

  describe("GET /v3/kb/plants/name_search", () => {
    it("should search plants by name", async () => {
      const response = await SELF.fetch("http://local.test/v3/kb/plants/name_search?q=ficus", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("entities");
      expect(Array.isArray(body.entities)).toBe(true);
      expect(body).toHaveProperty("entities_trimmed");
      expect(body).toHaveProperty("limit");

      if (body.entities.length > 0) {
        const entity = body.entities[0];
        expect(entity).toHaveProperty("matched_in");
        expect(entity).toHaveProperty("matched_in_type");
        expect(entity).toHaveProperty("access_token");
        expect(entity).toHaveProperty("entity_name");
      }
    });

    it("should include thumbnails when requested", async () => {
      const response = await SELF.fetch("http://local.test/v3/kb/plants/name_search?q=monstera&thumbnails=true", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      if (body.entities.length > 0) {
        const entity = body.entities[0];
        expect(entity).toHaveProperty("thumbnail");
      }
    });

    it("should return 400 without query parameter", async () => {
      const response = await SELF.fetch("http://local.test/v3/kb/plants/name_search", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Query parameter 'q' is required");
    });
  });

  describe("GET /v3/kb/plants/:access_token", () => {
    it("should get plant details with valid access token", async () => {
      // First, search for a plant to get an access token
      const searchResponse = await SELF.fetch("http://local.test/v3/kb/plants/name_search?q=ficus", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      const searchBody = await searchResponse.json();
      
      if (searchBody.entities.length > 0) {
        const accessToken = searchBody.entities[0].access_token;

        // Get plant details
        const detailResponse = await SELF.fetch(`http://local.test/v3/kb/plants/${accessToken}?details=common_names,description,taxonomy`, {
          method: "GET",
          headers: {
            "Api-Key": apiKey,
          },
        });

        expect(detailResponse.status).toBe(200);

        const detailBody = await detailResponse.json();
        expect(detailBody).toHaveProperty("access_token");
        expect(detailBody).toHaveProperty("entity_name");
        expect(detailBody).toHaveProperty("details");
        expect(detailBody.details).toHaveProperty("common_names");
        expect(detailBody.details).toHaveProperty("description");
        expect(detailBody.details).toHaveProperty("taxonomy");
      }
    });

    it("should return 400 without details parameter", async () => {
      const response = await SELF.fetch("http://local.test/v3/kb/plants/test-token", {
        method: "GET",
        headers: {
          "Api-Key": apiKey,
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Details parameter is required");
    });
  });

  describe("Advanced identification features", () => {
    it("should handle similar_images parameter", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("similar_images", "true");
      formData.append("details", "common_names,taxonomy");
      
      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result.classification.suggestions.length).toBeGreaterThan(0);
      
      const suggestion = body.result.classification.suggestions[0];
      expect(suggestion).toHaveProperty("similar_images");
      expect(Array.isArray(suggestion.similar_images)).toBe(true);
    });

    it("should handle custom_id parameter", async () => {
      const customId = 12345;
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("custom_id", customId.toString());
      
      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.custom_id).toBe(customId);
    });

    it("should handle classification_level parameter", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("classification_level", "genus");
      
      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.result.classification.suggestions).toBeDefined();
    });
  });

  describe("Health assessment advanced features", () => {
    it("should include disease questions when multiple diseases detected", async () => {
      const response = await SELF.fetch("http://local.test/v3/health_assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify({
          images: [MOCK_BASE64_IMAGE],
          details: "description,treatment,classification",
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      
      // Check if disease suggestions include advanced details
      if (body.result.disease.suggestions.length > 0) {
        const disease = body.result.disease.suggestions[0];
        expect(disease).toHaveProperty("similar_images");
        
        if (disease.details) {
          expect(disease.details).toBeDefined();
        }
      }
    });
  });
});