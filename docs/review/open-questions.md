# Decisiones de la revisión

Cada punto remite a la sección correspondiente de `2026-09-cross-review.md`. Todas las decisiones están resueltas; la columna Estado indica el commit que la aplicó.

| # | Decisión | Estado | Resolución | Ref |
|---|---|---|---|---|
| 1 | Un solo modelo de dominio | Resuelta en `8b1e1ff` | architecture.md §5 es la única definición; el JSON es una proyección | §1.1 |
| 2 | Enum de `status` | Resuelta en `fad3b6e`, `c8b7faf` y `738f91e` | Estados y reglas de derivación definidos. `outdated` es un solo estado. `updateType` dice qué número cambió y `mayBreak` estima la compatibilidad | §1.2 |
| 3 | `requested / resolved / installed / latest` en el modelo | Resuelta en `fad3b6e` | `VersionClaims`, con `not-applicable` cuando no corresponde | §1.3 |
| 4 | Comandos del MVP | Resuelta en `0bbf268` | Solo `status` y `explain`. `scan`, `doctor` e `init` quedan fuera | §1.4 |
| 5 | npm registry en Fase 1, npm CLI en Fase 2 | Resuelta en `90956b6` | Nombres distintos en todos los documentos | §1.5 |
| 6 | Confianza por claim o por tool | Resuelta en `fad3b6e` | Por claim, con reglas documentadas en architecture.md §6 | D1 |
| 7 | Representación de `unknown` | Resuelta en `fad3b6e` | `Claim<T>` con `state` explícito | D2 |
| 8 | Repo Git: proyecto o herramienta | Resuelta en `16f1351` | Proyecto por defecto; herramienta por config o por un ejecutable en PATH | D3 |
| 9 | Formato de `id` | Resuelta en `1a5de5d` | `global:<provider>:<nombre>` o `project:<raíz>:<nombre>`, documentado como opaco | D4 |
| 10 | Caché en el MVP | Resuelta en `fe7fc7f` | Sí, con TTL, requests condicionales y `--no-cache` | D5 |
| 11 | `GITHUB_TOKEN` para rate limit | Resuelta en `fe7fc7f` y `af9f01f` | Solo para límite de requests, y apagado por defecto | D5 |
| 12 | Cómo leer metadata de Git y pnpm | Resuelta en `a0c5ff6` | Git: archivos para `HEAD` y remotes; git endurecido solo para tags y distancia. pnpm nunca dentro de un proyecto | D6 |
| 13 | Allowlist | Resuelta en `a0c5ff6` | Comandos completos y exactos, elegidos por identificador | D6 |
| 14 | Directorios de PATH escaneados | Resuelta en `24268c0` | Directorio global de pnpm, `~/.local/bin` y `scan.bin_paths` | D7 |
| 15 | Exit codes | Resuelta en `2589804` | `0` ok, `1` updates solo con `--exit-code`, `2` uso inválido, `3` fatal. Se suma `diagnostics` al JSON | §3 |
| 16 | Nombre del paquete npm | Resuelta en `cd79d75`; scope cambiado en `54728de` | `@actually-cli/cli`, con el comando `actually`. Ver abajo | §4 |
| 17 | Idioma de los docs | Resuelta en `0337f0c` | Inglés para código y docs de contribuidores; planificación en español hasta el lanzamiento | §5 |
| 18 | `info` como comando separado | Resuelta en `0bbf268` | Reemplazado por `status <tool>` | §5 |

**Cambio respecto de la revisión en #12.** La revisión recomendaba leer `.git` directamente en vez de lanzar git. Eso alcanza para `HEAD` y los remotes, pero no para los tags anotados ni para la distancia al último tag, que exigen interpretar los packfiles de Git. Por eso se adoptó un enfoque mixto.

## Ajustes posteriores a la revisión

La revisión del PR #2 corrigió tres puntos:

