import { UsageError } from "../core/errors.js";
import type { Inventory, ToolRecord } from "../core/model.js";

/**
 * Finds the tool `explain <tool>` or `status <tool>` refers to. An exact id
 * always wins. A name that matches several tools is ambiguous: actually
 * lists the ids instead of picking one (docs/design.md §9).
 */
export function findTool(inventory: Inventory, query: string): ToolRecord {
  const byId = inventory.tools.find((t) => t.id === query);
  if (byId) return byId;
  const byName = inventory.tools.filter((t) => t.name === query);
  if (byName.length === 1 && byName[0]) return byName[0];
  if (byName.length > 1) {
    throw new UsageError(
      `"${query}" matches ${byName.length} tools. Pass one of these ids:\n` +
        byName.map((t) => `  ${t.id}`).join("\n"),
    );
  }
  throw new UsageError(`no tool named "${query}" was found`);
}
