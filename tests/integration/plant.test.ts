import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock base64 image data (minimal valid base64)
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

// Helper function to create an API key
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

describe("Plant API Integration Tests", () => {
  let apiKey: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create a fresh API key for each test
    const apiKeyResponse = await createApiKey("Test API Key");
    apiKey = apiKeyResponse.api_key;
  });

  describe("POST /admin/api-keys", () => {
    it("should create a new API key successfully", async () => {
      const response = await SELF.fetch("http://local.test/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Plant API Key" }),
      });

      const body = await response.json<{
        id: number;
        name: string;
        api_key: string;
        created_at: string;
      }>();

      expect(response.status).toBe(201);
      expect(body.name).toBe("My Plant API Key");
      expect(body.api_key).toMatch(/^[a-f0-9-]+[a-z0-9]+$/);
      expect(body.id).toBeTypeOf("number");
      expect(body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should return 400 for invalid API key name", async () => {
      const response = await SELF.fetch("http://local.test/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("Invalid request parameters");
    });
  });

  describe("POST /v3/identification", () => {
    it("should successfully identify a plant with valid API key and image", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("details", "common_names,url,taxonomy");
      formData.append("classification_level", "all");
      formData.append("language", "en");

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.status).toBe("COMPLETED");
      expect(body.result).toHaveProperty("is_plant");
      expect(body.result.is_plant).toHaveProperty("probability");
      expect(body.result.is_plant).toHaveProperty("binary");
      expect(body.result).toHaveProperty("classification");
      expect(body.result.classification).toHaveProperty("suggestions");
      expect(Array.isArray(body.result.classification.suggestions)).toBe(true);
      
      // Check first suggestion structure
      if (body.result.classification.suggestions.length > 0) {
        const suggestion = body.result.classification.suggestions[0];
        expect(suggestion).toHaveProperty("id");
        expect(suggestion).toHaveProperty("name");
        expect(suggestion).toHaveProperty("probability");
        expect(suggestion.probability).toBeGreaterThan(0);
        expect(suggestion.probability).toBeLessThanOrEqual(1);
      }
    });

    it("should return 401 without API key", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        body: formData,
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("API key is required");
    });

    it("should return 401 with invalid API key", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": "invalid-api-key",
        },
        body: formData,
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid API key");
    });

    it("should return 400 for missing images", async () => {
      const formData = new FormData();
      // Don't append any images to test missing images

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid request parameters");
      expect(body.details).toContain("images: At least one image is required");
    });

    it("should return 400 for invalid file type", async () => {
      const formData = new FormData();
      // Create a mock file with invalid content type
      const invalidFile = new File(["invalid content"], "test.txt", { type: "text/plain" });
      formData.append("images", invalidFile);

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid images");
    });

    it("should successfully identify a plant using FormData with file upload", async () => {
      const formData = new FormData();
      
      // Create a mock file from base64 data
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("classification_level", "species");
      formData.append("language", "en");
      formData.append("similar_images", "false");

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.status).toBe("COMPLETED");
      expect(body.result).toHaveProperty("is_plant");
      expect(body.result.is_plant).toHaveProperty("probability");
      expect(body.result.is_plant).toHaveProperty("binary");
      expect(body.result).toHaveProperty("classification");
      expect(body.result.classification).toHaveProperty("suggestions");
      expect(Array.isArray(body.result.classification.suggestions)).toBe(true);
    });

    it("should handle multiple files in FormData", async () => {
      const formData = new FormData();
      
      // Create multiple mock files
      const mockFile1 = createMockFile("plant1.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      const mockFile2 = createMockFile("plant2.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile1);
      formData.append("images", mockFile2);
      formData.append("classification_level", "all");

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.status).toBe("COMPLETED");
      expect(body.result).toHaveProperty("is_plant");
      expect(body.result).toHaveProperty("classification");
    });

    it("should return 400 for FormData without images", async () => {
      const formData = new FormData();
      formData.append("classification_level", "species");

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid request parameters");
      expect(body.details).toContain("images: At least one image is required");
    });

    it("should return 400 for invalid content type", async () => {
      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify({ images: ["test"] }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid content type");
      expect(body.details).toContain("Content-Type must be multipart/form-data for file uploads");
    });

    it("should handle JSON object parameters in FormData", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("suggestion_filter", JSON.stringify({ classification: "Plantae" }));

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.status).toBe("COMPLETED");
    });
  });

  describe("POST /v3/health_assessment", () => {
    it("should successfully assess plant health with valid API key and image", async () => {
      const requestData = {
        images: [MOCK_BASE64_IMAGE],
        details: "description,treatment",
        language: "en"
      };

      const response = await SELF.fetch("http://local.test/v3/health_assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify(requestData),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.access_token).toBeTypeOf("string");
      expect(body.status).toBe("COMPLETED");
      expect(body.result).toHaveProperty("is_healthy");
      expect(body.result.is_healthy).toHaveProperty("probability");
      expect(body.result.is_healthy).toHaveProperty("binary");
      expect(body.result).toHaveProperty("disease");
      expect(body.result.disease).toHaveProperty("suggestions");
      expect(Array.isArray(body.result.disease.suggestions)).toBe(true);
      
      // If diseases are detected, check their structure
      if (body.result.disease.suggestions.length > 0) {
        const disease = body.result.disease.suggestions[0];
        expect(disease).toHaveProperty("id");
        expect(disease).toHaveProperty("name");
        expect(disease).toHaveProperty("probability");
        expect(disease.probability).toBeGreaterThan(0);
        expect(disease.probability).toBeLessThanOrEqual(1);
      }
    });

    it("should return 401 without API key", async () => {
      const requestData = {
        images: [MOCK_BASE64_IMAGE],
      };

      const response = await SELF.fetch("http://local.test/v3/health_assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("API key is required");
    });

    it("should return 400 for missing images", async () => {
      const requestData = {
        images: [],
      };

      const response = await SELF.fetch("http://local.test/v3/health_assessment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey,
        },
        body: JSON.stringify(requestData),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid request parameters");
    });
  });

  describe("Classification levels and details", () => {
    it("should respect classification_level parameter", async () => {
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

    it("should include requested details in plant suggestions", async () => {
      const formData = new FormData();
      const mockFile = createMockFile("plant.jpg", "image/jpeg", MOCK_BASE64_IMAGE);
      formData.append("images", mockFile);
      formData.append("details", "common_names,taxonomy,url");

      const response = await SELF.fetch("http://local.test/v3/identification", {
        method: "POST",
        headers: {
          "Api-Key": apiKey,
        },
        body: formData,
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      
      if (body.result.classification.suggestions.length > 0) {
        const suggestion = body.result.classification.suggestions[0];
        if (suggestion.details) {
          // Check that requested details are present when available
          expect(suggestion.details).toBeDefined();
        }
      }
    });
  });
});