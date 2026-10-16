import { join, sep } from "node:path";
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
import { redactSpec } from "../core/redact.js";
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
  applyRegistryFile,
  applyYarnEnvironment,
  parsePnpmConfig,
  type RegistryConfig,
} from "../providers/npm-registry/registry-config.js";
import { resolveNpmLatest } from "../providers/npm-registry/resolver.js";
import { findNpmPrefixes, type NpmGlobalPackage, type NpmPrefix } from "../providers/npm/global.js";
import { PATH_TOOLS, pathToolVersion, type PathToolVersion } from "../providers/path/tools.js";
import {
  scanOtherPnpmGenerations,
  scanPnpmGlobal,
  type PnpmGlobalPackage,
  type PnpmGlobalScan,
} from "../providers/pnpm/global.js";
import { findProjectRoot, findUpDir, scanProject } from "../providers/project/project.js";
import type { WorkspaceCache } from "../providers/project/workspace.js";
import type { NetContext } from "../providers/shared/cached-get.js";
import { listExecutables, type Executable } from "../scanners/bin-scanner.js";
import { findCommands } from "../scanners/path-lookup.js";
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

  // The pnpm that runs outside projects, whose global packages are listed.
  if (!options.projectOnly) {
    const pnpm = await scanPnpmGlobal(runner, fs);
    diagnostics.push(...pnpm.diagnostics);
    const scanOptions = { platform: env.platform, pathext: env.get("PATHEXT") };

    // Executables in the allowed directories (architecture.md §3.3).
    const binDirs = [
      ...(pnpm.binDir ? [pnpm.binDir] : []),
      join(home, ".local", "bin"),
      ...config.scan.binPaths,
    ];
    const executables = await listExecutables(fs, binDirs, scanOptions);
    const binsInPnpmDir = new Set(
      executables.filter((e) => e.dir === pnpm.binDir).map((e) => e.name),
    );
    // pnpm describes itself in one record: a pnpm executable elsewhere is
    // evidence for that record, not a second tool with the same id (F-37).
    const pnpmSelf = pnpm.installed && !pnpm.packages.some((p) => p.name === "pnpm");
    const pnpmElsewhere = pnpmSelf
      ? executables.filter((e) => e.name === "pnpm" && e.dir !== pnpm.binDir)
      : [];
    tools.push(...(await pnpmRecords(pnpm, userRegistry, deps, binsInPnpmDir, pnpmElsewhere)));

    // Executables that a package of npm or of another pnpm generation
    // provides: npm commands are looked up by name, and a generation's bin
    // directory is listed only to attribute its commands. No other file in
    // those directories is reported.
    const attributed = new Set<string>();
    const attribute = (exe: Executable) => attributed.add(exe.path);
    const packageDirs = pnpm.packages.flatMap((p) => (p.dir ? [p.dir] : []));

    // Global packages of the other pnpm generations (F-57).
    const generations = pnpm.rootDir ? await scanOtherPnpmGenerations(fs, pnpm.rootDir) : [];
    for (const generation of generations) {
      const exes = await listExecutables(fs, [generation.binDir], scanOptions);
      for (const pkg of generation.packages) {
        const dir = pkg.dir as string;
        packageDirs.push(dir);
        const provided = exes.filter((e) => pkg.bins.includes(e.name) || isInside(e.realPath, dir));
        for (const exe of provided) attribute(exe);
        const evidence = [...pkg.evidence];
        if (provided.length > 0) {
          evidence.push({
            kind: "inference",
            source: generation.binDir,
            description: `${generation.binDir}, the bin directory of ${generation.label}, provides ${provided.map((e) => e.name).join(", ")}`,
          });
        }
        tools.push(
          await pnpmPackageRecord(pkg, userRegistry, deps, evidence, {
            location: dir,
            unknownVersion: "its package.json has no valid version",
          }),
        );
      }
    }

    // npm global packages (docs/providers/npm.md).
    for (const [i, prefix] of (await findNpmPrefixes(fs, env)).entries()) {
      for (const pkg of prefix.packages) {
        packageDirs.push(pkg.dir, ...(pkg.linkedTo ? [pkg.linkedTo] : []));
        for (const exe of pkg.commands) attribute(exe);
        // The first prefix in PATH is the one npm installs into; packages of
        // the others are told apart by their path (architecture.md §5).
        tools.push(await npmRecord(pkg, prefix, i === 0, deps, diagnostics));
      }
    }

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
      ) {
        // On Linux and macOS, pnpm's commands are scripts, not links into
        // the package: only their place says whose they are.
        attribute(exe);
        continue;
      }
      if (attributed.has(exe.path)) continue;
      const repo = repoCandidates.find((c) => isInside(exe.realPath, c.real))?.root;
      if (repo && (await fs.exists(join(repo, ".git")).catch(() => false))) {
        const list = repoToolEvidence.get(repo) ?? [];
        list.push({
          kind: "inference",
          source: exe.path,
          description: exe.viaLauncher
            ? `its .cmd launcher runs ${exe.realPath}, inside this repository`
            : `executable resolves to ${exe.realPath}, inside this repository`,
        });
        repoToolEvidence.set(repo, list);
        continue;
      }
      if (pnpmElsewhere.includes(exe)) continue;
      unknownExecutables.push(exe);
    }

    // Developer tools on PATH, looked up by name (ADR 0011). One that a
    // package or a repository accounts for is not a second tool, and the
    // one on PATH stands for an unknown executable with its name.
    const sameName = (a: string, b: string) =>
      env.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    const onPath = await findCommands(fs, PATH_TOOLS, { path: env.get("PATH"), ...scanOptions });
    for (const exe of onPath) {
      if (
        attributed.has(exe.path) ||
        packageDirs.some((d) => isInside(exe.realPath, d)) ||
        repoCandidates.some((c) => isInside(exe.realPath, c.real))
      )
        continue;
      const others = unknownExecutables.filter((u) => sameName(u.name, exe.name));
      for (const other of others) unknownExecutables.splice(unknownExecutables.indexOf(other), 1);
      tools.push(pathToolRecord(exe, await pathToolVersion(fs, exe), others));
    }
    for (const exe of unknownExecutables) tools.push(unknownExecutableRecord(exe));

    for (const [root, evidence] of repoToolEvidence) {
      tools.push(await repoToolRecord(root, evidence, deps, github, diagnostics));
    }
  }

  if (!options.globalOnly) {
    const roots: string[] = [];
    const current = await findProjectRoot(fs, deps.cwd, home);
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

  // Ids reference one tool each (design.md §14). A repeated id is a bug:
  // say so instead of letting `status <id>` pick one silently (F-37).
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.id)) {
      diagnostics.push({
        severity: "error",
        source: "actually",
        message: `two tools share the id ${tool.id}; please report this`,
        toolId: tool.id,
      });
    }
    seen.add(tool.id);
  }

  return { tools, projects, diagnostics };
}

