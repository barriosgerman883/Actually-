# Revisión cruzada de los docs de `actually?`

Fecha: 2026-09-26
Documentos revisados: `mvp.md`, `PRD.md`, `architecture.md`, `design.md`
Estado del repo al momento de la revisión: vacío (README y LICENSE). No hay código contra el cual contrastar.

## Resumen

Los cuatro documentos comparten filosofía y son coherentes en lo que prohíben: read-only, sin backend, sin telemetría, evidencia + confianza + `unknown`, CommandRunner como frontera, JSON como interfaz pública, capas vigiladas por tests. Divergen en lo que definen. Hay siete decisiones de fondo sin tomar y una lista de inconsistencias mecánicas que conviene resolver antes de escribir el primer provider.

---

## 1. Contradicciones entre documentos

### 1.1 Dos modelos de datos incompatibles

| Concepto | MVP §7 | Architecture §5 |
|---|---|---|
| Instalación | `installProvider?: string` | `installation?: Installation` |
| Origen | `sourceProvider?: string` | `source?: ToolSource` |
| Actualización | `updateProvider?: string` | `update?: UpdateStrategy` (nunca definido) |
| Scope | `"global" \| "project"` | `ToolScope` (nunca definido) |
| Evidence | `{ source, description, confidence: number }` | `{ kind, source, description, weight: number }` |

El JSON de salida (MVP §4.3, Design §14) sigue al modelo del MVP, no al de Architecture. Hay que elegir un modelo de dominio y declarar explícitamente que el JSON es una proyección de él.

### 1.2 `status` existe en el JSON pero en ningún modelo

Ambos ejemplos JSON tienen `"status": "outdated"`. Ningún `ToolRecord` tiene ese campo y sus valores no están enumerados. Design §4 habla de "1 major version change" y Design §6 tiene `!` warning, así que el enum real es más rico que `current | outdated`. Falta el caso `installed > latest` (prerelease instalada, o GitHub atrasado respecto a npm).

### 1.3 PRD RF-003 exige cuatro versiones, el modelo tiene dos

RF-003: `requested / resolved / installed / latest`. `ToolRecord` solo tiene `installedVersion` y `latestVersion`. Design §5 ya muestra `requested ^5.9.0 / resolved 5.9.2`, así que el requisito es real. Además `resolved` (lockfile) e `installed` (`node_modules/x/package.json`) pueden diferir, y parsear `pnpm-lock.yaml` v9 es más trabajo del que parece.

### 1.4 Comandos

- `actually doctor` aparece en MVP §4.1 y en ningún otro lugar (ni PRD, ni Design, ni `application/`).
- `actually init` aparece en Design §12 como "podría existir" y no está en el MVP.
- `scan` vs `status`: sin caché son redundantes. Con caché, `scan` necesita definición.

### 1.5 npm: tres posiciones distintas

- MVP §5.2 lo incluye en el MVP (limitado).
- PRD Fase 2 lo pospone.
- Architecture ya tiene `providers/npm/`.

Además los docs mezclan dos cosas: **npm CLI** como install provider (Fase 2 es razonable) y **npm registry** como fuente de versiones (obligatorio en Fase 1, porque los paquetes de pnpm viven ahí). Design §9 ya resuelve latest vía "npm registry". Separar ambos conceptos por nombre.

### 1.6 Taxonomía de providers incompleta

PRD RF-004 y Architecture §3.4 definen tres tipos: installation, source, version. El modelo tiene un cuarto, `updateProvider` / `UpdateStrategy`, que no pertenece a la taxonomía. La interfaz `Provider` de Architecture §15 tiene `detect()` y `resolveLatestVersion?()`, pero ningún método para source.

### 1.7 ADRs

Architecture §17 lista 0001 a 0007. Design §21 lista solo 0001 a 0004.

### 1.8 El ejemplo del MVP contradice su propia regla

MVP §2.3: ejecutable en `~/.local/bin/gstack`, "Owned by: pnpm", confianza alta. El home por defecto de pnpm en Linux es `~/.local/share/pnpm`. Ese es exactamente el tipo de inferencia que el doc pide evitar. Design §9 usa el path correcto.

### 1.9 El `explain` del PRD saca una conclusión que la evidencia no soporta