| Ajuste | Commit | Motivo |
|---|---|---|
| Explicación exacta de qué sale de la máquina, aviso de primera ejecución y `--offline` | `af9f01f` | La promesa de no enviar información de los proyectos era inexacta: consultar npm y GitHub les revela los nombres verificados |
| `GITHUB_TOKEN` apagado por defecto | `af9f01f` | Con token, GitHub puede asociar las consultas a una cuenta |
| `updateType` solo numérico, más el campo `mayBreak` | `738f91e` | Llamar `major` a un cambio de 0.2 a 0.3 mezclaba el tamaño del cambio con una estimación de compatibilidad |

También se definió la v0.1 como próximo hito (`c2970ff`). El riesgo principal pasó a ser seguir perfeccionando el diseño sin contrastarlo con una implementación.

La revisión del PR #3 corrigió cuatro puntos más:

| Ajuste | Commit | Motivo |
|---|---|---|
| Un paquete se consulta en el registry público solo si su origen es conocido. Se contempla un registry predeterminado privado, y la v0.1 lista sus protecciones | `cebff0e` | La v0.1 no tiene archivo de configuración, así que no tiene `exclude`. Antes solo se contemplaban scopes privados |
| El aviso sale siempre por stderr y el marcador vive en el estado local, no en la caché | `ac8bf3a` | "Nunca aparece con `--json`" era ambiguo, y la v0.1 no tiene caché |
| El id se describe como determinístico, con los casos en que cambia | `d926668` | Cambia si el proyecto se mueve o cambia el provider detectado |
| `latest` es lo que declara la fuente, no una garantía de estabilidad | `41bcc05` | El dist-tag `latest` de npm lo elige quien publica; usarlo para la última estable es una convención |

## Ajustes durante la implementación del MVP

La implementación (`2e02740`) tomó estas decisiones, ya reflejadas en los documentos:

| Ajuste | Motivo |
|---|---|
| Se quitó `node --version` del allowlist, que queda en 7 comandos | Ningún provider del MVP lo usa; sería superficie de ataque sin propósito |
| RA-002 permite `node:fs` también a `cache` y `local-state` | Son los únicos componentes que escriben; `filesystem` sigue siendo de solo lectura |
| Un tarball informado por pnpm fuera de `registry.npmjs.org` impide la consulta | Es evidencia directa de otro origen; ante la duda no se consulta |
| Ubicación del archivo de config, `ACTUALLY_CONFIG` y `scan.depth` | No estaban definidos |
| Un tag de GitHub sin release queda con confianza máxima `medium` | Un tag no es una release declarada por quien publica |
| El provider de actualización nunca supera la confianza de la instalación | Se deriva de ella |
| Windows queda fuera del MVP | pnpm es un shim `.cmd` que no se puede ejecutar sin shell. Se soporta desde el port a Windows (ver la sección siguiente) |
| El test del repo hostil incluye un control | Con `git tag` y `git describe` el ataque no se dispara ni sin endurecer; el control prueba que el endurecimiento sí lo detiene |

## Port a Windows

Decidido por la persona responsable el 2026-10-09, con la congelación de alcance levantada para el port:

| Ajuste | Commit | Motivo |
|---|---|---|
| En Windows, pnpm se busca en `PATH` como cmd y su lanzador `.cmd` se lee, nunca se ejecuta | `f28cd2f` | Node.js no lanza un `.cmd` sin shell, y `actually?` nunca usa uno (ADR 0009) |
| En Windows, un comando es el nombre del archivo sin su extensión de `PATHEXT`, y un lanzador se sigue leyéndolo | `e506902` | pnpm escribe `foo.CMD` y `foo.ps1` para cada comando, y un lanzador no es un symlink |
| Se desarrolla también en Windows, sin WSL, y la CI corre en Windows | `342dbc3`, `e4f9f52` | La persona responsable desarrolla en Windows; revierte esa parte de F-48 |

