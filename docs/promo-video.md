# The promo videos, and the README and site media

How the two tours (seedr and Seedr Studio) and the images on the README and on
danieldeusing.de/apps/seedr are produced. One set of captures feeds all three places. This was
written as the plan for the October 2026 refresh; when a step goes wrong, record it here, as
configr's `docs/promo-video.md` does.

| Artifact | Ends up in | Made by |
| --- | --- | --- |
| web captures, 2880×1800 | `pagr/public/apps/seedr/01-home.png` … `04-plugins.png`; README `docs/assets/screenshot-web.png` (the browse capture) | `npm run capture:web` (§1) |
| the same, 1440×900 | `promo/assets/01-home.png` … `04-plugins.png` | the same script |
| Studio window captures | `pagr/public/apps/seedr/studio-01-explorer.png` … `studio-05-publish.png`; README `docs/assets/studio-*.png` | the guided shoot (§2) |
| Studio crops, ~1440 wide, 16:10 | `promo/assets/studio/` | cropped from those (§2) |
| CLI still | README `docs/assets/screenshot-cli.png` | `npm run still:cli` (§3) |
| `out/seedr-promo.mp4`, `out/seedr-poster.png` | README (inline); `pagr/public/apps/seedr/tour.mp4`, `tour-poster.png` | `Promo`, `Poster` (§4) |
| `out/studio-tour.mp4`, `out/studio-poster.png` | README Studio section (inline); `pagr/public/apps/seedr/studio-tour.mp4`, `studio-tour-poster.png` | `StudioTour`, `StudioPoster` (§4) |

## 1. Web captures: scripted

`cd promo && npm run capture:web` runs Playwright against **https://seedr.danieldeusing.de**, the
public site, so no internal hostname and no estate item can ever be in frame. The viewport is
1440×900 at device scale factor 2, with the warm theme and animations off set in `localStorage`
before the first load. It writes four pages: `/`, `/skills`, one first-party skill's detail page
(chosen so its TL;DR, file tree and install command are all on screen; its slug is fixed in the
script), and `/plugins`.

The 2880×1800 files go to the site and the README. The 1440×900 copies go to `promo/assets/`:
the video scales a shot into about 1128px, so full resolution would only cost render time.

The first promo's captures were taken the same way but the script was never committed, which is
why they went stale (they predate the header change of 2026-09-28).

## 2. Studio: a guided shoot

Studio is captured by hand, deliberately:

- configr's dev-only automation bridge (`tauri-plugin-mcp-bridge`) would be always on here,
  because Studio only ever runs as a dev build. It would give any local process a way to run
  script inside an app whose agent jobs have a shell.
- A browser build with mocked IPC would show fixture data instead of the real registry.

**Run it against the public checkout, never `seedr-internal`.** The fork's items are private and
the explorer lists every one of them.

```bash
SEEDR_STUDIO_REPO=/path/to/public/seedr pnpm --filter @seedr/studio tauri:dev
```

Navigate by desktop control and capture each view with `screencapture -x -o -l <window-id>`: one
window, without the menu bar, the desktop, other apps or the drop shadow. A full-screen capture is
the wrong asset and a disclosure risk; configr's first shoot caught a private key in a terminal
scrollback that way. The window id is that of the largest titled window owned by the Studio
process (`promo/scripts/list-windows.swift`, taken from configr). A window that is fully covered
captures blank, so bring it forward first.

Five views, one capture each:

1. `studio-01-explorer` — the explorer with its type groups, the ownership marks and the agents
   each item installs into.
2. `studio-02-detail` — a first-party item open: the metadata pane beside the file preview.
3. `studio-03-add` — add capability: the Author screen and its three routes.
4. `studio-04-test-install` — test install's result for a first-party skill: every file written
   and the byte-for-byte check.
5. `studio-05-publish` — git → publish: the target branches, with `prod` marked as the one that
   deploys.

