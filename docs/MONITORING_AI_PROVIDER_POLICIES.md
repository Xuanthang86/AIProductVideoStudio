# Monthly provider policy monitoring

The scheduled GitHub Actions workflow checks the official public pages that govern the website's AI and infrastructure costs:

- Google Gemini API pricing and additional terms
- Cloudflare Workers pricing and limits
- Cloudflare D1 pricing and limits
- ImageKit plans
- fal.ai pricing (monitored because its paid video API is deliberately disabled)

## Schedule and alerts

- Runs on the first day of each month at 09:00 Vietnam time (02:00 UTC), and can also be started manually from GitHub Actions.
- Uses a persisted GitHub Actions cache as the last-known-good baseline; no database, Worker secret, billing permission, or third-party API key is required.
- If a monitored page changes, creates a GitHub Issue with the source link and a text excerpt for human review.
- The first successful run establishes the baseline and does not report a change.
- If any source cannot be fetched or verified, the run fails and preserves the previous baseline. It does not report an incomplete check as “no changes”.
- Reports are uploaded as workflow artifacts for 90 days.

## Safety

This is a read-only monitor. It does not deploy code, update provider credentials, change D1, enable paid APIs, subscribe to a paid plan, or modify the website. A changed page is only a review alert: a human must confirm whether the Free Tier, quota, pricing, terms, or billing requirements materially changed before any code/configuration change is made.

The script uses Python's standard library only and has no external package dependency.

## Run manually

Open the repository's Actions tab, select **Monitor free-tier AI and provider policies**, then choose **Run workflow** on `main`.
