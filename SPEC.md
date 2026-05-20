# Cricket Replay PWA — Specification & Decision Log

## Problem Statement

In amateur cricket matches, **six-or-out disputes** at the boundary pole are common — when the ball travels near the boundary pole, nobody can agree which side it passed. The ruling is simple in principle: ball to the left of the pole = out, ball to the right = six. But the umpire's position (behind the stumps or at square leg) introduces **parallax error** — they are never side-on to the pole, so their view is inherently unreliable.

This is specifically a **pole dispute tool**, not a general boundary or catch tool. The ball's path relative to the pole is the only thing being judged.

The goal is a lightweight video tool that:
- Runs on a phone mounted side-on to the boundary pole
- Keeps a rolling buffer so captures can happen *after* a dispute
- Enables frame-by-frame review with a red reference line pinned to the pole

---

## Camera Positioning Strategy

**Decision:** Mount phone at **deep point or deep square leg, ~60-70 yards from the pole, at ground level.**

**Why:** A side-on view eliminates parallax entirely. The ball either crosses the line or it doesn't — it's unambiguous from this angle. The umpire's head-on view gives no reliable depth cue.

---

## Architecture Decisions

### PWA vs Native Android App

**Chosen:** Progressive Web App (pure HTML/CSS/JS, no build step)

**Alternatives considered:**
- Native Android (Kotlin/Java) — rejected: slower to build, requires APK distribution, overkill for the feature set
- React Native / Flutter — rejected: adds a build pipeline and dependency chain for what is essentially a camera + canvas app
- Capacitor/Ionic wrapper — rejected: unnecessary complexity at this stage

**Why PWA:**
- Zero installation friction — just open a URL and optionally "Add to Home Screen"
- `MediaRecorder`, `IndexedDB`, `Canvas`, and `Service Worker` APIs are all well-supported in Android Chrome
- Faster iteration: edit a file, push, done
- Can be hosted on GitHub Pages for free

---

## Rolling Buffer Design

### What we wanted
Keep the last 90 seconds of video in memory so the user can capture *after* a boundary dispute happens, without needing to predict it in advance.

### Approach considered: Stop/start MediaRecorder every 30s, store complete segments in IndexedDB
- Pros: Each segment is a fully seekable video blob
- Cons: Segments don't align with incidents; combining two 30s WebM blobs naively breaks seekability; IndexedDB writes on every segment add latency

### Approach chosen: Single continuous MediaRecorder, 1-second timeslices, in-memory rolling array

```
initChunk  → first chunk from MediaRecorder (contains WebM header/codec init)
dataChunks → rolling array of 1-second Blobs with timestamps, pruned at 90s
```

On "Capture Incident":
1. Filter `dataChunks` to the last 90 seconds
2. Prepend `initChunk` (always required for a playable WebM)
3. Combine into a single `Blob`
4. Save to IndexedDB as an incident

**Why this works:** The WebM container requires the init segment (EBML header + codec initialisation) only once at the start. Subsequent data clusters are self-contained 1-second chunks. Concatenating `initChunk + recentDataChunks` produces a valid, linearly-playable WebM. Seeking within it works via browser linear scan (slower than indexed seek but acceptable for a ≤90s clip).

**Known limitation:** The combined blob is not fully indexed, so random seeking to an arbitrary timestamp can be slow on very old devices. In practice, users scrub forward from the start which is fast.

**Storage:** ~45-90MB in RAM during recording. Zero disk usage until "Capture Incident" is pressed.

---

## Playback Design

### Frame stepping

`video.currentTime += 1/fps` — moves exactly one frame forward.
`video.currentTime -= 1/fps` — moves one frame back.

The video element is **hidden**. A `<canvas>` is the visible surface. During playback, `requestAnimationFrame` continuously copies decoded frames from the video to the canvas. When paused, a single copy is made after each seek (`onseeked` event).

**Why canvas instead of just `<video>`:** The pole marker overlay must be drawn on top of the video frame. Compositing HTML elements over a `<video>` with precise pixel alignment is fragile across devices. A canvas gives full control — the marker is drawn directly onto the same pixel surface as the video frame.

