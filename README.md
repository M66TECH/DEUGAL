# DEUGAL

A fast, local-first snippet manager for the terminal. Store, search, tag and reuse the commands and code chunks you type over and over — without leaving your shell, without an account, without your snippets ever leaving your machine.

## Why

Every developer keeps a `commands.txt`, a Notion page, or 200 browser tabs of "how do I do X again". DEUGAL replaces that with a tiny CLI backed by a single JSON file on disk:

- **Local-first**: your snippets live in `~/.deugal/snippets.json`. No cloud, no telemetry.
- **Fast search**: weighted search across titles, tags, descriptions, languages and content.
- **Pipe-friendly**: `deugal use <id>` prints raw content, so you can pipe it anywhere.
- **Portable**: export/import to JSON or YAML, round-trip safe.

## Install

Requires Node.js >= 22.12.

```bash
npm install -g @m66tech/deugal
```

Or run it without installing:

```bash
npx @m66tech/deugal --help
```

## Quick start

```bash
# add a snippet (argument, stdin or editor)
deugal add "git undo last commit" "git reset --soft HEAD~1" -t git -l bash

echo 'kubectl rollout restart deploy/api' | deugal add "restart k8s deploy" -t k8s

deugal add "complex snippet" --editor   # opens $EDITOR

# find it again
deugal search git
deugal list --tag git

# reuse it
deugal use <id>        # prints content, bumps usage counter
deugal use <id> --copy # also copies to the clipboard

# organize
deugal tag add <id> bash git
deugal tags
deugal stats
```

Ids are 8 characters — any unique prefix works: `deugal show gitu` is fine when it matches exactly one snippet.

## Commands

| Command | Description |
| --- | --- |
| `deugal add <title> [content]` | Add a snippet (argument, piped stdin, or `--editor`) |
| `deugal list` / `ls` | List snippets (`--sort recent\|used\|alpha`, `--tag`, `--limit`, `--json`) |
| `deugal search <terms...>` | Weighted, case-insensitive search (AND semantics) |
| `deugal show <id>` | Metadata + content |
| `deugal use <id>` | Raw content on stdout, pipe-friendly (`--copy`, `--no-track`) |
| `deugal edit <id>` | Edit content in `$EDITOR` |
| `deugal rm <id> --force` | Delete (requires `--force`) |
| `deugal tag add/rm <id> <tags...>` | Manage tags on a snippet |
| `deugal tags` | All tags with counts |
| `deugal export <file>` | Export to JSON or YAML (format inferred from extension) |
| `deugal import <file>` | Import (`--overwrite` to replace same-id snippets) |
| `deugal stats` | Collection stats |
| `deugal config` | Show data locations |

Global flag: every command that prints data also accepts `--json` where noted, for scripting.

## Data location

Snippets are stored in `~/.deugal/snippets.json` by default. Override with:

```bash
export DEUGAL_HOME=/path/to/your/dir     # e.g. inside a synced folder
```

The store is written atomically (temp file + rename), so a crash mid-write will not corrupt your data.

## Import format

`deugal import` accepts:

- a file produced by `deugal export`,
- a bare JSON/YAML array of snippets,
- or `{"snippets": [...]}`.

Required fields per entry: `title` and `content`. Everything else (`id`, `tags`, `language`, `description`, `useCount`, dates) is optional and generated when missing.

## Development

```bash
git clone https://github.com/M66TECH/DEUGAL.git
cd DEUGAL
npm install
npm test        # vitest
npm run typecheck
npm run build   # tsup -> dist/
```

Project layout:

```
src/
  cli.ts          CLI wiring (commander)
  core/           store, search, config, clipboard, editor, import/export
  ui/             output formatting
tests/            vitest unit + CLI integration tests
```

## License

[MIT](./LICENSE) — M66TECH
