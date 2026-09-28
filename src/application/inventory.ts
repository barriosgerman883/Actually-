import { dirname, join, sep } from "node:path";
import { claimFrom } from "../core/confidence.js";
import type { Config } from "../core/config.js";
import { UsageError } from "../core/errors.js";
import {
  notApplicable,
  type Claim,
  type Diagnostic,
  type Evidence,
  type Installation,
  type Inventory,
  type ProjectSummary,
  type ToolRecord,
  type ToolSource,
} from "../core/model.js";
import type { CommandRunner, Environment, Filesystem } from "../core/ports.js";
import { buildRecord } from "../core/record.js";
import {
  installedFromTags,
  readRepository,
  type GitRepository,
} from "../providers/git/repository.js";
import { resolveGithubLatest, type GithubRunState } from "../providers/github/resolver.js";
import { githubWebUrl } from "../providers/github/url.js";
import { decideOrigin } from "../providers/npm-registry/origin.js";
import {
  applyNpmrc,
  parsePnpmConfig,
  type RegistryConfig,
} from "../providers/npm-registry/registry-config.js";
import { resolveNpmLatest } from "../providers/npm-registry/resolver.js";
import { scanPnpmGlobal, type PnpmGlobalScan } from "../providers/pnpm/global.js";
import { findProjectRoot, scanProject } from "../providers/project/project.js";
import type { WorkspaceCache } from "../providers/project/workspace.js";
import type { NetContext } from "../providers/shared/cached-get.js";
import { listExecutables, type Executable } from "../scanners/bin-scanner.js";
import { findProjects } from "../scanners/project-finder.js";
import { sourceFromRepository, updateFrom } from "./claims.js";

export interface InventoryDeps {
  fs: Filesystem;
  runner: CommandRunner;
  env: Environment;
  net: NetContext;
  config: Config;
  cwd: string;
}

export interface InventoryOptions {
  /** Only global tools (--global). */
  globalOnly?: boolean;
  /** Only the current project (--project). */
  projectOnly?: boolean;
}

const PNPM_OWN_BINS = new Set(["pnpm", "pnpx", "pn", "pnx"]);

function isInside(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);
}