## Instalación con npm

Decidido por la persona responsable el 2026-10-15: npm es el único método de instalación documentado para usuarios, con `npm install -g @actually-cli/cli` (MVP §12). Reemplaza las instrucciones de instalación con pnpm; pnpm sigue siendo el gestor de desarrollo y un provider del inventario. No se agrega una restricción de ejecución a otros gestores.

La persona responsable confirmó que npm instala el paquete en su VM. El error 193 del lanzador de pnpm ocurre antes de instalarlo y no demuestra una incompatibilidad del paquete.

## Servidor MCP

Decidido por la persona responsable el 2026-10-15, con la congelación de alcance recordada y levantada para este cambio:

| Ajuste | Commit | Motivo |
|---|---|---|
| `actually mcp` sobre stdio, con el protocolo implementado en `src/mcp/` y sin el SDK oficial | `2dd187c`, `7ff402e` | El SDK suma 17 dependencias directas para todos los usuarios de la CLI; el servidor solo necesita tools sobre stdio (ADR 0010) |
| Las llamadas corren offline salvo que pidan `offline: false`; `actually mcp --offline` cierra la red para todas | `2dd187c`, `7ff402e` | Es la misma regla que la skill les da a los agentes, y el aviso de red va en stderr, que la persona no ve en un cliente MCP |
| Toda la salida que muestra texto no confiable escapa los caracteres ignorables por defecto | `7daa400` | Los caracteres de etiqueta esconden texto que un modelo sí lee (F-73) |
| Un error del MCP lleva solo el documento JSON, y las descripciones aclaran que si actually no encuentra una herramienta, puede estar instalada igual | `fc29738` | En la prueba real, `status` para git devolvió el consejo de usar `actually --help`, que un modelo no puede seguir, y nada decía que git estaba instalado fuera de los lugares que actually revisa |

La prueba real fue el 2026-10-15, en Claude Code 2.1.280 sobre Windows, con el paquete instalado en una carpeta aislada. El cliente conectó con `initialize`, en la versión 2025-11-25. Las herramientas respondieron offline por defecto, la primera llamada online trajo el aviso de red, y solo cambió el directorio de caché y estado de actually. La generación 2026-07-28 queda cubierta por los tests y por el smoke de la CI, no por un cliente real.

## Vista global completa

Decidido por la persona responsable el 2026-10-15, con la congelación de alcance recordada: `status --global` también lista los paquetes de `npm -g`, las herramientas de PATH y los globales de otras generaciones de pnpm, sin comandos nuevos y sin ejecutar nada de lo que encuentra. Sus proyectos se ven con `scan.paths`, sin código.

| Ajuste | Commit | Motivo |
|---|---|---|
| Los paquetes globales de npm se leen de los prefijos de PATH, por su forma y por un comando que corre algo dentro de un paquete | `6ad34a9` | npm no deja leer su prefijo sin ejecutarlo. Solo la forma no alcanzaba: `C:\Windows\System32` tenía un `node_modules` con paquetes que dejó otro programa |
| Su `latest` nunca se consulta | `6ad34a9`, `2c223c2` | El plan suponía leer el origen de `node_modules/.package-lock.json`, pero no existe en un prefijo global, ni en Linux ni en Windows, y el `package.json` instalado no tiene `_resolved`. Sin origen, la regla de §8 no consulta: un global de un repositorio privado filtraría su nombre. La persona responsable eligió respetar la regla |
| Las herramientas de PATH son una lista cerrada, buscada por nombre, con la versión leída de un archivo y sin `latest` | `6ad34a9`, `2c223c2` | Revisa la decisión #14 sin listar PATH (ADR 0011) |
| Los globales de otras generaciones de pnpm se leen de `PNPM_HOME/global/5` y `global/v11`, y se quita el aviso de F-57 | `6ad34a9` | Formas verificadas con pnpm 10.33, 11.22 y 12.10 reales: pnpm 11 y 12 comparten `v11` |
| Los paquetes de un segundo prefijo de npm o de otra generación tienen id por ruta | `6ad34a9` | `@anthropic-ai/claude-code` estaba en dos prefijos de la misma máquina |
| Las herramientas de PATH usan el id `global:unknown:<nombre>`, el mismo de los ejecutables desconocidos, en vez del `global:path:<nombre>` del plan | `6ad34a9` | El id toma el provider de la instalación, que es desconocida; la herramienta de PATH reemplaza al ejecutable desconocido de su nombre, así que no hay choque |
| Plantilla nueva de lanzador de npm, con `PATHEXT` en la última línea | `a5e5239` | Así están los de fnm en Windows; ninguna plantilla los reconocía |

