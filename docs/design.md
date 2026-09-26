# actually? — Design

## 1. Objetivo de diseño

El diseño de `actually?` debe transmitir:

- claridad;
- confianza;
- precisión;
- bajo ruido;
- control del usuario.

La experiencia debe sentirse como una herramienta de diagnóstico, no como un instalador agresivo.

---

## 2. Principios de UX

### 2.1 Informar antes que actuar

El sistema prioriza:

```text
detect
compare
explain
```

No:

```text
update now!
fix everything!
```

### 2.2 Estado visible

La salida debe comunicar rápidamente:

- actualizado;
- desactualizado;
- desconocido;
- error;
- información incompleta.

### 2.3 Incertidumbre explícita

No ocultar:

```text
unknown
probably
limited evidence
```

### 2.4 Progressive disclosure

La salida normal debe ser corta.

Detalles adicionales mediante:

```bash
actually info
actually explain
--verbose
--json
```

---

## 3. Identidad del producto

Nombre:

```text
actually?
```

Nombre CLI:

```text
actually
```

El signo `?` pertenece al branding, no al binario.

---

## 4. Tono

El producto debe ser:

- neutral;
- técnico;
- directo;
- no alarmista.

Evitar mensajes como:

```text
CRITICAL!
YOUR SYSTEM IS OUTDATED!
FIX NOW!
```

Preferir:

```text
2 updates available
1 major version change
```

---

## 5. Diseño de status

Ejemplo:

```text
actually

GLOBAL

✓ pnpm
  installed    12.0.0
  latest       12.0.0

↑ gstack
  installed    1.0.0
  latest       2.0.0
  installed by pnpm

? custom-tool
  installed    unknown
  latest       unknown
  provider     unknown

PROJECT · ~/projects/tokke

✓ typescript
  requested    ^5.9.0
  resolved     5.9.2
  latest       5.9.2

↑ biome
  resolved     2.1.0
  latest       2.3.1
```

`confidence` en `status` es un resumen. El detalle por afirmación está en `explain` (§9).

---

## 6. Símbolos

Uso sugerido:

```text
✓ current
↑ update available
? unknown
! warning
× error
```

Los símbolos nunca deben ser la única fuente de significado.

La salida debe seguir siendo comprensible sin color.

---

## 7. Color

El CLI puede usar color cuando el terminal lo soporte.

Sin embargo:

- debe funcionar sin color;
- `NO_COLOR` debe respetarse;
- JSON nunca lleva códigos ANSI;
- logs redirigidos deben evitar decoración innecesaria.

---

## 8. Comando `info`

```bash
actually info gstack
```

Salida:

```text
gstack

Installed
1.0.0

Latest stable
2.0.0

Scope
global

Installation provider
pnpm

Source
github.com/example/gstack

Status
update available
```

---

## 9. Comando `explain`

`explain` es una función central del diseño.

```bash
actually explain gstack
```

```text
gstack

Installed version    1.0.0                        high
  fact        pnpm list --global --json reports gstack@1.0.0

Installed by         pnpm                         high
  fact        pnpm list --global --json includes gstack
  fact        ~/.local/share/pnpm/gstack is inside pnpm's global bin directory

Source               github.com/example/gstack    medium
  inference   npm registry: "repository" points to github.com/example/gstack
  inference   repository name matches the package name

Latest stable        2.0.0                        high
  fact        npm registry: latest version is 2.0.0

Not determined
  requested, resolved    not applicable to global tools
```

Cada afirmación muestra su propia confianza y su evidencia. Cada línea de evidencia dice si es un hecho (`fact`) o una inferencia (`inference`).

Lo que no se pudo determinar aparece al final con su motivo. Nunca se omite.

---

## 10. Diseño de errores

Evitar:

```text
Error: ENOENT at Object.openSync...
```

Preferir:

```text
Could not inspect Git metadata.

Reason:
repository is not accessible

actually continued scanning other sources.
```

Con debug:

```bash
actually status --debug
```

se puede mostrar detalle técnico.

---

## 11. Modo proyecto

Cuando se ejecuta dentro de un proyecto:

```bash
actually status --project
```

Debe detectar root y mostrarlo.

```text
PROJECT
~/projects/tokke

Package manager
pnpm

Repository
GitHub

Dependencies checked
47

Updates available
3
```

Luego el detalle.

---

## 12. Configuración inicial

Podría existir:

```bash
actually init
```

Flujo:

```text
actually needs directories to scan.

Detected common locations:

[x] ~/projects
[x] ~/dev
[ ] ~/Documents

Save configuration? [Y/n]
```

No debe seleccionar directorios sensibles indiscriminadamente.

---

## 13. Configuración

Formato sugerido:

```toml
[scan]
paths = [
  "~/projects",
  "~/dev",
  "~/tools"
]

# Repositorios que son herramientas, no proyectos (mvp.md §5.3).
[[tools.git]]
path = "~/tools/gstack"

[network]
enabled = true

[output]
color = "auto"
```

Los defaults deben ser conservadores.

---

## 14. Diseño JSON

JSON es una interfaz pública.

Es una proyección del modelo de dominio de architecture.md §5: puede renombrar o aplanar campos, pero no puede exponer datos que ese modelo no tenga.

Debe:

