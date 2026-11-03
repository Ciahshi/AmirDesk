# AmirDesk Next — WebRTC direction

> Experimental foundation only. This is not yet a working remote-desktop application.

AmirDesk Next is a proposed independent remote-support product with two separately packaged clients:

- **AmirDesk Customer** — a visible Windows host agent. The person at the remote computer must be able to approve, view, and end each support session.
- **AmirDesk Admin** — the support operator application. It signs in, requests access to an enrolled device, and connects only after customer approval.

## Why this is a separate implementation

The current root project is based on the RustDesk codebase and its native rendezvous/relay protocol. RustDesk's `hbbs` and `hbbr` use TCP and UDP listeners. Cloudflare Workers are suitable for HTTPS and WebSocket signaling, but they are not a drop-in host for those native listeners.

AmirDesk Next therefore uses a different transport:

1. A native Windows Customer agent captures the desktop and receives approved input.
2. The Admin client displays the remote stream and sends control events.
3. WebRTC attempts a direct peer-to-peer connection.
4. Cloudflare Workers + Durable Objects handle authentication, device presence, session coordination, and WebRTC signaling.
5. A managed TURN service is used only when direct connectivity cannot cross NAT/firewalls.

The signaling Worker must never carry the continuous screen-video stream. Keeping media peer-to-peer reduces server bandwidth and cost.

## Planned Cloudflare services

| Service | Responsibility |
| --- | --- |
| Workers | HTTPS API, auth endpoints, session creation |
| Durable Objects | Live WebSocket signaling and per-session coordination |
| D1 | Users, enrolled devices, permissions, and audit events |
| R2 | Optional signed installer/update artifacts |
| WebRTC + TURN | Direct media/data transport with relay fallback |

A custom domain is optional; the Worker can initially use its `workers.dev` address.

## Security requirements

- No hidden or silent remote access.
- Customer approval before control begins.
- A persistent, visible session indicator and an obvious Stop button.
- Short-lived, role-scoped session tokens.
- End-to-end protected WebRTC transport.
- Admin audit events and device-level permissions.
- Unattended access, if ever added, must be an explicit opt-in with revocation.

## Current implementation status

- [x] Isolated development branch created.
- [x] Cloudflare Durable Object signaling skeleton.
- [x] Short-lived HMAC-signed signaling tokens.
- [ ] User authentication and enrollment API.
- [ ] D1-backed device registry and audit trail.
- [ ] Customer Windows agent (screen capture, consent UI, input).
- [ ] Admin application (device list, approval flow, viewer).
- [ ] WebRTC media and data-channel integration.
- [ ] TURN configuration and connectivity tests.
- [ ] Installer signing, updates, and release workflows.

The signaling API in this branch is a development foundation. Its bootstrap endpoint is protected by a Cloudflare secret and must be replaced with proper account/device authentication before production use.

## Local setup

Install a current Node.js LTS release, then:

```bash
cd amirdesk-next/cloudflare
npm install
npm run dev
```

Configure secrets before deployment:

```bash
npx wrangler secret put ADMIN_API_TOKEN
npx wrangler secret put SIGNALING_SECRET
```

Deploy:

```bash
npm run deploy
```

The initial API exposes:

- `GET /health` — health check.
- `POST /api/v1/sessions` — development-only session token minting; requires `Authorization: Bearer <ADMIN_API_TOKEN>`.
- `GET /ws/:sessionId?token=...` — authenticated WebSocket signaling endpoint.

This initial signaling layer exchanges only WebRTC negotiation messages. It does not capture a desktop, transmit video, or control a computer yet.
