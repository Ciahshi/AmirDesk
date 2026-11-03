# AmirDesk

AmirDesk is a branded remote-support client built from the open-source RustDesk remote desktop engine. It provides two Windows desktop profiles:

- **AmirDesk Customer** — receives support connections and requires a visible, local approval click for every incoming session.
- **AmirDesk Admin** — outgoing-only client for support operators.

This repository retains the upstream RustDesk engine and protocol rather than reimplementing remote desktop, screen capture, input forwarding, codecs, and NAT traversal from scratch.

## Windows builds

GitHub Actions builds portable Windows x64 packages for both profiles:

1. Open the **Actions** tab.
2. Select **Build AmirDesk Customer and Admin (Windows x64)**.
3. Run the workflow manually, or push supported source changes to the amirdesk-webrtc-foundation branch.
4. Download the **AmirDesk-customer-Windows-x64** and **AmirDesk-admin-Windows-x64** artifacts from the completed run.
5. Extract the complete ZIP before launching the executable.

The Customer build is incoming-only and uses click-to-approve. The Admin build is outgoing-only.

## Server and network

The current Windows builds use the networking protocol and rendezvous/relay behavior of the RustDesk engine. A Cloudflare Worker is **not** a replacement for the RustDesk HBBS/HBBR service: Workers do not accept the native TCP/UDP protocol used by this engine.

For a first test, the client can use the configured public RustDesk network defaults if they are available in this build. For a controlled production deployment, run the compatible RustDesk OSS hbbs and hbbr services on a small VPS or supported host and configure both clients with the same server address and public key.

The optional amirdesk-next/cloudflare folder is an experimental HTTPS/WebSocket API and signaling scaffold. It is not connected to the Windows remote desktop data path, does not relay the desktop stream, and must not be considered a production backend.

## Security

- The Customer user must see and approve incoming sessions.
- Do not use this build for hidden access or unattended access.
- Keep remote permissions limited to what is needed.
- Use a trusted rendezvous/relay service and protect its private keys.
- Do not publish server secrets or signing keys in GitHub.
- Portable builds are not signed with an AmirDesk code-signing certificate unless a signing secret/certificate is separately configured.

## Source and license

AmirDesk contains modifications to the RustDesk open-source project. Preserve the upstream license and notices when redistributing. Review the repository's license files and the upstream project at https://github.com/rustdesk/rustdesk before publishing binaries or source changes.
