# Private native debug files

CYRA-957 adds CLI commands for the private native artifact API. Backend delivery is still
in progress; this does not claim that the endpoint is deployed or that a stack is certified.

```sh
cyi artifacts native-symbols upload -p PROJECT --file build/application.debug \
  --format elf --architecture arm64 --debug-id DEBUG_UUID --code-id COMPLETE_BUILD_ID
cyi artifacts native-symbols upload -p PROJECT --file Application.dSYM/Contents/Resources/DWARF/Application \
  --format macho --architecture arm64 --debug-id DEBUG_UUID
cyi artifacts native-symbols upload -p PROJECT --file application.pdb \
  --format pdb --architecture x86_64 --debug-id GUID-AGE_HEX
cyi artifacts native-symbols list -p PROJECT --page 1 --json
cyi artifacts native-symbols show ARTIFACT_ID -p PROJECT --json
cyi artifacts native-symbols delete ARTIFACT_ID -p PROJECT --confirm
```

Copy the identity and architecture from the build's debug metadata. The server parses the
binary in its isolated processor and requires an exact match; a filename or release label
is not an identity. ELF needs the **complete** code/build ID, since its debug UUID contains
only part of it. PDB uses GUID and hexadecimal age (1–8 digits), without a code ID. UUID form uses a hyphen before the age; compact Breakpad form
concatenates the 32 UUID digits and age without a separator. PE and
its PDB are separate files sharing the debug identity. A PE without usable debug information
does not become symbolic just because its metadata can be inspected.

Upload selects exactly one regular file, at most **20 MiB**. For dSYM select the DWARF file
inside the bundle. A fat Mach-O is sent whole and the server selects the matching slice.
The CLI does not scan directories, unpack archives, fetch companions, execute tools or
interpret symbols. The final path component cannot be a symbolic link; parent directories
follow normal OS resolution. Known credential paths/extensions are refused, which is not
a general secret scanner. Unsupported safe-open platforms fail before reading the file.

The opened descriptor is checked and read with a fixed bound, preserving binary bytes.
JSON is at most **28 MiB** after base64 encoding. Request fields are `format`, `architecture`,
`debug_id`, optional `code_id`, and `object_base64`; no release is required.
The endpoint is `/cli/v1/projects/:project_id/artifacts/native_symbols`.

List/show/upload output uses an explicit metadata allowlist and never prints the binary.
Remote upload diagnostics are reduced to the HTTP status, error code and a fixed safe message.
All commands use the existing CLI authentication; upload/delete require `artifacts.manage`,
and every operation is scoped to a visible project. Deletion requires `--confirm`.

The CLI's bounded-read behavior follows the [Node FileHandle API](https://nodejs.org/api/fs.html#filehandlereadbuffer-offset-length-position).
Actual symbol validation and ID normalization belong to the version-pinned native processor.
