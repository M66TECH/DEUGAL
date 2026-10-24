# DEUGAL

[![CI](https://github.com/M66TECH/DEUGAL/actions/workflows/ci.yml/badge.svg)](https://github.com/M66TECH/DEUGAL/actions/workflows/ci.yml)

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
| `deugal list` / `ls` | List snippets (`--sort recent\|created\|used\|alpha`, `--tag`, `--lang`, `--limit`, `--json`) |
| `deugal recent [n]` | The n most recently created snippets (default 10) |
| `deugal search <terms...>` / `find` | Weighted, case-insensitive search, fuzzy fallback on titles and tags (AND semantics), `--tag` filter |
| `deugal related <id>` | Snippets sharing at least one tag with `<id>`, ranked by overlap |
| `deugal show <id>` | Metadata + content |
| `deugal use <id>` | Raw content on stdout, pipe-friendly (`--copy`, `--no-track`) |
| `deugal edit <id>` | Edit content in `$EDITOR` (or your configured editor) |
| `deugal pin <id>` / `unpin <id>` | Pinned snippets always appear first in lists (marked `*`) |
| `deugal rm <id> [ids...] --force` | Delete one or many snippets (reports each failure) |
| `deugal tag add/rm <id> <tags...>` | Manage tags on a snippet |
| `deugal tag rename <old> <new>` | Rename a tag on every snippet |
| `deugal tags` | All tags with counts |
| `deugal export <file>` / `export -` | Export to a JSON/YAML file or to stdout |
| `deugal import <file>` / `import -` | Import from a file or from piped stdin (`--overwrite` to replace same-id snippets) |
| `deugal recover [--from n]` | List the rotating backups, or restore the nth |
| `deugal stats` | Collection stats |
| `deugal config` | Show preferences (`config set editor\|sort\|limit <value>`, `config reset`) |
| `deugal completions <shell>` | Print a completion script for bash, zsh or powershell |
| `deugal dedupe [--dry-run]` | Remove snippets with identical content, keep the most used |
| `deugal sync` | Commit the store to a local git repo (`--remote <url>`, `--message`, `--status`) |

Global flag: `--no-color` disables colored output (the `NO_COLOR` environment variable is honored too). Every command that prints data also accepts `--json` where noted, for scripting.

## Backups

Every save keeps a rotating backup of the previous store states next to the data file: `snippets.json.bak1`, `.bak2`, `.bak3`. If a save goes wrong, you can restore from these.

## Data location

Snippets are stored in `~/.deugal/snippets.json` by default, preferences in `~/.deugal/config.json`. Override the directory with:

```bash
export DEUGAL_HOME=/path/to/your/dir     # e.g. inside a synced folder
```

The store is written atomically (temp file + rename), so a crash mid-write will not corrupt your data.

## Sync your snippets with git

Your whole collection is one JSON file — perfect for version control:

```bash
deugal sync --init                # local repo in your data directory
deugal sync                       # commit when something changed
deugal sync --remote git@github.com:you/snippets.git   # set origin and push
deugal sync --status              # inspect repo, remote and pending changes
```

Then on another machine: clone that repo into your `DEUGAL_HOME` (or set the same `--remote` and pull).

## Backups

Every save rotates the previous store states next to the data file: `snippets.json.bak1`, `.bak2`, `.bak3`. If something goes wrong, run `deugal recover` to list them and `deugal recover --from 2` to restore. The state before a restore is kept as `.pre-recover`.

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: one branch per feature, tests required, merge with `--no-ff`.

## License

[MIT](./LICENSE) — M66TECH