### Pole marker overlay

User taps the canvas to place a red vertical line at the boundary pole position. This line persists across frame steps, giving a fixed visual reference while stepping through the catch.

Available in both:
- **Live view** — drawn on a transparent `<canvas>` overlay above the `<video>` element (the live feed can't be drawn to canvas due to hardware acceleration; an overlay is used instead)
- **Playback view** — drawn directly onto the playback canvas each frame

---

## Storage (Incidents)

**IndexedDB** via a thin `Storage` class.

Each saved incident stores:
- `blob` — the combined WebM video blob
- `timestamp` — Unix ms, used for labelling and sorting
- `id` — auto-increment key

Incidents persist across sessions (page refreshes, app restarts). They are manually deleted by the user.

**What is NOT stored:** The rolling buffer. Raw recording chunks are memory-only and are discarded (garbage collected) as they age past 90 seconds. If you record an entire match without capturing anything, zero disk space is used.

---

## Hosting

**Platform:** GitHub Pages (free, HTTPS, zero config)

**URL:** `https://assetsathidev1.github.io/cricket-replay/`

**Why not the DO Droplet:** The Droplet serves a Streamlit app on a raw IP with no Nginx and no domain. `getUserMedia` (camera API) requires HTTPS or localhost — a raw IP over HTTP will not work.

**PWA manifest fix required:** GitHub Pages hosts at `/cricket-replay/` not `/`. `start_url` and `scope` in `manifest.json` must match this base path, and the service worker asset list must use the same prefix. This was fixed in commit `eafa9f6`.

---

## Service Worker

Cache-first strategy for all app assets. Enables:
- Offline use (once installed, the app works without internet)
- Faster load on the field

Camera recording and incident storage work entirely on-device — no network required after the initial load.

---

## Known Limitations (Current State)

| Limitation | Detail |
|---|---|
| FPS cap | MediaRecorder in PWA context is typically 30fps on most Android phones; 60fps requires flagship hardware and browser support |
| Seekability | The captured WebM blob is linearly playable but not fully indexed; arbitrary seeking can be slow |
| Background recording | If the phone screen locks or Chrome is backgrounded, the browser may throttle/suspend the MediaRecorder. Keep screen on during play. |
| iOS | iOS 17+ supports MediaRecorder with `video/mp4`. Earlier versions do not. Tested primarily on Android Chrome. |
| No audio | Intentional — saves memory in the rolling buffer |

---

## Open: Remote Capture (Umpire View)

### Problem
The recording phone is mounted at height. The umpire wants to trigger "Capture Incident" from their own handheld phone without walking to the mount.

### Options explored

**Firebase Realtime Database**
- Umpire phone writes a "capture" event; recording phone listens
- Works across any network (mobile data)
- User note: assumed discontinued (it is not); user prefers AWS/DO

**DO Droplet WebSocket relay**
- Tiny Node.js process alongside the Streamlit app
- **Blocked:** Droplet has no domain, no Nginx, no SSL. PWA on HTTPS cannot connect to `ws://` (unencrypted). Mixed content is blocked by all modern browsers. Raw IPs cannot get free Let's Encrypt certificates.

**AWS API Gateway WebSocket + Lambda**
- API Gateway provides a `wss://` endpoint automatically (no SSL config needed)
- Two Lambda functions (~20 lines): one to route messages between connected phones
- ~$0 cost at this scale
- User already has AWS
- **Status: preferred path, not yet implemented**

**Cloudflare Tunnel**
- `cloudflared` on the DO Droplet creates a persistent `wss://x.trycloudflare.com` URL
- No domain or SSL config needed
- Downside: URL changes on tunnel restart; one more process to keep alive

**Add domain + Nginx to DO Droplet**
- Buy a cheap domain (~$1-2/yr), point to Droplet, add Nginx + Node.js + Let's Encrypt
- Fully self-hosted; makes the Droplet more generally useful
- More setup work

### Decision
Pending. AWS API Gateway WebSocket is the leading option. To be implemented in the next phase.

---

## Bug Fixes & Improvements (v2)

### Issue 1 — Pole marker breaks on phone rotation
**Root cause:** marker was stored in canvas pixel coords. On rotation the canvas resizes (width ↔ height swap) but the stored pixel value pointed to the wrong position.

**Fix:** store as normalised fractions `{ nx, ny }` (0–1 of canvas dimensions). `_drawLivePole()` converts to pixels at draw time using the current canvas size. Rotation fires ResizeObserver → redraw → marker stays on the pole.

### Issue 2 — No zoom on live view
**Considered:** canvas capture stream (record the zoomed video). Rejected: adds complexity and a persistent `requestAnimationFrame` loop just for recording.

**Chosen:** CSS `transform: scale(N)` on a `#camera-inner` wrapper div that contains both the `<video>` and the overlay `<canvas>`. Both elements scale together so the overlay click coordinates remain correct without any compensation. `overflow: hidden` on `.camera-wrap` clips content outside the viewport. A slider (1×–5×) controls zoom. Does **not** affect the recorded video (raw stream is captured); full-resolution footage is always saved.

### Issue 3 — No zoom in playback review
**Approach:** `drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvasW, canvasH)` — render only a sub-region of the decoded frame, stretched to fill the canvas. This is pure canvas math, no extra DOM elements.

- Pole marker stored in video pixel space; converted to canvas pixel space at draw time through the same `_srcRegion` used for rendering → marker stays on the pole at all zoom levels
- **Pinch-to-zoom:** two-finger spread/squeeze changes zoom; pinch midpoint is used as the zoom anchor so the view stays centred on what the user is looking at
- **Drag-to-pan:** single-finger drag when zoom > 1
- **Reset Zoom button** snaps back to 1× and recentres

### Issue 5 — Pole marker hard to position precisely

**Problem:** single-tap to place meant any slight inaccuracy required clearing and starting again.

**State machine introduced:** `none → placing → adjusting → locked`
- `placing`: button turns red with instruction text; canvas cursor changes to crosshair; tap places the line
- `adjusting`: line shown amber/dashed with drag-direction arrows on the anchor circle. A single finger drag moves the line. Vertical line: only X-axis moves. Horizontal line: only Y-axis moves. This prevents accidental diagonal drift and makes fine-tuning intuitive.
- `locked`: line turns solid red. The "Adjust" button re-enters adjusting mode without clearing.

**Rotate button:** toggles the line between vertical (pole) and horizontal (rope/ground level). The anchor point stays fixed — only the orientation changes. Useful if the camera angle makes a horizontal reference more readable.

**Drag priority:** in `adjusting` state, single-finger touch moves the pole even when zoomed in (overrides the pan gesture). Two-finger pinch still zooms.

**Same flow on live view:** the recording overlay uses the same 4 states with the same button set, so the umpire can fine-tune the pole reference before play starts.

### Issue 4 — Export "format not supported"
**Root cause:** `<a download>` triggers a file download, not a share. On mobile this either saves to Files (not intuitive) or the receiving app rejects the MIME type.

**Fix:** `navigator.share({ files: [file] })` — opens the native OS share sheet (same as sharing from Photos or WhatsApp). File extension is set from the blob MIME type (`.webm` or `.mp4`). Falls back to `<a download>` on desktop where the Share API is unavailable. AbortError (user cancelled share sheet) is swallowed silently.

---

## Commit History

| Commit | Description |
|---|---|
| `be9fd23` | Initial implementation: recording, rolling buffer, playback, pole marker, incidents list |
| `eafa9f6` | Fix PWA manifest `start_url` and service worker asset paths for GitHub Pages `/cricket-replay/` base |
| `9526ac0` | Add SPEC.md: decision log for current implementation |
| `451fe6d` | Update SPEC.md: clarify problem as six-or-out pole dispute |
| `295ac5e` | Fix rotation, add zoom (live + playback), fix share/export |
| `f90adba` | Draggable pole marker with state machine + rotate button |
