[简体中文](README.md) · [English](README.en.md)

<div align="center">
  <img src="extension/assets/icon128.png" alt="X Xiuxian jade-blade logo" width="80">
  <h1>X Xiuxian · Creator Retreat</h1>
  <p>A movable cultivation-inspired dashboard for your daily writing and X creator stats.</p>
  <p>
    <img src="https://img.shields.io/badge/version-0.1.11-173e34" alt="Version 0.1.11">
    <img src="https://img.shields.io/badge/Chrome-116%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 116+">
    <img src="https://img.shields.io/badge/Manifest-V3-6d7772" alt="Manifest V3">
    <img src="https://img.shields.io/badge/Data-Local_storage-173e34" alt="Local data storage">
  </p>
  <p><a href="https://github.com/zkilxx/x-xiuxian/releases/latest">Download</a> · <a href="#installation">Install</a> · <a href="#usage">How to use</a> · <a href="https://github.com/zkilxx/x-xiuxian/issues">Report an issue</a></p>
</div>

<p align="center"><img src="docs/images/panel-home.png" alt="Actual dashboard render showing daily goals, writing countdown, impressions, followers and reward progress" width="372"></p>

No API key and no build step. Read the X account signed in to your browser, set daily post and reply goals, and view your writing countdown, total impressions, follower changes and original-content reward progress. Successful publishing updates counts immediately; a background cycle checks rewards, account analytics and followers every five minutes and reconciles your goals with studio totals.

> Screenshots use the actual panel with the fictional profile “云游散人 / @wanderer” and a fixed demo date. They contain no real account data. Documentation is bilingual; the extension interface is currently Chinese.

## Features

| Feature | Details |
| --- | --- |
| Movable dashboard | Drag the title bar, remember its position, or collapse into a rounded jade-blade X; the home view adapts to available height |
| Account sync | Show your signed-in account's avatar, name and handle; keep goals, settings and records separate by account |
| Daily goals | Set post and reply targets; count successful publishing immediately and reconcile against studio statistics |
| Quiet feedback | No repeated success banners; a green `+1` fades above the original reply button after a successful reply |
| Writing reminder | Time since your last post, a configurable countdown and a persistent alert with write, snooze and acknowledge actions |
| Impressions | Today's total studio Impressions, including verified and unverified viewers |
| Followers | Total followers and net change since the day's first observation |
| Ascension progress | A 500K progress bar for verified home-timeline impressions over the last 90 days, displayed as 13.46W / 50W (W = 10,000), with yesterday’s net change on the home view and daily readings in history |
| Background sync | Rewards → account analytics → follower profile, using an inactive temporary tab; manual sync is available in the footer |
| History | Daily records, date filtering, reward and count adjustments, and JSON export |
| Project GitHub | Open the X Xiuxian repository from the GitHub icon in the header |
| Update checks | Check the latest stable GitHub Release when opening the panel, with a six-hour cache and a manual check button |
| Local storage | No custom backend, telemetry, separate sign-in or API key |

## Interface

<table>
  <tr><th>History · 日志</th><th>Settings · 功法</th></tr>
  <tr>
    <td><img src="docs/images/panel-history.png" alt="History with daily records, reward changes, date filter and JSON export" width="372"></td>
    <td><img src="docs/images/panel-settings.png" alt="Settings for post and reply goals, reminder interval and automatic sync" width="372"></td>
  </tr>
</table>

The panoramic landscape preserves the full composition, with the avatar overlapping its lower edge. Ink green, celadon jade and warm gold carry through the panel. The header uses a transparent blade emblem; the collapsed button uses the complete rounded-square logo.

<p align="center"><img src="docs/images/floating-logo.png" alt="Collapsed jade-blade X button" width="56"></p>

## Installation

Install as an unpacked Chrome extension. It is not currently listed in the Chrome Web Store.

