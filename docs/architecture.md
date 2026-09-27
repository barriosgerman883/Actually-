# actually? — Architecture

## 1. Visión general

La arquitectura de `actually?` debe priorizar:

1. seguridad;
2. observabilidad;
3. extensibilidad;
4. testabilidad;
5. explicabilidad;
6. bajo mantenimiento.

El sistema debe poder inspeccionar entornos heterogéneos sin convertirse en un package manager universal.

---

## 2. Arquitectura conceptual

```text
                    USER

                     │
                     ▼

                    CLI
                     │
                     ▼

               APPLICATION CORE

      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼

  INVENTORY       DETECTION      VERSIONING

      │              │              │
      └──────────────┼──────────────┘
                     │
                     ▼

                  PROVIDERS

     ┌─────────────┬─┴───────────┬─────────────┐
     │             │             │             │
     ▼             ▼             ▼             ▼

   pnpm      npm registry       Git         GitHub

     │             │             │             │
     └─────────────┴─┬───────────┴─────────────┘
                     │
                     ▼

               INFRASTRUCTURE

        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼

   Filesystem    CommandRunner   HttpClient
```

---

## 3. Capas

## 3.1 CLI

Responsabilidades:

- parsear argumentos;
- ejecutar casos de uso;
- seleccionar formatter;
- mostrar errores;
- definir exit codes.

Exit codes:

| Código | Significado |
|---|---|
| `0` | Terminó, aunque haya datos `unknown` o diagnósticos recuperables |
| `1` | Hay actualizaciones disponibles. Solo con `--exit-code` |
| `2` | Uso inválido, incluido un nombre de herramienta inexistente o ambiguo |
| `3` | Error fatal (§13) |

Sin `--exit-code`, encontrar actualizaciones no es un error. Así `actually status` no rompe scripts que usan `set -e`, igual que `git diff` sin `--exit-code`.

No debe:

- leer filesystem directamente;
- ejecutar comandos;
- hacer requests;
- conocer detalles de providers.

Ejemplo:

```ts
const result = await application.status(options);
formatter.render(result);
```

---

## 3.2 Core

El core contiene conceptos del dominio.

Ejemplos:

```text
ToolRecord
Evidence
Confidence
Scope
Version
Installation
Source
Status
```

El core no conoce:

- `node:fs`;
- `child_process`;
- GitHub HTTP;
- pnpm CLI;
- sistema operativo.

Debe ser portable y altamente testeable.

---

## 3.3 Scanners

Un scanner encuentra señales.

Ejemplos:

```text
ProjectScanner
FilesystemScanner
PathScanner
GitRepositoryScanner
```

Un scanner no determina necesariamente el significado completo de una señal.

Ejemplo:

```text
FilesystemScanner

found:
~/projects/foo/pnpm-lock.yaml
```

La interpretación pertenece a un provider o detector especializado.

Un repositorio encontrado por `GitRepositoryScanner` es un proyecto salvo evidencia positiva de que es una herramienta. La regla está en mvp.md §5.3.

`PathScanner` no recorre todo PATH, porque listaría miles de binarios del sistema como herramientas desconocidas. En el MVP revisa solo:

- el directorio global de binarios de pnpm (`PNPM_HOME`, o el que informa `pnpm bin --global`);
- `~/.local/bin`;
- los directorios declarados en `[scan] bin_paths` (design.md §13).

Otros directorios de usuario, como `~/.cargo/bin` o `~/go/bin`, se suman cuando llegue su provider en la Fase 2.

---

## 3.4 Providers

Los providers traducen señales externas al modelo de dominio.

Ejemplos:

```text
PnpmProvider
GitProvider
GitHubProvider
```

Tipos posibles:

### Installation Provider
Determina quién administra una instalación.

### Source Provider
Determina el origen lógico o repositorio.

### Version Provider
Determina la versión que la fuente declara como la última estable (§5).

Una misma herramienta puede tener:

```text
source:       GitHub
installation: pnpm
update:       pnpm
```

`update` es un dato informativo derivado de `installation`, no un cuarto tipo de provider (ver §5).

---

## 3.5 Infrastructure

Única capa con acceso directo a efectos externos.

