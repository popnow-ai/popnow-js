# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

- Open a [private security advisory](https://github.com/popnow-ai/popnow-js/security/advisories/new) on GitHub, or
- email **support@popnow.ai** with "Security" in the subject.

Include a description, steps to reproduce and the SDK version. We aim to acknowledge reports within a few
business days.

## Keeping your API key safe

- Keep `POPNOW_API_KEY` on your server, in an environment variable or a secret store. Never ship it to a
  browser or a mobile app.
- If a key leaks, revoke it in the [API console](https://popnow.ai/api/console/keys) and create a new one.
- Verify every webhook with `verifyWebhook` / `verifyStandardWebhook` before trusting its contents.
