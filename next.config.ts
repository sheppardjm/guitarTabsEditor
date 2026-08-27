import type { NextConfig } from "next";

// NEXT_PUBLIC_READONLY=1 builds the read-only static site for Netlify:
// the "local.tsx" page extension is dropped, so editor-only routes (and the
// server actions they import) are excluded from the export build.
const isReadonlyExport = process.env.NEXT_PUBLIC_READONLY === "1";

const nextConfig: NextConfig = {
  pageExtensions: isReadonlyExport
    ? ["tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js", "local.tsx"],
  ...(isReadonlyExport && {
    output: "export" as const,
    trailingSlash: true,
  }),
};

export default nextConfig;
