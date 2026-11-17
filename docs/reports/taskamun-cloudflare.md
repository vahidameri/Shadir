# Madar on taskamun.ir

2026-11-17. Published application route configured in Cloudflare on the dedicated `madar` tunnel. The dashboard confirmed a CNAME for `taskamun.ir` pointing to the tunnel, and the route maps to `http://127.0.0.1:4181` on ASUS.

- The origin `/healthz` returned HTTP 200 over the existing ASUS SSH connection.
- Installed the official Windows cloudflared package. The server reported version 2026.11.0 at `C:\Program Files (x86)\cloudflared\cloudflared.exe`. Service registration is pending.
- On ASUS, run the Windows service installation command shown in Cloudflare under the `madar` tunnel's **Add a replica** page from an elevated PowerShell. Use the absolute path above if the executable is absent from PATH. Keep the connector token out of the repository and shared messages.
- The authoritative `.ir` nameserver and public resolvers still returned NXDOMAIN at the time of checking. Once the connector is healthy and delegation is visible, verify public HTTPS on `/healthz` and confirm the Madar login page loads.

The application and database configuration were untouched. Atlas was outside this change.
