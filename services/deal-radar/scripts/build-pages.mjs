import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, "../../_site/apps/deal-radar");
await mkdir(output, { recursive: true });
const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ["src/pages-entry.tsx"],
  entryNames: "radar-[hash]",
  outdir: output,
  bundle: true,
  minify: true,
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NEXT_PUBLIC_DEAL_RADAR_BASE_PATH": '""', "process.env.NODE_ENV": '"production"' },
  write: false,
});
const script = outputFiles.find((file) => file.path.endsWith(".js"));
if (!script) throw Error("Deal Radar bundle missing");
const globals = path.join(root, "src/app/globals.css");
const styles = await postcss([tailwind({ base: root, optimize: true })]).process(await readFile(globals, "utf8"), { from: globals });
const css = styles.css + "\n" + await readFile(path.join(root, "src/components/deal-board.css"), "utf8");
const styleName = `radar-${createHash("sha256").update(css).digest("hex").slice(0, 12)}.css`;
const template = await readFile(path.join(root, "src/pages.html"), "utf8");
await Promise.all([
  writeFile(script.path, script.contents),
  writeFile(path.join(output, styleName), css),
  writeFile(path.join(output, "index.html"), template.replace("__RADAR_CSS__", styleName).replace("__RADAR_JS__", path.basename(script.path))),
  copyFile(path.join(root, "src/app/icon.svg"), path.join(output, "icon.svg")),
]);
console.log(`Deal Radar Pages bundle: ${script.contents.byteLength + Buffer.byteLength(css)} bytes`);
