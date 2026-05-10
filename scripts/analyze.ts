import path from "node:path";
import { Command } from "commander";
import { listInputImages, readImageDimensionsByPath } from "../src/utils/slideshow-files";

type CliOptions = {
  input: string;
  height: string;
};

const program = new Command();

program
  .argument("[inputDir]", "directory of local images")
  .option("--input <dir>", "alias for the input directory")
  .option("--height <pixels>", "reference height for the suggested output size", "1080")
  .parse(process.argv);

const options = program.opts<CliOptions>();
const cwd = process.cwd();
const rawInputDir = program.args[0] ?? options.input;

if (!rawInputDir) {
  throw new Error("Missing input directory. Pass it as an argument or with --input.");
}

const inputDir = path.resolve(cwd, rawInputDir);
const referenceHeight = Number(options.height);

function roundToEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(3)}:1`;
}

function formatDimension(width: number, height: number): string {
  return `${roundToEven(width)}x${roundToEven(height)}`;
}

const commonRatios = [
  { label: "16:9", ratio: 16 / 9 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:2", ratio: 3 / 2 },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "9:16", ratio: 9 / 16 },
];

async function main() {
  if (!Number.isFinite(referenceHeight) || referenceHeight <= 0) {
    throw new Error("Height must be a positive number.");
  }

  const files = await listInputImages(inputDir);
  if (files.length === 0) {
    throw new Error(`No images found in ${inputDir}`);
  }

  const dimensionsByPath = await readImageDimensionsByPath(files);
  const dimensions = files.map((filePath) => dimensionsByPath[filePath]);
  const widths = dimensions.map((value) => value.width);
  const heights = dimensions.map((value) => value.height);
  const ratios = dimensions.map((value) => value.width / value.height);
  const averageWidth = mean(widths);
  const averageHeight = mean(heights);
  const medianRatio = median(ratios);
  const averageRatio = mean(ratios);

  const bestPreset = commonRatios.reduce(
    (best, preset) => {
      const distance = Math.abs(preset.ratio - medianRatio);
      if (!best || distance < best.distance) {
        return { ...preset, distance };
      }
      return best;
    },
    null as null | { label: string; ratio: number; distance: number },
  );

  const suggestedWidth = roundToEven(referenceHeight * medianRatio);
  const coverageThreshold = 0.1;
  const nearMedianCount = ratios.filter(
    (ratio) => Math.abs(ratio - medianRatio) / Math.max(medianRatio, 1e-6) <= coverageThreshold,
  ).length;

  console.log(`Input directory: ${path.relative(cwd, inputDir) || inputDir}`);
  console.log(`Image count: ${files.length}`);
  console.log(`Average image size: ${formatDimension(averageWidth, averageHeight)}`);
  console.log(`Average aspect ratio: ${formatRatio(averageRatio)}`);
  console.log(`Median aspect ratio: ${formatRatio(medianRatio)}`);
  console.log(`Closest standard ratio: ${bestPreset?.label ?? "unknown"}`);
  console.log(
    `Suggested output at ${referenceHeight}px tall: ${formatDimension(suggestedWidth, referenceHeight)}`,
  );
  console.log(
    `Images within ${coverageThreshold * 100}% of the median ratio: ${nearMedianCount}/${files.length}`,
  );
  console.log(
    `Tip: if you still want a fixed 16:9 render, keep 1920x1080 and use contain + background color.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