async function findUpDir(
  fs: Filesystem,
  start: string,
  entry: string,
  stopAt: string,
): Promise<string | undefined> {
  let dir = start;
  for (;;) {
    if (await fs.exists(join(dir, entry))) return dir;
    if (dir === stopAt) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Builds the inventory for `status` and `explain`. It only observes: every
 * provider reads files or runs allowlisted read-only commands, and a failing
 * provider becomes a diagnostic instead of stopping the run (RA-009).
 */
export async function buildInventory(
  deps: InventoryDeps,
  options: InventoryOptions = {},
): Promise<Inventory> {
  const { fs, runner, env, config } = deps;
  const diagnostics: Diagnostic[] = [];
  const tools: ToolRecord[] = [];
  const projects: ProjectSummary[] = [];
  const github: GithubRunState = { rateLimited: false, diagnostics };
  const home = env.homeDir;

  // Effective registry, read once from pnpm (architecture.md §8).
  const registryResult = await runner.run({ command: "pnpm.config.list" });
  let userRegistry: RegistryConfig;
  if (registryResult.ok) {
    userRegistry = parsePnpmConfig(registryResult.stdout);
  } else {
    // Without the registry nothing is queried, so say so (§13, F-55).
    userRegistry = {
      state: "unknown",
      reason:
        registryResult.reason === "not-found"
          ? "pnpm is not installed"
          : "pnpm config could not be read",
    };
    diagnostics.push({
      severity: "warning",
      source: "pnpm",
      message: `default registry not determined (${registryResult.message}): no package was queried on registry.npmjs.org`,
    });
  }

  // Git repositories under scan.paths, and the ones declared as tools.
  const declaredTools = new Map(config.tools.git.map((t) => [t.path, t]));
  // Also with --global: a repository under scan.paths can be a tool
  // (docs/mvp.md §5.3). It is only scanned as a project without --global.
  const scannedRoots = options.projectOnly
    ? []
    : await findProjects(fs, config.scan.paths, config.scan.depth);
  const repoToolEvidence = new Map<string, Evidence[]>();
  for (const path of declaredTools.keys()) {
    repoToolEvidence.set(path, [
      {
        kind: "fact",
        source: config.file ?? "config",
        description: `declared as a tool in [[tools.git]] (${path})`,
      },
    ]);
  }

  if (!options.projectOnly) {
    const pnpm = await scanPnpmGlobal(runner, fs);
    diagnostics.push(...pnpm.diagnostics);

    // Executables in the allowed directories (architecture.md §3.3).
    const binDirs = [
      ...(pnpm.binDir ? [pnpm.binDir] : []),
      join(home, ".local", "bin"),
      ...config.scan.binPaths,
    ];
    const executables = await listExecutables(fs, binDirs);
    const binsInPnpmDir = new Set(
      executables.filter((e) => e.dir === pnpm.binDir).map((e) => e.name),
    );
    tools.push(...(await pnpmRecords(pnpm, userRegistry, deps, binsInPnpmDir)));
    const owned = new Set(pnpm.packages.flatMap((p) => p.bins));
    const unknownExecutables: Executable[] = [];
    // Executables resolve to real paths, so the roots are compared resolved too.
    const repoCandidates = await Promise.all(
      [...scannedRoots, ...declaredTools.keys()].map(async (root) => ({
        root,
        real: await fs.realpath(root).catch(() => root),
      })),
    );
    for (const exe of executables) {
      if (
        pnpm.binDir &&
        exe.dir === pnpm.binDir &&
        (owned.has(exe.name) || PNPM_OWN_BINS.has(exe.name))
      )
        continue;
      const repo = repoCandidates.find((c) => isInside(exe.realPath, c.real))?.root;
      if (repo && (await fs.exists(join(repo, ".git")))) {
        const list = repoToolEvidence.get(repo) ?? [];
        list.push({
          kind: "inference",
          source: exe.path,
          description: `executable resolves to ${exe.realPath}, inside this repository`,
        });
        repoToolEvidence.set(repo, list);
        continue;
      }
      unknownExecutables.push(exe);
    }
    for (const exe of unknownExecutables) tools.push(unknownExecutableRecord(exe));

    for (const [root, evidence] of repoToolEvidence) {
      tools.push(await repoToolRecord(root, evidence, deps, github, diagnostics));
    }
  }

  if (!options.globalOnly) {
    const roots: string[] = [];
    const current =
      (await findProjectRoot(fs, deps.cwd, home)) ?? (await findUpDir(fs, deps.cwd, ".git", home));
    if (current) roots.push(current);
    else if (options.projectOnly) throw new UsageError("no project found in the current directory");
    for (const root of scannedRoots) {
      if (!roots.includes(root) && !repoToolEvidence.has(root)) roots.push(root);
    }
    // Projects of the same workspace share one walk of its packages.
    const workspaces: WorkspaceCache = new Map();
    for (const root of roots) {
      const { summary, records } = await projectRecords(
        root,
        userRegistry,
        deps,
        diagnostics,
        workspaces,
      );
      projects.push(summary);
      tools.push(...records);
    }
  }

  return { tools, projects, diagnostics };
}

async function pnpmRecords(
  pnpm: PnpmGlobalScan,
  registry: RegistryConfig,
  deps: InventoryDeps,
  binsInPnpmDir: Set<string>,
): Promise<ToolRecord[]> {
  if (!pnpm.installed) return [];
  const { config, net } = deps;
  const records: Promise<ToolRecord>[] = [];

  if (!pnpm.packages.some((p) => p.name === "pnpm")) {
    records.push(
      (async () => {
        const origin = decideOrigin({
          name: "pnpm",
          spec: null,
          registry,
          exclude: config.network.exclude,
        });
        const latest = await resolveNpmLatest("pnpm", origin, net);
        const installation: Claim<Installation> = {
          state: "unknown",
          reason: "how pnpm itself was installed is not determined",
          evidence: [],
        };
        return buildRecord({
          name: "pnpm",
          scope: "global",
          versions: {
            requested: notApplicable,
            resolved: notApplicable,
            installed: pnpm.version
              ? claimFrom(pnpm.version, pnpm.versionEvidence)
              : { state: "unknown", reason: "pnpm --version gave no valid version", evidence: [] },
            latest: latest.latest,
          },
          installation,
          source: sourceFromRepository("pnpm", latest.repository, "npm registry manifest"),
          update: updateFrom(installation),
        });
      })(),
    );
  }

  for (const pkg of pnpm.packages) {
    records.push(
      (async () => {
        const origin = decideOrigin({
          name: pkg.name,
          spec: pkg.spec,
          specSource: pkg.specSource,
          registry,
          exclude: config.network.exclude,
          tarball: pkg.resolved
            ? { url: pkg.resolved, source: "pnpm list --global --json" }
            : undefined,
        });
        const latest = await resolveNpmLatest(pkg.name, origin, net);
        const installEvidence: Evidence[] = [...pkg.evidence];
        const shims = pkg.bins.filter((b) => binsInPnpmDir.has(b));
        if (shims.length > 0 && pnpm.binDir) {
          installEvidence.push({
            kind: "fact",
            source: pnpm.binDir,
            description: `pnpm's global bin directory provides ${shims.join(", ")}`,
          });
        }
        const installation = claimFrom<Installation>(
          { provider: "pnpm", ...(pkg.dir ? { path: pkg.dir } : {}) },
          installEvidence,
        );
        return buildRecord({
          name: pkg.name,
          scope: "global",
          versions: {
            requested: notApplicable,
            resolved: notApplicable,
            installed: pkg.installedVersion
              ? claimFrom(pkg.installedVersion, pkg.evidence)
              : {
                  state: "unknown",
                  reason: `pnpm reports a non-registry version (${pkg.spec ?? "unknown"})`,
                  evidence: pkg.evidence,
                },
            latest: latest.latest,
          },
          installation,
          source: sourceFromRepository(
            pkg.name,
            pkg.repository ?? latest.repository,
            pkg.repository && pkg.dir ? join(pkg.dir, "package.json") : "npm registry manifest",
          ),
          update: updateFrom(installation),
        });
      })(),
    );
  }
  return Promise.all(records);
}

function unknownExecutableRecord(exe: Executable): ToolRecord {
  const evidence: Evidence[] = [
    { kind: "fact", source: exe.path, description: `executable found in ${exe.dir}` },
  ];
  return buildRecord({
    name: exe.name,
    scope: "global",
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed: {
        state: "unknown",
        reason: "no supported provider reports its version",
        evidence,
      },
      latest: { state: "unknown", reason: "no supported provider manages it", evidence: [] },
    },
    installation: {
      state: "unknown",
      reason: "no supported provider manages this executable",
      evidence,
    },
    source: { state: "unknown", reason: "no evidence about its origin", evidence: [] },
    update: { state: "unknown", reason: "installation method is unknown", evidence: [] },
  });
}

function repositorySource(repo: GitRepository | undefined): Claim<ToolSource> {
  if (!repo) return notApplicable;
  if (!repo.github) return { state: "unknown", reason: "no GitHub remote", evidence: [] };
  return claimFrom(
    {
      provider: "github",
      identifier: `${repo.github.repo.owner}/${repo.github.repo.repo}`,
      url: githubWebUrl(repo.github.repo),
    },
    [repo.github.evidence],
  );
}

async function repoToolRecord(
  root: string,
  installEvidence: Evidence[],
  deps: InventoryDeps,
  github: GithubRunState,
  diagnostics: Diagnostic[],
): Promise<ToolRecord> {
  const repo = await readRepository(deps.fs, root);
  const name = root.split(sep).filter(Boolean).pop() ?? root;
  if (!repo) {
    const record = buildRecord({
      name,
      scope: "global",
      versions: {
        requested: notApplicable,
        resolved: notApplicable,
        installed: { state: "unknown", reason: "not a Git repository", evidence: [] },
        latest: { state: "unknown", reason: "not a Git repository", evidence: [] },
      },
      installation: { state: "unknown", reason: "not a Git repository", evidence: installEvidence },
      source: { state: "unknown", reason: "not a Git repository", evidence: [] },
      update: { state: "unknown", reason: "installation method is unknown", evidence: [] },
      failed: true,
    });
    // A provider that fails emits an error for the tools it affects (§13).
    diagnostics.push({
      severity: "error",
      source: "git",
      message: `${root} is declared as a tool but is not a Git repository`,
      toolId: record.id,
    });
    return record;
  }
  const tags = await installedFromTags(deps.runner, repo);
  const installed: Claim<string> = tags.version
    ? claimFrom(tags.version.value, [tags.version.evidence])
    : {
        state: "unknown",
        reason: tags.failure ?? "HEAD has no semver tag",
        evidence: tags.unknownEvidence,
      };
  const latest: Claim<string> = repo.github
    ? await resolveGithubLatest(repo.github.repo, deps.net, github)
    : { state: "unknown", reason: "no GitHub remote", evidence: [] };
  const installation = claimFrom<Installation>({ provider: "git", path: root }, installEvidence);
  const record = buildRecord({
    name,
    scope: "global",
    versions: { requested: notApplicable, resolved: notApplicable, installed, latest },
    installation,
    source: repositorySource(repo),
    update: updateFrom(installation),
    failed: tags.failure !== undefined,
  });
  if (tags.failure) {
    diagnostics.push({
      severity: "error",
      source: "git",
      message: `${root}: ${tags.failure}`,
      toolId: record.id,
    });
  }
  return record;
}

async function projectRecords(
  root: string,
  userRegistry: RegistryConfig,
  deps: InventoryDeps,
  diagnostics: Diagnostic[],
  workspaces: WorkspaceCache,
): Promise<{ summary: ProjectSummary; records: ToolRecord[] }> {
  const { fs, config, net } = deps;
  const scan = await scanProject(fs, root, deps.env.homeDir, workspaces);
  diagnostics.push(...scan.diagnostics);
  let registry: RegistryConfig = scan.registryUnknown
    ? { state: "unknown", reason: scan.registryUnknown }
    : userRegistry;
  for (const npmrc of scan.npmrcs) registry = applyNpmrc(registry, npmrc.text, npmrc.path);

  const gitRoot = await findUpDir(fs, root, ".git", deps.env.homeDir);
  const repo = gitRoot ? await readRepository(fs, gitRoot) : undefined;
  const packageManager: Claim<string> = scan.packageManager
    ? claimFrom(scan.packageManager.value, scan.packageManager.evidence)
    : scan.manifestPath
      ? { state: "unknown", reason: "no packageManager field and no lockfile", evidence: [] }
      : notApplicable;

  const records = await Promise.all(
    scan.dependencies.map(async (dep) => {
      const origin = decideOrigin({
        name: dep.name,
        spec: dep.requested,
        specSource: scan.manifestPath,
        registry,
        exclude: config.network.exclude,
        local: dep.local,
        tarball: dep.tarball,
      });
      const latest = await resolveNpmLatest(dep.name, origin, net);
      const installation: Claim<Installation> =
        dep.installed && packageManager.state === "known"
          ? claimFrom({ provider: packageManager.value, path: dep.installed.path }, [
              dep.installed.evidence,
              ...(scan.packageManager?.evidence ?? []),
            ])
          : dep.installed
            ? {
                state: "unknown",
                reason: "package manager not determined",
                evidence: [dep.installed.evidence],
              }
            : { state: "unknown", reason: "not installed in node_modules", evidence: [] };
      return buildRecord({
        name: dep.name,
        scope: "project",
        projectRoot: root,
        versions: {
          requested: claimFrom(dep.requested, [
            {
              kind: "fact",
              source: scan.manifestPath ?? root,
              description: `${dep.section} declares "${dep.requested}"`,
            },
          ]),
          resolved: dep.resolved
            ? claimFrom(dep.resolved.version, [dep.resolved.evidence])
            : {
                state: "unknown",
                reason: dep.resolvedUnknownReason ?? "not found in the lockfile",
                evidence: [],
              },
          installed: dep.installed
            ? claimFrom(dep.installed.version, [dep.installed.evidence])
            : { state: "unknown", reason: "not installed in node_modules", evidence: [] },
          latest: latest.latest,
        },
        installation,
        source: sourceFromRepository(dep.name, latest.repository, "npm registry manifest"),
        update: updateFrom(installation),
      });
    }),
  );

  return {
    summary: {
      root,
      packageManager,
      repository: repositorySource(repo),
      dependenciesChecked: records.length,
      updatesAvailable: records.filter((r) => r.status === "outdated").length,
    },
    records,
  };
}
