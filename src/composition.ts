import { buildInventory, type InventoryOptions } from "./application/inventory.js";
import type { Config } from "./core/config.js";
import type { Inventory } from "./core/model.js";
import type { CommandRunner, Environment, HttpClient } from "./core/ports.js";
import { disabledCache, fileCache } from "./infrastructure/cache/file-cache.js";
import { nodeCommandRunner } from "./infrastructure/command-runner/node-command-runner.js";
import { loadConfig } from "./infrastructure/config/toml-config.js";
import { appDirs } from "./infrastructure/environment/dirs.js";
import { nodeEnvironment } from "./infrastructure/environment/node-environment.js";
import { nodeFilesystem } from "./infrastructure/filesystem/node-filesystem.js";
import { undiciHttpClient } from "./infrastructure/http/undici-http-client.js";
import { fileLocalState } from "./infrastructure/local-state/file-local-state.js";
import { VERSION } from "./version.js";

const NOTICE_MARKER = "network-notice-shown";

export interface RuntimeOptions {
  offline: boolean;
  noCache: boolean;
  cwd: string;
  /** Receives the first-run notice (always stderr, docs/design.md §12). */
  notice: (text: string) => void;
  /** Cancels pending network requests, for example on Ctrl-C. */
  signal?: AbortSignal;
}

export interface Runtime {
  config: Config;
  configWarnings: string[];
  env: Environment;
  inventory(options: InventoryOptions): Promise<Inventory>;
}

export const NETWORK_NOTICE = `actually checks online for the latest versions of what it finds.

It sends package names to registry.npmjs.org and repository names
(owner/repo) to api.github.com. It never sends file paths, file
contents, project names or installed versions.

Those services can see which names were checked and your IP address.

Run without network:  actually status --offline
Turn it off:          set [network] enabled = false in the config

This notice is shown once.
`;

/**
 * What the runtime talks to outside the process. Tests replace them to
 * check the rules that live here, such as the first-run notice (F-49).
 */
export interface RuntimeDeps {
  env: Environment;
  runner?: CommandRunner;
  httpClient: (options: { githubToken?: string; signal?: AbortSignal }) => HttpClient;
}

const nodeDeps = (): RuntimeDeps => ({
  env: nodeEnvironment(),
  httpClient: (o) => undiciHttpClient({ userAgent: `actually/${VERSION}`, ...o }),
});

/**
 * Composition root: the only module that wires infrastructure into the
 * application. The CLI imports this, never infrastructure directly.
 */
export async function createRuntime(
  options: RuntimeOptions,
  deps: RuntimeDeps = nodeDeps(),
): Promise<Runtime> {
  const { env } = deps;
  const dirs = appDirs(env);
  const fs = nodeFilesystem({ pathext: env.get("PATHEXT") });
  const { config, warnings } = await loadConfig(dirs.configFile, fs, env);
  const state = fileLocalState(dirs.state);
  const runner = deps.runner ?? nodeCommandRunner({ neutralDir: () => state.neutralDir() });

  const online = config.network.enabled && !options.offline;
  const http = online
    ? deps.httpClient({
        signal: options.signal,
        githubToken: config.network.githubToken
          ? (env.get("GITHUB_TOKEN") ?? env.get("GH_TOKEN"))
          : undefined,
      })
    : undefined;

  // The notice goes out before the first request leaves the machine. If
  // the marker cannot be written, the next run shows it again.
  let noticeShown: Promise<void> | undefined;
  const showNoticeOnce = () =>
    (noticeShown ??= (async () => {
      if (await state.hasMarker(NOTICE_MARKER)) return;
      options.notice(NETWORK_NOTICE);
      await state.writeMarker(NOTICE_MARKER);
    })());

  const cache = config.cache.enabled && !options.noCache ? fileCache(dirs.cache) : disabledCache();
  const net = {
    http: http
      ? {
          getJson: async (url: string, o?: { headers?: Record<string, string> }) => {
            await showNoticeOnce();
            return http.getJson(url, o);
          },
        }
      : undefined,
    cache,
    clock: { now: () => Date.now() },
    ttlMs: config.cache.ttlMs,
  };

  return {
    config,
    configWarnings: warnings,
    env,
    inventory: (inventoryOptions) =>
      buildInventory({ fs, runner, env, net, config, cwd: options.cwd }, inventoryOptions),
  };
}
