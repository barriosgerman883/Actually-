# Confidence

Confidence belongs to each claim, not to a tool.

| Level | Rule |
|---|---|
| high | at least one fact states the value and nothing contradicts it |
| medium | only inferences, at least two independent ones that agree |
| low | a single inference, or contradictory evidence |

Adjustments:

- A prerelease under npm's `latest` dist-tag contradicts "stable": low.
- A stale cached response: at most medium.
- A GitHub tag used because there are no releases: at most medium.
- The update provider is never more confident than the installation it is derived from.

A tool's summary confidence is the lowest among its local version, latest version and installation claims that are known.

No percentages or numeric weights are shown, because they would imply a precision the model does not have.
