# Security baseline and dependency review

## Implemented controls

- Environment files and local data are ignored; example files contain no production credentials.
- Zod validates configuration without echoing rejected values.
- Helmet provides baseline HTTP headers; the web adds framing, MIME, referrer, and permissions
  restrictions.
- CORS allows configured exact origins, disallows credentials, and restricts methods.
- The global exception filter suppresses stack traces and internal error details in responses.
- Swagger UI cannot be mounted in production, regardless of its environment flag.
- Containers use pinned runtime images, multi-stage builds, and unprivileged runtime users.
- GitHub Actions receives read-only repository contents permission.

Authentication and authorization are intentionally deferred. The API must not be exposed to
untrusted networks before Phase 1 supplies the reviewed identity boundary or an external gateway
provides equivalent protection.

## Dependency checks

Run `pnpm security:audit` after every dependency update and in CI. High or critical production
findings block delivery. Record accepted exceptions here with the package, advisory, exposure,
mitigation, owner, and expiry date; there are no accepted exceptions at Phase 0 creation.

The Phase 0 audit on 2026-08-13 initially found vulnerable transitive dependencies in the then
current Next.js and NestJS Swagger lines. Updating to Next.js 16.3.0 and `@nestjs/swagger` 11.4.6
removed all but the latter's exact `js-yaml` 5.2.1 pin. The workspace override raises that patch to
5.2.3 until upstream does so. The repeated production audit reports no known vulnerabilities and
the peer-dependency check reports no conflicts.

Image scanning belongs in the deployment platform once one is selected. No cloud-specific scanner
is introduced in Phase 0.