### Filesystem
Abstrae lectura de archivos, directorios y resolución de paths.

### CommandRunner
Único componente autorizado a lanzar procesos.

### HttpClient
Único componente autorizado a realizar requests.

### Clock
Abstracción del tiempo. Necesaria para el TTL de la caché.

### Cache
Guarda respuestas de red, y solo dentro del directorio de caché (§14). Es descartable y no existe en la v0.1.

### LocalState
Guarda el estado propio de `actually?` que no es una respuesta de red, como el marcador del aviso de red de la primera ejecución (design.md §12). Vive en un directorio distinto de la caché:

| Sistema | Directorio de estado |
|---|---|
| Linux | `$XDG_STATE_HOME/actually`, o `~/.local/state/actually` si no está definida |
| macOS | `~/Library/Application Support/actually` |
| Windows | `%LOCALAPPDATA%\actually\state` |

Cache y LocalState son los únicos componentes autorizados a escribir en disco, cada uno solo dentro de su directorio (RA-010).

---

## 4. Flujo de detección

```text
scan request
   │
   ▼
discover signals
   │
   ▼
providers inspect signals
   │
   ▼
produce evidence
   │
   ▼
normalize records
   │
   ▼
resolve versions
   │
   ▼
calculate confidence
   │
   ▼
build inventory
```

---

## 5. Modelo de dominio

Este es el único modelo de dominio del proyecto. mvp.md y design.md lo referencian en vez de duplicarlo.

El JSON público (design.md §14) es una proyección de este modelo. Puede renombrar o aplanar campos, pero no puede exponer datos que el modelo no tenga.

```ts
export type ToolScope = "global" | "project";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface Evidence {
  /** `fact`: una fuente autoritativa lo afirma. `inference`: se deduce. */
  kind: "fact" | "inference";
  /** Qué se consultó: un comando, un archivo o un endpoint. */
  source: string;
  description: string;
}

/**
 * Una afirmación sobre un dato, con su estado explícito.
 * Un campo opcional no distingue "no lo sé" de "no aplica";
 * un Claim sí.
 */
export type Claim<T> =
  | {
      state: "known";
      value: T;
      confidence: ConfidenceLevel;
      evidence: Evidence[];
    }
  | {
      state: "unknown";
      reason: string;
      evidence: Evidence[];
    }
  | { state: "not-applicable" };

export interface VersionClaims {
  /** Rango declarado, por ejemplo "^5.9.0" en package.json. */
  requested: Claim<string>;
  /** Versión fijada en el lockfile. */
  resolved: Claim<string>;
  /** Versión presente en disco. */
  installed: Claim<string>;
  /** Versión que la fuente declara como la última estable (ver abajo). */
  latest: Claim<string>;
}

/** Tipo de cambio entre la versión local y la última estable. */
export type UpdateType = "major" | "minor" | "patch";

/** Estado que muestra `status`. Se deriva; ningún provider lo asigna. */
export type ToolStatus =
  | "current"   // ✓
  | "outdated"  // ↑
  | "unknown"   // ?
  | "warning"   // !
  | "error";    // ×

export interface ToolRecord {
  /**
   * Identificador opaco y determinístico. Los consumidores no deben parsearlo.
   * Cambia si cambia el scope, la ubicación o el provider detectado
   * (design.md §14).
   * Formato actual:
   *   global:<provider>:<nombre>   (provider "unknown" si no se conoce)
   *   project:<raíz absoluta>:<nombre>
   */
  id: string;
  name: string;

  scope: ToolScope;
  /** Raíz del proyecto. Presente solo cuando scope es "project". */
  projectRoot?: string;

  versions: VersionClaims;
  installation: Claim<Installation>;
  source: Claim<ToolSource>;
  update: Claim<UpdateStrategy>;

  status: ToolStatus;
  /** Presente solo cuando status es "outdated". */
  updateType?: UpdateType;
  /** Presente solo cuando status es "outdated". */
  mayBreak?: boolean;
  /** Resumen de los claims que determinan `status` (ver §6). */
  confidence: ConfidenceLevel;
}
```

