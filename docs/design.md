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

✓ pnpm  up to date
  installed    12.0.0
  latest       12.0.0

↑ gstack  update available (major, may break)
  installed    1.0.0
  latest       2.0.0
  installed by pnpm
  confidence   high

? 1 executable with no known provider
  custom-tool
  use --verbose to list them one by one

PROJECT · ~/projects/tokke
  manager      pnpm
  repository   https://github.com/me/tokke
  dependencies 2 checked · 1 update available

↑ @biomejs/biome  update available (minor)
  requested    ^2.1.0
  resolved     2.1.0
  installed    2.1.0
  latest       2.3.1
  installed by pnpm
  confidence   high

  1 dependency up to date (--verbose to list)

2 updates available · 1 may include breaking changes · 1 unknown
Run `actually explain <tool>` to see the evidence.
```

`confidence` en `status` es un resumen, y solo aparece cuando la herramienta no está al día. El detalle por afirmación está en `explain` (§9). Sin `--verbose`, las dependencias al día se cuentan en una línea y los ejecutables sin provider se agrupan; con `--verbose` se listan uno por uno.

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

Latest (source-declared)
2.0.0

Scope
global

Installation provider
pnpm

Source
https://github.com/example/gstack

Status
update available (major, may include breaking changes)

Id
global:pnpm:gstack
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
global:pnpm:gstack

Installed version    1.0.0                          high
  fact       pnpm list --global --json: lists gstack@1.0.0 as a global package

Installed by         pnpm                           high
  fact       pnpm list --global --json: lists gstack@1.0.0 as a global package
  fact       ~/.local/share/pnpm: pnpm's global bin directory provides gstack

Source               github.com/example/gstack      medium
  inference  ~/.local/share/pnpm/global/5/node_modules/.pnpm/gstack/node_modules/gstack/package.json: "repository" points to github.com/example/gstack
  inference  name comparison: repository name matches the package name

Latest               2.0.0                          high
  fact       GET https://registry.npmjs.org/gstack/latest: dist-tag "latest" is 2.0.0

Updates through      pnpm                           high
  fact       pnpm list --global --json: lists gstack@1.0.0 as a global package
  fact       ~/.local/share/pnpm: pnpm's global bin directory provides gstack
  inference  installation: the installer, pnpm, is what would update it

Not applicable
  requested, resolved

Status               update available (major, may include breaking changes) high
```

Cada afirmación muestra su propia confianza y su evidencia. Cada línea de evidencia dice si es un hecho (`fact`) o una inferencia (`inference`).

Lo que no se pudo determinar aparece con su motivo, y lo que no aplica, bajo "Not applicable". Nunca se omite.

Si el nombre coincide con varias herramientas, por ejemplo la misma dependencia en dos proyectos, `explain` y `status <tool>` listan las coincidencias con su `id` y no eligen ninguna. En ese caso se puede pasar el `id` completo.

---

## 10. Diseño de errores

Evitar:

```text
Error: ENOENT at Object.openSync...
```

Preferir un diagnóstico por línea, en stderr, con su severidad, el componente que lo emitió y el motivo en lenguaje llano, seguido de una línea que aclara que la ejecución siguió:

```text
error: git: ~/tools/gstack: git.describe.head failed: fatal: detected dubious ownership in repository
warning: github: GitHub rate limit reached; remaining GitHub versions are unknown
actually continued with the other sources.
```

Las rutas dentro de home se muestran con `~`. Con `--json`, los diagnósticos van solo en `diagnostics` (§14), dentro del JSON de stdout; stderr lleva solo el aviso de red.

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
PROJECT · ~/projects/tokke
  manager      pnpm
  repository   https://github.com/me/tokke
  dependencies 2 checked · 1 update available
```

Luego el detalle.

---

## 12. Configuración inicial

No hay `actually init`. Sin configuración, `status` revisa las herramientas globales y el proyecto de la carpeta actual, así que configurar no es obligatorio; el archivo se escribe a mano (§13). Se reconsidera si la configuración pasa a ser necesaria, y en ese caso el asistente no debe seleccionar directorios sensibles por su cuenta.

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
- Se muestra una sola vez. El marcador es un archivo vacío en el directorio de estado local (architecture.md §3.5), no en la caché. Existe aunque la caché esté desactivada.
- Borrar el marcador vuelve a mostrar el aviso. Si el marcador no se puede escribir, el aviso se muestra en cada ejecución: es preferible repetirlo a omitirlo.
- No se muestra con `--offline` ni con la red desactivada.
- Nombra solo los hosts que la versión instalada realmente consulta.

El detalle completo está en architecture.md §8.

---

## 13. Configuración

La configuración es opcional. El archivo vive en:

| Sistema | Ruta |
|---|---|
| Linux y macOS | `$XDG_CONFIG_HOME/actually/config.toml`, o `~/.config/actually/config.toml` |
| Windows | `%APPDATA%\actually\config.toml` |

`ACTUALLY_CONFIG` reemplaza la ruta. Un archivo que no se puede interpretar, o con valores de tipo incorrecto, es un error fatal (exit code `3`): adivinar la intención podría escanear o enviar más de lo pedido. Las claves desconocidas son un diagnóstico, no un error.

Formato:

```toml
[scan]
paths = [
  "~/projects",
  "~/dev",
  "~/tools"
]
# Profundidad máxima bajo cada ruta (1 a 10).
depth = 3
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

