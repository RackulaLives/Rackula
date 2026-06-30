# Security Policy

## Supported Versions

Rackula is currently in active development. Security updates are applied to the latest version.

| Version  | Supported          |
| -------- | ------------------ |
| 26.6.5   | :white_check_mark: |
| < 26.6.5 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Rackula, please report it by:

1. **Private Report**: Submit a private vulnerability report via GitHub Security Advisories at https://github.com/RackulaLives/Rackula/security/advisories/new
2. **Response Time**: We aim to acknowledge reports within 48 hours
3. **Disclosure**: Please allow us time to address the issue before public disclosure

## AI-Generated Code

Code generated with AI assistance undergoes the same security review process as human-written code.

### Our Approach

- All contributions (AI-assisted or traditional) are tested against our comprehensive test suite (1400+ tests)
- AI-generated code receives human review before merging
- Security-sensitive code (for example: authentication/authorization logic, session/cookie handling, input validation/sanitization, cryptographic operations, and file import/export parsing) receives additional scrutiny regardless of authorship
- Additional scrutiny includes a security-focused reviewer sign-off and verification that relevant automated security checks (for example SAST/dependency scanning) pass before merging
- Dependencies are regularly audited using `npm audit`

### Security Considerations

- **Client-Side App**: Rackula runs in the browser, communicating with an optional API backend
- **Authentication Modes**: The API supports `none` (open access), `local` (username/password with bcrypt), and `oidc` (OAuth2/OIDC via environment-configured provider). Mode is set via `RACKULA_AUTH_MODE`. **Security warning:** `none` disables authentication and should only be used for trusted local development/testing in isolated environments; **never** use `none` in production or on internet-facing deployments. For production, use `local` or preferably `oidc` when available.
- **Session Tokens**: Authenticated sessions use HMAC-signed cookies; tokens are not stored in localStorage
- **Local Storage**: Layout data is stored in browser localStorage (user-controlled)

## Best Practices for Users

When using Rackula:

- Review exported files before sharing, as they may contain infrastructure details
- Be cautious about loading `.Rackula.zip` files from untrusted sources
- Keep your browser updated to ensure latest security patches

## Dependency Security

We maintain security through:

- Regular dependency updates
- Automated security scanning via `npm audit`
- Minimal dependency footprint
- Pre-commit hooks for code quality and linting
