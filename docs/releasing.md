# Releasing to npm

Releases are published from GitHub Actions (`.github/workflows/release.yml`), never from a local machine: a local build embeds that machine's paths in `.next`, and CI adds npm provenance.

## First release

1. Create or sign in to an npm account with two-factor authentication.
2. Create a **granular access token** with read and write access to packages (it will cover the new `mefagram` package) and **"Bypass two-factor authentication (2FA)" checked**: CI cannot type a one-time password, and without it the publish fails with `EOTP`. A short expiry is enough. Add it to the GitHub repository as the secret `NPM_TOKEN` (Settings → Secrets and variables → Actions). The workflow runs in an environment named `npm`; GitHub creates it on first use, and you can add required reviewers to it.
3. Make sure `package.json` has the version you want and `CHANGELOG.md` describes it, then tag and push:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. Watch the **Release** workflow. It checks that the tag matches the version, runs typecheck, lint, unit tests and the build, then publishes with provenance.

## Later releases

After the first publish, you can switch to token-free **trusted publishing**: on npmjs.com open the package → Settings → Trusted publishing, add GitHub Actions with repository `berkinduz/mefagram` and workflow `release.yml`, then delete the `NPM_TOKEN` secret and revoke the token.

For each release: bump `version` in `package.json` and `plugin/.claude-plugin/plugin.json`, update `CHANGELOG.md`, commit, tag `v<version>` and push the tag.

## Check before tagging

`npm pack --dry-run` lists the files that will be published (the built app under `.next`, `bin`, `public` and docs). To test a package end to end, `npm pack`, install the tarball in an empty folder and run `npx mefagram mcp` from there with a throwaway `MEFAGRAM_HOME`.
