# GitHub

## Purpose

Resolve the latest version of repositories used as tools.

## Detection strategy

1. The latest release (`/releases/latest`), which never includes drafts or releases marked as prereleases. A release whose tag is a prerelease anyway (`v3.0.0-beta.1`) gets `low` confidence.
2. Otherwise the highest non-prerelease semver tag.
3. Otherwise unknown. `HEAD` of the default branch is never treated as a version.

## Evidence used

| Claim | Evidence | Kind | Confidence |
|---|---|---|---|
| latest from a release | latest release is tagged vX | fact | high |
| latest from a tag | no releases; highest semver tag is vX | fact | capped at medium, because a tag is not a declared release |

## Version detection

As above.

## Commands executed

None.

## Files inspected

None.

## Network requests

`GET https://api.github.com/repos/<owner>/<repo>/releases/latest` and, if needed, `/tags?per_page=100`. GitHub receives `owner/repo`, the IP and the user agent. The token is off by default. With `[network] github_token = true`, `GITHUB_TOKEN` or `GH_TOKEN` is sent to api.github.com only, and GitHub can then link the requests to that account.

## Failure modes

Without a token the limit is 60 requests per hour. Cached responses and 304 revalidations do not use quota. When GitHub reports the limit is exhausted, no more GitHub requests are made in that run, the remaining versions are unknown, and a warning diagnostic explains why.

## Security considerations

The token is never cached, logged or sent to another host. The HTTP client checks this in the security tests.

## Known limitations

Private repositories are not supported. Only the first 100 tags are considered.
