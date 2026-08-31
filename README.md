# Mandelo web starter

A Strapi 5 + Next.js 16 monorepo starter for web projects. Clone it, install, boot, then follow the **in-app deploy guide** to take it live.

---

## 🚀 Get it running locally

Three steps: **use the template**, **install**, **boot**. ~5 minutes.

### Use this template

Click the green **`Use this template`** button (top right) → **Create a new repository** → name it for your project → Create. Then clone it:

```bash
git clone https://github.com//.git
cd 
```

### Install + scaffold

Run these from the repo root.

**macOS / Linux:**

```bash
cd backend && npm install && cd ../frontend && npm install && cd ..
npm run setup
```

**Windows (PowerShell):**

```powershell
cd backend; npm install; cd ../frontend; npm install; cd ..; npm run setup
```

`npm run setup` writes `backend/.env` and `frontend/.env.local` with fresh secrets. It's safe to re-run; it won't overwrite existing env files.

> Ignore npm vulnerability warnings on Strapi/Next — normal noise. **Never** run `npm audit fix --force`.

### Boot both apps

Two terminals, leave both running.

```bash
# Terminal 1 — Strapi backend
cd backend
npm run develop      # → http://localhost:1337/admin
```

```bash
# Terminal 2 — Next.js frontend
cd frontend
npm run dev
```

When Strapi finishes booting (~30s first time), open its admin and create your local admin user. Then open the frontend.

---

## 👉 Then follow the in-app deploy guide

The frontend home page has two buttons:

- **Set up your project** → a guided, phase-by-phase journey from local to a live production site
- **Tour the framework** → a walkthrough of every front-end system

Click **Set up your project** and follow it phase by phase. Your progress is saved in the browser, and every gotcha is called out at the exact step it matters.

---

## Stack

Strapi 5 · Next.js 16 · React 19 · Tailwind v4 · GSAP · next-intl (nl + en).

Reference notes and conventions live in the in-app guide at **`/setup/reference`**.
