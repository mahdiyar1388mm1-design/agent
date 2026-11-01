# AI Holding Command Center

**One Command. Three Corporations. One Intelligent Organization.**

A dark-first executive workspace for an owner overseeing Trading, Development, and Marketing corporations. It combines communications, organizational oversight, approvals, projects, tasks, meetings, knowledge, audit, security, finance status, and data-derived reporting in one application.

## Quick start

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:4173`. The default environment is an isolated demo; choose **Enter demo workspace** to continue. Demo records are explicitly labeled, and changes are saved to `server/runtime/state.json` with uploads under `server/runtime/uploads/`. Runtime data is local and git-ignored.

## AI integration

AI is **not configured** by default. Commands are stored as pending, and dispatch is rejected until a server-side gateway is configured; the app does not fabricate AI responses or successful executions.

Set these variables on the server to configure the A2A-compatible adapter:

```text
AIHOLDING_AGENT_ENDPOINT=https://your-gateway.example
AIHOLDING_AGENT_TOKEN=your-server-side-secret
AIHOLDING_AGENT_PROVIDER=Your provider name (optional)
```

The endpoint must use HTTPS, except for loopback development hosts. Keep provider credentials out of browser code and source control.

## Safety and deployment notes

- The demo uses an owner-only signed session and seeded sample records. It is not connected to live corporate systems.
- High- and critical-risk approval decisions require explicit owner confirmation. Permission and recruitment requests do not grant access or provision agents.
- The demo's file-backed JSON store is for local evaluation, not a production database. It does not provide encryption at rest, multi-factor authentication, malware scanning, centralized audit retention, or backup guarantees.
- Before a production deployment, disable demo mode with `AIHOLDING_DEMO=false`, provide a random `AIHOLDING_SESSION_SECRET` of at least 32 characters, configure `AIHOLDING_OWNER_EMAIL` and a scrypt-formatted `AIHOLDING_OWNER_PASSWORD_HASH`, and deploy reviewed durable storage, identity, encryption, observability, backups, and network controls.
- Financial and operational reporting displays unavailable telemetry as unconfigured rather than estimating it.

## Commands

```bash
npm run dev        # Express API with Vite middleware on port 4173
npm run typecheck  # TypeScript checks
npm run build      # TypeScript check and production frontend build
npm start          # Serve the built app (set production environment variables first)
```

The executive boardroom image is included at `public/images/command-center.jpg`.
