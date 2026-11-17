# Madar on taskamun.ir

2026-11-17. The Cloudflare `madar` tunnel publishes `taskamun.ir` to `http://127.0.0.1:4181` on ASUS. Cloudflare confirmed creation of the CNAME for the route.

- Registered the official cloudflared 2026.11.0 Windows service on ASUS. Windows reports Running and the Cloudflare dashboard reports Healthy. ASUS reached the Cloudflare edge on TCP 7844, and the local Madar `/healthz` returned HTTP 200.
- The service token file grants access only to Windows Administrators and SYSTEM. The temporary local transfer file was removed.
- Cloudflare requests `aria.ns.cloudflare.com` and `rustam.ns.cloudflare.com`. At verification, Cloudflare was waiting for registrar propagation and both `a.nic.ir` and `b.nic.ir` returned NXDOMAIN. The public HTTPS request could not resolve the hostname.
- After delegation becomes visible, verify public HTTPS on `/healthz` and confirm that the Madar login page loads on the root URL.

The application and database configuration were outside this change, as was Atlas.
