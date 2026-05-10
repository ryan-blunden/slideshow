import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedLyricLine } from "../lyrics";

export type LyricsThemeMetrics = {
  wrapWidth: number;
  fontSize: number;
  lineHeight: number;
  paddingX: number;
  paddingY: number;
  averageCharWidthRatio: number;
  frameWidth: number;
  frameHeight: number;
  fontFamily: string;
};

const defaultMetrics: Omit<LyricsThemeMetrics, "frameWidth" | "frameHeight"> = {
  wrapWidth: 1280,
  fontSize: 76,
  lineHeight: 1.18,
  paddingX: 104,
  paddingY: 104,
  averageCharWidthRatio: 0.54,
  fontFamily: 'Palatino, "Times New Roman", Times, serif',
};

function parseCssNumber(cssText: string, propertyName: string, fallback: number): number {
  const match = cssText.match(
    new RegExp(`--${propertyName}\\s*:\\s*([+-]?(?:\\d+\\.\\d+|\\d+))(?:px)?\\s*;`, "i"),
  );

  if (!match) {
    return fallback;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : fallback;
}

function parseCssString(cssText: string, propertyName: string, fallback: string): string {
  const match = cssText.match(new RegExp(`--${propertyName}\\s*:\\s*([^;]+);`, "i"));
  if (!match) {
    return fallback;
  }

  return match[1].trim();
}

function estimateWrappedLines(
  text: string,
  wrapWidth: number,
  fontSize: number,
  ratio: number,
): number {
  const charWidth = Math.max(1, fontSize * ratio);
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 1;
  }

  let lineCount = 1;
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = word.length * charWidth;
    const separatorWidth = currentWidth === 0 ? 0 : charWidth;

    if (currentWidth > 0 && currentWidth + separatorWidth + wordWidth > wrapWidth) {
      lineCount += 1;
      currentWidth = wordWidth;
      continue;
    }

    if (wordWidth > wrapWidth) {
      const pieces = Math.max(1, Math.ceil(wordWidth / wrapWidth));
      lineCount += pieces - 1;
      currentWidth = wordWidth % wrapWidth;
      continue;
    }

    currentWidth += separatorWidth + wordWidth;
  }

  return lineCount;
}

export function deriveLyricsThemeMetrics(
  themeCss: string,
  lyricLines: ParsedLyricLine[],
): LyricsThemeMetrics {
  const wrapWidth = parseCssNumber(themeCss, "lyrics-wrap-width", defaultMetrics.wrapWidth);
  const fontSize = parseCssNumber(themeCss, "lyrics-font-size", defaultMetrics.fontSize);
  const lineHeight = parseCssNumber(themeCss, "lyrics-line-height", defaultMetrics.lineHeight);
  const paddingX = parseCssNumber(themeCss, "lyrics-padding-x", defaultMetrics.paddingX);
  const paddingY = parseCssNumber(themeCss, "lyrics-padding-y", defaultMetrics.paddingY);
  const averageCharWidthRatio = parseCssNumber(
    themeCss,
    "lyrics-average-char-width-ratio",
    defaultMetrics.averageCharWidthRatio,
  );
  const fontFamily = parseCssString(themeCss, "lyrics-font-family", defaultMetrics.fontFamily);

  const frameWidth = Math.ceil(wrapWidth + paddingX * 2);
  const frameHeight = lyricLines.reduce(
    (maxHeight, line) => {
      const wrappedLines = estimateWrappedLines(
        line.text,
        wrapWidth,
        fontSize,
        averageCharWidthRatio,
      );
      const lineHeightPx = wrappedLines * fontSize * lineHeight + paddingY * 2;
      return Math.max(maxHeight, lineHeightPx);
    },
    fontSize * lineHeight + paddingY * 2,
  );

  return {
    wrapWidth,
    fontSize,
    lineHeight,
    paddingX,
    paddingY,
    averageCharWidthRatio,
    frameWidth,
    frameHeight: Math.ceil(frameHeight),
    fontFamily,
  };
}

export async function readLyricsTheme(
  themePath: string | undefined,
  defaultThemePath: string,
): Promise<string> {
  return fs.readFile(themePath ?? defaultThemePath, "utf8");
}

export function buildFontFaceCss(fontFamily: string, fontSrc: string, format: string): string {
  return `@font-face {
  font-family: ${JSON.stringify(fontFamily)};
  src: url(${JSON.stringify(fontSrc)}) format(${JSON.stringify(format)});
  font-style: normal;
  font-weight: 400;
}`;
}

export function inferFontFormat(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".woff2":
      return "woff2";
    case ".woff":
      return "woff";
    case ".otf":
      return "opentype";
    default:
      return "truetype";
  }
}
