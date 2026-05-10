import crypto from "node:crypto";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { Command } from "commander";
import { DEFAULT_COMPOSITION_ID, type SlideshowConfig } from "../src/slideshow";
import { buildAutoConfig } from "../src/utils/randomize";
import {
  getOutputExtension,
  parseRenderCodec,
  resolveCrf,
  resolveProResProfile,
} from "../src/utils/render-encoding";
import { selectImagesForSlideshowDuration } from "../src/utils/slideshow-duration";
import {
  listInputImages,
  readImageDimensionsByPath,
  removeStagingDir,
  slugify,
  stageFilesToPublic,
  stageOptionalAudioToPublic,
} from "../src/utils/slideshow-files";
import { packagePublicRoot, packageRoot } from "./runtime-paths";

type CliOptions = {
  input: string;
  duration: string;
  crossFade: string;
  motion: string;
  zoom: string;
  slideshowDuration?: string;
  width: string;
  height: string;
  fps: string;
  backgroundColor: string;
  minImageDimensionPercent: string;
  output?: string;
  codec: string;
  proresProfile?: string;
  crf?: string;
  audio?: string;
};

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--duration <seconds>", "per-image duration in seconds", "3.0")
  .option(
    "--cross-fade <seconds>",
    "cross-fade duration in seconds; overlaps adjacent images without shortening total runtime",
    "1.0",
  )
  .option(
    "--motion <percent>",
    "pan amount as a percent of the clip's available travel; 0 disables pan",
    "6",
  )
  .option("--zoom <percent>", "zoom amount as a percent scale change over the whole clip", "8")
  .option("--slideshow-duration <seconds>", "maximum total slideshow duration in seconds")
  .option("--width <pixels>", "output width", "1920")
  .option("--height <pixels>", "output height", "1080")
  .option("--fps <fps>", "frames per second", "25")
  .option("--background-color <color>", "background color for letterboxed slides", "#000000")
  .option(
    "--min-image-dimension-percent <percent>",
    "disable motion when either source dimension falls below this percent of the output size",
    "100",
  )
  .option("--output <path>", "output file path")
  .option("--codec <codec>", "render codec: h264, h265, or prores-<profile>", "h264")
  .option(
    "--prores-profile <profile>",
    "ProRes profile: 4444-xq, 4444, hq, standard, light, or proxy",
  )
  .option("--crf <crf>", "quality setting for h264/h265; lower is better")
  .option("--audio <path>", "optional guide audio file")
  .parse(process.argv);

const options = program.opts<CliOptions>();
const cwd = process.cwd();
const rawInputDir = program.args[0] ?? options.input;
if (!rawInputDir) {
  throw new Error("Missing input directory. Pass it as an argument or with --input.");
}
const inputDir = path.resolve(cwd, rawInputDir);
const width = Number(options.width);
const height = Number(options.height);
const fps = Number(options.fps);
const durationSeconds = Number(options.duration);
const crossfadeSeconds = Number(options.crossFade);
const slideshowDurationSeconds = options.slideshowDuration
  ? Number(options.slideshowDuration)
  : undefined;
const motionPercent = Number(options.motion);
const zoomPercent = Number(options.zoom);
const backgroundColor = options.backgroundColor;
const minImageDimensionPercent = Number(options.minImageDimensionPercent);
const codecSelection = parseRenderCodec(options.codec);
const normalizedMotionPercent = Number.isFinite(motionPercent)
  ? Math.min(100, Math.max(0, motionPercent))
  : 6;
const normalizedZoomPercent = Number.isFinite(zoomPercent)
  ? Math.min(100, Math.max(0, zoomPercent))
  : 8;
const audioPath = options.audio ? path.resolve(cwd, options.audio) : undefined;

function buildOutputLocation(config: SlideshowConfig): string {
  const requested =
    options.output ?? config.output ?? path.join("renders", `${config.compositionId}.mov`);
  const outputPath = path.isAbsolute(requested) ? requested : path.resolve(cwd, requested);
  const extension = getOutputExtension(codecSelection.codec);
  return outputPath.match(/\.[^.]+$/)
    ? outputPath.replace(/\.[^.]+$/i, extension)
    : `${outputPath}${extension}`;
}

