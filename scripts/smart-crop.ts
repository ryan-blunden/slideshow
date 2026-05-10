import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import {
  listInputImages,
  readImageDimensions,
  readImageDimensionsByPath,
  removePathIfExists,
} from "../src/utils/slideshow-files";
import { packageSmartCropBin } from "./runtime-paths";

type CliOptions = {
  input: string;
  width: string;
  height: string;
  quality: string;
  variant: string;
};

type CropVariant = "smart" | "top";

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--width <pixels>", "crop width", "1920")
  .option("--height <pixels>", "crop height", "1080")
  .option("--quality <value>", "JPEG quality", "90")
  .option("--variant <name>", "crop variant: smart or top", "smart")
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
const quality = Number(options.quality);
const variant = options.variant as CropVariant;
const targetAspectRatio = width / height;
const maxRelativeAspectRatioDelta = 0.35;
const outputDir =
  variant === "top"
    ? path.join(path.dirname(inputDir), `${path.basename(inputDir)}-top-cropped`)
    : path.join(path.dirname(inputDir), `${path.basename(inputDir)}-smart-cropped`);

function ensurePositiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function ensureCropVariant(value: string): asserts value is CropVariant {
  if (value !== "smart" && value !== "top") {
    throw new Error(`Variant must be either "smart" or "top".`);
  }
}

function shouldKeepOriginal(imageWidth: number, imageHeight: number): boolean {
  const sourceAspectRatio = imageWidth / imageHeight;
  const relativeDelta =
    Math.abs(sourceAspectRatio - targetAspectRatio) / Math.max(targetAspectRatio, 1e-6);

  return relativeDelta > maxRelativeAspectRatioDelta;
}

function imageMagickDependencyMessage(details?: string): string {
  const prefix = "ImageMagick is required for cropping.";
  const suffix =
    "Install ImageMagick and make sure `magick` and `identify` are available on your PATH.";

  return details ? `${prefix} ${details} ${suffix}` : `${prefix} ${suffix}`;
}

function isImageMagickDependencyIssue(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("command not found") ||
    lower.includes("no such file or directory") ||
    lower.includes("graphicsmagick/imagemagick") ||
    lower.includes("imagemagick") ||
    lower.includes("graphicsmagick") ||
    lower.includes("magick: not found") ||
    lower.includes("identify: not found") ||
    lower.includes("gm/convert")
  );
}

function isMissingExecutableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

function runSmartCrop(sourceFile: string, outputFile: string) {
  return spawnSync(
    packageSmartCropBin,
    [
      "--width",
      String(width),
      "--height",
      String(height),
      "--quality",
      String(quality),
      sourceFile,
      outputFile,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function runTopCrop(sourceFile: string, outputFile: string) {
  return spawnSync(
    "magick",
    [
      sourceFile,
      "-resize",
      `${width}x${height}^`,
      "-gravity",
      "North",
      "-extent",
      `${width}x${height}`,
      "-quality",
      String(quality),
      outputFile,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function normalizeOutputDimensions(destinationFile: string) {
  const dimensions = await readImageDimensions(destinationFile);
  if (dimensions.width === width && dimensions.height === height) {
    return;
  }

  const tempFile = `${destinationFile}.tmp${path.extname(destinationFile)}`;
  const result = spawnSync(
    "magick",
    [
      destinationFile,
      "-background",
      "black",
      "-gravity",
      "center",
      "-extent",
      `${width}x${height}`,
      tempFile,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "";
    const stdout = result.stdout?.trim() ?? "";
    const combined = [stdout, stderr].filter(Boolean).join("\n");
    throw new Error(
      combined.length > 0
        ? `Unable to normalize ${destinationFile} to ${width}x${height}: ${combined}`
        : `Unable to normalize ${destinationFile} to ${width}x${height}.`,
    );
  }

  await fs.rm(destinationFile, { force: true });
  await fs.rename(tempFile, destinationFile);
}

async function main() {
  ensurePositiveInteger(width, "Width");
  ensurePositiveInteger(height, "Height");
  ensurePositiveInteger(quality, "Quality");
  ensureCropVariant(variant);

  const files = await listInputImages(inputDir);
  if (files.length === 0) {
    throw new Error(`No images found in ${inputDir}`);
  }

  const cropLabel = variant === "top" ? "top-crop" : "smart-crop";
  const dimensionsByPath = await readImageDimensionsByPath(files);

  await removePathIfExists(outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  for (const sourceFile of files) {
    const relativePath = path.relative(inputDir, sourceFile);
    const destinationFile = path.join(outputDir, relativePath);
    await fs.mkdir(path.dirname(destinationFile), { recursive: true });

    const dimensions = dimensionsByPath[sourceFile];
    if (shouldKeepOriginal(dimensions.width, dimensions.height)) {
      await fs.copyFile(sourceFile, destinationFile);
      console.log(
        `${path.relative(cwd, destinationFile) || destinationFile} (kept original: ${dimensions.width}x${dimensions.height})`,
      );
      continue;
    }

    const result =
      variant === "top"
        ? runTopCrop(sourceFile, destinationFile)
        : runSmartCrop(sourceFile, destinationFile);
    const stderr = result.stderr?.trim() ?? "";
    const stdout = result.stdout?.trim() ?? "";
    const outputStats = await fs.stat(destinationFile).catch(() => null);

    if (!outputStats || outputStats.size === 0 || result.status !== 0) {
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      if (isImageMagickDependencyIssue(combined)) {
        throw new Error(imageMagickDependencyMessage(combined || undefined));
      }

      if (isMissingExecutableError(result.error)) {
        throw new Error(imageMagickDependencyMessage());
      }

      if (result.error) {
        throw new Error(`${cropLabel} failed for ${sourceFile}: ${result.error.message}`);
      }

      throw new Error(`${cropLabel} did not write an output file for ${sourceFile}`);
    }

    if (isImageMagickDependencyIssue([stdout, stderr].filter(Boolean).join("\n"))) {
      throw new Error(imageMagickDependencyMessage([stdout, stderr].filter(Boolean).join("\n")));
    }

    await normalizeOutputDimensions(destinationFile);
    console.log(`${path.relative(cwd, destinationFile) || destinationFile}`);
  }

  console.log(
    `${variant === "top" ? "Top-cropped" : "Smart-cropped"} ${files.length} image(s) into ${path.relative(cwd, outputDir) || outputDir}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
