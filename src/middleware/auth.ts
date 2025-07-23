import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types";

export const apiKeyAuth = createMiddleware<{ 
  Bindings: Env,
  Variables: {
    apiKey: {
      id: unknown;
      name: unknown;
      is_active: unknown;
    }
  }
}>(async (c, next) => {
  const apiKey = c.req.header("Api-Key");
  
  if (!apiKey) {
    return c.json({ error: "API key is required" }, 401);
  }

  try {
    // Hash the API key for database lookup
    const keyHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(apiKey)
    );
    const hashHex = Array.from(new Uint8Array(keyHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Query the database for the API key
    const result = await c.env.DB.prepare(
      "SELECT id, name, is_active FROM api_keys WHERE key_hash = ? AND is_active = 1"
    ).bind(hashHex).first();

    if (!result) {
      return c.json({ error: "Invalid API key" }, 401);
    }

    // Update last_used_at timestamp
    await c.env.DB.prepare(
      "UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?"
    ).bind(result.id).run();

    // Store API key info in context for later use
    c.set("apiKey", {
      id: result.id,
      name: result.name,
      is_active: result.is_active,
    });

    await next();
  } catch (error) {
    console.error("Database error during authentication:", error);
    return c.json({ error: "Authentication failed" }, 500);
  }
});

export const createApiKey = async (db: D1Database, name: string): Promise<{ key: string, id: number }> => {
  // Generate a random API key
  const key = crypto.randomUUID() + "-" + Date.now().toString(36);
  
  // Hash the key for storage
  const keyHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key)
  );
  const hashHex = Array.from(new Uint8Array(keyHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Insert into database
  const result = await db.prepare(
    "INSERT INTO api_keys (key_hash, name) VALUES (?, ?) RETURNING id"
  ).bind(hashHex, name).first();

  if (!result) {
    throw new Error("Failed to create API key");
  }

  return { key, id: result.id as number };
};