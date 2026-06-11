# Security Policy

## Supported Versions

Rackula is currently in active development. Security updates are applied to the latest version.

| Version  | Supported          |
| -------- | ------------------ |
| 26.6.2   | :white_check_mark: |
| < 26.6.2 | :x:                |

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
- Security-sensitive code receives additional scrutiny regardless of authorship
- Dependencies are regularly audited using `npm audit`

### Security Considerations

- **Client-Side App**: Rackula runs in the browser, communicating with an optional API backend
- **Authentication Modes**: The API supports `none` (open access), `local` (username/password with bcrypt), and `oidc` (OAuth2/OIDC via environment-configured provider). Mode is set via `RACKULA_AUTH_MODE`.
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