PRD §10: la evidencia "npm metadata maps package to GitHub repository" se lista bajo la conclusión "Installed via pnpm". Es evidencia de *source*, no de *instalación*. Design §9 lo agrupa mejor ("How this was detected" / "How latest version was resolved").

---

## 2. Decisiones de fondo que ningún documento toma

### D1. Confianza: ¿de qué claim?

Un solo `confidence` por tool mezcla cuatro afirmaciones independientes:

1. versión instalada (hecho, viene de `pnpm list`);
2. install provider (inferencia, normalmente fuerte);
3. source (inferencia, a menudo débil: metadata de npm → repo GitHub);
4. latest version (hecho o unknown).

Design §9 exige separar facts, inferences y unknowns, pero `Evidence.kind: string` no lo modela.

**Recomendación:** confianza por claim, no por tool. `Evidence.kind` como enum cerrado (`fact | inference`). El `confidence` global del tool, si se conserva, es el mínimo de los claims que se muestran.

### D2. Representación de `unknown`

Design §14 exige distinguir `null`, `unknown` y ausencia. El modelo TS solo tiene `?:` (ausencia). Los pesos 0.45 + 0.35 + 0.20 de Architecture §6 sugieren una suma ponderada, pero no hay umbrales para mapear a `low | medium | high`.

**Recomendación:** tipo discriminado por campo inferido, por ejemplo `{ state: "resolved", value } | { state: "unknown", reason } | { state: "not-applicable" }`. Umbrales documentados en `docs/concepts/confidence.md`.

### D3. Qué es un repo Git en `status`

Un repo propio con dependencias es un **proyecto**. Un repo clonado para usar una herramienta es un **tool** con source Git. Ambos tienen `.git`. Los docs dicen correctamente que `.git` no implica "instalado por git clone", pero no dan el criterio positivo. Sin él, un developer con 40 repos propios ve 40 líneas `?`.

Tampoco está definido qué es la `installedVersion` de un clon cuando HEAD no cae en un tag.

**Recomendación:** por defecto todo repo es proyecto. Un repo es tool solo si el usuario lo marca en config o si hay evidencia fuerte (por ejemplo, un binario en PATH cuyo `realpath` cae dentro del repo). `installedVersion` = `git describe --tags --exact-match`; si no hay tag exacto, `unknown` con el commit y la distancia al último tag como evidencia.

### D4. Identidad de un tool

`id: "pnpm:gstack"` (Design §14) no escala: `typescript` en tres proyectos con tres versiones, o un tool con provider `unknown`.

**Recomendación:** identidad compuesta por scope + ubicación + nombre, por ejemplo `global:pnpm:gstack` y `project:<root>:typescript`. Documentar el formato como parte del contrato JSON.

### D5. Caché

Architecture §14 la saca del MVP. Tres requisitos dependen de ella:

- `api.github.com` sin autenticación permite 60 requests por hora. Un usuario con más de veinte repos se queda sin cuota en la primera ejecución.
- Un proyecto de 47 dependencias (Design §11) son 47 requests al registry. Varios proyectos, cientos.
- Las IDEs de Fase 3 llamarán `--json` en loop.

Además el MVP excluye "acceso a repositorios privados autenticados", pero un token para levantar el rate limit no es acceso a privados. Están conflatados.

**Recomendación:** caché local con TTL dentro del MVP, con `--no-cache`. Leer `GITHUB_TOKEN` del entorno si existe, solo para rate limit, y documentarlo como tal. Usar el endpoint abreviado del registry (`Accept: application/vnd.npm.install-v1+json`) para no bajar packuments de varios MB. Límite de concurrencia y timeout explícitos.

### D6. Read-only no es seguro

- `intent: "read"` es un literal de tipo. No impone nada. La seguridad real está en el allowlist.
- `AllowedBinary` (Architecture §7) es allowlist por binario. `git` con args arbitrarios incluye `git pull`. MVP §8.2 habla de comandos (`git remote`, `pnpm list`), que es lo correcto.
- Spawnear `git` o `pnpm` con `cwd` dentro de un repo no confiable ejecuta código: `core.fsmonitor` en `.git/config`, `.npmrc` del proyecto, `packageManager` vía corepack.
- `threat-model.md` está en el árbol de Design §21 pero nadie describe qué amenazas cubre.
- Sin telemetría, pero las consultas al registry y a GitHub revelan qué paquetes tiene el usuario a esos servicios. Justifica `[network] enabled = false` y merece una línea en el threat model.

