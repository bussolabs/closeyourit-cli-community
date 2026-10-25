# Source map artifacts

The local CLI implementation uploads private build artifacts with an existing user or
service-account CLI token. The backend requires a visible project for metadata reads and
`artifacts.manage` on that project for upload/delete.
An ingest token or public DSN cannot manage artifacts. Local implementation does not imply
that the backend route or CLI package has been released.

```sh
cyi artifacts source-maps upload --project "$PROJECT_ID" \
  --file ./dist/app.js.map --release "$APP_RELEASE" \
  --generated-file "$GENERATED_FILE" --json
cyi artifacts source-maps list --project "$PROJECT_ID" --page 1 --json
cyi artifacts source-maps show "$ARTIFACT_ID" --project "$PROJECT_ID" --json
cyi artifacts source-maps delete "$ARTIFACT_ID" --project "$PROJECT_ID" --confirm
```

`--release` is mandatory. Set `--dist` when the error event uses a distribution identifier.
`--generated-file` must identify the generated file carried by error frames; the CLI passes
it unchanged. It does not guess a basename, expand wildcards, fetch URLs or locate source files.
The server owns identity normalization and conflict detection. A nonblank distribution is
preserved exactly; empty or whitespace-only distributions are omitted. An optional `--debug-id`
is validated and normalized by the backend.

The upload opens one explicit `.map` path using `O_NOFOLLOW`, checks the same descriptor is a
regular file and reads at most 10 MiB. It rejects secret paths and malformed UTF-8 or JSON
without printing their contents. Symlinks at the final path component are rejected.

Flat version-3 and embedded indexed maps are supported: at most four nested section levels,
100 sections, 10,000 sources, 10,000 names, 100,000 mapping segments and 5 MiB after normalization.
External section URLs are rejected. The server independently validates mappings and all limits.

For embedded JavaScript/TypeScript sources, the uploader lazily loads TypeScript 5.9.3 and parses
an AST in memory. It creates no program or type checker and performs no emit, import resolution,
plugin loading, source-file reads or execution. Compiler work is limited to 1 MiB per source,
5 MiB of source text in total, 100,000 AST nodes and 128 AST levels. Unsupported source languages
and absent source contents produce no function ranges; no source retrieval is attempted.

Named declarations and expressions, assigned arrows/functions, and methods/accessors with static
names produce `x_closeyourit_functions: {version: 1, ranges: [...]}`. Each embedded map uses its own
source indices. Lines and UTF-16 columns are zero-based; range ends are exclusive. The global
limit is 10,000 ranges, including unnamed boundaries. Anonymous callbacks, computed methods and
constructors retain a range with `name: null`: the innermost boundary masks a named outer function
without inventing a name. Overload signatures without a body produce no range. Source-map
`names` entries are not assumed to be function names. Supplied range extensions are replaced
by the parser's actual findings. The backend chooses the innermost matching range and a null name
never falls back to an outer function or to a generated function name.

Every `sourcesContent` entry is removed before the HTTP request, including unsupported source
languages. Mappings, original source paths and function names remain build metadata: use
version identifiers and paths without secrets or personal data. Parser failures expose only
static diagnostics and numeric positions, never source snippets. Upload/list/show print only
artifact metadata; there is no raw-map download command.

The backend returns 201 for a new artifact, 200 for an identical duplicate, 409 for a conflicting
identity, 422 for invalid input, 413 for size limits and 503 for storage unavailability. The CLI
preserves structured API error codes while replacing remote free-text diagnostics and details
with a bounded message. A failed command exits nonzero; deletion always requires `--confirm`.

Platforms without a usable `O_NOFOLLOW` flag reject source-map upload before opening the file.
Use a supported Linux or macOS build runner; Windows upload is not supported by this profile.
