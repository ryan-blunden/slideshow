# VidTools

VidTools renders Ken Burns-style slideshows using Remotion and TypeScript.

## What it does

- Reads images from a directory you provide on the CLI
- Applies Ken Burns motion per image
- Crossfades adjacent shots
- Optionally includes guide audio
- Renders ProRes `.mov` by default

## Setup

```bash
npm install
```

To install the CLI globally from this checkout:

```bash
npm install -g .
```

## Assets

- Put photos in `public/assets/photos`
- Put guide audio in `assets/audio`
- The sample project already includes three example photos in `public/assets/photos`

You can also point the CLI at any other directory of local images.

## Smart crop workflow

If you want a preprocessed copy of an image directory, use:

```bash
vidtools slides smart-crop --input public/assets/photos
```

This writes cropped images into a sibling directory named `public/assets/photos-smart-cropped`.
You can override the crop size with `--width` and `--height`; the defaults are `1920x1080`.
Use `--variant top` to keep the existing file selection but crop from the top edge instead of using smart subject detection. That writes to `public/assets/photos-top-cropped`.
The `smartcrop` binary uses ImageMagick under the hood, so it needs that installed on the machine running the command.
Images that are too far from the target aspect ratio are copied through unchanged instead of being force-cropped.

## Render workflow

Directory-driven render:

```bash
vidtools slides render public/assets/photos
```

Same thing with the flag form:

```bash
vidtools slides render --input "public/assets/photos"
```

## CLI flags

- `inputDir` can be passed positionally or with `--input`
- `--duration 3.0` sets per-image duration in seconds
- `--cross-fade 1.0` sets the cross-fade overlap in seconds; it blends adjacent images but does not shorten the overall slideshow runtime
- `--motion 6` sets pan amount as a percent of frame size over the whole clip
- `--zoom 8` sets zoom amount as a percent scale change over the whole clip
- `--slideshow-duration 60` caps the slideshow runtime in seconds and trims trailing images if needed
- `--width`, `--height`, `--fps` control output format
- `--output` overrides the output path
- `--codec h264|h265|prores-<profile>` chooses the encoder
- `--prores-profile 4444-xq|4444|hq|standard|light|proxy` selects the ProRes profile
- `--crf` sets quality for `h264` and `h265`; lower is higher quality and larger files
- `--audio path/to/file.wav` enables guide audio, resolved from your current shell directory

## Preview

Open a local browser preview before rendering:

```bash
vidtools slides preview public/assets/photos
```

The flag form works too:

```bash
vidtools slides preview --input public/assets/photos
```

Then open the URL printed in the terminal. The preview URL matches the input path you supplied, so if you run:

```bash
vidtools slides preview /media/test
```

you can refresh `http://localhost:3000/media/test` without a generated `index.html` suffix.

Launching a preview cleans up the active `.preview` runtime and its staging directory when the server exits. If a previous run was interrupted, you may still need to clear stale `public/generated` entries manually.

## Smoke Tests

Run a small render matrix to sanity-check multiple motion and zoom combinations:

```bash
vidtools slides smoke
```

This renders several short MP4s into `renders/smoke-tests/`.

Recommended defaults:

- Duration: `3.0` seconds
- Cross-fade: `1.0` seconds
- Motion: `6`
- Zoom: `8`
- Codec: `h264`
- CRF: `18`

Use `prores-hq` only if you want an edit-friendly master. Transparent lyric themes default to `prores-4444` so alpha is preserved.

## Regenerating the render

1. Replace or add files in the input directory
2. Re-run the render command
3. Import the resulting `.mov` into DaVinci Resolve

The render is deterministic for a given input set and settings.

## Lyric Videos

`lyrics` is a standalone audio-backed subtitle renderer.

Render a lyric video:

```bash
vidtools lyrics render --lyrics path/to/lyrics.lrc --output renders/song-lyrics.mov --audio path/to/song.wav
```

Audio is optional:

```bash
vidtools lyrics render --lyrics path/to/lyrics.lrc --output renders/song-lyrics.mov
```

Preview the same workflow locally:

```bash
vidtools lyrics preview --lyrics path/to/lyrics.lrc --audio path/to/song.wav
```

Theme workflow:

```bash
vidtools lyrics theme init themes/default.css
```

Lyric render flags:

- `--codec h264|h265|prores-<profile>` chooses the encoder
- `--prores-profile 4444-xq|4444|hq|standard|light|proxy` selects the ProRes profile
- `--crf` sets quality for `h264` and `h265`; lower is higher quality and larger files
- `--background <path>` stages an image or video into `public/generated/...` and renders it behind the lyrics

If the lyric theme does not set a background color and renders transparently, the renderer requires a ProRes profile with alpha support. In that case the default is `prores-4444`.
If `--background` is set, the render is treated as opaque and does not need an alpha codec.

The theme file controls the typography and layout:

- `.lyrics` is the only selector you need right now
- `--lyrics-wrap-width`, `--lyrics-font-size`, `--lyrics-line-height`, and padding values live in the theme
- `--theme` points at the CSS file to use
- `--font` lets you embed a local font file that is not installed in Font Book
- `theme init <cssPath>` copies the built-in default theme to the path you give it so you can edit it in place
- the starter theme already uses `font-family: var(--lyrics-font-family)` so `--font` can swap the face without extra flags

Lyric timing flags:

- `--lyrics-start-offset 0` shifts all lyric timestamps
- `--lyrics-fade-in 0.4` sets the lyric fade-in duration
- `--lyrics-fade-out 0.4` sets the lyric fade-out duration
- `--lyrics-fade-out-offset 0.5` starts the fade-out before the next line begins
- `--lyrics` points to the lyric file path from your current shell directory
- `--output` is optional for preview and points to the output file path from your current shell directory when provided
- `--audio` points to the source audio file from your current shell directory, and is optional
- lyric preview uses a route based on the lyric file name, such as `http://localhost:3000/song-title`

## Notes

- The project uses `staticFile()` and the `public/` directory for Remotion rendering.
- The render script stages input files into `public/generated/...` before rendering.
- Cross-fades are implemented as overlapping sequences, so future slide or wipe effects can be added later without changing the basic timeline model.