`status` se calcula comparando `versions.latest` con la versión local más concreta que se conozca: `installed` si está disponible, si no `resolved`.

| Estado | Condición |
|---|---|
| `current` | ambas versiones conocidas e iguales |
| `outdated` | la versión local es menor que `latest` |
| `unknown` | alguna de las dos es `unknown` |
| `warning` | la versión local es mayor que `latest`, o no son comparables como semver |
| `error` | el provider falló al inspeccionar la herramienta |

`outdated` es un solo estado. Dos campos derivados describen la actualización, y cada uno responde una pregunta distinta.

`updateType` dice qué número cambió. Es puramente numérico:

- `major` si cambia el primer número;
- `minor` si cambia el segundo;
- `patch` si cambia el tercero.

Un cambio de `0.2.0` a `0.3.0` es `minor`.

`mayBreak` dice si semver permite que la actualización incluya cambios incompatibles. Es verdadero si:

- cambia el primer número; o
- el primer número es `0` y cambia el segundo; o
- los dos primeros son `0` y cambia el tercero.

Es la misma regla que usa el rango `^` de npm. Un cambio de `0.2.0` a `0.3.0` tiene `updateType: "minor"` y `mayBreak: true`.

`mayBreak` es una estimación basada en la convención de versionado. No inspecciona el cambio real, y un proyecto que no sigue semver puede romper sin que `mayBreak` lo anticipe.

Esto permite resúmenes como "2 updates available, 1 may include breaking changes" (design.md §4) sin agregar estados.

### Qué significa `latest`

`versions.latest` es la versión que la fuente declara como la última estable. No es una verificación independiente de estabilidad.

- **npm:** es el dist-tag `latest`, que elige quien publica. Usarlo para la última versión estable es una convención habitual, no una obligación. La evidencia lo dice tal cual: `fact: npm registry: dist-tag "latest" is 2.0.0`.
- **GitHub:** es la release más reciente no marcada como prerelease. Esa marca también la pone quien publica.
- Si la versión declarada tiene sufijo de prerelease, por ejemplo `3.0.0-beta.1`, la evidencia contradice la idea de "estable". El claim queda con confianza `low`, según las reglas de §6.

### Installation

```ts
export interface Installation {
  provider: string;
  path?: string;
}
```

### ToolSource

```ts
export interface ToolSource {
  provider: string;
  identifier: string;
  url?: string;
}
```

### UpdateStrategy

```ts
/**
 * Cómo se actualizaría la herramienta. Es informativo:
 * actually nunca ejecuta actualizaciones.
 */
export interface UpdateStrategy {
  provider: string;
}
```

`UpdateStrategy` no es un cuarto tipo de provider. En el MVP siempre coincide con el installation provider y se deriva de él.

---

## 6. Confidence model

La confianza se asigna por afirmación (`Claim`), no por herramienta. Una misma herramienta puede tener la versión instalada con confianza alta y el origen con confianza baja, y la salida debe mostrarlo.

Cada `Evidence` es de uno de dos tipos:

- `fact`: una fuente autoritativa lo afirma directamente. Ejemplo: `pnpm list --global --json` incluye `gstack@1.0.0`.
- `inference`: se deduce de otras señales. Ejemplo: el campo `repository` del paquete en npm apunta a GitHub, así que ese repositorio es probablemente el origen.

Reglas del MVP:

| Nivel | Condición |
|---|---|
| `high` | al menos un `fact` afirma el valor y ninguna evidencia lo contradice |
| `medium` | solo inferencias, al menos dos independientes y concordantes |
| `low` | una sola inferencia, o evidencia contradictoria |

Si no hay evidencia suficiente ni para `low`, el claim queda `unknown` con un `reason`.

Ajustes a esas reglas:

- una prerelease bajo el dist-tag `latest` contradice "estable": `low`;
- una respuesta vencida de la caché, usada porque no hay red: como máximo `medium`;
- un tag de GitHub usado porque no hay releases: como máximo `medium`, porque un tag no es una release declarada;
- el provider de actualización nunca tiene más confianza que la instalación de la que se deriva.

La confianza resumida de un `ToolRecord` es la mínima entre `versions.installed` (o `resolved`), `versions.latest` e `installation`, contando solo los que están en estado `known`.