- ser versionable;
- evitar cambios incompatibles silenciosos;
- usar campos estables;
- representar cada dato inferido como un claim con `state` explícito.

Ejemplo de `actually status --json`:

```json
{
  "schemaVersion": 1,
  "tools": [
    {
      "id": "pnpm:gstack",
      "name": "gstack",
      "scope": "global",
      "status": "outdated",
      "confidence": "high",
      "versions": {
        "requested": { "state": "not-applicable" },
        "resolved": { "state": "not-applicable" },
        "installed": { "state": "known", "value": "1.0.0", "confidence": "high" },
        "latest": { "state": "known", "value": "2.0.0", "confidence": "high" }
      },
      "installation": {
        "state": "known",
        "value": { "provider": "pnpm", "path": "/home/me/.local/share/pnpm/gstack" },
        "confidence": "high"
      },
      "source": {
        "state": "known",
        "value": {
          "provider": "github",
          "identifier": "example/gstack",
          "url": "https://github.com/example/gstack"
        },
        "confidence": "medium"
      },
      "update": {
        "state": "known",
        "value": { "provider": "pnpm" },
        "confidence": "high"
      }
    }
  ]
}
```

Reglas:

- Ningún claim se omite. Si no aplica, es `not-applicable`. Si no se sabe, es `unknown` con `reason`.
- `null` no se usa para representar ausencia de información.
- `status --json` no incluye `evidence`. `explain --json` sí.

> **Decisión pendiente (open-questions #9):** el formato de `id`. `pnpm:gstack` no distingue la misma dependencia en varios proyectos ni una herramienta sin provider conocido.

---

## 15. Diseño para IDEs

La CLI sigue siendo el producto principal.

Integraciones futuras deben consumir:

```bash
actually status --json
actually info <tool> --json
actually explain <tool> --json
```

Una extensión de VS Code no debe replicar detección.

Ejemplo visual futuro:

```text
ACTUALLY

Environment

Node        22.14    ✓
pnpm        12.0     ✓
gstack      1.0      ↑ 2.0
Biome       2.1      ↑ 2.3

2 updates available
```

---

## 16. Documentación de funciones

Toda función no trivial debe explicar:

1. qué hace;
2. cómo lo hace;
3. por qué existe de esa manera;
4. riesgos;
5. supuestos.

Evitar comentarios redundantes.

Mal:

```ts
/** Returns the name. */
getName(): string
```

Bien:

```ts
/**
 * Determines whether an executable is owned by pnpm.
 *
 * Ownership is inferred by comparing the resolved executable path
 * against pnpm's global binary directory and validating matching
 * package metadata.
 *
 * This avoids classifying unrelated binaries solely by filename.
 *
 * This operation is read-only.
 */
```

---

## 17. Docs de providers

Plantilla obligatoria:

```markdown
# Provider name

## Purpose

## Detection strategy

## Evidence used

## Version detection

## Commands executed

## Files inspected

## Network requests

## Failure modes

## Security considerations

## Known limitations
```

---

## 18. AGENTS.md

El repo debe incluir instrucciones explícitas para agentes.

Ejemplo:

```text
- Never add destructive commands.
- Never bypass CommandRunner.
- Never access the network outside HttpClient.
- Never import node:fs outside infrastructure/filesystem.
- Never introduce telemetry.
- Never require elevated privileges.
- Every provider requires tests and docs.
- Security exceptions require an ADR.
```

Estas instrucciones no reemplazan controles automáticos.

---

## 19. Hooks

### Pre-commit

Debe ser rápido.

Ejemplo:

```text
lint staged files
format check
light architecture checks
```

### Pre-push

```bash
pnpm check
```

Incluye:

- lint;
- typecheck;
- tests;
- security tests;
- architecture tests.

---

## 20. CI

Pipeline mínimo:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
security tests
 ↓
architecture tests
 ↓
dependency audit
```

Branch protection debe impedir merge si falla cualquier check obligatorio.

---

## 21. Estructura documental

```text
docs/
├─ architecture/
│  ├─ overview.md
│  ├─ core.md
│  ├─ providers.md
│  └─ data-flow.md
│
├─ concepts/
│  ├─ inventory.md
│  ├─ evidence.md
│  ├─ confidence.md
│  ├─ scope.md
│  └─ source-vs-installation.md
│
├─ providers/
│  ├─ pnpm.md
│  ├─ npm-registry.md
│  ├─ git.md
│  └─ github.md
│
├─ security/
│  ├─ threat-model.md
│  ├─ command-execution.md
│  ├─ filesystem.md
│  └─ network.md
│
├─ commands/
│  ├─ status.md
│  ├─ scan.md
│  ├─ info.md
│  └─ explain.md
│
└─ decisions/
   ├─ 0001-use-typescript.md
   ├─ 0002-use-pnpm.md
   ├─ 0003-read-only-mvp.md
   ├─ 0004-no-backend.md
   ├─ 0005-command-runner-boundary.md
   ├─ 0006-evidence-driven-detection.md
   └─ 0007-json-as-public-interface.md
```

---

## 22. Principio final

La experiencia debe hacer que el usuario sienta:

```text
I know what is on my machine.
I know why actually thinks that.
I remain in control.
```

Ese es el núcleo del diseño.
