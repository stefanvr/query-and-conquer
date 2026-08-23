# Environment

**Purpose.** How to actually run this project on a real machine, and which parts of that are
non-negotiable versus merely how one setup happens to work.

**What belongs here.** Runtimes and where they live, shells, identity setup that affects commits,
ports, paths, and tooling behaviour that surprises.

**What doesn't.** Technical *choices* — which runtime, which test framework, which architecture —
belong in [tech-stack.md](tech-stack.md). This doc doesn't decide anything; it describes what's
true. tech-stack changes when the project changes; this changes when a machine changes.

**Write silent failures first.** A command that errors is self-correcting — you see it and fix it.
A command that quietly does the *wrong thing* is not, and that's the class of problem this
document exists for. Every entry below is here because it bit.

---

## Invariants

True regardless of whose machine it is.

- **Commits must be authored as `StefanVR` / `stefan.van.raaphorst@gmail.com`** — the personal
  identity matching this repository's owner (`stefanvr`). This is a personal project; a commit
  authored under a work identity is wrong and won't announce itself.
- **Node 18+ / npm 9+.** Confirmed working: Node v18.19.1, npm 9.2.0.

---

## This machine (Windows host + WSL Ubuntu)

### Node and npm live only inside WSL

They are not installed on the Windows host. The working directory is visible to Windows tools as
`\\wsl.localhost\Ubuntu-24.04\home\stefanraaphorst\query-and-conquer`, but every build, install,
test, or run command still has to execute *inside* WSL:

```
wsl.exe -- bash -lc 'cd ~/query-and-conquer && npm test'
```

Calling `bash` directly from a Windows-side tool reaches Git Bash/mingw, which has no node. Only
the `wsl.exe -- bash -lc '...'` form gets to the real environment.

### `git commit` must run inside WSL too — this one fails silently

Windows-side git's global identity is a **work** email; WSL's global identity is the personal one
above. Committing through the Windows-side shell doesn't error. It just attributes the commit to
the wrong person, and you find out much later.

Discovered exactly that way, after two commits had already landed on `main` and `build-v2` under
the wrong identity.

Use the same wrapper for git as for npm:

```
wsl.exe -- bash -lc 'cd ~/query-and-conquer && git commit -F <message-file>'
```

### Background processes need the calling tool's own backgrounding

A one-shot `wsl.exe` invocation tears down its children when it exits, so a dev server started
with `&` inside that invocation dies immediately — while the launch command still looks like it
succeeded. Background it at the tool level instead.

### Quoting: write files, don't build them in shell strings

Nesting a heredoc, an apostrophe, or `${...}` inside `bash -lc '...'` breaks in ways whose error
messages point somewhere unrelated — a mangled heredoc surfaces as a JavaScript syntax error, and
an apostrophe in prose silently terminates the quoted string mid-file. Write the file with an
editor/tool, then run it.

Multi-line commit messages: write the message to a file outside the repo and use `git commit -F`.

### Don't write scratch output into the served directory

`npm run dev` runs live-server with live reload. Writing a screenshot or scratch file anywhere it
watches reloads the page mid-run and resets the state you were inspecting — and the failure reads
as an application bug rather than a tooling one. Write to `/tmp` instead.

---

## When someone else joins

The section above is tuned to one setup, deliberately: for a solo project the specifics *are* the
value. It won't survive a contributor whose environment differs — at that point promote whatever
actually matters up into **Invariants** and add a second "This machine" section, rather than
genericising both into something that fits neither.
