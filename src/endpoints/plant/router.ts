import { Hono } from "hono";
import { fromHono } from "chanfana";
import { PlantIdentification } from "./identification";
import { PlantHealthAssessment } from "./health";
import { CreateApiKey } from "./apiKeys";
import { UsageInfo } from "./usageInfo";
import { PlantSearch } from "./plantSearch";
import { PlantDetail } from "./plantDetail";

export const plantRouter = fromHono(new Hono());

// Plant.ID v3 API compatible endpoints
plantRouter.post("/v3/identification", PlantIdentification);
plantRouter.post("/v3/health_assessment", PlantHealthAssessment);
plantRouter.get("/v3/usage_info", UsageInfo);
plantRouter.get("/v3/kb/plants/name_search", PlantSearch);
plantRouter.get("/v3/kb/plants/:access_token", PlantDetail);

// API key management endpoint
plantRouter.post("/admin/api-keys", CreateApiKey);