No se usan porcentajes ni pesos numéricos, porque implicarían una precisión que el modelo no tiene. Las reglas pueden evolucionar, pero cada cambio debe reflejarse aquí y en docs/concepts/confidence.md.

---

## 7. CommandRunner

El `CommandRunner` es una frontera de seguridad. Es el único componente que lanza procesos, y solo lanza comandos de una lista cerrada.

### API

Quien lo usa elige un comando de la lista por su identificador. No pasa binario, argumentos ni entorno.

```ts
type AllowedCommand =
  | "pnpm.version"
  | "pnpm.root.global"
  | "pnpm.bin.global"
  | "pnpm.list.global"
  | "pnpm.config.list"
  | "git.tags.head"
  | "git.describe.head";

interface CommandRequest {
  command: AllowedCommand;
  /** Solo para comandos git.*: raíz del repositorio a inspeccionar. */
  repository?: string;
}
```

Ejemplo:

```ts
commandRunner.run({
  command: "git.describe.head",
  repository: repositoryPath
});
```

### Allowlist

Cada entrada es un comando completo y exacto. No se aceptan prefijos ni argumentos adicionales, y ningún argumento sale de datos del usuario o de un repositorio.

| Identificador | Comando | Directorio de trabajo |
|---|---|---|
| `pnpm.version` | `pnpm --version` | neutral |
| `pnpm.root.global` | `pnpm root --global` | neutral |
| `pnpm.bin.global` | `pnpm bin --global` | neutral |
| `pnpm.list.global` | `pnpm list --global --json --depth=0` | neutral |
| `pnpm.config.list` | `pnpm config list --json` | neutral |
| `git.tags.head` | `git tag --points-at HEAD` | repositorio |
| `git.describe.head` | `git describe --tags --long HEAD` | repositorio |

El directorio neutral es un subdirectorio vacío dentro del estado local de `actually?` (§3.5). Nunca contiene `package.json` ni `.npmrc`, y existe también en la v0.1, que no tiene caché.

Agregar un comando requiere un ADR. Un test de arquitectura verifica que ningún módulo lanza procesos por fuera de esta tabla.

La lista original incluía `node --version`. Ningún provider del MVP lo usa, así que se quitó para no sumar superficie de ataque sin propósito (docs/decisions/0005-command-runner-boundary.md).

### pnpm

- `pnpm` nunca se lanza dentro de un proyecto detectado. Un proyecto puede definir un `.npmrc` o el campo `packageManager`, que activa corepack y puede descargar y ejecutar otra versión de pnpm.
- Las dependencias de un proyecto se leen de `package.json` y del lockfile a través de Filesystem, sin ejecutar nada.
- pnpm hereda el entorno del usuario, porque ahí se define dónde vive su instalación global (`PNPM_HOME`). Es configuración del propio usuario, no de un proyecto.
- La salida de `pnpm.config.list` puede contener tokens. Solo se extraen las claves de registry (§8) y el resto nunca se guarda ni se registra.

### Git

Un repositorio encontrado en disco no es confiable: su `.git/config` puede definir comandos que Git ejecuta.

- El commit actual, la rama y los remotes se leen de archivos (`.git/HEAD`, `.git/config`, `refs/` y `packed-refs`) a través de Filesystem.
- Git se lanza solo para los tags de `HEAD` y la distancia al último tag. Obtener eso de los archivos exigiría interpretar los packfiles de Git, y reimplementar ese formato sería una fuente de errores.
- Cada ejecución de git usa un entorno endurecido:

| Variable u opción | Efecto |
|---|---|
| `GIT_CONFIG_NOSYSTEM=1` | ignora la configuración del sistema |
| `GIT_CONFIG_GLOBAL` apuntando a un archivo vacío | ignora la configuración global |
| `-c core.fsmonitor=false` | impide que el repositorio lance un monitor propio |
| `GIT_PAGER=cat` | no abre paginadores |
| `GIT_TERMINAL_PROMPT=0` | nunca pide credenciales |
| `GIT_OPTIONAL_LOCKS=0` | no escribe locks opcionales dentro del repositorio |