## #16: nombre del paquete

Se eligió la alternativa B con un scope propio, porque `@actually` pertenece a otra cuenta: primero `@getactually` y, desde el 2026-10-09, `@actually-cli`. Las alternativas quedan como registro de la decisión.

### Contexto

El comando que el usuario escribe lo define el campo `bin` del `package.json`, no el nombre del paquete. En las tres alternativas el comando sigue siendo `actually` y la marca sigue siendo `actually?`. Solo cambia la línea de instalación.

Datos del paquete que hoy ocupa el nombre, verificados en el registry el 2026-09-26:

- versión `0.0.3`, creado en enero de 2017;
- sin ejecutable y sin dependencias;
- un solo maintainer, con repositorio en `github.com/PrestonR/actually`;
- el propio paquete se describe como una broma.

### A. Pedir el nombre al dueño actual

npm permite que el dueño transfiera un paquete agregando un nuevo owner. El contacto del maintainer está en la metadata pública del paquete (`npm view actually maintainers`).

Si no responde, el soporte de npm puede mediar, pero normalmente no transfiere un nombre con contenido publicado salvo casos de squatting o de marca registrada. El resultado es incierto y puede tardar semanas.

### B. Scope propio: `@actually/cli`

```bash
pnpm add -g @actually/cli
actually status
```

Es el patrón de `@angular/cli` (comando `ng`), `@vue/cli` (comando `vue`) y `@nestjs/cli` (comando `nest`).

Ventaja adicional: la Fase 3 pide que las integraciones de IDE consuman el core, no que lo dupliquen. Con un scope, el core puede publicarse como `@actually/core` junto a la CLI.

No se pudo verificar si la organización `@actually` está libre: hay que intentar crearla en npmjs.com. Si está tomada, el scope personal de la cuenta de npm que publique `actually?` es la alternativa garantizada.

### C. Nombre sin scope: `actually-cli`

```bash
pnpm add -g actually-cli
actually status
```

El nombre estaba libre en el registry el 2026-09-26. Es la opción más simple, pero no agrupa paquetes futuros.

### Decisión

El scope `@actually` resultó pertenecer a otra cuenta de npm, sin paquetes públicos. Se usó el scope `@getactually`, que estaba libre; la organización `getactually` se creó en npmjs.com el 2026-09-26.

El 2026-10-09 se perdieron las credenciales de la cuenta dueña de `getactually`, antes de publicar nada en ese scope: el registry respondía 404 para `@getactually/cli`. Se creó la organización `actually-cli` en otra cuenta, y el registry respondía 404 para `@actually-cli/cli` y `@actually-cli/core`.

- El paquete se publica como `@actually-cli/cli` y expone el comando `actually`.
- El scope reserva `@actually-cli/core` para las integraciones de la Fase 3.
- La cuenta que publica debe tener la verificación en dos pasos activa.

Pedir la transferencia del nombre `actually`, la alternativa A, sigue siendo posible más adelante. Si prospera, `actually` pasaría a ser el nombre principal y `@actually-cli/cli` se deprecaría con un mensaje que apunte al nuevo nombre.
