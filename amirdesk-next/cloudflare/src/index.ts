import { DurableObject } from "cloudflare:workers";

interface Env {
  SESSION_ROOMS: DurableObjectNamespace<SessionRoom>;
  ADMIN_API_TOKEN: string;
  SIGNALING_SECRET: string;
}

type Role = "admin" | "customer";
type Claims = { sid: string; role: Role; exp: number; jti: string };
const encoder = new TextEncoder();

function b64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(value: string): Uint8Array {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}
async function signClaims(claims: Claims, secret: string): Promise<string> {
  const payload = b64url(encoder.encode(JSON.stringify(claims)));
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return payload + "." + b64url(sig);
}
async function verifyClaims(token: string, secret: string): Promise<Claims | null> {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const key = await hmacKey(secret, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, fromB64url(signature), encoder.encode(payload));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Claims;
    if (!claims.sid || !["admin", "customer"].includes(claims.role) ||
        !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000) ||
        !claims.jti) return null;
    return claims;
  } catch {
    return null;
  }
}
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function randomId(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(18)));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "amirdesk-next-signaling", stage: "foundation" });
    }

    if (request.method === "POST" && url.pathname === "/api/v1/sessions") {
      if (!env.ADMIN_API_TOKEN || !env.SIGNALING_SECRET) return json({ error: "server_not_configured" }, 503);
      if (request.headers.get("Authorization") !== `Bearer ${env.ADMIN_API_TOKEN}`) {
        return json({ error: "unauthorized" }, 401);
      }
      const sessionId = randomId();
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 10 * 60;
      const adminToken = await signClaims({ sid: sessionId, role: "admin", exp: now + expiresIn, jti: randomId() }, env.SIGNALING_SECRET);
      const customerToken = await signClaims({ sid: sessionId, role: "customer", exp: now + expiresIn, jti: randomId() }, env.SIGNALING_SECRET);
      return json({ sessionId, expiresIn, adminToken, customerToken }, 201);
    }

    const wsMatch = url.pathname.match(/^\/ws\/([A-Za-z0-9_-]{12,64})$/);
    if (wsMatch) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "websocket_upgrade_required" }, 426);
      }
      const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      const token = bearer || url.searchParams.get("token") || "";
      const claims = await verifyClaims(token, env.SIGNALING_SECRET || "");
      if (!claims || claims.sid !== wsMatch[1]) return json({ error: "invalid_or_expired_session_token" }, 401);
      const id = env.SESSION_ROOMS.idFromName(claims.sid);
      return env.SESSION_ROOMS.get(id).fetch(new Request(request, {
        headers: new Headers([...request.headers, ["X-AmirDesk-Role", claims.role], ["X-AmirDesk-Session", claims.sid]])
      }));
    }
    return json({ error: "not_found" }, 404);
  }
};

export class SessionRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const role = request.headers.get("X-AmirDesk-Role") as Role | null;
    const session = request.headers.get("X-AmirDesk-Session");
    if (!role || !session || !["admin", "customer"].includes(role)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const sockets = this.ctx.getWebSockets();
    const alreadyConnected = sockets.some(ws => ws.deserializeAttachment<{ role: Role }>()?.role === role);
    if (alreadyConnected) return new Response("Role already connected", { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role, session, connectedAt: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(sender: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = sender.deserializeAttachment<{ role: Role; session: string }>();
    if (!state || typeof message !== "string" || message.length > 64_000) {
      sender.close(1008, "Invalid message");
      return;
    }
    let packet: { type?: string; payload?: unknown };
    try { packet = JSON.parse(message) as { type?: string; payload?: unknown }; }
    catch { sender.close(1008, "Invalid JSON"); return; }

    // Only WebRTC negotiation and connectivity metadata are allowed here.
    const allowed = new Set(["offer", "answer", "ice-candidate", "session-ready", "session-end"]);
    if (!packet || typeof packet.type !== "string" || !allowed.has(packet.type)) {
      sender.close(1008, "Unsupported signaling message");
      return;
    }
    const peers = this.ctx.getWebSockets();
    for (const peer of peers) {
      if (peer === sender) continue;
      const peerState = peer.deserializeAttachment<{ role: Role; session: string }>();
      if (peerState?.session === state.session && peerState.role !== state.role) {
        try { peer.send(JSON.stringify({ type: packet.type, payload: packet.payload, from: state.role })); }
        catch { /* Peer may have disconnected. */ }
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try { ws.close(1000, "Disconnected"); } catch { /* already closed */ }
  }
}
