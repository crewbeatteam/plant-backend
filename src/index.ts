import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { plantRouter } from "./endpoints/plant/router";
import { ContentfulStatusCode } from "hono/utils/http-status";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

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
  schema: {
    info: {
      title: "Plant.ID v3 API",
      version: "3.0.0",
      description: "AI-powered plant identification and health assessment API compatible with Plant.ID v3.",
    },
  },
});

// Register Plant API router (main functionality)
openapi.route("/", plantRouter);

// Export the Hono app
export default app;
