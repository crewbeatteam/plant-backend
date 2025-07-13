# Plant Identification API

A Cloudflare Workers backend API for plant identification with multiple provider support and OpenAPI 3.1 auto-generation using [chanfana](https://github.com/cloudflare/chanfana) and [Hono](https://github.com/honojs/hono).

## Features

- **Multiple Plant ID Providers**: Support for Mock, PlantNet, and OpenAI-powered identification
- **Fallback System**: Automatic failover between providers for reliable identification
- **OpenAPI 3.1 Compliant**: Auto-generated schema and request validation
- **D1 Database Integration**: SQLite database for data persistence
- **Integration Testing**: Comprehensive test suite using Vitest

## Plant Identification Providers

- **Mock**: Built-in plant database for testing and fallback
- **PlantNet**: Real plant identification using the PlantNet API
- **OpenAI**: AI-powered identification using GPT-4 Vision


## Setup Steps

1. Install the project dependencies:
   ```bash
   pnpm install
   ```

2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/):
   ```bash
   npx wrangler d1 create plant-id-db
   ```
   Update the `database_id` field in `wrangler.jsonc` with the new database ID.

3. Set up environment variables:
   - Copy `.dev.vars` file and add your API keys for local development
   - For production, set secrets using:
     ```bash
     wrangler secret put PLANTNET_API_KEY
     wrangler secret put OPENAI_API_KEY
     ```

4. Apply database migrations:
   ```bash
   pnpm seedLocalDb
   ```

5. Start development server:
   ```bash
   pnpm dev
   ```

6. Deploy to production:
   ```bash
   pnpm deploy
   ```

## Environment Configuration

Configure plant identification providers in `wrangler.jsonc`:

```json
{
  "vars": {
    "DEFAULT_IDENTIFIER": "mock",
    "FALLBACK_IDENTIFIERS": "plantnet,openai"
  }
}
```

Available providers: `mock`, `plantnet`, `openai`

## Development Commands

- `pnpm dev` - Start local development server with automatic database seeding
- `pnpm test` - Run integration tests using Vitest with Cloudflare Workers pool
- `pnpm seedLocalDb` - Apply D1 database migrations locally
- `pnpm deploy` - Deploy to Cloudflare Workers (runs migrations first)
- `pnpm schema` - Generate and extract OpenAPI schema locally
- `pnpm cf-typegen` - Generate TypeScript types from Wrangler

## Testing

Run integration tests using Vitest:

```bash
pnpm test
```

Test files are located in the `tests/` directory and run against actual Worker environment with D1 database.

## Project Structure

- `src/index.ts` - Main application entry point with Hono app setup
- `src/endpoints/` - API endpoint implementations organized by feature
- `src/types.ts` - Shared TypeScript type definitions
- `migrations/` - D1 database migration files
- `tests/` - Integration tests with Vitest configuration
- `wrangler.jsonc` - Cloudflare Workers configuration

## Documentation

- [Chanfana Documentation](https://chanfana.com/) - OpenAPI framework
- [Hono Documentation](https://hono.dev/docs) - Web framework
- [Vitest Documentation](https://vitest.dev/guide/) - Testing framework
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/) - Database