async function pnpmRecords(
  pnpm: PnpmGlobalScan,
  registry: RegistryConfig,
  deps: InventoryDeps,
  binsInPnpmDir: Set<string>,
  pnpmElsewhere: Executable[],
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
          evidence: pnpmElsewhere.map((exe) => ({
            kind: "fact",
            source: exe.path,
            description: `executable found in ${exe.dir}`,
          })),
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
    const installEvidence: Evidence[] = [...pkg.evidence];
    const shims = pkg.bins.filter((b) => binsInPnpmDir.has(b));
    if (shims.length > 0 && pnpm.binDir) {
      installEvidence.push({
        kind: "fact",
        source: pnpm.binDir,
        description: `pnpm's global bin directory provides ${shims.join(", ")}`,
      });
    }
    records.push(
      pnpmPackageRecord(pkg, registry, deps, installEvidence, {
        unknownVersion: `pnpm reports a non-registry version (${pkg.spec ? redactSpec(pkg.spec) : "unknown"})`,
      }),
    );
  }
  return Promise.all(records);
}

/**
 * A package pnpm installed globally. `location` gives it an id by path, for
 * the packages of another pnpm generation, which can share a name with the
 * ones the running pnpm lists.
 */
async function pnpmPackageRecord(
  pkg: PnpmGlobalPackage,
  registry: RegistryConfig,
  deps: InventoryDeps,
  installEvidence: Evidence[],
  options: { location?: string; unknownVersion: string },
): Promise<ToolRecord> {
  const origin = decideOrigin({
    name: pkg.name,
    spec: pkg.spec,
    specSource: pkg.specSource,
    registry,
    exclude: deps.config.network.exclude,
    tarball: pkg.resolved ? { url: pkg.resolved, source: "pnpm list --global --json" } : undefined,
  });
  const latest = await resolveNpmLatest(pkg.name, origin, deps.net);
  const installation = claimFrom<Installation>(
    { provider: "pnpm", ...(pkg.dir ? { path: pkg.dir } : {}) },
    installEvidence,
  );
  const versionEvidence = pkg.versionEvidence ? [pkg.versionEvidence] : pkg.evidence;
  return buildRecord({
    name: pkg.name,
    scope: "global",
    ...(options.location ? { location: options.location } : {}),
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed: pkg.installedVersion
        ? claimFrom(pkg.installedVersion, versionEvidence)
        : { state: "unknown", reason: options.unknownVersion, evidence: versionEvidence },
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
}

/**
 * A package in an npm global prefix. npm records no spec or tarball for a
 * global package, so where it came from is never known and it is never
 * queried (architecture.md §8): latest stays unknown.
 */
async function npmRecord(
  pkg: NpmGlobalPackage,
  prefix: NpmPrefix,
  primary: boolean,
  deps: InventoryDeps,
  diagnostics: Diagnostic[],
): Promise<ToolRecord> {
  const installEvidence: Evidence[] = [prefix.evidence];
  if (pkg.linkedTo) {
    installEvidence.push({
      kind: "inference",
      source: pkg.dir,
      description: `a link to ${pkg.linkedTo}, as npm link makes them`,
    });
  }
  const broken: Executable[] = [];
  for (const exe of pkg.commands) {
    if (!(await deps.fs.exists(exe.realPath).catch(() => false))) broken.push(exe);
    installEvidence.push({
      kind: "inference",
      source: exe.path,
      description: exe.viaLauncher
        ? `its launcher in ${prefix.binDir} runs ${exe.realPath}, inside this package, as npm writes them`
        : `${exe.path} resolves to ${exe.realPath}, inside this package, as npm links them`,
    });
  }
  const installation = claimFrom<Installation>({ provider: "npm", path: pkg.dir }, installEvidence);
  const record = buildRecord({
    name: pkg.name,
    scope: "global",
    ...(primary ? {} : { location: pkg.dir }),
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed:
        pkg.version && pkg.versionEvidence
          ? claimFrom(pkg.version, [pkg.versionEvidence])
          : { state: "unknown", reason: "its package.json has no valid version", evidence: [] },
      latest: {
        state: "unknown",
        reason: pkg.linkedTo
          ? `a link to ${pkg.linkedTo}, not a package from a registry`
          : "npm keeps no record of where a global package came from, so it is not queried",
        evidence: [],
      },
    },
    installation,
    source: sourceFromRepository(pkg.name, pkg.repository, join(pkg.dir, "package.json")),
    update: updateFrom(installation),
  });
  // A command whose launcher runs a missing file cannot start: say so.
  for (const exe of broken) {
    diagnostics.push({
      severity: "warning",
      source: "npm",
      message: `${exe.path} runs ${exe.realPath}, which does not exist: ${exe.name} cannot start`,
      toolId: record.id,
    });
  }
  return record;
}

/** A tool found on PATH by name (docs/providers/path.md). */
function pathToolRecord(
  exe: Executable,
  version: PathToolVersion,
  others: Executable[],
): ToolRecord {
  const found: Evidence = {
    kind: "fact",
    source: exe.path,
    description:
      exe.realPath === exe.path
        ? `the first ${exe.name} in PATH`
        : `the first ${exe.name} in PATH, which runs ${exe.realPath}`,
  };
  const elsewhere = others.map((o): Evidence => ({
    kind: "fact",
    source: o.path,
    description: `another ${o.name}, in ${o.dir}`,
  }));
  return buildRecord({
    name: exe.name,
    scope: "global",
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed:
        version.version !== undefined
          ? claimFrom(version.version, [version.evidence])
          : { state: "unknown", reason: version.reason, evidence: version.evidence },
      latest: {
        state: "unknown",
        reason: "no source declares a latest version for it",
        evidence: [],
      },
    },
    installation: {
      state: "unknown",
      reason: "installed outside any supported package manager",
      evidence: [found, ...elsewhere],
    },
    source: { state: "unknown", reason: "no evidence about its origin", evidence: [] },
    update: { state: "unknown", reason: "installation method is unknown", evidence: [] },
  });
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
  const repo = await readRepository(deps.fs, root, diagnostics);
  const name = root.split(sep).filter(Boolean).pop() ?? root;
  if (!repo) {
    const record = buildRecord({
      name,
      scope: "global",
      location: root,
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
    location: root,
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
    : applyYarnEnvironment(userRegistry, deps.env.get("YARN_NPM_REGISTRY_SERVER"));
  for (const file of scan.registryFiles) registry = applyRegistryFile(registry, file);

  const gitRoot = await findUpDir(fs, root, [".git"], deps.env.homeDir);
  const repo = gitRoot ? await readRepository(fs, gitRoot, diagnostics) : undefined;
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
          ? // The fact is the installed version; who installed it is only as
            // sure as the package manager (architecture.md §6, F-35).
            claimFrom(
              { provider: packageManager.value, path: dep.installed.path },
              [dep.installed.evidence, ...(scan.packageManager?.evidence ?? [])],
              { cap: packageManager.confidence },
            )
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
          requested: claimFrom(redactSpec(dep.requested), [
            {
              kind: "fact",
              source: scan.manifestPath ?? root,
              description: `${dep.section} declares "${redactSpec(dep.requested)}"`,
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
