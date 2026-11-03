# AmirDesk Next — Cloudflare experiment

This folder is a separate experiment for future web-based account/session APIs.

**It is not the current AmirDesk remote-desktop transport and is not needed to run the Windows builds.**

The working Windows clients use the existing RustDesk remote desktop engine and its rendezvous/relay protocol. That protocol uses native TCP/UDP and its compatible HBBS/HBBR server; a normal Cloudflare Worker cannot transparently host those listeners.

## Planned role split

- **AmirDesk Customer:** Windows host profile; incoming connections only; every support session requires a local click-to-approve.
- **AmirDesk Admin:** Windows operator profile; outgoing connections only.

These profiles are compiled from the existing AMIRDESK_ROLE=customer|admin setting in src/flutter_ffi.rs.

## Cloudflare experiment

The cloudflare/ directory contains an early HTTPS/WebSocket signaling prototype using a Durable Object. It can be developed independently for future account management or a future WebRTC client, but it currently does not:
- authenticate real AmirDesk user/device accounts;
- register Customer devices or enforce their permissions;
- connect to the existing RustDesk native rendezvous protocol;
- transmit screen video, audio, or remote input;
- provide a TURN relay.

Do not deploy it as the backend for the current Windows clients.

## Current working build path

See the root README and .github/workflows/amirdesk-windows.yml. The workflow builds separate portable Windows x64 packages. The first test can use the configured public RustDesk network defaults where available. A private production network requires compatible HBBS/HBBR services and a shared server public key.
