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

- Put photos in `assets/photos`
- Put guide audio in `assets/audio`
- The sample project already includes three example photos

You can also point the CLI at any other directory of local images.

## Render workflow

Directory-driven render:

```bash
vidtools slides render assets/photos
```

Same thing with the flag form:

```bash
vidtools slides render --input "assets/photos"
```

## CLI flags

- `inputDir` can be passed positionally or with `--input`
- `--duration 3.0` sets per-image duration in seconds
- `--cross-fade 1.0` sets the cross-fade overlap in seconds
- `--motion 6` sets pan amount as a percent of frame size over the whole clip
- `--zoom 8` sets zoom amount as a percent scale change over the whole clip
- `--width`, `--height`, `--fps` control output format
- `--output` overrides the output path
- `--codec prores|mp4` chooses the encoder
- `--audio path/to/file.wav` enables guide audio

## Preview

Open a local browser preview before rendering:

```bash
vidtools slides preview assets/photos
```

The flag form works too:

```bash
vidtools slides preview --input assets/photos
```

Then open the URL printed in the terminal. The preview URL matches the input path you supplied, so if you run:

```bash
vidtools slides preview /media/test
```

you can refresh `http://localhost:3000/media/test` without a generated `index.html` suffix.

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
- Codec: `prores`

## Regenerating the render

1. Replace or add files in the input directory
2. Re-run the render command
3. Import the resulting `.mov` into DaVinci Resolve

The render is deterministic for a given input set and settings.

## Other commands

`vidtools lyrics` currently prints `hello world` as a placeholder for the upcoming lyric-video workflow.

## Notes

- The project uses `staticFile()` and the `public/` directory for Remotion rendering.
- The render script stages input files into `public/generated/...` before rendering.
- Cross-fades are implemented as overlapping sequences, so future slide or wipe effects can be added later without changing the basic timeline model.
