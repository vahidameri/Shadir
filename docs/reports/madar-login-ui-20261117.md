# Madar login and command palette — 2026-11-17

The public sign-in screen mounts without the main application or its keyboard shortcuts. Password fields have separate accessible names, the visibility control works with the keyboard, and browser autofill keeps the field background consistent. The command palette keeps focus in its modal, closes from any control with Escape and restores the previous focus.

On the Docker deployment, the official Google button uses the runtime OAuth web client. Madar verifies the signed ID token and the one-use browser challenge, matches exactly one active team account, and issues the existing app session. The Google subject is linked to that member on first use. Username/password remains available, including with no Google client configured. The Apps Script login remains separate.

## Verification

- The Docker-mode TypeScript/Vite build passed.
- Four Node tests passed: signed fixture acceptance, concurrent replay rejection, rejection of the wrong signature/issuer/audience and expired or invalid claims, challenge expiry, and active member matching and binding.
- Local Chromium at 320 px and desktop: login has no background controls or shortcuts, autofill uses the field background, field names are distinct, the password eye is keyboard-operable, and the Google button fits on mobile. Simulated Google rejection and retry led to a valid local session and data fetch; password login also passed without a Google client. Tab stayed in the command palette and Escape restored focus.
- Compose configuration validated locally. The local Docker engine was unavailable; the GitHub CI workflow exercises Docker startup, login capability discovery, invalid Google login rejection and existing password login.
- A live Google session requires an OAuth Web client authorized for the deployment origin. See [deployment guide](../../deploy/README.md#enable-google-sign-in-on-the-docker-site). No production account was used for local checks.

- Offline deploy graph rebuilt and queried: 70 nodes, 84 edges. Source paths validated. The optional SQL extractor remains unavailable.
