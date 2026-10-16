/** The commands a package.json declares in `bin`, as npm and pnpm name them. */
export function binNames(manifest: Record<string, unknown>, packageName: string): string[] {
  const bin = manifest.bin;
  if (typeof bin === "string") {
    return [
      packageName.startsWith("@") ? packageName.slice(packageName.indexOf("/") + 1) : packageName,
    ];
  }
  if (typeof bin === "object" && bin !== null) return Object.keys(bin);
  return [];
}
