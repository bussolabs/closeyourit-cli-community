# closeyourit-cli

`closeyourit` (alias `cyi`) is the command-line interface for [CloseYourIt](https://www.closeyour.it).
Authenticate with your user token and manage projects, error monitoring, ingest tokens, tickets and
performance metrics straight from your terminal — handy for CI pipelines and SDK setup.

## Install

```bash
npm install -g @bussolabs/closeyourit-cli
# or run without installing
npx @bussolabs/closeyourit-cli --help
```

## Getting started

```bash
closeyourit login        # device flow: opens your browser, enter the shown code
closeyourit whoami       # confirm who you are and which org/token is active
closeyourit projects list
```

`login` uses the OAuth 2.0 device authorization grant: it prints a short user code and a verification
URL (and opens it in your browser), then polls until you approve. The resulting token, account and
organization are stored locally, together with the backend used for login.
A failed login leaves the previous configuration intact. An API URL override
does not forward the stored token to a different endpoint; supply an explicit
environment token or sign in there. Successful login persists its backend even
when selected through `CLOSEYOURIT_API_URL`.

A CLI token belongs to one organization. To work in another one, run
`closeyourit org switch <slug>`: the first time it signs in through the browser,
where you pick that organization; after that the switch is instant, because every
organization keeps its own saved token. `org list` shows the saved ones, and
`logout` forgets only the active one.

### Headless / CI / agents

Set `CLOSEYOURIT_TOKEN` to a user token (`cyi_u_…`) to authenticate non-interactively, without the
device-flow login. It overrides the stored config token. Ideal for a **service account** token driving
an agent or CI job:

```bash
CLOSEYOURIT_TOKEN=cyi_u_… CLOSEYOURIT_API_URL=https://app.closeyour.it \
  closeyourit secrets bundle -p KEY -e development
```

## Commands

Source map upload and management: see [Source maps](docs/source-maps.md). These commands require
a visible project; upload/delete also require `artifacts.manage` through the existing CLI token.

| Command | Description |
| --- | --- |
| `artifacts source-maps upload --project <id\|key> --file <path.map> --release <release> --generated-file <filename-or-url> [--dist] [--debug-id]` | Upload a source map and original function ranges, removing embedded source contents. |
| `artifacts source-maps list --project <id\|key> [--page]` | List artifact metadata. |
| `artifacts source-maps show <id> --project <id\|key>` | Show artifact metadata, never map contents. |
| `artifacts source-maps delete <id> --project <id\|key> --confirm` | Delete an artifact with explicit confirmation. |
| `artifacts proguard-maps upload --project <id\|key> --file <mapping.txt> --release <release> --debug-id <uuid> [--dist]` | Upload a private ProGuard/R8 mapping with explicit build identity; backend contract pending deployment. |
| `artifacts proguard-maps list --project <id\|key> [--page]` | List ProGuard artifact metadata. |
| `artifacts proguard-maps show <id> --project <id\|key>` | Show metadata without mapping contents. |
| `artifacts proguard-maps delete <id> --project <id\|key> --confirm` | Delete a ProGuard artifact with explicit confirmation. See [contract and limits](docs/proguard-maps.md). |
| `artifacts native-symbols upload\|list\|show\|delete …` | Manage private native debug files with exact build identity. See [formats, limits and deployment status](docs/native-symbols.md). |
| `login [--api-url <url>]` | Authenticate via device flow, store the token. |
| `logout` | Clear the locally stored token and identity. |
| `whoami` | Show account, organization, token prefix and permissions. |
| `projects list [--page]` | List visible projects. |
| `projects show <id\|key>` | Show one project, plus its declared environments and per-environment capabilities. |
| `projects create <name> --key <key> [--group <id\|name>] [--color] [--description] [--quick-bug-report-enabled]` | Create a project (optionally inside a group). |
| `projects update --project <id\|key> [--name] [--key] [--color] [--description] [--group] [--quick-bug-report-enabled]` | Update a project (only the passed fields change). |
| `projects link-server --project <id\|key> --host-id <id> --environment-id <id>` | Link a server host to a declared project environment (uptime). |
| `projects unlink-server <link-id> --project <id\|key> --confirm` | Unlink a server host from the project. |
| `projects settings show --project <id\|key>` | Show a project's settings (log/analytics retention + feature flags). |
| `projects settings update --project <id\|key> [--logs-retention-days] [--analytics-retention-days] [--quick-bug-report-enabled] [--analytics-enabled]` | Update a project's settings (only the passed fields change). |
| `projects github --project <id\|key>` | Show a project's GitHub integration (repo link + secrets-sync state + tag→release binding rules). |
| `projects github-connect --project <id\|key> --repository <owner/name>` | Connect a project to a repository visible to the organization's GitHub App. |
| `projects github-map [--connected-only]` | List every visible CloseYourIt project and its connected GitHub repository; automatically fetches all pages. |
| `projects github-update --project <id\|key> [--default-branch] [--production-environment-id] [--staging-environment-id] [--sync-enabled] [--sync-secrets] [--tag-binding-enabled] [--autoclose-on-merge]` | Update a project's GitHub binding rules (only the passed fields change; `--sync-secrets`/`--no-sync-secrets` toggles pushing vault secrets to GitHub). |
| `groups list [--page]` | List groups (macro-projects) in your org. |
| `groups create <name> [--color]` | Create a group (container of related projects, e.g. "DriverOne"). |
| `groups update <id\|name> [--name] [--color]` | Update a group (rename, recolor). |
| `roles list\|show <id\|name>` | List roles / show a role with its permission keys. |
| `roles create <name> [--permission <key>…] [--color]` | Create an RBAC role (bundle of permission keys). |
| `roles update <id\|name> [--name] [--permission <key>…] [--color]` | Update a role (permissions REPLACE the set). |
| `roles delete <id\|name>` | Delete a role. |
| `teams list\|show <id\|name>` | List teams / show a team (roles, scope, members). |
| `teams create <name> [--role <id\|name>…] [--group <id\|name>…] [--project <id\|key>…] [--member <email\|id>…] [--color]` | Create a team with roles + group/project scope + members. |
| `teams update <id\|name> [--name] [--role…] [--group…] [--project…] [--member…]` | Update a team (each dimension REPLACES its set; dimensions you omit are left untouched). |
| `teams add-member\|remove-member <team> <email\|id>` | Add/remove one person, keeping the others. |
| `teams delete <id\|name>` | Delete a team. |
| `members list [--page]` | List org members (resolve email → account id). |
| `members set-access <membership-id> [--group <id\|name>…] [--project <id\|key>…] [--role-id <id\|name>…] [--override <key=allow\|deny\|inherit>…]` | Set a member's scope, direct roles and permission overrides. |
| `members update <membership-id> [--name] [--handle]` | Update a member's profile (requires members.edit). The email of an account cannot be changed here. |
| `members remove <membership-id> --confirm` | Remove a member from the org (requires members.manage). |
| `invitations create <email> [--role customer\|member\|admin]` | Invite a person; prints the acceptance link (once). |
| `invitations list [--page]` | List invitations. |
| `invitations revoke <id>` | Revoke a pending invitation. |
| `org list` | List the organizations this computer is signed into; `*` marks the active one. |
| `org switch <slug>` | Make another organization active. The first time it signs in through the browser. |
| `org update [--name] [--slug] [--projects-view cards\|table] [--logs-retention-days] [--analytics-retention-days]` | Update the organization (requires organization.manage). |
| `platforms create <code> --label <label> [--color] [--position] [--active] [--supports-uptime]` | Create a platform (a device/system your projects run on). |
| `platforms update <id\|code> [--code] [--label] [--color] [--position] [--active] [--supports-uptime]` | Update a platform. |
| `errors list --project <id\|key> [--status] [--page]` | List error groups. |
| `errors show <id> --project <id\|key>` | Show one error group. |
| `errors resolve\|reopen\|mute\|unmute <id> --project <id\|key>` | Triage an error group. |
| `errors bulk-triage --project <id\|key> --action resolve\|ignore\|reopen --group <id>…` | Triage several error groups in one call. Repeated ids are sent once. If the server does not return every group asked for — an id belonging to another project is dropped without a word — the command names the ones left out and exits non-zero: the rest were changed. |
| `errors assign <id> --project <id\|key> (--assignee <id\|email> \| --unassign)` | Put an error group in someone's hands, or take it out. An account outside the organization is refused by the server in silence: the command checks the answer and exits non-zero instead of reporting an error handed to nobody. |
| `errors merge <primary-id> --project <id\|key> --group <id>… --confirm` | Merge error groups into the primary: occurrences move, counters add up, the absorbed groups disappear. Irreversible. The ids travel raw, so one id the server cannot find in the project aborts the whole merge and nothing is half-done. |
| `errors split <id> --project <id\|key> --event <event-id>…` | Pull some occurrences out into a new group. All-or-nothing too: an occurrence that is not in this group stops the split. Splitting every occurrence is refused — that would be a deletion. |
| `errors delete <id> --project <id\|key> --confirm` | Delete an error group and every occurrence it holds (requires errors.destroy). Irreversible. |
| `errors grouping-rules list --project <id\|key> [--page]` | The project's custom grouping rules, in the order they are applied. |
| `errors grouping-rules create --project <id\|key> --field exception_type\|message\|culprit\|transaction --operator contains\|equals\|starts_with --value <text> --fingerprint-key <key> [--position] [--active\|--no-active]` | Add a rule: at ingest the first active rule that matches rewrites the fingerprint, and everything sharing a `--fingerprint-key` lands in one group. Matching is case-insensitive and never a regular expression. |
| `errors grouping-rules update <id> --project <id\|key> [--field] [--operator] [--value] [--fingerprint-key] [--position] [--active\|--no-active]` | Change a rule, or turn it off without deleting it. At least one field is required. |
| `errors grouping-rules delete <id> --project <id\|key> --confirm` | Delete a rule; the groups it already made stay where they are. |
| `vulnerabilities list [--project <id\|key>] [--severity] [--status] [--package] [--page]` | List known dependency vulnerabilities across every visible project, worst first. |
| `vulnerabilities show <id>` | Show one: advisory, package, manifest, fixing version. |
| `vulnerabilities ignore <id> [--note]` / `reopen <id>` | Accept living with the risk, or change your mind (requires vulnerabilities.triage). |
| `vulnerabilities promote <id>` | Open a ticket from it — automatic promotion only fires on high/critical. |
| `vulnerabilities rescan --project <id\|key>` | Rescan now, without waiting for the nightly run. |
| `vulnerabilities runtimes [--project <id\|key>] [--page]` | Support state of the declared runtimes (Ruby, Node, Flutter…). |
| `seo list [--project <id\|key>] [--severity] [--status] [--area] [--page]` | List the SEO findings of your sites, worst first. |
| `seo show <id>` | Show one, with the evidence behind it. |
| `seo pages [--project <id\|key>] [--url] [--page]` | The pages the check visited: status, title, h1, words. |
| `seo ignore <id> [--note]` / `reopen <id>` | Accept living with a finding, or change your mind (requires seo.triage). |
| `seo promote <id>` | Open a ticket from it, evidence included. |
| `seo rescan --site <id>` | Check a site now, without waiting for the scheduled run (requires seo.manage). |
| `seo-sites list [--project <id\|key>] [--page]` | The sites under SEO check, with cadence and open findings. |
| `seo-sites show <id>` | One site in full: setup, open findings, last run and vitals. |
| `seo-sites create --project <id\|key> --url <url> --environment <id> [--frequency] [--max-pages] [--no-sitemap]` | Declare a site to watch; the first check starts right away. |
| `seo-sites update <id> [--url] [--frequency] [--max-pages] [--sitemap\|--no-sitemap] [--enable\|--disable]` | Change how a site is checked. |
| `seo-sites delete <id>` | Stop watching a site and remove its pages and findings. |
| `tokens list --project <id\|key>` | List ingest tokens. |
| `tokens create --project <id\|key> --name <name> --environment-id <id>` | Create a token (secret shown once). |
| `tokens provision --project <id\|key> --name <name> --environment-id <code\|id> --to-project <id\|key> --to-environment-id <code\|id> --secret-name <NAME>` | Generate and deliver a token without revealing its value. GitHub sync is enabled by default; use `--no-sync-github` for vault-only delivery. |
| `tokens provisions show <id> --project <id\|key>` | Show secret-free provisioning status. |
| `tokens provisions retry <id> --project <id\|key>` | Retry GitHub sync without regenerating or revealing the token. |
| `tokens rotate <id> --project <id\|key>` | Rotate a token (new secret shown once). |
| `tokens revoke <id> --project <id\|key>` | Revoke a token. |
| `secrets assets list --project <id\|key>` | List encrypted secret-file metadata (never contents). |
| `secrets assets upload --project <id\|key> --name <name> --file <path> [--environment]` | Encrypt and upload `.p8`, `.p12`, keystore or service-account JSON. |
| `secrets assets download <id> --project <id\|key> --output <path> [--version] [--force]` | Decrypt to an explicit `0600` file; refuses overwrite by default. |
| `secrets assets versions\|rollback\|archive\|purge …` | Manage immutable versions, restore, archive or owner-only permanent purge. |
| `secrets assets shared-list\|shared-upload\|delegate\|undelegate …` | Manage one organization-level ciphertext and delegate it to authorized projects. |
| `shared list` | List the organization shared secret variables (name, description, last update); automatically fetches all pages. Never prints values. |
| `shared set --environment <code\|id> NAME=VALUE [--description]` | Create or update a shared variable on one environment (`NAME --value <v>` also works). Projects delegated on that environment read the new value. Requires `shared_secrets.manage`. |
| `shared delete <name\|id> --confirm` | Delete a shared variable from **every** environment at once (there is no per-environment deletion). Irreversible. |
| `vault requests list` | List the secret changes waiting for a second approval, across every visible project (org-level, no `--project`). Shows the name and the intent, never the proposed value. |
| `vault requests approve <id>` | Apply a pending secret change. Four-eyes: whoever asked for it cannot approve it, and a service account never decides — only a person. |
| `vault requests reject <id> --reason <why>` | Freeze a pending secret change as rejected; nothing changes in the vault and the reason reaches whoever asked. `--reason` is required and cannot be blank. |
| `tickets list --project <id\|key> [--page] [--agent-eligibility] [--assignee me] [--open]` | List tickets. `--assignee me --open` keeps only your unfinished tickets (needs the server from closeyourit-rails v0.180.0). |
| `tickets show <id> --project <id\|key>` | Show one ticket. |
| `tickets create --project <id\|key> --title <t> [--kind bug\|story\|task\|epic] [--parent-id] [--step-*] [--description] [--status <code\|label\|id>] [--priority <code\|label\|id>]` | Create a ticket. `--status` defaults to `open` and `--priority` to `medium`, and both take a code or a label (`in_progress`, `"In Progress"`), so no id lookup is needed. Length caps: title 255, description 4000, technical analysis 1500 characters — every field over the cap is listed at once, before the call. |
| `tickets statuses` | List the org ticket statuses (id, code, label) — any of the three works as `--status`. |
| `tickets priorities` | List the org ticket priorities (id, code, label) — any of the three works as `--priority`. |
| `tickets ask <question…> [--timeout <seconds>]` | Ask a natural-language question across every ticket you can see (no `--project`: it spans them all); the AI answers and cites the tickets it used. Waits for the answer, then gives up saying so. |
| `tickets report <id\|code> --project <id\|key> (--body <text> \| --body-file <path>)` | Write the work report — the long text a comment cannot hold (max 20000 characters). Each write adds a version, it never overwrites the previous one. |
| `tickets report-show <id\|code> --project <id\|key> [--version <n>]` | Show the current work report, or a past version. |
| `tickets report-versions <id\|code> --project <id\|key> [--page]` | List the versions of the work report (newest first). |
| `tickets reject <id> --project <id\|key> --reason <text>` | Reject the review: back to work, the reason becomes a comment. |
| `tickets approve <id> --project <id\|key>` | Approve the review: move to the first done status. |
| `tickets links <id> --project <id\|key>` | List the ticket-to-ticket links (duplicate/related) involving a ticket. |
| `tickets unlink <id> <link-id> --project <id\|key> --confirm` | Remove a ticket-to-ticket link (requires tickets.edit). |
| `tickets reviewer <id> --project <id\|key> --reviewer-id <account-id>` | Set the reviewer of a ticket (requires tickets.assign). |
| `tickets unreviewer <id> --project <id\|key>` | Remove the reviewer of a ticket. |
| `tickets watch\|unwatch <id> --project <id\|key>` | Watch / stop watching a ticket (its notifications). |
| `tickets branch <id\|code> --project <id\|key>` | Create a GitHub branch from a ticket (name prefixed with the ticket code). |
| `tickets pr <id\|code> --project <id\|key>` | Open a GitHub pull request from a ticket (head = the ticket branch). |
| `tickets lease claim <id\|code> --project <id\|key> [--ttl <seconds>] [--run-id <id>]` | Claim the working lease on a ticket (server default TTL: 8h). Exits non-zero on a 409, naming the current holder and its expiry. |
| `tickets lease renew <id\|code> --project <id\|key> [--ttl <seconds>] [--run-id <id>]` | Extend your own lease before it expires. |
| `tickets lease release <id\|code> --project <id\|key> [--run-id <id>]` | Release your own lease so someone else can claim the ticket. |
| `tickets work-context <id\|code> --project <id\|key> [--full]` | Show the work context frozen at claim time: the references and procedures actually delivered, never the project's current guidance. `--full` also prints their frozen text. The snapshot is taken only when an automation host claims the ticket from the queue, so a ticket claimed by hand has none: that case exits non-zero with `R404-TICKET-004`, spelling out why. Reading it needs `tickets.audit.view`. |
| `tickets questions list <id\|code> --project <id\|key>` | List the questions of a ticket, each with the answers that belong to it. A question that is blocking and still open is marked as such: it is why the agent queue is not starting the ticket. |
| `tickets questions ask <id\|code> --project <id\|key> --body <text> [--blocking] [--shared]` | Ask a question about a ticket (max 240 characters). `--blocking` stops the agent queue until it is answered (needs tickets.edit; without the permission the question is still recorded, it just does not block). `--shared` makes it visible to the client too. The server refuses text that reads as a command or a URL. |
| `tickets questions answer <id\|code> --project <id\|key> --question-id <id> --body <text>` | Answer one question (max 240 characters). The answer belongs to that question, not to whatever came next. |
| `tickets questions close <id\|code> --project <id\|key> --question-id <id>` | Withdraw a question still waiting for an answer, so it stops blocking (requires tickets.edit). One that already has an answer cannot be withdrawn. |
| `tickets questions delete <id\|code> --project <id\|key> --question-id <id> --confirm` | Delete a question, answers included (author, or tickets.comment.delete_any). To keep it in the history, withdraw it instead. |
| `ideas delete <id> --project <id\|key> --confirm` | Delete an idea (author always allowed; others need ideas.delete). |
| `ideas archive\|unarchive <id> --project <id\|key>` | Archive an idea (open → archived) / reopen it. |
| `ideas case-update <idea-id> <case-id> --project <id\|key> [--title] [--description]` | Update a case (example) of an idea. |
| `ideas case-delete <idea-id> <case-id> --project <id\|key> --confirm` | Delete a case from an open idea. |
| `ideas create … [--monetization] [--risks] [--evolves <idea-id>]` | Monetization and risks are fields of the idea (not comments). `--evolves` makes the new idea an evolution of the base one: same project, one level only. |
| `ideas update <id> … [--monetization] [--risks]` | Replaced only when provided (like `--stakeholders`). |
| `ideas link <id> <other-id> --project <id\|key> [--kind related\|evolution]` | Link two ideas of the same project: peers (default) or `<id>` as the evolution of `<other-id>`. |
| `ideas unlink <id> <other-id> --project <id\|key>` | Remove the link between two ideas, from either side. |
| `metrics list --project <id\|key> [--kind] [--page]` | List metric groups. |
| `metrics show <id> --project <id\|key>` | Show one metric group. |
| `metrics bulk-triage --project <id\|key> --action resolve\|ignore\|reopen --group <id>…` | Triage several metric groups in one call — same rules as `errors bulk-triage`, including the refusal to call a partial selection a success. |
| `logs list [--project <id\|key>] [--level] [--trace-id] [--environment] [--page]` | List structured log entries. Cross-app: omit `--project` for the full visible stream. |
| `logs show <id>` | Show a single log entry (attributes, trace id, correlation). |
| `logs link <id> --to <Errors::Group:uuid\|Ticketing::Ticket:uuid>` | Manually link a log entry to an error group or ticket. |
| `logs unlink <id> <link-id> --confirm` | Remove a manual log link. |
| `kb list [--project <id\|key>] [--kind] [--status] [--awaiting-consolidation] [--per] [--page]` | List knowledge pages. Cross-project: omit `--project` for every visible project. Published only unless `--status` says otherwise. |
| `kb search <query…> [--project <id\|key>] [--kind] [--status] [--per] [--page] [--with-related]` | Search knowledge pages (semantic when available, title ILIKE fallback). Accepted pages only unless `--status` says otherwise: `--status all` also searches the proposals waiting for review and the rejected ones, so a duplicate that is not accepted yet shows up before you propose it again. Results carry a `STATUS` column as soon as one row is not published. |
| `kb show <id> [--related] [--question <q>]` | Show one knowledge page: metadata header (every project it belongs to, its groups and tags), raw markdown body, then the technical section. |
| `kb related <id> [--question <q>] [--links-only]` | Pages to read next: linked with `[[wiki links]]` plus close matches by meaning. |
| `kb context [--project <id\|key>] [--limit] [--quiet] [--timeout <seconds>]` | Print the knowledge context of the current project: the short list of pages whoever starts working here should already know. Without `--project` the project is resolved from the `origin` git remote of the current directory (project → repository map). `--quiet` never fails — outside a project it prints nothing, on an unreachable service one line — so a session-start hook can call it blindly. `KB_CONTEXT_DISABLE=1` turns it off. |
| `kb create [--project <id\|key>…] [--group <id\|name>…] [--tag <tag>…] --title <t> [--kind note\|decision\|guide] (--body <md> \| --body-file <path>) [--tech-spec <md> \| --tech-spec-file <path>] [--in-review] [--review-note <line>] [--author-origin <name>]` | Create a knowledge page (optional technical section, kept separate from the body). `--project`, `--group` and `--tag` are repeatable — a page can belong to several projects and groups at once, and to groups alone; at least one project or group is required. Length caps: title 255, body 4000, technical section 1500, review note 240 characters — every field over the cap is listed at once, before the call. With `--in-review` the page waits for a human and stays out of ordinary search, answers and related panels — `kb search --status in_review\|all` finds it on purpose, so nobody proposes the same page twice. `--author-origin` declares the assistant or skill that wrote the text, which is not the owner of the token. |
| `kb publish --project <id\|key> --publication-key <key> --title <t> [--kind note\|decision\|guide] (--body <md> \| --body-file <path>)` | Create or update a knowledge page in one atomic call, keyed by a stable `--publication-key` (1-255 URL-safe characters). Safe to repeat: the same key always lands on the same page, and the output says whether it was `created` or `updated`. Exactly one body source is required. Omitting `--kind` keeps the kind the page already has (a new page is a `note`). Same title/body caps as `kb create`. |
| `kb approve <id>` | Accept a page waiting for review: it enters search, answers and related panels. A human decision: a service token is refused, and a page the automatic reviewer rejected must be fixed and saved first. |
| `kb reject <id>` | Discard a page waiting for review: it stays archived as rejected, out of ordinary search and answers (`kb search --status rejected\|all` still finds it), so it is not proposed again. Nothing is deleted. |
| `kb consolidate <id> --path <doc-path>` | Mark an accepted page as written to the versioned docs, recording where the document lives. |
| `kb doctor [--project <id\|key>] [--stale-days <n>] [--docs-root <path>] [--limit <n>]` | Check the health of the knowledge base: pages no search can find, `[[wiki links]]` pointing nowhere, proposals nobody decided, accepted pages never filed, and — with `--docs-root` — filed documents missing from the repository on this machine. Every check reports its outcome, what it means and the safe next step; nothing is ever changed. Exits 1 when a check fails, 0 on warnings alone. `--project` narrows the scan but marks the two organization-wide checks (`duplicate-title`, `dangling-link`) as skipped, because the service resolves those across every project. `--limit` caps how many pages each listing reads (default 500) and the report says when it stopped short. |
| `kb update <id> [--title] [--kind] [--body \| --body-file] [--tech-spec \| --tech-spec-file] [--project <id\|key>…] [--group <id\|name>…] [--tag <tag>…] [--author-origin <name>]` | Update a page (unpassed fields keep their current value — including projects, groups, tags and attachments). Passing `--project`, `--group` or `--tag` **replaces** that list with what you name; `--tag ""` clears the tags. Changing only scope or tags never rewrites the text, so a concurrent edit is not overwritten. Same length caps as `kb create`; text already over the cap is refused only if it grows. |
| `kb delete <id> --confirm` | Delete a knowledge page (irreversible). |
| `kb attachments <id>` | List every file attached to a knowledge page — all pages, never truncated (`SCRIPT` says whether the server considers it executable). |
| `kb attach <id> --file <path>…` | Attach one or more local files to a page. All-or-nothing: an unreadable path or a file the server refuses leaves the page untouched. |
| `kb attachment-download <id> <attachment-id> [--out <dir>] [--filename <name>]` | Download an attachment to disk. The server always sends it as an inert file, never something a viewer would render. |
| `kb detach <id> --attachment <attachment-id> --confirm` | Remove an attachment from a page (irreversible). |
| `kb ask <question…>` | Ask a question; the AI answers from the knowledge base and cites the pages it used. |
| `kb book list [--project <id\|key>] [--q <text>] [--per] [--page]` | List knowledge books (ordered collections of pages). Cross-project: omit `--project` for every visible project. |
| `kb book show <id>` | Show a book: metadata, then the summary of the pages it collects (`#` is the 0-based position). |
| `kb book add-page <id> --page <page-id> [--position <n>]` | Add a page to a book's summary. `--page` takes a page **id** (alias: `--page-id`), not a page number; `--position` is 0-based (`0` = top, omitted = last), like the position the summary shows back. Idempotent: repeating it never lists the page twice. |
| `mcp [--timeout <seconds>]` | Serve the knowledge base over the Model Context Protocol on stdin/stdout, so any MCP-speaking assistant can search it, ask it, read pages and propose new ones with your own access. Started by the client as a subprocess — see [Connecting an assistant (MCP)](#connecting-an-assistant-mcp). |
| `assistant ask <question…> [--conversation <id>] [--timeout <seconds>]` | Ask the assistant a question about your own data; it reads what you are allowed to see, answers, and lists the tools it used. Prints the conversation id so the next question can keep the context (`--conversation <id>`). |
| `assistant conversations list [--per] [--page]` | List your conversations with the assistant, most recently active first. |
| `assistant conversations create [--title]` | Open an empty conversation; without `--title` the server names it after its first question. |
| `assistant conversations show <id>` | Read one conversation: every question and answer, the tools each answer used, and why a reply failed. |
| `assistant conversations delete <id> --confirm` | Delete a conversation and all its messages (irreversible). |
| `servers list [--status] [--page]` | List the monitored servers (fleet snapshot: status, cpu/mem/disk, last seen). |
| `servers show <id>` | Show a monitored server (latest snapshot + machine details). |
| `servers rename <id> --name <name>` | Rename a server (display name only). |
| `servers pause\|resume <id>` | Pause (no staleness/alerts) / resume a server. |
| `servers revoke <id> --confirm` | Revoke a server: its agent gets 403 and stops (reversible with `unrevoke`). |
| `servers unrevoke <id>` | Restore a revoked server. |
| `servers delete <id> --confirm` | Delete a server and all its metrics. |
| `servers tokens list` | List the fleet enrollment tokens. |
| `servers tokens create <name>` | Create an enrollment token (secret shown once). |
| `servers tokens revoke <id> --confirm` | Revoke an enrollment token. |
| `agents tokens list [--page]` | List the org automator tokens (cyi_a_). |
| `agents tokens create <name>` | Create an org automator token (secret shown only once). |
| `agents tokens revoke <id> --confirm` | Revoke an org automator token. |
| `service-accounts list [--page]` | List the service accounts (AI members, CLI-only) in your org. |
| `service-accounts show <id>` | Show one service account: identity, active token count, and the environments it may read secrets in. |
| `service-accounts create --name [--handle] [--project <id\|key>…] [--group <id\|name>…] [--role <id\|name>…] [--grant-secrets] [--secret-environment <code>…]` | Create a service account (optionally granting read+write secrets, limited to environment codes). |
| `service-accounts update <id> --secret-environment <code>… \| --all-environments` | Replace the environments the account may read secrets in. An empty list means *every* environment, so it must be asked for with `--all-environments`; an unknown code is refused before the write, and the boundary actually applied is verified after it. |
| `service-accounts delete <id> --confirm` | Delete a service account (revokes tokens + removes access; secrets audit kept). |
| `service-accounts tokens list <account-id> [--page]` | List a service account's CLI tokens: prefix, active/revoked, last use. Never the secret. |
| `service-accounts tokens create <account-id> <name>` | Mint a CLI token (cyi_u_) for a service account (secret shown only once). |
| `service-accounts tokens revoke <account-id> <token-id> --confirm` | Revoke a service account token. |
| `monitors create --project <id\|key> --url <url> [--environment] [--http-method] [--interval-seconds] [--expected-status] [--timeout-seconds] [--expected-body-keyword] [--ssl-expiry-warn-days] [--group-id]` | Create an uptime monitor (one per environment). |
| `monitors update <id> --project <id\|key> [--url] [--http-method] [--interval-seconds] [--expected-status] [--timeout-seconds] [--expected-body-keyword] [--ssl-expiry-warn-days] [--group-id]` | Update an uptime monitor. |
| `monitors publish\|unpublish <id> --project <id\|key>` | Publish / unpublish the monitor's public status page. |
| `monitors announcements show <id> --project <id\|key>` | Show the status-page announcement banner. |
| `monitors announcements set <id> --project <id\|key> [--level info\|maintenance\|warning] [--message] [--starts-at] [--ends-at] [--active]` | Upsert the status-page announcement banner. |
| `monitors announcements clear <id> --project <id\|key> --confirm` | Remove the announcement banner. |
| `monitors incidents delete <id> <incident-id> --project <id\|key> --confirm` | Delete an uptime incident. |
| `monitors incidents group <id> --project <id\|key> --incident <id>… --phase <phase> [--body]` | Unify incidents and post the first narration step. |
| `monitors incidents ungroup <id> <incident-id> --project <id\|key> [--keep <window-id>]` | Dissolve an incident grouping. |
| `monitors incidents update-add <id> <incident-id> --project <id\|key> --phase <phase> [--body]` | Add a timeline step to a narrated incident. |
| `monitors incidents update-delete <id> <incident-id> <update-id> --project <id\|key> --confirm` | Delete a timeline step from an incident. |
| `uptime-groups list [--page]` | List uptime monitor groups in your org. |
| `uptime-groups show <id>` | Show an uptime monitor group. |
| `uptime-groups create --name <name> [--color] [--icon] [--description]` | Create an uptime monitor group (org-level container). |
| `uptime-groups update <id> [--name] [--color] [--icon] [--description]` | Update an uptime monitor group. |
| `uptime-groups delete <id> --confirm` | Delete an uptime monitor group. |
| `uptime-groups publish\|unpublish <id>` | Publish / unpublish the group's public status page. |
| `cron-monitors list [--status] [--project <id\|key>] [--page]` | List cron / heartbeat monitors across visible projects. |
| `cron-monitors show <id>` | Show a cron / heartbeat monitor. |
| `analytics show --project <id\|key> [--range 24h\|7d\|30d\|1y] [--environment]` | Show the web analytics snapshot (traffic, top pages, goals). |
| `analytics share --project <id\|key> [--password]` | Publish a public shareable analytics link. |
| `analytics unshare --project <id\|key> --confirm` | Revoke the public analytics link. |
| `analytics goals list --project <id\|key>` | List a project's conversion goals. |
| `analytics goals create --project <id\|key> --kind pageview_path\|custom_event --display-name <name> [--event-name] [--path-pattern]` | Create a conversion goal. |
| `analytics goals delete <id> --project <id\|key> --confirm` | Delete a conversion goal. |
| `releases list --project <id\|key> [--page]` | List a project's releases (tracked from CI). |
| `matrix list [--page]` | List the products whose feature × platform matrix you can see. |
| `matrix show <product>` | Show the matrix: features in rows, platforms in columns, `status version` per cell (`-` = not set, `?` = released without a version). |
| `matrix statuses` | List the cell statuses of your org (the codes `matrix cells set` accepts). |
| `matrix categories list <product> [--page]` | List the feature groups of a product. |
| `matrix categories create <product> --name <name> [--position]` | Create a feature group. |
| `matrix categories update <product> <id\|name> [--name] [--position]` | Update a feature group (unpassed fields keep their value). |
| `matrix categories delete <product> <id\|name> --confirm` | Delete a feature group (only when empty). |
| `matrix features list <product> [--category] [--page]` | List the features; the REFERENCE column is the `Category/Name` form the other commands take. |
| `matrix features show <product> <id\|"Category/Name">` | Show one feature and the cells written for it. |
| `matrix features create <product> --category <id\|name> --name <name> [--description] [--position] [--knowledge-page]` | Create a feature (a row of the matrix). |
| `matrix features update <product> <id\|"Category/Name"> [--name] [--description] [--position] [--category] [--knowledge-page]` | Update a feature, or move it to another category of the same product. |
| `matrix features delete <product> <id\|"Category/Name"> --confirm` | Delete a feature and every cell written for it. |
| `matrix cells set <product> <feature> <platform> --status <code> [--release <version>]` | Write a cell: how far along a feature is on a platform, and since which version. |
| `matrix cells clear <product> <feature> <platform> --confirm` | Clear a cell: the crossing goes back to "not set". |
| `alerts channels list` | List the external alert channels (webhook / Telegram). |
| `alerts channels create <name> --kind telegram\|webhook …` | Create a channel (`--bot-token`/`--chat-id` or `--url`/`--secret`). |
| `alerts channels delete <id> --confirm` | Delete a channel. |
| `alerts notifications list [--page]` | List your in-app alert notifications. |
| `alerts notifications read <id>` | Mark a notification as read. |
| `alerts notifications read-all` | Mark all your unread notifications as read. |
| `alerts notifications delete <id> --confirm` | Delete one of your notifications. |
| `alerts preferences show` | Show your personal alert preferences (per org). |
| `alerts preferences update [--in-app-enabled] [--email-enabled] [--errors-enabled] [--uptime-enabled] [--tickets-enabled] [--chat-enabled] [--servers-enabled] [--min-level] [--quiet-hours-enabled] [--quiet-hours-start] [--quiet-hours-end] [--quiet-hours-tz]` | Update your personal alert preferences (send only the fields to change). |
| `todos list [--page]` | List your own todo lists. |
| `todos show <id>` | Show one of your todo lists. |
| `todos create --name <name> [--color]` | Create a todo list. |
| `todos update <id> [--name] [--color]` | Update a todo list (rename or recolor). |
| `todos delete <id> --confirm` | Delete a todo list. |
| `todos reorder --list <id>…` | Reorder your todo lists (pass --list once per id, in order). |
| `todos shares <list-id>` | List the members a todo list is shared with. |
| `todos share <list-id> [--account <id>…]` | Set who a todo list is shared with (omit --account to unshare all). |
| `todos complete\|uncomplete <list-id> <item-id>` | Mark a todo item done / reopen it. |
| `todos shared [--page]` | List todo lists shared with you (read-only). |
| `todos shared-show <id>` | Show a todo list shared with you (read-only). |
| `todos items list <list-id> [--page]` | List the items of a todo list. |
| `todos items add <list-id> --title <title> [--ticket] [--position]` | Add an item to a todo list. |
| `todos items update <list-id> <item-id> [--title] [--ticket] [--position]` | Update a todo item. |
| `todos items delete <list-id> <item-id> --confirm` | Delete a todo item. |
| `workload list [--page]` | List the workload actions (non-dev activities) of the teams you belong to. |
| `workload show <action-id>` | Show one workload action with its participants. |
| `workload create --team <id\|name> --title <title> [--description] [--status] [--scheduled-at] [--due-at] [--ticket <code\|id>]` | Create a workload action on one of your teams. |
| `workload update <action-id> [--title] [--description] [--status] [--scheduled-at] [--due-at] [--ticket]` | Update a workload action (`--ticket ""` unlinks the ticket; the team never changes). |
| `workload delete <action-id> --confirm` | Delete a workload action (a linked ticket survives, it only loses the link). |
| `workload participant add\|remove <action-id> <email\|id>` | Add/remove one participant (they must belong to the action team). |
| `workload promote <action-id> --project <id\|key> [--title] [--description] [--kind] [--status] [--priority]` | Generate a ticket from the action and link it back. |

Every command accepts `--json` for machine-readable output and `--help` for usage details.
Every command also accepts `--yes`: the server refuses a write that goes through a dangerous
permission (deleting a project, importing or deleting secrets, …) with `R422-CONFIRM-001` until you
confirm it, and `--yes` is that confirmation. Reads never need it.
`--project` accepts either a project UUID or its key (matched case-insensitively).

`kb publish` needs a backend exposing the atomic Knowledge publication route; an older one fails with
`C404-KNW-001` and says to upgrade. An unknown project key fails locally with `C404-PRJ-001`; the
backend `R404-KNOWLEDGE-001` is reserved for a project UUID that is missing or not visible to the
caller. `R403-KNOWLEDGE-003` means the key already belongs to a page you cannot manage, and
`R409-KNOWLEDGE-001` that two untagged pages share the title the key would adopt.

### Knowledge at the start of a session

`kb context` is built to be called by a `SessionStart` hook, so what the project already learned is
on screen before anyone asks for it. In `--quiet` mode it never gets in the way: a directory that is
not a project prints nothing, an unreachable service costs one line, and both exit 0.

```bash
#!/usr/bin/env bash
# SessionStart hook: stdout becomes the session's additional context.
command -v cyi >/dev/null 2>&1 || exit 0
cyi kb context --quiet --limit 5 --timeout 3 2>/dev/null
exit 0
```

`kb context` reads the context route of the backend and falls back to the project's page list on a
server that does not expose it yet, so the list shows up either way.

### Connecting an assistant (MCP)

`cyi mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server on stdio: the same
procedure works for every assistant that speaks MCP, so reaching the knowledge base no longer means
writing instructions for one particular tool.

Most clients declare their servers in a JSON file. Add this entry under the key your client uses —
`mcpServers` for Claude Code, Cursor, Windsurf and most others, `context_servers` for
[Zed](https://zed.dev/docs/ai/mcp):

```json
{
  "mcpServers": {
    "closeyourit": {
      "command": "cyi",
      "args": ["mcp"]
    }
  }
}
```

The client launches it as a subprocess; there is nothing to start or keep running by hand.

It authenticates exactly like the terminal does, with the token `cyi login` already stored in
`~/.config/closeyourit/config.json` (mode 0600). In the ordinary case the entry above is the whole
configuration and no secret goes anywhere near it.

For a service account, keep the token out of that file too — a client configuration is a dotfile
like any other and frequently ends up committed. Export `CLOSEYOURIT_TOKEN` into the environment the
client is started from, taking it from wherever the secret already lives, rather than writing the
value into JSON:

```bash
CLOSEYOURIT_TOKEN=cyi_u_… your-editor-or-agent
```

Six tools are exposed, each one the call its command already makes:

| Tool | What it does |
| --- | --- |
| `kb_search` | Search the pages (`kb search`). Accepted pages only, unless `status` says otherwise — `"all"` also finds the proposals waiting for review. |
| `kb_ask` | Ask a question and get an answer with its sources (`kb ask`). |
| `kb_show` | Read one page in full (`kb show`). |
| `kb_related` | The pages to read next (`kb related`). |
| `kb_context` | What to know about the project of the working directory (`kb context`). |
| `kb_propose` | Propose a new page — **always** into the review queue (`kb create --in-review`). |

Two things hold whatever the assistant asks for. `kb_propose` sends `in_review` and nothing else:
the page waits for a person to accept it and stays out of ordinary search, answers and related
panels until then — `kb_search` with `status: "all"` looks it up on purpose, before proposing a
duplicate. There is no tool here that publishes, accepts, edits or deletes. And every call travels on
your own token, so a project your access does not include returns nothing, exactly as it does from
the terminal.

`kb_context` recognises the project from the git remote of the directory the client started the
server in. Clients that launch it elsewhere can name the project instead (`project`), or pass it to
every call.

To check the server by hand, talk to it the way a client would:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | cyi mcp
```

When a command fails in `--json` mode it exits non-zero and prints an error envelope on stdout —
never a silent success:

```json
{ "error": { "code": "C400-INP-001", "message": "Missing required flag project" } }
```

`C400-INP-001` means the command line itself needs fixing (missing flag or argument, unknown flag,
missing `--confirm`) and `message` says what; `C500-SYS-001` is reserved for unexpected failures.
Codes starting with `R`/`G` come straight from the backend.

`C408-ASK-001` is not a failure: the AI answer did not arrive within `--timeout` and is still being
worked on — `assistant ask` says which conversation to read it from once it lands. `C502-ASK-002`
means the answer will not come, and the server gave no code of its own to explain why.

## Configuration

The CLI stores its state in:

```
~/.config/closeyourit/config.json   (mode 0600)
```

It holds the backend URL, your token and a cached copy of your account/organization. Use `logout`
to clear it locally; revoke the token on the server at `/account/cli/tokens`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `CLOSEYOURIT_TOKEN` | User token (`cyi_u_…`) for headless/CI/agent use, including the `mcp` server; overrides the stored config token. | — |
| `CLOSEYOURIT_API_URL` | Runtime backend URL override; successful login persists the token's issuing endpoint. | `https://app.closeyour.it` |
| `CLOSEYOURIT_CONFIG_DIR` | Directory holding `config.json`. | `~/.config/closeyourit` |
| `KB_CONTEXT_DISABLE` | Set to `1` to make `kb context` print nothing and call nothing (the switch a session-start hook honours). | — |

## Development

Toolchain is pinned with [mise](https://mise.jdx.dev) (`mise.toml`): Node 24 + pnpm.

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm build      # tsc -> dist/
mise exec -- pnpm test       # vitest (fetch mocked)
./bin/run.js --help          # run the built CLI
```

The machine-readable command surface lives in `opencli.json` ([OpenCLI](https://opencli.org)).
The file is not in the repository: `prepack` generates it inside the published npm package and
`postpack` removes it.

Secret and asset exports create owner-only files (`0600`). Replacing an existing
file uses a new inode atomically, including with `--force`; symlink targets are
never followed.
