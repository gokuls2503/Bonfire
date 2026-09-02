# DNS records

At your domain registrar, point everything at the VPS's public IP.

| Type | Name    | Value            | Notes                          |
|------|---------|------------------|--------------------------------|
| A    | `@`     | `<VPS_IP>`       | bonfiregaminghub.com           |
| A    | `www`   | `<VPS_IP>`       | redirects to the apex          |
| A    | `admin` | `<VPS_IP>`       | admin.bonfiregaminghub.com     |
| A    | `api`   | `<VPS_IP>`       | api.bonfiregaminghub.com       |

If the VPS has IPv6, add the same four as `AAAA` records pointing at its IPv6 address.

Wait for propagation (`dig +short bonfiregaminghub.com` should return the VPS IP)
**before** running certbot — Let's Encrypt validates over HTTP and fails if DNS
has not caught up yet.

## Why a separate `api.` subdomain

The two front-ends are static bundles served straight off nginx; the API is a
separate Django process. Giving the API its own hostname keeps CORS explicit,
lets you cache the static sites aggressively without touching API responses, and
means you can move the API to its own box later without changing either site.