- Requiere Git 2.32 o posterior, la primera versión con `GIT_CONFIG_GLOBAL`.
- `safe.directory` no se sobrescribe. Si Git rechaza un repositorio, los datos quedan `unknown` con ese motivo.

### Reglas para todos los comandos

- Sin shell: se lanza el binario con un arreglo de argumentos.
- `LC_ALL=C`, para que la salida sea estable al interpretarla.
- Timeout de 10 segundos por comando.
- La salida se valida antes de usarla. Una salida inesperada produce un diagnóstico (§13), no una excepción.

No debe aceptar:

```text
raw shell string
shell: true
sudo
arbitrary executable
```

---

## 8. HTTP

Todos los requests pasan por `HttpClient`.

Responsabilidades:

- allowlist opcional de hosts;
- timeout;
- user-agent;
- retries limitados;
- rate-limit handling;
- JSON validation;
- requests condicionales para revalidar la caché;
- concurrencia limitada;
- enviar el token de GitHub solo a `api.github.com` (§14);
- cancellation.

Ejemplos de hosts permitidos inicialmente:

```text
api.github.com
registry.npmjs.org
```

### Qué sale de la máquina

`actually?` no tiene servidor propio y no recopila nada. Pero para saber cuál es la última versión de algo, tiene que preguntarle a un servicio externo, y esa pregunta revela qué se está verificando.

| Destino | Qué recibe |
|---|---|
| `registry.npmjs.org` | el nombre de cada paquete consultado, la IP y el user-agent `actually/<versión>` |
| `api.github.com` | el `owner/repo` de cada repositorio consultado, la IP y el user-agent. Si el token está activado (§14), también la identidad de la cuenta |

Nunca se envían rutas, contenido de archivos, nombres ni raíces de proyectos, lockfiles ni versiones instaladas. Solo se pide la última versión.

La consecuencia, dicha tal cual: esos servicios pueden inferir qué herramientas y dependencias usa la persona, y desde qué IP. Si se consulta el nombre de un paquete o repositorio privado, ese nombre queda expuesto al servicio consultado.

### Qué paquetes se consultan

La regla es conservadora: ante la duda, no se consulta. Un paquete se consulta en `registry.npmjs.org` solo si se cumplen las tres condiciones:

1. Su spec es de registry: un rango semver o un dist-tag. No se consultan alias `npm:`, `workspace:`, `link:`, `file:`, repositorios git ni URLs.
2. El registry predeterminado efectivo es `https://registry.npmjs.org/`. Si la persona configuró otro registry predeterminado, por ejemplo un mirror o un registry de su empresa, no se consulta ningún paquete en el registry público.
3. Su scope no está asignado a otro registry.

Además, si pnpm informa el tarball desde el que instaló el paquete, ese tarball tiene que venir de `registry.npmjs.org`.

Si alguna de las tres no se puede determinar, el paquete no se consulta. `latest` queda en `unknown` con el motivo: "registry privado" o "no se pudo determinar el origen".

Cómo se determina el registry efectivo:

- Se le pregunta a pnpm con `pnpm config list --json`, desde el directorio neutral (§7). La respuesta refleja todas las fuentes que pnpm lee: variables de entorno, `~/.npmrc`, el rc global de pnpm y el npmrc global. Leer esos archivos a mano arriesgaba omitir una fuente y filtrar nombres.
- **La salida puede incluir tokens de autenticación.** Solo se extraen `registry` y las claves `@scope:registry`. El resto se descarta sin registrarse en logs, evidencia ni diagnósticos.
- Si el comando falla o su salida no se puede interpretar, el origen de todos los paquetes queda indeterminado y no se consulta ninguno.
- En los proyectos del MVP, donde pnpm nunca se lanza, se suma la lectura del `.npmrc` del proyecto como archivo. Leerlo no ejecuta nada.

El spec de cada paquete global de pnpm se lee del `package.json` del directorio global, que está junto a la ruta que devuelve `pnpm root --global`.

Además, en el MVP, `[network] exclude` lista nombres que nunca se consultan, por ejemplo `"@mi-empresa/*"` (design.md §13).

Cómo trabajar sin red:

