import type { ImageIdentifier } from "./interface";
import { PlantNetIdentifier } from "./plantNetIdentifier";
import { OpenAIIdentifier } from "./openAIIdentifier";

export type IdentifierType = "plantnet" | "openai" | "mock";

export interface ImageIdentifierConfig {
  plantnet?: {
    apiKey: string;
  };
  openai?: {
    apiKey: string;
  };
  default?: IdentifierType;
  fallback?: IdentifierType[];
}

export class ImageIdentifierFactory {
  private config: ImageIdentifierConfig;

  constructor(config: ImageIdentifierConfig) {
    this.config = config;
  }

  async createIdentifier(type?: IdentifierType): Promise<ImageIdentifier> {
    const identifierType = type || this.config.default || "mock";

    switch (identifierType) {
      case "plantnet":
        if (!this.config.plantnet?.apiKey) {
          throw new Error("PlantNet API key not configured");
        }
        return new PlantNetIdentifier(this.config.plantnet.apiKey);

      case "openai":
        if (!this.config.openai?.apiKey) {
          throw new Error("OpenAI API key not configured");
        }
        return new OpenAIIdentifier(this.config.openai.apiKey);

      case "mock":
      default:
        // Import mock identifier (our existing implementation)
        const { MockIdentifier } = await import("./mockIdentifier");
        return new MockIdentifier();
    }
  }

  async createBestAvailableIdentifier(): Promise<ImageIdentifier> {
    console.log("this.config.default:" + this.config.default);
    console.log("this.config.fallback:" + this.config.fallback);
    const typesToTry = [
      this.config.default,
      ...(this.config.fallback || []),
      "mock", // Always fallback to mock
    ].filter(Boolean) as IdentifierType[];

    for (const type of typesToTry) {
      try {
        const identifier = await this.createIdentifier(type);
        const isAvailable = await identifier.isAvailable();

        console.log(identifier.getName() + " isAvailable: " + isAvailable);

        if (isAvailable) {
          console.log(`Using ${identifier.getName()} for plant identification`);
          return identifier;
        }
      } catch (error) {
        console.warn(`Failed to create ${type} identifier:`, error);
      }
    }

    // Final fallback to mock
    const { MockIdentifier } = await import("./mockIdentifier");
    return new MockIdentifier();
  }

  static fromEnvironment(env: any): ImageIdentifierFactory {
    return new ImageIdentifierFactory({
      plantnet: env.PLANTNET_API_KEY
        ? {
            apiKey: env.PLANTNET_API_KEY,
          }
        : undefined,
      openai: env.OPENAI_API_KEY
        ? {
            apiKey: env.OPENAI_API_KEY,
          }
        : undefined,
      default: (env.DEFAULT_IDENTIFIER as IdentifierType) || "plantnet",
      fallback: env.FALLBACK_IDENTIFIERS
        ? (env.FALLBACK_IDENTIFIERS.split(",") as IdentifierType[])
        : ["openai"],
    });
  }
}