1. Open [Releases](https://github.com/zkilxx/x-xiuxian/releases/latest), download **`x-xiuxian-v0.1.11.zip`** and extract it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted **X修仙** folder containing `manifest.json`.
4. Sign in to [X](https://x.com) and refresh the page to display the floating panel.
5. Open **功法** (settings), set your daily goals and reminder interval, and wait for the first sync cycle.

```text
Downloaded ZIP
└── X修仙/                  ← Select this folder in Chrome
    ├── manifest.json
    ├── panel.html
    └── ...
```

Extract the ZIP before loading it. Alternatively, clone the repository and load its **`extension/`** folder directly, without running npm or a build:

```sh
git clone https://github.com/zkilxx/x-xiuxian.git
cd x-xiuxian
```

To update, replace files in your existing extension folder, click **Reload** in `chrome://extensions`, then refresh X. Keep the existing installation to retain local records. New versions are detected automatically; downloading and replacing files remain manual.

Each Release includes `SHA256SUMS.txt` for package verification.

## Usage

### Project and updates

The GitHub icon in the header opens the [X Xiuxian repository](https://github.com/zkilxx/x-xiuxian). The footer displays your installed version and update status. Opening or expanding the panel checks the latest stable GitHub Release, with a six-hour cache. An open panel revisits the cache hourly and when visible again; click **检查更新** to force a fresh check.

When an update is available, a version link downloads its ZIP. Replace files in the existing folder and reload as described above. Failed checks retain the last known release and show a retry message instead of claiming you are up to date; automatic retries use a 15-minute backoff. The status row keeps a fixed height.

Only public Release metadata is requested. No account, goal or history data is sent, and no download or installation starts automatically. Update checks are available from 0.1.9; earlier versions need a manual upgrade first.

### Set daily goals

1. Confirm that the profile in the panel matches your signed-in account.
2. Open **功法**, enter daily post and reply targets and the reminder interval, then click **保存功法** (save).
3. Use X normally. Only confirmed successful publishing counts; failed or canceled attempts do not. Repeated responses are deduplicated by post ID.
4. View progress in **洞府** (home), or open **日志** (history) for past records.

Original posts and quote posts count as posts; your own replies count as replies. Reposts do not count. Studio reconciliation can include today's posts from other devices or before installation. Fresh local events are temporarily protected while studio totals catch up.

### Sync creator stats

The default five-minute cycle reads:

```text
Original-content rewards → Account analytics (posts, replies, impressions) → Follower profile
```

You do not need to open the studio manually. The extension uses an inactive temporary tab and closes only the tab it created. Click **同步** in the footer to start the same cycle early; an already-running cycle is not duplicated.

The footer reports the combined result. Partial failures keep existing values. Impressions are shown as a total because a reliable original-post/reply split is unavailable.

### Use writing reminders

A successful post starts the interval timer. When due, the panel shows a persistent alert and requests a system notification. Choose **去撰写** (write), **15 分钟后提醒** (snooze) or **知道了** (acknowledge). A sound can play after interaction with the panel when browser audio rules allow it.

<p align="center"><img src="docs/images/panel-reminder.png" alt="Persistent writing alert with write, snooze and acknowledge actions" width="372"></p>

System notifications depend on Chrome and operating-system settings. Closing the browser, sleep or background throttling can delay reminders.

### View history and daily changes

The home view shows yesterday’s recorded reward change. Missing yesterday data appears as “—”; partial readings are explained in a tooltip.

Open **日志** to filter dates, expand reward readings or count adjustments, and click **导出 JSON** to export the current account's records and settings.

- **Publishing and impressions** follow the studio's **UTC dates**.
- **Follower change** is net change since the day's first observation, not the number of new follows over the entire day.
- **Daily reward change** is the latest official progress minus the previous day's final reading. If a consecutive baseline is missing, the day's first observation is used and labeled.
- Follower and reward logs use the account's recording time zone, **Asia/Shanghai** by default.

Rolling progress may fall because of expiration or platform corrections; negative values are retained. Rounded source values produce approximate deltas. See [data definitions and runtime conditions (Chinese)](docs/data-semantics.md) for implementation details.

## Privacy and permissions

The extension uses your existing X session to read the signed-in profile, successful publishing events and creator data. Records and settings stay in `chrome.storage.local`; transient state uses `chrome.storage.session`. Accounts are stored separately.

There is no custom backend, telemetry or third-party AI request. The extension does not save post text, direct messages, cookies, authorization headers or API keys. It does not automatically post, reply, like or follow. Post metadata is retained for up to 120 days / 20,000 posts; daily snapshots are stored separately.

| Permission or site | Purpose |
| --- | --- |
| `storage` | Save local profiles, settings and records |
| `alarms` | Schedule sync and writing reminders |
| `notifications` | Show system notifications when reminders are due |
| `api.github.com` | Read this repository's public Release version and package links |
| `x.com`, `twitter.com` | Display the panel, observe publishing success and read your creator data |

Personal verification records, account screenshots and earlier design candidates remain local and are not included in the source repository or package.

## Limitations

- Built for desktop Chrome 116 or later; the current interface is Chinese.
- Background reads require the browser to be running, a valid X session and access to the relevant creator pages.
- Five minutes is a scheduled interval. Sleep, network errors, throttling and X data delays can postpone updates. Failed reads do not overwrite existing values with zero.
- X pages and response structures may change. Refresh X and try manual sync before reporting an [issue](https://github.com/zkilxx/x-xiuxian/issues).
- 500K is the displayed progress target, not confirmation of all participation or earnings requirements. The current X page determines eligibility.
- This is an unofficial tool and is not affiliated with X.

## Development

Core development requires Node.js 20+ and Python 3. The extension uses plain JavaScript and CSS with no third-party runtime dependency. Loadable build files are committed; rebuild after editing their sources.

```sh
npm test                # Data, publishing events and background flow tests
npm run check           # Rebuild; verify scripts, manifest and assets
npm run preview         # http://127.0.0.1:4178/demo.html
npm run package         # release/x-xiuxian-v0.1.11.zip
```

All **40 regression tests pass**. Coverage includes account isolation, deduplication, successful and failed publishing, UTC boundaries, impression backfill, publishing reconciliation, lag protection, downward corrections, reward deltas, follower changes, background jobs and reminders. Tests use simulated responses; they do not establish live compatibility after every X update.

The demo page uses fictional data separate from real account storage and is excluded from the package. Documentation screenshots render the actual panel in an isolated headless browser with a fixed date and local requests only, without signing in to X:

```sh
npm ci
npx playwright install chromium
npm run docs:screenshots
npm run test:ui          # Real extension, isolated profile, mocked X / GitHub responses
```

Playwright is a development dependency for screenshots and UI checks, not an extension runtime dependency. The real-extension flow covers the repository link, automatic and manual checks, available updates, offline errors, caching, collapse/expand and a compact viewport. The screenshot script does not read your existing Chrome profile or automatically delete local files.

```text
extension/                    Loadable Chrome extension
  background.js               Background sync, account storage and notifications
  updates.js                  Release checks, version comparison and caching
  bridge.js                   Publishing events and X response observation
  content.js / feedback.js    Panel injection, dragging and reply +1
  core.js                     Counts, dates, reconciliation and daily deltas
  panel.html / panel.js       Dashboard, history and settings
  panel.css / assets/         Styles, landscape and icon assets
  *-bundle.js                 Built scripts for separate execution worlds
docs/images/                  Actual UI screenshots for the README
docs/data-semantics.md         Metric definitions and runtime conditions
scripts/capture-docs.cjs       Documentation screenshot generator
scripts/build.cjs             MAIN / ISOLATED script build
scripts/package.py            Installable ZIP generator
tests/                        Data, bridge and background-flow tests
design/                       Selected masters and native image-generation prompts
```

Visual assets were created with native image generation; transparent logos retain a real alpha channel. See the [design notes](docs/design.md) and [asset index](design/README.md), both in Chinese.

The GitHub mark comes from [Primer Octicons](https://github.com/primer/octicons). Its MIT notice is included in [THIRD_PARTY_NOTICES.txt](extension/THIRD_PARTY_NOTICES.txt).
