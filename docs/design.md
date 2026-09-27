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
actually status <tool>
actually explain <tool>
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

Paquete npm:

```text
@getactually/cli
```

El signo `?` pertenece al branding, no al binario.

En npm, el nombre `actually` y el scope `@actually` ya pertenecen a otras cuentas. El campo `bin` del `package.json` mapea el comando `actually`, así que el comando no depende del nombre del paquete.

El scope `@getactually` agrupa los paquetes del proyecto. Queda reservado, por ejemplo, `@getactually/core` para que las integraciones de la Fase 3 consuman el core sin duplicarlo.

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
1 may include breaking changes
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

## 8. Detalle de una herramienta: `status <tool>`

```bash
actually status gstack
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

`status` sin argumentos muestra la lista resumida (§5). Con el nombre de una herramienta, muestra este detalle. La evidencia de cada dato está en `explain` (§9).

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

Si el nombre coincide con varias herramientas, por ejemplo la misma dependencia en dos proyectos, `explain` y `status <tool>` listan las coincidencias con su `id` y no eligen ninguna. En ese caso se puede pasar el `id` completo.

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

Con `--json`, el mismo problema aparece en `diagnostics` (§14).

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

`actually init` no entra en el MVP. Sin configuración, `status` revisa las herramientas globales y el proyecto de la carpeta actual, así que configurar no es obligatorio. Se reconsidera si la configuración pasa a ser necesaria.

Un flujo posible:

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

### Aviso de red en la primera ejecución

Antes de la primera consulta a la red, `actually` explica qué va a enviar y a quién:

```text
actually checks online for the latest versions of what it finds.

It sends package names to registry.npmjs.org and repository names
(owner/repo) to api.github.com. It never sends file paths, file
contents, project names or installed versions.

Those services can see which names were checked and your IP address.

Run without network:  actually status --offline
Turn it off:          set [network] enabled = false in the config

This notice is shown once.
```

Reglas:

- Se escribe siempre en stderr, antes de la primera consulta a la red, también con `--json`. stdout lleva solo el resultado, así que el documento JSON nunca incluye el aviso.
- No pide confirmación, así que no interrumpe scripts ni el primer uso.
- Se muestra una sola vez. El marcador es un archivo vacío en el directorio de estado local (architecture.md §3.5), no en la caché. Existe aunque no haya caché, como en la v0.1.
- Borrar el marcador vuelve a mostrar el aviso. Si el marcador no se puede escribir, el aviso se muestra en cada ejecución: es preferible repetirlo a omitirlo.
- No se muestra con `--offline` ni con la red desactivada.
- Nombra solo los hosts que la versión instalada realmente consulta.

El detalle completo está en architecture.md §8.

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
# Directorios de ejecutables a revisar, además del de pnpm
# y ~/.local/bin (architecture.md §3.3).
bin_paths = []

# Repositorios que son herramientas, no proyectos (mvp.md §5.3).
[[tools.git]]
path = "~/tools/gstack"

# Qué se envía y a quién: architecture.md §8.
[network]
enabled = true
# Nombres que nunca se consultan, por ejemplo "@mi-empresa/*".
exclude = []
# Usar GITHUB_TOKEN o GH_TOKEN para ampliar el límite de requests.
# Apagado por defecto: le permite a GitHub asociar las consultas
# a tu cuenta (architecture.md §14).
github_token = false

[cache]
enabled = true
ttl = "6h"

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
      "id": "global:pnpm:gstack",
      "name": "gstack",
      "scope": "global",
      "status": "outdated",
      "updateType": "major",
      "mayBreak": true,
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
  ],
  "diagnostics": []
}
```

Reglas:

- Ningún claim se omite. Si no aplica, es `not-applicable`. Si no se sabe, es `unknown` con `reason`.
- `null` no se usa para representar ausencia de información.
- `updateType` y `mayBreak` aparecen solo cuando `status` es `outdated`. No son claims: se derivan de las versiones.
- `updateType` dice qué número cambió. `mayBreak` estima, según semver, si el cambio puede ser incompatible. De `0.2.0` a `0.3.0` es `minor` con `mayBreak: true` (architecture.md §5).
- `status --json` no incluye `evidence`. `explain --json` sí.
- `diagnostics` siempre está presente, aunque esté vacío. Su forma está en architecture.md §13.

`id` es opaco y determinístico: los consumidores lo usan para comparar y referenciar, no para extraer datos. Su formato está en architecture.md §5 y distingue la misma dependencia en varios proyectos y las herramientas sin provider conocido.

No es estable en sentido fuerte. Se mantiene entre ejecuciones mientras no cambien el scope, la ubicación ni el provider detectado, y cambia si:

- el proyecto se mueve a otra carpeta, porque su raíz forma parte del id;
- cambia el provider detectado, por ejemplo cuando una herramienta pasa de `unknown` a `pnpm`.

Un integrador que necesite seguir una herramienta a través de esos cambios puede correlacionar por `name` y `scope`, sabiendo que esa combinación puede ser ambigua.

---

## 15. Diseño para IDEs

La CLI sigue siendo el producto principal.

Integraciones futuras deben consumir:

```bash
actually status --json
actually status <tool> --json
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
- Never add a command to the CommandRunner allowlist without an ADR.
- Never run pnpm inside a detected project.
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
   ├─ 0007-json-as-public-interface.md
   └─ 0008-scoped-package-name.md
```

### Idioma

- **En inglés:** el código, los comentarios, la salida de la CLI, las claves del JSON, `README`, `CONTRIBUTING`, `AGENTS.md` y todo el árbol de `docs/` de arriba. Es lo que leen los contribuidores y los integradores.
- **En español por ahora:** los documentos de planificación (`docs/mvp.md`, `docs/prd.md`, `docs/architecture.md`, `docs/design.md`) y `docs/review/`. Se traducen antes de hacer público el proyecto.

---

## 22. Principio final

La experiencia debe hacer que el usuario sienta:

```text
I know what is on my machine.
I know why actually thinks that.
I remain in control.
```

Ese es el núcleo del diseño.
