import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isSupportedImageFile, sortPathsNaturally } from "./randomize";

export type ImageDimensions = {
  width: number;
  height: number;
};

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "slideshow"
  );
}

export async function listInputImages(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listInputImages(fullPath)));
      continue;
    }

    if (entry.isFile() && isSupportedImageFile(fullPath) && fs.statSync(fullPath).isFile()) {
      files.push(fullPath);
    }
  }

  return sortPathsNaturally(files);
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return (
    buffer.readUInt8(offset) |
    (buffer.readUInt8(offset + 1) << 8) |
    (buffer.readUInt8(offset + 2) << 16)
  );
}

export async function readImageDimensions(filePath: string): Promise<ImageDimensions> {
  const buffer = await fsp.readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length >= 2 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;

    while (offset + 3 < buffer.length) {
      if (buffer.readUInt8(offset) !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer.readUInt8(offset + 1);
      offset += 2;

      if (marker === 0xd9 || marker === 0xda) {
        break;
      }

      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x00) {
        continue;
      }

      if (offset + 2 > buffer.length) {
        break;
      }

      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2) {
        break;
      }

      const segmentStart = offset + 2;
      const isSofMarker =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSofMarker && segmentStart + 5 < buffer.length) {
        return {
          height: buffer.readUInt16BE(segmentStart + 1),
          width: buffer.readUInt16BE(segmentStart + 3),
        };
      }

      offset += segmentLength;
    }

    throw new Error(`Unable to read JPEG dimensions for ${filePath}`);
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    let offset = 12;

    while (offset + 8 <= buffer.length) {
      const chunkType = buffer.subarray(offset, offset + 4).toString("ascii");
      const chunkSize = buffer.readUInt32LE(offset + 4);
      const chunkDataStart = offset + 8;

      if (chunkType === "VP8X" && chunkDataStart + 10 <= buffer.length) {
        return {
          width: readUInt24LE(buffer, chunkDataStart + 4) + 1,
          height: readUInt24LE(buffer, chunkDataStart + 7) + 1,
        };
      }

      if (chunkType === "VP8L" && chunkDataStart + 5 <= buffer.length) {
        const packed = buffer.readUInt32LE(chunkDataStart + 1);
        return {
          width: (packed & 0x3fff) + 1,
          height: ((packed >> 14) & 0x3fff) + 1,
        };
      }

      if (chunkType === "VP8" && chunkDataStart + 10 <= buffer.length) {
        return {
          width: buffer.readUInt16LE(chunkDataStart + 6) & 0x3fff,
          height: buffer.readUInt16LE(chunkDataStart + 8) & 0x3fff,
        };
      }

      offset = chunkDataStart + chunkSize + (chunkSize % 2);
    }

    throw new Error(`Unable to read WebP dimensions for ${filePath}`);
  }

  throw new Error(`Unsupported image format for dimension probing: ${extension || filePath}`);
}

export async function readImageDimensionsByPath(
  files: string[],
): Promise<Record<string, ImageDimensions>> {
  const dimensions: Record<string, ImageDimensions> = {};

  for (const filePath of files) {
    dimensions[filePath] = await readImageDimensions(filePath);
  }

  return dimensions;
}

export async function stageFilesToPublic(
  sourceFiles: string[],
  stagingName: string,
  publicRoot: string,
): Promise<Record<string, string>> {
  const stagingRoot = path.join(publicRoot, "generated", stagingName);
  await fsp.mkdir(stagingRoot, { recursive: true });

  const map: Record<string, string> = {};

  for (const [index, sourceFile] of sourceFiles.entries()) {
    const fileName = `${String(index + 1).padStart(3, "0")}-${path.basename(sourceFile)}`;
    const publicRelative = path.posix.join("generated", stagingName, fileName);
    const publicAbsolute = path.join(publicRoot, publicRelative);
    await fsp.copyFile(sourceFile, publicAbsolute);
    map[sourceFile] = publicRelative;
  }

  return map;
}

export async function stageFileToPublic(
  sourceFile: string,
  stagingName: string,
  publicRoot: string,
  publicFileName?: string,
): Promise<string> {
  const fileName = publicFileName ?? path.basename(sourceFile);
  const publicRelative = path.posix.join("generated", stagingName, fileName);
  const publicAbsolute = path.join(publicRoot, publicRelative);
  await fsp.mkdir(path.dirname(publicAbsolute), { recursive: true });
  await fsp.copyFile(sourceFile, publicAbsolute);
  return publicRelative;
}

export async function stageOptionalAudioToPublic(
  audioPath: string,
  stagingName: string,
  publicRoot: string,
): Promise<string> {
  const resolvedAudio = path.isAbsolute(audioPath)
    ? audioPath
    : path.resolve(process.cwd(), audioPath);
  const fileName = `${stagingName}-audio${path.extname(resolvedAudio) || ".wav"}`;
  return stageFileToPublic(resolvedAudio, stagingName, publicRoot, fileName);
}

export async function removeStagingDir(publicRoot: string, stagingName: string): Promise<void> {
  const stagingRoot = path.join(publicRoot, "generated", stagingName);
  await fsp.rm(stagingRoot, { recursive: true, force: true });
}

export async function removePathIfExists(targetPath: string): Promise<void> {
  await fsp.rm(targetPath, { recursive: true, force: true });
}
