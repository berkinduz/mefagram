# Security

Please report vulnerabilities through this repository's **Security → Report a vulnerability** feature. Do not disclose credentials, private diagrams or exploitable details in a public issue. If private reporting is unavailable, open a minimal issue asking for a private reporting channel without including the vulnerability.

The latest tagged release is the supported version. This is a small open-source project; response times are not guaranteed.

## Local boundary

Mefagram has no accounts. It is a single-user workspace for the person using this computer, and the loopback interface is its access control:

- The server listens on `127.0.0.1` only.
- Every request, including pages and static assets, is refused unless its `Host` is `localhost`, `127.0.0.1` or `[::1]`. This blocks DNS-rebinding pages from reading or changing the workspace.
- Requests carrying another website's `Origin` are refused, so a page you visit cannot submit changes to the local API or MCP endpoint.

Programs running on the same computer can use the workspace without credentials; that is the intended way for agents to connect. Do not expose the port through a tunnel, reverse proxy or a non-loopback `--hostname`, and do not run it on a shared multi-user machine where other accounts must not see your diagrams.

Use a durable local volume for PGlite, with only one Node process opening it. Database backups contain every diagram and its full history and must remain private.
