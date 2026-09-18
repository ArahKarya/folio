// Copies the runtime assets pdf.js needs out of node_modules and into public/,
// where Vite serves them verbatim in dev and copies them into dist for release.
//
// Without these, pdf.js fails *silently* on real-world documents: v6 moved the
// JBIG2 and JPEG2000 decoders into WebAssembly, and a scanned PDF whose text is
// a JBIG2 layer simply renders without its words. Non-embedded standard fonts
// and CJK encodings need their own files for the same reason.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const target = new URL("../public/pdfjs/", import.meta.url).pathname;

// wasm: JBIG2, JPEG2000 and colour management decoders
// standard_fonts: the 14 base fonts, for PDFs that do not embed them
// cmaps: CJK character encodings
// iccs: colour profiles
const DIRECTORIES = ["wasm", "standard_fonts", "cmaps", "iccs"];

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of DIRECTORIES) {
  cpSync(join(root, name), join(target, name), { recursive: true });
}
console.log(`copied ${DIRECTORIES.join(", ")} -> public/pdfjs/`);
