import { writeFile } from "node:fs/promises";
import { generateSW } from "workbox-build";

// Runs after `next build` in export mode. Precaches everything in out/ so the
// whole library works offline, not just visited pages. The .txt files are RSC
// payloads used by client-side navigation and must be precached too.
const { count, size, warnings } = await generateSW({
  swDest: "out/sw.js",
  globDirectory: "out",
  globPatterns: ["**/*.{html,js,css,txt,svg,png,ico,webmanifest,woff2}"],
  globIgnores: ["_headers"],
  ignoreURLParametersMatching: [/^_rsc$/],
  directoryIndex: "index.html",
  navigateFallback: "/404.html",
  skipWaiting: true,
  clientsClaim: true,
  sourcemap: false,
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
});

// Lets the UI show "cached X / total" progress; not precached itself.
await writeFile("out/offline-total.json", JSON.stringify({ count }));

warnings.forEach((w) => console.warn(w));
console.log(
  `sw.js: precached ${count} files, ${(size / 1024 / 1024).toFixed(1)} MB`
);