**Recomendación:** allowlist por tupla (binario, subcomando) con validación de flags. Para Git, leer `.git/HEAD`, `.git/config` y `packed-refs` con la abstracción Filesystem en vez de spawnear git. Si se spawnea, `GIT_CONFIG_NOSYSTEM=1`, `-c core.fsmonitor=false`, entorno saneado. Escribir `threat-model.md` antes del primer provider.

### D7. Política de escaneo de PATH

Design §5 muestra `custom-tool` detectado por PATH. Si se escanea todo PATH, aparecen miles de binarios de `/usr/bin` como `?`.

**Recomendación:** solo directorios de usuario: `PNPM_HOME`, `~/.local/bin`, `~/.cargo/bin`, `~/go/bin`, y los que el usuario agregue en config. Resto de PATH ignorado por defecto.

---

## 3. Huecos operativos

- **Exit codes** prometidos en Architecture §3.1, nunca definidos. Importan para el persona P4.
- **JSON sin `errors` / `warnings`**, pese a RA-009 y Design §10. Un scan parcial en `--json` no tiene dónde reportar lo que falló.
- **Config:** ubicación del archivo (XDG?), comportamiento sin config, `depth`, exclusión de `node_modules`, symlink loops. PRD RNF-003 implica default = solo cwd + global.
- **Monorepos** con `pnpm-workspace.yaml`: ¿un proyecto o diez?
- **Portabilidad:** RNF-004 menciona Windows. `.cmd` shims, `PNPM_HOME`, expansión de `~` en TOML y `realpath` de shims cambian el diseño del PathScanner desde el día uno.
- **Ports:** Architecture §11 dice que providers dependen de puertos, no de implementaciones. El árbol no tiene `ports/`. Si las interfaces viven en `infrastructure/`, core y providers importan de infraestructura y RA-004 se viola en espíritu. Sugerido: `core/ports/`.
- **Diagnósticos:** RA-005 prohíbe que los providers impriman y RA-009 exige que no derriben el scan. Falta un `Diagnostic[]` en el resultado.
- **Criterio de aceptación 4** ("identifica pnpm y Git correctamente en escenarios soportados"): "escenarios soportados" no está definido. Falta una matriz OS × método de instalación de pnpm × `PNPM_HOME` custom.
- **"Integration tests" y "security tests"** se exigen sin definir qué integran ni qué prueban. Sugerido: fixtures con CommandRunner falso, y smoke tests con binarios reales detrás de un flag.
- **Carga documental:** JSDoc de cinco puntos por función, plantilla de provider de diez secciones, árbol de 25 archivos y siete ADRs antes de la primera línea de código. Riesgo de que se pudra o bloquee. Sugerido: ADRs 0001 a 0004 al inicio, el resto cuando la decisión ocurra.

---

## 4. Hecho verificado

El nombre `actually` en npm ya está ocupado: paquete broma, versión 0.0.3, publicado en enero de 2017, sin `bin`. El criterio de éxito `pnpm add -g actually` (MVP §12, PRD §14.1) no se cumple tal cual.

Opciones: scope (`@<org>/actually`), otro nombre, o disputa de nombre en npm, que suele fallar si el paquete existente no infringe nada.

---

## 5. Cuestionamientos que no son errores

- `info` y `explain` se pisan. `info <tool>` es `status` filtrado más la URL del source. Progressive disclosure sugiere menos comandos.
- Docs en español para un proyecto open source. Si se buscan contribuidores externos, inglés desde el inicio cuesta menos que migrar después.
- El ejemplo de `status` en Design §5 muestra `pnpm` sin línea de provider y `custom-tool` con `provider unknown`. Decidir si el provider unknown se muestra siempre o nunca.
- Un tool con `installed` conocido y `latest` unknown debe mostrarse como `?`, no como `✓`. Los docs lo insinúan (RF-010) pero no lo dicen.
