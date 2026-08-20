# Security Policy

AI Chat stores your API key **only in your browser's localStorage** — it never
leaves your device except in direct requests to the API provider you chose.
There is no server-side code.

## Supported versions

| Version | Supported |
|---|---|
| v1.2.x | ✅ |
| < 1.2 | ❌ |

## Reporting a vulnerability

The project is a static client-side tool with a small attack surface. If you
find a security issue:

1. **Do not open a public issue** for exploitable vulnerabilities.
2. Report privately via GitHub: open an issue on
   https://github.com/bestdeejay-design/aichat/issues with the `security`
   label, or contact the maintainer through the repo profile.

Please include:

- Affected version and file/line if known
- A minimal reproduction (browser, steps)
- Impact assessment

## Security notes for users

- Your key is stored in plain text in localStorage — this is a trade-off of a
  no-backend design. Use a dedicated key with usage limits if your provider
  supports it, and revoke it if you suspect exposure.
- Delete the key and all data anytime: **Settings → "Delete key and settings"**.