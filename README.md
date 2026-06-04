# Devin Quota Usage Widget

A lightweight, always-on-top desktop widget for **Windows, macOS, and Linux** that
shows your **Devin Daily and Weekly ACU usage** in real time.

Inspired by the [claude-usage-widget](https://github.com/SlavomirDurej/claude-usage-widget).

![Daily and Weekly progress bars](assets/icon.png)

## Features

- **Daily & Weekly progress bars** — ACUs consumed vs. your configured limits.
- **Threshold colors** — green / amber / red based on configurable warn & danger thresholds.
- **Product breakdown** — Devin, Cascade, Terminal, Review ACUs for the week.
- **Auto-refresh** every N minutes + manual refresh button.
- **Demo mode** — preview the UI with sample data, no credentials required.
- Frameless, draggable, always-on-top widget; minimizes to the system tray.
- Dark / light themes. Settings persisted locally with `electron-store`.

## How it gets data

The widget calls the Devin consumption API:

```
GET https://api.devin.ai/v3/organizations/{org_id}/consumption/daily
Authorization: Bearer cog_...
```

It reads `consumption_by_date[]` (ACUs per billing day, midnight PST) and computes:

- **Daily** = ACUs for the current PST billing day.
- **Weekly** = ACUs over the last 7 PST billing days (rolling window).

> The Devin API returns consumption only — not a quota limit. You set the **Daily**
> and **Weekly** limits (in ACUs) in Settings, and the bars show usage against them.

### Requirements

- A **service user token** (prefix `cog_`) with the `ManageBilling` permission.
- Your **Org ID** (prefix `org-`).

See the [API docs](https://docs.devin.ai/api-reference/v3/consumption/organizations-consumption-daily).

## First run

On first launch the widget shows a **Connect to Devin** screen:

1. Click **Create token in Devin** — this opens `app.devin.ai` in your browser, where
   you log in (email, GitHub, Google, …) and go to **Settings → Service Users**.
2. Create a service user with billing access and **Generate API key** (`cog_…`).
3. Copy the key and your **Org ID** (shown on the same page), paste both into the
   widget, and click **Save & connect**.

No credentials yet? Click **Try demo** to preview the UI with sample data.

> Devin has no public OAuth flow for third-party apps, so the app can't read your
> account purely from a browser login. The token is pasted once and stored locally.

## Development

```bash
npm install
npm start        # launch the widget
npm run dev      # launch in development mode
npm run lint     # syntax-check all JS files
```

> On a headless Linux box, run with a virtual display, e.g.
> `xvfb-run -a npm start`.

## Building installers

```bash
npm run build:win     # Windows: NSIS installer + portable .exe
npm run build:mac     # macOS: .dmg (arm64 + x64)
npm run build:linux   # Linux: AppImage
```

Artifacts are written to `dist/`. Builds are produced with
[`electron-builder`](https://www.electron.build/); build each target on (or for)
its matching OS.

## Configuration

Open **Settings** (gear icon) to set:

| Setting | Description |
| --- | --- |
| API Key | Service user token (`cog_…`) |
| Org ID | Organization ID (`org-…`) |
| Daily / Weekly limit | Your ACU budgets |
| Warn % / Danger % | Bar color thresholds |
| Refresh (min) | Auto-refresh interval |
| Theme | Dark / Light |
| Always on top | Keep widget above other windows |
| Demo mode | Show sample data without credentials |

## License

MIT