- `--offline` evita toda consulta en esa ejecución. `[network] enabled = false` la evita siempre.
- Sin red se usa la caché si tiene la entrada. Si no, `latest` queda en `unknown` con el motivo "offline".

La primera ejecución muestra un aviso con esta misma información (design.md §12).

---

## 9. Filesystem

Toda interacción con archivos pasa por una abstracción.

Ejemplo:

```ts
interface Filesystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  realpath(path: string): Promise<string>;
}
```

Esto permite:

- tests sin disco real;
- validación de paths;
- control de traversal;
- futura portabilidad.

---

## 10. Estructura propuesta

```text
src/
├─ cli/
│  ├─ commands/
│  ├─ formatters/
│  └─ index.ts
│
├─ application/
│  ├─ status/
│  └─ explain/
│
├─ core/
│  ├─ inventory/
│  ├─ evidence/
│  ├─ confidence/
│  ├─ versions/
│  └─ errors/
│
├─ scanners/
│  ├─ project/
│  ├─ filesystem/
│  ├─ path/
│  └─ git/
│
├─ providers/
│  ├─ pnpm/
│  ├─ npm-registry/
│  ├─ git/
│  └─ github/
│
├─ infrastructure/
│  ├─ filesystem/
│  ├─ command-runner/
│  ├─ http/
│  ├─ cache/
│  ├─ local-state/
│  └─ config/
│
└─ security/
   ├─ policies/
   ├─ validation/
   └─ architecture/
```

---

## 11. Dependencias internas

Regla:

```text
cli
 ↓
application
 ↓
core
 ↑
providers
 ↑
infrastructure adapters
```

El core nunca depende de infraestructura.

Providers pueden depender de interfaces del core y puertos de infraestructura, pero no de implementaciones concretas.

---

## 12. Reglas arquitectónicas

### RA-001
Solo `infrastructure/command-runner` puede importar `node:child_process`.

### RA-002
Solo `infrastructure/filesystem`, `infrastructure/cache` e `infrastructure/local-state` pueden importar `node:fs`. `filesystem` solo lee; los otros dos son los únicos que escriben (RA-010).

### RA-003
Solo `infrastructure/http` puede usar APIs de red.

### RA-004
`core/` no depende de CLI ni infraestructura.

### RA-005
Providers no imprimen output.

### RA-006
CLI no implementa detección.

### RA-007
Ningún provider ejecuta comandos de escritura.

### RA-008
Toda inferencia relevante produce evidencia.

### RA-009
Los fallos de un provider no deben derribar todo el scan salvo error crítico.

### RA-010
Solo `infrastructure/cache` y `infrastructure/local-state` escriben en disco, cada uno solo dentro de su propio directorio.

---

## 13. Error handling

Errores se clasifican.

```text
Recoverable
- network unavailable
- permission denied
- unsupported metadata
- unknown version

Fatal
- corrupted internal config
- invalid application state
- programmer invariant violation
```

El usuario debe recibir mensajes útiles sin stack traces por defecto.

Modo debug puede exponer información técnica.

### Diagnósticos

Los errores recuperables no cortan la ejecución (RA-009). Se registran como diagnósticos y viajan junto al resultado:

```ts
export interface Diagnostic {
  severity: "warning" | "error";
  /** Provider o componente que lo emitió, por ejemplo "github". */
  source: string;
  message: string;
  /** Herramienta afectada, si corresponde. */
  toolId?: string;
}
```

- `warning`: el resultado es válido pero incompleto. Ejemplo: GitHub agotó el límite y algunas versiones quedaron `unknown`.
- `error`: un provider falló. Las herramientas afectadas quedan con `status: "error"`.

Un error fatal termina con exit code `3`. Con `--json`, igual se emite un documento JSON válido con el diagnóstico, para que los integradores no tengan que parsear texto.

---

## 14. Cache

La caché es parte del MVP, pero no de la v0.1. Guarda solo respuestas de red y es descartable. El estado local, como el marcador del aviso de red, vive en otro directorio (§3.5). Sin ella, el resolver de GitHub se queda sin cuota en la primera ejecución de cualquier usuario con más de unos pocos repositorios: `api.github.com` sin autenticación permite 60 requests por hora. Un proyecto con decenas de dependencias genera la misma cantidad de requests al npm registry.

