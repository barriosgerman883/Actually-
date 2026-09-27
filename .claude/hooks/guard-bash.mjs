#!/usr/bin/env node
// PreToolUse hook for Bash (docs/mvp.md §9, "Agentes").
//
// Denies destructive or irreversible commands and asks before risky ones.
// It parses the command into simple commands, so text inside quoted
// arguments, such as a commit message, is not mistaken for a command.
// It is a safety net, not a sandbox: an obfuscated command can evade it.
import process from "node:process";
import { pathToFileURL } from "node:url";

const PREFIX = "actually guardrail (docs/mvp.md §9)";

/** Splits a command line into simple commands, each a list of words. */
export function parse(text) {
  const commands = [];
  let words = [];
  let word = "";
  let inWord = false;
  let pipedFrom = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = (op) => {
    endWord();
    if (words.length > 0) commands.push({ words, pipedFrom });
    pipedFrom = op === "|" && words.length > 0 ? words : null;
    words = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      word += text[++i];
      inWord = true;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      word += text.slice(i + 1, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end;
      inWord = true;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\" && j + 1 < text.length) j++;
        word += text[j];
        j++;
      }
      i = j;
      inWord = true;
    } else if (c === "#" && !inWord) {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (c === "\n" || c === ";") {
      endCommand(";");
    } else if (c === "&" && text[i + 1] === "&") {
      endCommand("&&");
      i++;
    } else if (c === "|" && text[i + 1] === "|") {
      endCommand("||");
      i++;
    } else if (c === "|") {
      endCommand("|");
    } else if (c === "&" && text[i - 1] !== ">" && text[i + 1] !== ">") {
      endCommand("&");
    } else if (c === " " || c === "\t") {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand(";");
  return commands;
}

/** Removes heredoc bodies unless they are fed to a shell. */
export function stripHeredocs(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    const match = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (!match) continue;
    const toShell = /(^|[\s;&|(])(ba|z|da|k)?sh(\s|$)/.test(line.slice(0, match.index));
    const terminator = match[2];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== terminator) {
      if (toShell) out.push(lines[j]);
      j++;
    }
    i = j;
  }
  return out.join("\n");
}

/** Command texts nested in $(...) and backticks. */
function substitutions(text) {
  const found = [];
  for (const m of text.matchAll(/\$\(([^()]*)\)/g)) found.push(m[1]);
  for (const m of text.matchAll(/`([^`]*)`/g)) found.push(m[1]);
  return found;
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const WRAPPERS = new Set(["command", "builtin", "exec", "nohup", "time", "nice", "stdbuf"]);
const PROTECTED_ROOTS = new Set([".git", "src", "docs", "tests", ".claude", ".github"]);
const SECRET_PATH =
  /(^|\/)(\.npmrc|\.netrc|\.git-credentials|\.pypirc)$|(^|\/)\.ssh(\/|$)|\.config\/gh\/hosts\.yml$|\.aws\/credentials$|\.docker\/config\.json$|^\/proc\/[^/]+\/environ$/;
const GUARD_FILES = /(^|\/)\.claude\/(settings(\.local)?\.json|hooks(\/|$))/;
const READ_ONLY = new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "grep",
  "rg",
  "ls",
  "wc",
  "diff",
  "stat",
  "file",
  "jq",
  "node",
  "git",
  "pnpm",
  "npx",
  "prettier",
  "eslint",
]);

const deny = (reason) => ({ decision: "deny", reason });
const ask = (reason) => ({ decision: "ask", reason });

const shortFlagsWith = (arg, letter) => new RegExp(`^-[A-Za-z]*${letter}[A-Za-z]*$`).test(arg);

function hasUnguardedVariable(arg) {
  const vars = arg.match(/\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return vars.some((v) => !/^\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}$/.test(v));
}

function rmTarget(arg) {
  if (hasUnguardedVariable(arg))
    return deny(`rm with an unguarded variable (${arg}); use "\${VAR:?}"`);
  const globAt = arg.search(/[*?[]/);
  const prefix = (globAt < 0 ? arg : arg.slice(0, globAt)).replace(/\/+$/, "");
  const home = /^(~|\$HOME|\$\{HOME\})(\/|$)/.exec(arg);
  if (home) {
    const rest = arg.slice(home[1].length).replace(/^\/+/, "");
    const depth = rest.split("/").filter(Boolean).length;
    if (depth <= 1) return deny(`rm -r on the home directory or a top-level folder in it (${arg})`);
    return null;
  }
  if (arg.startsWith("/")) {
    const depth = prefix.split("/").filter(Boolean).length;
    if (depth <= 1) return deny(`rm -r on a system-level path (${arg})`);
    return null;
  }
  const rel = arg.replace(/^(\.\/)+/, "");
  if (rel === "" || rel === "." || rel.startsWith("..") || /^[*.]*\*$/.test(rel) || rel === ".*") {
    return deny(`rm -r on the current, parent or every directory (${arg})`);
  }
  const first = rel.split("/")[0];
  if (PROTECTED_ROOTS.has(first)) {
    const isRoot = rel.replace(/\/+$/, "") === first;
    if (isRoot || first === ".git" || first === ".claude") {
      return deny(`rm -r on a protected repository directory (${arg})`);
    }
    return ask(`rm -r inside ${first}/ (${arg})`);
  }
  return null;
}

function checkRm(args, viaXargs) {
  const flags = args.filter((a) => a.startsWith("-"));
  const recursive = flags.some(
    (f) => f === "--recursive" || (/^-[A-Za-z]+$/.test(f) && /[rR]/.test(f)),
  );
  if (!recursive) return [];
  const targets = args.filter((a) => !a.startsWith("-"));
  if (targets.length === 0 && viaXargs) return [ask("rm -r with targets from xargs")];
  return targets.map(rmTarget).filter(Boolean);
}

function gitSubcommand(args) {
  let i = 0;
  const globals = [];
  while (i < args.length && args[i].startsWith("-")) {
    const a = args[i];
    globals.push(a);
    if ((a === "-C" || a === "-c") && i + 1 < args.length) globals.push(args[++i]);
    i++;
  }
  return { globals, sub: args[i], rest: args.slice(i + 1) };
}

function checkGit(args) {
  const found = [];
  const { globals, sub, rest } = gitSubcommand(args);
  if (globals.some((g) => /^core\.hookspath=/i.test(g)))
    found.push(deny("git with core.hooksPath"));
  if (rest.includes("--no-verify")) found.push(deny(`git ${sub} --no-verify skips the git hooks`));
  const positional = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "push": {
      if (
        rest.some(
          (a) => a === "--force" || a === "--mirror" || a === "--prune" || shortFlagsWith(a, "f"),
        )
      )
        found.push(
          deny("git push --force, --mirror or --prune overwrites or deletes remote history"),
        );
      if (rest.some((a) => a === "--delete" || shortFlagsWith(a, "d")))
        found.push(deny("git push --delete removes a remote branch or tag"));
      if (rest.some((a) => a.startsWith("--force-with-lease") || a === "--force-if-includes"))
        found.push(ask("git push --force-with-lease rewrites the remote branch"));
      if (rest.includes("--all")) found.push(ask("git push --all pushes every local branch"));
      for (const ref of positional.slice(1)) {
        if (ref.startsWith("+")) found.push(deny(`force refspec ${ref}`));
        if (ref.startsWith(":")) found.push(deny(`refspec ${ref} deletes a remote ref`));
        if (/(^|:)(refs\/heads\/)?(main|master)$/.test(ref))
          found.push(deny("pushing to main or master; push to the working branch and open a PR"));
      }
      break;
    }
    case "commit":
      if (rest.some((a) => a === "-n" || (shortFlagsWith(a, "n") && !a.includes("m"))))
        found.push(deny("git commit -n skips the git hooks"));
      if (rest.includes("--amend")) found.push(ask("git commit --amend rewrites the last commit"));
      break;
    case "reset":
      if (rest.includes("--hard")) found.push(ask("git reset --hard discards uncommitted work"));
      break;
    case "clean":
      if (rest.some((a) => a === "--force" || shortFlagsWith(a, "f")))
        found.push(deny("git clean -f deletes untracked files, such as unrecorded findings"));
      break;
    case "checkout":
      if (
        rest.includes("--") ||
        positional.includes(".") ||
        rest.some((a) => a === "--force" || a === "-f")
      )
        found.push(ask("git checkout of paths discards local changes"));
      if (rest.includes("-B")) found.push(ask("git checkout -B resets a branch"));
      break;
    case "restore":
      if (!rest.includes("--staged") || rest.includes("--worktree"))
        found.push(ask("git restore discards local changes"));
      break;
    case "switch":
      if (
        rest.some((a) => a === "--discard-changes" || a === "-f" || a === "--force" || a === "-C")
      )
        found.push(ask("git switch that discards changes or resets a branch"));
      break;
    case "branch":
      if (rest.some((a) => a === "-D" || a === "--force" || a === "-f"))
        found.push(ask("git branch -D deletes a branch that may not be merged"));
      break;
    case "stash":
      if (positional[0] === "drop" || positional[0] === "clear")
        found.push(ask(`git stash ${positional[0]} deletes stashed work`));
      break;
    case "tag":
      if (rest.some((a) => a === "-d" || a === "--delete"))
        found.push(ask("git tag -d deletes a tag"));
      break;
    case "filter-branch":
    case "filter-repo":
    case "prune":
      found.push(deny(`git ${sub} rewrites or deletes history`));
      break;
    case "reflog":
      if (positional[0] === "expire" || positional[0] === "delete")
        found.push(deny(`git reflog ${positional[0]} deletes recovery points`));
      break;
    case "update-ref":
      if (rest.includes("-d")) found.push(deny("git update-ref -d deletes a ref"));
      break;
    case "gc":
      if (rest.some((a) => a.startsWith("--prune")))
        found.push(deny("git gc --prune deletes unreachable objects"));
      break;
    case "credential":
      found.push(deny("git credential reads stored credentials"));
      break;
    case "config": {
      const reads = [
        "--get",
        "--get-all",
        "--get-regexp",
        "--list",
        "-l",
        "--show-origin",
        "--show-scope",
      ];
      if (positional.some((a) => /^core\.hookspath$/i.test(a)))
        found.push(deny("changing core.hooksPath disables the git hooks"));
      else if (
        !rest.some((a) => reads.includes(a)) &&
        (positional.length >= 2 ||
          rest.some((a) => /^--(unset|add|replace-all|edit|remove-section|rename-section)/.test(a)))
      )
        found.push(ask("git config changes the repository configuration"));
      break;
    }
    case "remote":
      if (["add", "set-url", "remove", "rm", "rename"].includes(positional[0]))
        found.push(ask(`git remote ${positional[0]} changes where pushes go`));
      break;
    default:
      if (typeof sub === "string" && sub.startsWith("credential-"))
        found.push(deny("git credential helpers read stored credentials"));
  }
  return found;
}

const REGISTRY_WRITES = new Set([
  "publish",
  "unpublish",
  "deprecate",
  "undeprecate",
  "dist-tag",
  "dist-tags",
  "owner",
  "access",
  "token",
  "team",
  "org",
  "adduser",
  "login",
  "logout",
  "star",
  "unstar",
]);

function checkPackageManager(cmd, args) {
  const found = [];
  let sub = args.find((a) => !a.startsWith("-"));
  let subArgs = args.slice(args.indexOf(sub) + 1);
  if (cmd === "yarn" && sub === "npm") {
    sub = subArgs.find((a) => !a.startsWith("-"));
    subArgs = subArgs.slice(subArgs.indexOf(sub) + 1);
  }
  if (sub === undefined) return found;
  if (REGISTRY_WRITES.has(sub))
    found.push(deny(`${cmd} ${sub} changes the npm registry or its credentials`));
  if (sub === "config" || sub === "c" || sub === "get") {
    const action = sub === "get" ? "get" : subArgs.find((a) => !a.startsWith("-"));
    if (action === undefined || ["list", "ls", "get"].includes(action))
      found.push(
        deny(`${cmd} config output can contain auth tokens (CLAUDE.md, "Tokens in pnpm config")`),
      );
    else found.push(ask(`${cmd} config ${action} changes the package manager configuration`));
  }
  const global = args.some((a) => a === "-g" || a === "--global" || a === "--location=global");
  const installs = [
    "add",
    "install",
    "i",
    "remove",
    "rm",
    "uninstall",
    "un",
    "update",
    "up",
    "upgrade",
    "link",
    "unlink",
  ];
  if (global && installs.includes(sub))
    found.push(ask(`${cmd} ${sub} --global changes the global tools actually inspects`));
  else if (
    sub === "add" ||
    ((sub === "install" || sub === "i") && cmd === "npm" && subArgs.some((a) => !a.startsWith("-")))
  )
    found.push(ask(`${cmd} ${sub} adds a dependency; new dependencies need review`));
  if (["setup", "self-update"].includes(sub) || (sub === "env" && subArgs[0] === "use"))
    found.push(ask(`${cmd} ${sub} changes the pnpm installation`));
  if (sub === "dlx") found.push(ask(`${cmd} dlx downloads and runs a package`));
  return found;
}

function checkCommand(words, pipedFrom, depth) {
  const found = [];
  let i = 0;
  let viaXargs = false;
  // Leading variable assignments.
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) {
    if (/^(SKIP_SIMPLE_GIT_HOOKS=|HUSKY=0)/.test(words[i]))
      found.push(deny(`${words[i]} disables the git hooks`));
    i++;
  }
  for (;;) {
    const w = words[i];
    if (w === undefined) return found;
    if (WRAPPERS.has(w)) i++;
    else if (
      w === "env" &&
      words.length > i + 1 &&
      !words.slice(i + 1).every((a) => a.startsWith("-"))
    ) {
      i++;
      while (
        i < words.length &&
        (words[i].startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))
      ) {
        if (/^(SKIP_SIMPLE_GIT_HOOKS=|HUSKY=0)/.test(words[i]))
          found.push(deny(`${words[i]} disables the git hooks`));
        i++;
      }
    } else if (w === "timeout") {
      i++;
      while (i < words.length && (words[i].startsWith("-") || /^\d/.test(words[i]))) i++;
    } else if (w === "xargs") {
      viaXargs = true;
      i++;
      while (i < words.length && words[i].startsWith("-")) i++;
    } else break;
  }
  const cmd = words[i].replace(/^.*\//, "");
  const args = words.slice(i + 1);

  if (["sudo", "su", "doas", "pkexec"].includes(cmd))
    return [...found, deny(`${cmd}: elevated privileges are never needed`)];
  if (SHELLS.has(cmd)) {
    const c = args.indexOf("-c");
    if (c >= 0 && args[c + 1] !== undefined && depth < 4)
      found.push(...evaluateText(args[c + 1], depth + 1));
    if (pipedFrom && ["curl", "wget"].includes(pipedFrom[0]?.replace(/^.*\//, "")))
      found.push(deny("piping a download into a shell runs unreviewed code"));
    return found;
  }
  if (cmd === "eval" && depth < 4) return [...found, ...evaluateText(args.join(" "), depth + 1)];
  if (
    pipedFrom &&
    ["curl", "wget"].includes(pipedFrom[0]?.replace(/^.*\//, "")) &&
    /^(node|python3?|perl|ruby|deno|bun)$/.test(cmd)
  )
    found.push(deny("piping a download into an interpreter runs unreviewed code"));

  // Secrets.
  if (cmd === "printenv") found.push(deny("printenv prints secrets such as tokens"));
  if (cmd === "env" && args.every((a) => a.startsWith("-")))
    found.push(deny("env without a command prints secrets"));
  if (
    (cmd === "export" || cmd === "declare" || cmd === "typeset") &&
    args.every((a) => a.startsWith("-"))
  )
    found.push(deny(`${cmd} without arguments prints secrets`));
  if (cmd === "set" && args.length === 0) found.push(deny("set without arguments prints secrets"));
  if (
    cmd === "gh" &&
    args[0] === "auth" &&
    (args[1] === "token" || args.includes("--show-token") || args.includes("-t"))
  )
    found.push(deny("gh auth token prints a credential"));
  for (const a of args) {
    if (SECRET_PATH.test(a.replace(/\/+$/, ""))) found.push(deny(`${a} can contain credentials`));
  }

  // The guardrails themselves.
  if (args.some((a) => GUARD_FILES.test(a)) && !READ_ONLY.has(cmd))
    found.push(deny("only the user changes the agent guardrails in .claude/"));
  if (
    (cmd === "sed" || cmd === "perl") &&
    args.some((a) => /^-[a-zA-Z]*i/.test(a)) &&
    args.some((a) => GUARD_FILES.test(a))
  )
    found.push(deny("only the user changes the agent guardrails in .claude/"));

  switch (cmd) {
    case "rm":
      found.push(...checkRm(args, viaXargs));
      break;
    case "git":
      found.push(...checkGit(args));
      break;
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun":
      found.push(...checkPackageManager(cmd, args));
      break;
    case "corepack":
      if (args.some((a) => ["enable", "disable", "prepare", "install", "use", "up"].includes(a)))
        found.push(ask("corepack changes the package manager installation"));
      break;
    case "find":
      if (
        args.includes("-delete") ||
        args.some(
          (a, k) => (a === "-exec" || a === "-execdir") && /(^|\/)rm$/.test(args[k + 1] ?? ""),
        )
      )
        found.push(ask("find that deletes files"));
      break;
    case "mv": {
      const sources = args.filter((a) => !a.startsWith("-")).slice(0, -1);
      if (sources.some((s) => PROTECTED_ROOTS.has(s.replace(/^\.\//, "").replace(/\/+$/, ""))))
        found.push(ask("moving a protected repository directory"));
      break;
    }
    case "chmod":
      if (args.some((a) => a === "-R" || a === "--recursive" || /^0?777$/.test(a)))
        found.push(deny("chmod -R or 777 changes permissions broadly"));
      break;
    case "chown":
      found.push(
        args.some((a) => a === "-R" || a === "--recursive")
          ? deny("chown -R")
          : ask("chown changes file ownership"),
      );
      break;
    case "dd":
      if (args.some((a) => a.startsWith("of=")))
        found.push(deny("dd writes raw data to a file or device"));
      break;
    case "shred":
    case "wipefs":
    case "fdisk":
    case "parted":
    case "mkswap":
    case "shutdown":
    case "reboot":
    case "halt":
    case "poweroff":
      found.push(deny(`${cmd} is destructive or stops the machine`));
      break;
    case "kill":
    case "pkill":
    case "killall":
      if (args.includes("-1") || cmd !== "kill")
        found.push(ask(`${cmd} can stop unrelated processes`));
      break;
    default:
      if (/^mkfs(\.|$)/.test(cmd)) found.push(deny("mkfs formats a disk"));
  }
  return found;
}

function evaluateText(text, depth) {
  const clean = stripHeredocs(text);
  const found = [];
  if (/(^|[^<>])>>?\s*\/dev\/(sd|nvme|hd|vd|disk|mmcblk)/.test(clean))
    found.push(deny("writing to a block device"));
  if (/<\(\s*(curl|wget)\b/.test(clean)) found.push(deny("running a downloaded script"));
  if (/(^|[^<])>>?\s*["']?[^\s"';|&]*\.claude\/(settings(\.local)?\.json|hooks\/)/.test(clean))
    found.push(deny("only the user changes the agent guardrails in .claude/"));
  if (depth < 4)
    for (const inner of substitutions(clean)) found.push(...evaluateText(inner, depth + 1));
  for (const { words, pipedFrom } of parse(clean))
    found.push(...checkCommand(words, pipedFrom, depth));
  return found;
}

/** Returns the decision for a command: deny, ask, or undefined to allow. */
export function evaluate(command) {
  const found = evaluateText(String(command ?? ""), 0);
  const denied = found.filter((f) => f.decision === "deny");
  if (denied.length > 0)
    return { decision: "deny", reason: [...new Set(denied.map((f) => f.reason))].join("; ") };
  const asked = found.filter((f) => f.decision === "ask");
  if (asked.length > 0)
    return { decision: "ask", reason: [...new Set(asked.map((f) => f.reason))].join("; ") };
  return undefined;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  let command;
  try {
    command = JSON.parse(input)?.tool_input?.command;
  } catch {
    return;
  }
  const result = evaluate(command);
  if (!result) return;
  const reason =
    result.decision === "deny"
      ? `${PREFIX}: blocked: ${result.reason}. Do not work around this: tell the user what you needed and why.`
      : `${PREFIX}: ${result.reason}. Confirm only if this is intended.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
