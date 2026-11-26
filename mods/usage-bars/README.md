# usage-bars

Shows your Claude plan usage as color-coded bars (eighth-cell precision; green, lime, yellow, orange, red as usage climbs) in a bordered band above the prompt. On a narrow terminal it shows just the numbers on one line:

- **5h**: the rolling 5-hour session limit
- **week**: the weekly limit across all models
- **Fable** (and any other per-model weekly scope your plan has)
- a reset countdown on every bar, and whether extra usage is on

Data comes from the same endpoint `/usage` reads, using the session's own sign-in (the token never reaches the mod). It refreshes at session start, after each turn (at most every 30 seconds) and every 5 minutes. Sessions on an API key or third-party provider show nothing, since they have no plan limits.