### Qué guarda

- Solo metadata pública: la versión con el dist-tag `latest`, tags, releases y el campo `repository` de npm.
- La clave es el host más el recurso consultado, por ejemplo `registry.npmjs.org/gstack/latest`.
- Cada entrada guarda la fecha de obtención y los validadores que haya devuelto el servidor (`ETag` o `Last-Modified`).
- Nunca guarda tokens, rutas locales, nombres de proyectos ni resultados del inventario local.

### Dónde

| Sistema | Ruta |
|---|---|
| Linux | `$XDG_CACHE_HOME/actually`, o `~/.cache/actually` si no está definida |
| macOS | `~/Library/Caches/actually` |
| Windows | `%LOCALAPPDATA%\actually\cache` |

Borrar ese directorio es siempre seguro.

### Reglas

- El TTL por defecto es de 6 horas y se configura con `[cache] ttl` (design.md §13).
- Una entrada vencida se revalida con un request condicional (`If-None-Match` o `If-Modified-Since`). En GitHub, una respuesta 304 a un request condicional no consume cuota.
- `--no-cache` no lee ni escribe la caché en esa ejecución. `[cache] enabled = false` la desactiva siempre.
- Si la red falla y existe una entrada vencida, puede usarse solo como evidencia explícita (`valor en caché del <fecha>; red no disponible`) y con confianza máxima `medium`. Nunca se presenta como dato fresco.
- La caché nunca guarda el inventario local. La máquina se inspecciona de nuevo en cada ejecución.

### GitHub

- El token está apagado por defecto, porque le permite a GitHub asociar las consultas a una cuenta.
- Con `[network] github_token = true`, si `GITHUB_TOKEN` o `GH_TOKEN` están definidos, se envían solo a `api.github.com` y solo para ampliar el límite de requests. No se guardan en la caché, la configuración ni los logs.
- Sin token, el límite es de 60 requests por hora. Las revalidaciones que reciben un 304 no consumen cuota, así que con la caché alcanza para un uso normal.
- Tener un token no convierte el acceso a repositorios privados en una funcionalidad soportada del MVP.
- Si GitHub responde que el límite se agotó, no se hacen más requests a GitHub en esa ejecución. Los datos pendientes quedan `unknown` con ese motivo.

### npm registry

- Se consulta `/<paquete>/latest`, que devuelve solo el manifiesto de la versión con el dist-tag `latest`, con su campo `repository`. El documento completo del paquete puede pesar decenas de megabytes; el manifiesto, unos pocos kilobytes.
- Concurrencia máxima por defecto: 8 requests simultáneos. Timeout por request: 10 segundos.

---

## 15. Extensibilidad

Un nuevo provider debe implementar un contrato estable.

Ejemplo conceptual:

```ts
export interface Provider {
  readonly id: string;

  detect(
    context: DetectionContext
  ): Promise<DetectionResult[]>;

  resolveLatestVersion?(
    target: VersionTarget
  ): Promise<VersionResult | null>;
}
```

No todos los providers necesitan implementar todas las capacidades.

---

## 16. Architecture tests

El repositorio debe comprobar automáticamente reglas críticas.

Ejemplos:

```text
providers must not import node:child_process
core must not import node:fs
core must not use fetch
cli must not import infrastructure implementations directly
```

Estas reglas deben ejecutarse en CI.

---

## 17. ADRs iniciales

```text
0001-use-typescript.md
0002-use-pnpm.md
0003-read-only-mvp.md
0004-no-backend.md
0005-command-runner-boundary.md
0006-evidence-driven-detection.md
0007-json-as-public-interface.md
0008-scoped-package-name.md
```

---

## 18. Evolución futura

La arquitectura debe permitir agregar:

```text
Cargo
pipx
uv
mise
Homebrew
winget
Scoop
Go tooling
Docker
```

sin cambiar el modelo fundamental.

También debe permitir consumidores externos:

```text
VS Code
JetBrains
Neovim
Zed
Raycast
```

El core debe seguir siendo independiente de esas interfaces.
