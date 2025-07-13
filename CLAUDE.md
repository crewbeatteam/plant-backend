# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm dev` - Start local development server with automatic database seeding
- `pnpm test` - Run integration tests using Vitest with Cloudflare Workers pool
- `pnpm seedLocalDb` - Apply D1 database migrations locally
- `pnpm deploy` - Deploy to Cloudflare Workers (runs migrations first)
- `pnpm schema` - Generate and extract OpenAPI schema locally
- `pnpm cf-typegen` - Generate TypeScript types from Wrangler

## Architecture Overview

This is a Cloudflare Workers backend API using:

**Core Stack:**
- **Hono** - Web framework for Cloudflare Workers
- **Chanfana** - OpenAPI 3.1 auto-generation and validation framework
- **D1** - Cloudflare's SQLite database
- **Vitest** - Testing framework with Cloudflare Workers integration
- **Zod** - Schema validation and TypeScript type generation

**Project Structure:**
- `src/index.ts` - Main application entry point with Hono app setup and global error handling
- `src/endpoints/` - API endpoint implementations organized by feature
- `src/endpoints/tasks/` - Complete CRUD operations for tasks (uses Chanfana D1 AutoEndpoints pattern)
- `src/types.ts` - Shared TypeScript type definitions
- `migrations/` - D1 database migration files
- `tests/` - Integration tests with separate Vitest configuration
- `wrangler.jsonc` - Cloudflare Workers configuration

**Key Patterns:**
- Each endpoint family has its own router (e.g., `tasksRouter`)
- Zod schemas define both API validation and TypeScript types
- Database models use a consistent pattern with `TaskModel` containing schema, serializer, and metadata
- OpenAPI documentation is auto-generated from endpoint definitions
- Integration tests run against actual Worker environment with D1 database

**Database:**
- D1 database binding configured as `DB` in wrangler.jsonc
- Tasks table with fields: id, name, slug, description, completed, due_date
- Migrations are applied automatically during deployment

This template demonstrates both Chanfana D1 AutoEndpoints and standard endpoint patterns for building scalable OpenAPI-compliant Workers.

## Environment Configuration

**API Keys and Environment Variables:**
- Copy `.dev.vars` file and add your actual API keys for local development
- For production deployment, use `wrangler secret put` command to set secrets
- Environment variables configured in `wrangler.jsonc`:
  - `DEFAULT_IDENTIFIER` - Primary plant identification provider (mock/plantnet/openai)
  - `FALLBACK_IDENTIFIERS` - Comma-separated fallback providers
- Secrets (set via wrangler CLI, not in config files):
  - `PLANTNET_API_KEY` - PlantNet API key
  - `OPENAI_API_KEY` - OpenAI API key

**Setting Production Secrets:**
```bash
wrangler secret put PLANTNET_API_KEY
wrangler secret put OPENAI_API_KEY
```

**Plant Identification Providers:**
- **Mock**: Default fallback, uses built-in plant database
- **PlantNet**: Real plant identification using PlantNet API
- **OpenAI**: AI-powered identification using GPT-4 Vision

## Commit Message Guidelines

- Do not mention "Claude" or "AI" in commit messages
- Focus on the functional changes made to the codebase
- Use conventional commit format when possible (feat:, fix:, refactor:, etc.)