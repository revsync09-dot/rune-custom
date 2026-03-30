# Rune Custom Bot

Discord bot for Rune carry tickets and vouches, built for Northflank with Discord Components v2 containers and Supabase.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Discord and Supabase variables.
3. Run the SQL from `schema.sql` in Supabase.
4. Install dependencies with `npm install`.
5. Start locally with `npm run dev`.

## Deploy

- Northflank build command: `npm install && npm run build`
- Northflank start command: `npm start`
- Dockerfile is included if you prefer Docker deployment.