Los defaults deben ser conservadores. Solo un archivo que no existe usa los defaults: uno que existe pero no se puede leer, comprobar o interpretar es fatal (exit code 3), porque podría decir `enabled = false`.

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
  "projects": [],
  "diagnostics": []
}
```

`status --json` también incluye `projects`, con un elemento por cada proyecto inspeccionado:

```json
{
  "root": "/home/me/projects/app",
  "packageManager": { "state": "known", "value": "pnpm", "confidence": "high" },
  "repository": { "state": "unknown", "reason": "no GitHub remote" },
  "dependenciesChecked": 47,
  "updatesAvailable": 3
}
```

Las dependencias de ese proyecto están en `tools`, con `scope: "project"` y `projectRoot` igual a su `root`. `status <tool> --json` y `explain --json` devuelven solo `tools` y `diagnostics`.

Reglas:

- Ningún claim se omite. Si no aplica, es `not-applicable`. Si no se sabe, es `unknown` con `reason`.
- `null` no se usa para representar ausencia de información.
- `updateType` y `mayBreak` aparecen solo cuando `status` es `outdated`. No son claims: se derivan de las versiones.
- `updateType` dice qué número cambió. `mayBreak` estima, según semver, si el cambio puede ser incompatible. De `0.2.0` a `0.3.0` es `minor` con `mayBreak: true` (architecture.md §5).
- `status --json` no incluye `evidence`. `explain --json` sí.
- `diagnostics` siempre está presente, aunque esté vacío. Su forma está en architecture.md §13.

`id` es opaco y determinístico: los consumidores lo usan para comparar y referenciar, no para extraer datos. Su formato está en architecture.md §5 y distingue la misma dependencia en varios proyectos y las herramientas sin provider conocido.

No es estable en sentido fuerte. Se mantiene entre ejecuciones mientras no cambien el scope, la ubicación ni el provider detectado, y cambia si:

- el proyecto, o un repositorio de Git usado como herramienta, se mueve a otra carpeta, porque su ruta forma parte del id;
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

El repo incluye instrucciones explícitas para agentes en `AGENTS.md`, en la raíz: no agregar comandos destructivos, no saltear el CommandRunner, no usar la red fuera de `src/infrastructure/http/`, no importar `node:fs` fuera de `src/infrastructure/{filesystem,cache,local-state}`, no registrar la salida de `pnpm config list`, no informar valores sin evidencia, y el protocolo de hallazgos. Ese archivo es la versión vigente; esta sección no la repite.

Estas instrucciones no reemplazan controles automáticos.

---

## 19. Hooks

### Pre-commit

Debe ser rápido. Lo que corre está en mvp.md §9: lint, chequeo de formato y tests de arquitectura, sobre todo el repositorio.

### Pre-push

```bash
pnpm check
```

Incluye:

- lint;
- chequeo de formato;
- typecheck;
- todos los tests: unitarios, de integración, de seguridad y de arquitectura.

---

## 20. CI

Pipeline mínimo:

```text
install
 ↓
lint
 ↓
format check
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
build
 ↓
smoke test of the built CLI
 ↓
dependency audit
```

Branch protection debe impedir merge si falla cualquier check obligatorio.

---

## 21. Estructura documental

```text
docs/
├─ mvp.md, prd.md, architecture.md, design.md   planificación y decisiones
├─ commands/        status.md, explain.md
├─ concepts/        confidence.md
├─ providers/       pnpm.md, npm-registry.md, git.md, github.md
├─ security/        threat-model.md
├─ decisions/       ADRs 0001 a 0008
└─ review/          hallazgos, revisiones y aceptación del MVP
```

Una página nueva de `docs/` se agrega cuando hay algo que documentar en ella, no antes.

### Idioma

- **En inglés:** el código, los comentarios, la salida de la CLI, las claves del JSON, `README`, `CONTRIBUTING`, `AGENTS.md` y los subdirectorios `commands/`, `concepts/`, `providers/`, `security/` y `decisions/`. Es lo que leen los contribuidores y los integradores.
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
