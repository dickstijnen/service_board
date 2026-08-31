# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**ContainerOS v2** — container & waste management platform. Strapi 5 (backend API) + Next.js 16 (frontend dashboard). All UI text is Dutch.

## Node Version

Always use **Node v22**. Both `backend/` and `frontend/` have `.nvmrc` set to `22.8.0`.

```bash
nvm use 22
```

## Running the project

Two terminals required:

```bash
# Terminal 1 — Strapi backend (http://localhost:1337)
cd backend && npm run dev

# Terminal 2 — Next.js frontend (http://localhost:3333)
cd frontend && npm run dev
```

Frontend port is driven by `NEXT_PUBLIC_SITE_URL` in `frontend/.env.local` (default 3333). The `npm run dev` script reads this via `scripts/dev.mjs` — don't pass `--port` directly.

## First-time setup

```bash
npm run setup        # generates backend/.env + frontend/.env.local with fresh secrets
```

Then boot both servers and create an admin user in Strapi at `http://localhost:1337/admin`. Reset an existing admin password with:

```bash
cd backend && npx strapi admin:reset-user-password --email=<email> --password=<password>
```

## Architecture

### Backend (`backend/`)

Strapi 5 headless CMS. SQLite locally (`.tmp/data.db`), PostgreSQL in production (toggle via `DATABASE_CLIENT` in `.env`).

**Content types** (all Dutch domain names):
| Type | Purpose |
|---|---|
| `container` | Physical containers; QR code auto-generated on create via lifecycle |
| `opdracht` | Work orders (plaatsing/ophaling/wisseling); auto-increments `opdracht_nummer`; lifecycle syncs container status + creates meldingen |
| `klant` | Customers (company or private), with separate billing/delivery addresses |
| `factuur` | Invoices linked 1:1 to an opdracht |
| `melding` | Activity notifications, created automatically by opdracht lifecycle |
| `tarief` | Price matrix: afval_soort × container formaat |
| `chauffeur-beschikbaarheid` | Driver availability calendar |
| `opdracht-foto` | Photo attachments (voor/na/algemeen) on opdrachten |

**Custom endpoints** in `src/api/dashboard/controllers/dashboard.ts`:
- `GET /api/dashboard/stats` — active containers, extra rentals, open orders, monthly revenue
- `GET /api/dashboard/containers-kaart` — containers with GPS + days-deployed for the map view

**Lifecycle hooks** live in `src/api/<type>/content-types/<type>/lifecycles.ts`. The opdracht lifecycle is the most complex: it manages container status transitions and auto-creates meldingen on create/update.

### Frontend (`frontend/`)

Next.js 16 App Router with Turbopack. React 19, Tailwind v4, shadcn/ui, GSAP + Lenis.

**API layers** — two distinct clients:
- `src/lib/strapi.ts` — Server-side SSR reads. Uses `STRAPI_API_TOKEN` (Bearer). Dev: `cache="no-store"`. Prod: tag-based ISR revalidation via webhook at `/api/revalidate`.
- `src/lib/api.ts` — Client-side mutations. Reads JWT from `localStorage` key `containeros_token`.

**Auth** (`src/hooks/useAuth.tsx`): JWT stored in localStorage (`containeros_token`, `containeros_gebruiker`). Roles: `chauffeur | planner | administratie | manager | admin`. Dashboard routes are protected — redirects to `/login` when no token.

**Routing**: `/` redirects to `/login`. All app routes live under `/dashboard/*` (containers, opdrachten, klanten, planning, facturatie, meldingen, kaart, qr, instellingen).

**Dashboard CRUD — VERPLICHT tweerichtingsverkeer.** Elke dashboardpagina die data toont moet die data ook kunnen aanmaken/bewerken, en wijzigingen moeten écht in Strapi worden opgeslagen — niet alleen in lokale state. Concreet:
- **Frontend → backend**: mutaties lopen via `src/lib/api.ts` (`apiPost`/`apiPut`/`apiDelete`). Create = `POST <plural>`, update = `PUT <plural>/:documentId` (Strapi 5 gebruikt **documentId** in de URL, niet de numerieke id). Relaties koppel je met de numerieke id (bv. `{ data: { klant: 16 } }`). Na opslaan altijd de lijst opnieuw laden.
- **Backend → frontend**: wijzigingen in de Strapi-admin moeten vanzelf zichtbaar worden aan de voorkant. Elke datapagina roept daarom `useLiveRefetch(laad)` aan (`src/hooks/useLiveRefetch.ts`) — herlaadt bij tab-focus/visibility + lichte polling. Geef je loader een vaste naam (`laad`) zodat de hook 'm kan hergebruiken.
- **Bewerken-UI**: gecentreerde modal (`src/components/dashboard/Modal.tsx`) met velden uit `src/components/dashboard/fields.tsx`. Per content type een `*Modal.tsx` (zie `OpdrachtModal`, `ContainerModal`, `KlantModal`, `FactuurModal`). Rijen zijn klikbaar = bewerken; aparte "Nieuwe …"-knop = aanmaken. Een nieuwe content-type-pagina volgt ditzelfde patroon.
- **Rol-gedrag**: chauffeurs zien hun eigen ritten (Planning, Chauffeur-app), planner/admin/manager zien alles.

Backend-eindpunten zijn afgeschermd: de `authenticated` rol krijgt z'n permissies via `backend/src/index.ts` (`bootstrap`). Nieuw content type of custom endpoint → actie toevoegen aan de lijst in die bootstrap, anders volgt een 403.

**Animation system**: `ScrollAnimationsProvider` drives GSAP ScrollTrigger via `data-scroll-animate`, `data-translate-y`, etc. attributes. `LenisProvider` handles smooth scroll globally.

**Fonts**: loaded from `src/fonts/fonts.ts` as CSS variables (`--font-mori`, `--font-fraktionMono`, `--font-publicSans`).

## Environment variables

**Backend** (`.env`): `APP_KEYS`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `API_TOKEN_SALT`, `DATABASE_CLIENT` (sqlite|postgres), optional postgres params + DigitalOcean Spaces config.

**Frontend** (`.env.local`): `NEXT_PUBLIC_STRAPI_URL` (default `http://localhost:1337`), `STRAPI_API_TOKEN`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `NEXT_PUBLIC_SITE_URL` (controls dev port), `NEXT_PUBLIC_MEDIA_HOST` (prod CDN), `REVALIDATE_SECRET`.

## Seed data

```bash
cd backend && node scripts/seed.js
```

Creates 3 chauffeur users (password: `Chauffeur1!`), 15 klanten, 5 containers, 35 tarieven, 10 opdrachten, 3 facturen.