async function main() {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Width and height must be positive numbers.");
  }

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("FPS must be a positive number.");
  }

  const files = await listInputImages(inputDir);
  if (files.length === 0) {
    throw new Error(`No images found in ${inputDir}`);
  }

  const slideshowSelection = selectImagesForSlideshowDuration({
    inputFiles: files,
    durationFrames: Math.round(durationSeconds * fps),
    crossfadeFrames: Math.round(crossfadeSeconds * fps),
    slideshowDurationSeconds,
    fps,
  });

  if (slideshowSelection.excludedFiles.length > 0) {
    console.log(
      [
        `Requested slideshow duration: ${slideshowDurationSeconds} seconds`,
        `Using ${slideshowSelection.includedFiles.length} of ${files.length} images to fit the requested length.`,
        `Excluding ${slideshowSelection.excludedFiles.length} image(s):`,
        ...slideshowSelection.excludedFiles.map(
          (file) => `  - ${path.relative(cwd, file) || file}`,
        ),
      ].join("\n"),
    );
  } else if (slideshowDurationSeconds !== undefined) {
    console.log(
      `Requested slideshow duration: ${slideshowDurationSeconds} seconds; all ${files.length} image(s) fit.`,
    );
  }

  const imageDimensionsByPath = await readImageDimensionsByPath(slideshowSelection.includedFiles);

  const outputName =
    options.output ?? path.join("renders", `${slugify(path.basename(inputDir))}.mov`);
  const config = buildAutoConfig({
    inputFiles: slideshowSelection.includedFiles,
    width,
    height,
    fps,
    durationSeconds,
    crossfadeSeconds,
    output: outputName,
    compositionId: `${slugify(path.basename(inputDir))}-slideshow`,
    backgroundColor,
    motionPercent: normalizedMotionPercent,
    zoomPercent: normalizedZoomPercent,
    minImageDimensionPercent: Number.isFinite(minImageDimensionPercent)
      ? minImageDimensionPercent
      : 100,
    imageDimensionsByPath,
    audio: audioPath
      ? {
          src: audioPath,
          volume: 0.8,
          enabled: true,
        }
      : undefined,
  });
  const outputLocation = buildOutputLocation(config);
  const sourceFiles = config.segments.map((segment) => path.resolve(cwd, segment.src));
  const stagingName = `${slugify(config.compositionId)}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const stagedMap = await stageFilesToPublic(sourceFiles, stagingName, packagePublicRoot);
    const stagedAudio =
      config.audio?.enabled && config.audio.src
        ? await stageOptionalAudioToPublic(config.audio.src, stagingName, packagePublicRoot)
        : undefined;

    const runtimeConfig: SlideshowConfig = {
      ...config,
      audio: config.audio
        ? {
            ...config.audio,
            src: stagedAudio ?? config.audio.src,
            enabled: config.audio.enabled ?? true,
          }
        : undefined,
      segments: config.segments.map((segment) => ({
        ...segment,
        src: stagedMap[path.resolve(cwd, segment.src)],
      })),
    };

    const entryPoint = path.join(packageRoot, "src", "Root.tsx");
    const serveUrl = await bundle({
      entryPoint,
      onProgress: () => undefined,
    });

    const composition = await selectComposition({
      serveUrl,
      id: DEFAULT_COMPOSITION_ID,
      inputProps: runtimeConfig,
    });

    await renderMedia({
      serveUrl,
      codec: codecSelection.codec,
      composition,
      inputProps: runtimeConfig,
      outputLocation,
      overwrite: true,
      proResProfile: resolveProResProfile(codecSelection, false, options.proresProfile),
      crf: resolveCrf(codecSelection.codec, options.crf),
      x264Preset: codecSelection.codec === "h264" ? "slow" : undefined,
      onProgress: ({ progress }) => {
        process.stdout.write(`\rRendering ${(progress * 100).toFixed(1)}%`);
      },
    });
  } finally {
    try {
      await removeStagingDir(packagePublicRoot, stagingName);
    } catch (error) {
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  process.stdout.write(`\nRendered ${outputLocation}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
