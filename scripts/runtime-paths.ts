import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(scriptsDir, "..");
export const packagePublicRoot = path.join(packageRoot, "public");
export const packageTsxBin = path.join(packageRoot, "node_modules", ".bin", "tsx");
export const packageVidtoolsBin = path.join(packageRoot, "bin", "vidtools.js");
