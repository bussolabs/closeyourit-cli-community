# Private ProGuard/R8 artifacts

These commands implement the local client contract for the pending ProGuard artifact backend.
They do not establish that the server route, isolated Retrace processor or CLI version has been
released. The CLI uploads a mapping; it never runs Java/R8 or interprets the mapping itself.

```sh
cyi artifacts proguard-maps upload --project "$PROJECT_ID" \
  --file ./build/mapping.txt --release "$APP_RELEASE" \
  --debug-id "$SENTRY_PROGUARD_UUID" --json
cyi artifacts proguard-maps list --project "$PROJECT_ID" --page 1 --json
cyi artifacts proguard-maps show "$ARTIFACT_ID" --project "$PROJECT_ID" --json
cyi artifacts proguard-maps delete "$ARTIFACT_ID" --project "$PROJECT_ID" --confirm
```

Use the existing user or service-account CLI token, never a public DSN or project ingest token.
Metadata reads require a visible project; upload/delete also require `artifacts.manage`.
Delete sends an explicit JSON confirmation and refuses to run without `--confirm`.

`--release` and `--debug-id` are mandatory. The debug ID is the Sentry ProGuard UUID present in
the error's debug metadata. It is not the R8 `pg_map_id`: the CLI does not derive or convert one
into the other. A nonzero UUID with 32 hexadecimal characters or the standard hyphenated form
is accepted; the backend owns canonicalization. Release and nonblank `--dist` are passed exactly.
Whitespace-only distributions are omitted. There is no generated filename or basename fallback.

The input must be one explicit regular `.txt` or `.map` file. The CLI uses a single descriptor,
`O_NOFOLLOW` on the final path component and `O_NONBLOCK`, refuses directory/symlink/secret paths,
and checks the file size both before and during reading. It accepts at most 8 MiB of valid UTF-8,
rejects NUL and empty contents, and preserves comments, Unicode, BOM and line endings. Comments
can carry R8 semantics and must not be stripped. JSON encoding plus metadata must fit in 10 MiB.
Platforms without `O_NOFOLLOW`, including Windows, reject upload before opening the file.

The complete mapping is sent privately to the backend. It is never printed in successful output
or input/remote error diagnostics. Commands return only artifact metadata; no raw download command
exists. The uploader does not scan directories, read referenced sources, fetch URLs, parse mapping
extensions, import user code or execute a subprocess. Invalid R8 semantics remain a backend concern.

The agreed backend response is 201 for new metadata, 200 for an identical duplicate, 409 for a
build-identity conflict, 422 for invalid input, 413 for a size limit and 503 for storage unavailability.
Commands preserve structured API error codes and replace free-text remote diagnostics with a fixed
message. A JVM proof does not certify Android devices, emulators or native NDK crashes.

Official background: [Android R8 Retrace](https://developer.android.com/tools/retrace) and
[R8 mapping comments and versioning](https://r8.googlesource.com/r8/+/refs/heads/main/doc/retrace.md).