Keep diffs and agent transcripts out of frame, and crop when a view would show one. Test
install's scratch directory under the system temp folder can stay: it names no user and is the
point of that view.

The full windows go to the site and the README as they are. The video gets a 16:10 crop about
1440px wide of the region that carries the caption (`sips -c <h> <w> --cropOffset <top> <left>`),
in `promo/assets/studio/`. A whole Retina window scaled into a video frame shrinks 12px UI text
to about 5px, which nobody can read.

## 3. The CLI still

`npm run still:cli` renders `Promo` at frame 470: the CLI scene with its whole transcript on
screen. The README's CLI image is that frame. It is rendered text, not a terminal capture, so
nothing from a real scrollback can appear in it.

## 4. The videos

**`Promo`** keeps its structure: intro, the five-copies question, the CLI scene, four shots,
outro. Its captions in `src/shots.ts` are rewritten against the new frames, with **no counts**:
the registry changes every day, and "66 of them" was stale within weeks.

**`StudioTour`** is the intro (`seedr studio`), the five Studio shots at six seconds each, and an
outro with the run command: 110 + 5 × 180 + 100 = 1110 frames, 37 seconds. It reuses `Ground`,
`Shot` and the scene fades. `Intro` and `Outro` take their text as props instead of hard-coding
seedr, and `presentShots()` takes a slot list, so both tours treat a missing file the same way:
no file, no scene. **`StudioPoster`** is its still.

Both render at `--crf 24` (configr measured the default 18 at double the bytes for no visible
difference):

```bash
npm run render          # Promo       → out/seedr-promo.mp4
npm run render:studio   # StudioTour  → out/studio-tour.mp4
npm run poster          # Poster      → out/seedr-poster.png
npm run poster:studio   # StudioPoster → out/studio-poster.png
```

## 5. Publish

**README.** GitHub plays a video inline only when the file was uploaded through its own editor
(`https://github.com/user-attachments/assets/…`). A committed or externally hosted mp4 renders as
a link. So each mp4 is dropped into a draft on github.com, the draft is discarded unsubmitted,
and the returned URL goes on its own line in `README.md`. Free accounts cap such uploads at
10 MB: re-encode a larger render at a higher crf for the README, and compare extracted frames
before using it. Each re-render needs a re-upload, because the old URL keeps serving the old cut.

The layout: the seedr tour at the top; the browse capture and the CLI still where the two
screenshots are now; a new **Seedr Studio** section with what it is in two sentences, its tour,
the explorer and detail captures, and the run command.

**Site.** Copy the files into `pagr/public/apps/seedr/` under the names in the table. Add a Studio
section to `SeedrPage.astro` built like the tour and screenshot blocks: every media slot is
optional (a missing file hides its slot) and every URL carries its content hash (`mediaUrl()`).
Its captions are new `seedr.studio.*` keys in `de`, `en`, `es` and `pt`. The English text is word
for word the video's caption, and the other three are its translations. Deploy with
`npm run deploy` in `apps/pagr`, then check the live files with `curl -sI -L` (a short-timeout
`GET` on a video reports a truncated size that looks like a broken upload) and look at the page.

**Repository.** `promo/`, `docs/assets/`, `README.md` and this file go to `main`. Nothing under
`apps/web` changes, so the site is not redeployed. `seedr-internal` gets the usual upstream merge
and push, without a redeploy.

## 6. Checks

- After every render, extract one frame per scene and look at it. The caption must describe what
  the image shows, and the UI text must be readable at video scale:
  `npx remotion ffmpeg -ss <seconds> -i out/<file>.mp4 -frames:v 1 -y /tmp/frame.png`.
  The ffmpeg bundled with Remotion is the one to use; no system ffmpeg is needed.
- `npm run typecheck` in `promo/`.
- The README on github.com after the push: both videos play inline and every image loads.
- danieldeusing.de/apps/seedr in English and German: both videos and every capture show, each
  caption matching its image.
