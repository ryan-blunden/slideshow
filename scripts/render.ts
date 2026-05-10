import path from "node:path";
import crypto from "node:crypto";
import { Command } from "commander";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { buildAutoConfig } from "../src/utils/randomize";
import { listInputImages, slugify, stageFilesToPublic, stageOptionalAudioToPublic } from "../src/utils/slideshow-files";
import { DEFAULT_COMPOSITION_ID, type SlideshowConfig } from "../src/slideshow";
import { packagePublicRoot, packageRoot } from "./runtime-paths";

type CliOptions = {
  input: string;
  duration: string;
  crossFade: string;
  motion: string;
  zoom: string;
  width: string;
  height: string;
  fps: string;
  output?: string;
  codec: "prores" | "mp4";
  audio?: string;
};

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--duration <seconds>", "per-image duration in seconds", "3.0")
  .option("--cross-fade <seconds>", "cross-fade duration in seconds", "1.0")
  .option("--motion <percent>", "pan amount as a percent of the clip's available travel; 0 disables pan", "6")
  .option("--zoom <percent>", "zoom amount as a percent scale change over the whole clip", "8")
  .option("--width <pixels>", "output width", "3840")
  .option("--height <pixels>", "output height", "2160")
  .option("--fps <fps>", "frames per second", "25")
  .option("--output <path>", "output file path")
  .option("--codec <codec>", "render codec: prores or mp4", "prores")
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
const motionPercent = Number(options.motion);
const zoomPercent = Number(options.zoom);
const outputCodec = options.codec;
const normalizedMotionPercent = Number.isFinite(motionPercent) ? Math.min(100, Math.max(0, motionPercent)) : 6;
const normalizedZoomPercent = Number.isFinite(zoomPercent) ? Math.min(100, Math.max(0, zoomPercent)) : 8;

function buildOutputLocation(config: SlideshowConfig): string {
  const requested = options.output ?? config.output ?? path.join("renders", `${config.compositionId}.mov`);
  const outputPath = path.isAbsolute(requested) ? requested : path.resolve(cwd, requested);

  if (outputCodec === "mp4") {
    return outputPath.replace(/\.(mov|mkv|webm)$/i, ".mp4").replace(/\.mov$/i, ".mp4");
  }

  return outputPath.endsWith(".mov") ? outputPath : outputPath.replace(/\.[^.]+$/i, ".mov");
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

  const outputName = options.output ?? path.join("renders", `${slugify(path.basename(inputDir))}.mov`);
  const config = buildAutoConfig({
    inputFiles: files,
    width,
    height,
    fps,
    durationSeconds,
    crossfadeSeconds,
    output: outputName,
    compositionId: `${slugify(path.basename(inputDir))}-slideshow`,
    backgroundColor: "#000000",
    motionPercent: normalizedMotionPercent,
    zoomPercent: normalizedZoomPercent,
    audio: options.audio
      ? {
          src: options.audio,
          volume: 0.8,
          enabled: true,
        }
      : undefined,
  });
  const outputLocation = buildOutputLocation(config);
  const sourceFiles = config.segments.map((segment) => path.resolve(cwd, segment.src));
  const stagingName = `${slugify(config.compositionId)}-${crypto.randomUUID().slice(0, 8)}`;
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

  const renderWithCodec = async (codec: "prores" | "mp4") =>
    renderMedia({
      serveUrl,
      codec: codec === "prores" ? "prores" : "h264",
      composition,
      inputProps: runtimeConfig,
      outputLocation,
      overwrite: true,
      proResProfile: codec === "prores" ? "hq" : undefined,
      crf: codec === "mp4" ? 18 : undefined,
      x264Preset: codec === "mp4" ? "slow" : undefined,
      onProgress: ({ progress }) => {
        process.stdout.write(`\rRendering ${(progress * 100).toFixed(1)}%`);
      },
    });

  await renderWithCodec(outputCodec);

  process.stdout.write(`\nRendered ${outputLocation}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
