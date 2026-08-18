# ADR 0014: Git repository connector (P3-02)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

ADR 0013 (P3-01) defined the connector contract and deliberately shipped no real connector: "No git,
no filesystem walking, no HTTP, … no credential resolution." Its stated expectation for this ticket
was that "a real git connector (P3-02 onward) replaces the reference connector's option-supplied
artifacts with a checkout and its `sha256` with git's own object ids; nothing else about the shape
changes."

P3-02 is that connector, and its remit is three things: read **repository metadata**, **revisions**,
and **source files**. It is the first ticket in this project that touches the outside world — a
process on the machine, a directory that Phoenix did not create, and (optionally) a network — so it
is also the first place where the contract's shapes get tested against reality rather than against a
test double.

What existed beforehand:

- `SourceConnector`/`ConnectorSession` with the `open → list → read → close` lifecycle, `ArtifactRef`/
  `RawArtifact`, `ArtifactFilter` + `matchesArtifactFilter`, the `descriptorToSource`/
  `artifactToEvidence` bridges, and `createInMemoryRepositoryConnector` as the only implementation.
- `SourceRepositoryDescriptor` with `RepositoryCoordinates` (`kind`/`branch`/`revision`/`subpaths`).
- `ConnectorCapabilities` with all five flags defined but nothing declaring them truthfully against a
  real source.

## Decision

1. **The implementation is the `git` binary, invoked as a subprocess — not a JS git library, and not
   mocked in tests.** git is the reference implementation of its own object model; a pure-JS
   reimplementation would have to be trusted on packfiles, shallow clones, `.gitattributes`, and
   object-id computation, and being wrong there means producing provenance that does not match what
   `git` itself reports. The cost is an external dependency on `git` being installed
   (`isGitAvailable`/`gitVersion` probe for it and produce a clear error rather than a cryptic
   spawn failure). Consequently the tests build a real repository in a temp directory and run real
   git against it — a faked git would only prove that the fake matches the code's assumptions.

2. **Every git invocation goes through one hardened layer (`git-command.ts`), and it never uses a
   shell.** `spawn` with an explicit argv array and `shell: false` means shell metacharacters in a
   caller-supplied locator, revision, or path are inert — there is no shell to interpret them. That
   removes command injection but **not argument injection**, which is the real risk with git: an
   argument beginning with `-` is parsed as an option, and `--upload-pack=<command>` is the classic
   path from "a path string" to "arbitrary execution". So `assertSafeRevision`/`assertSafePath`/
   `assertSafeRemote` reject leading `-`, NUL, and `..` segments explicitly, and every call site
   passes `--` before user-supplied paths. Three further hardening choices, all because this
   connector's whole job is reading a repository Phoenix did not create:
   `protocol.ext.allow=never` (the `ext::` transport runs an arbitrary command as the transport),
   `core.fsmonitor=false` (a checkout's own `.git/config` can name an executable git would run), and
   `GIT_TERMINAL_PROMPT=0`/`GIT_ASKPASS=` (without them, a private repository with no credential
   blocks forever on an interactive prompt instead of failing).

3. **The revision is resolved to an immutable full SHA exactly once, at `open`, and every subsequent
   read is addressed against it.** `git rev-parse --verify <ref>^{commit}` resolves whatever the
   descriptor asked for — branch, tag, SHA, or `HEAD` — and that SHA is what `list`/`read` use, what
   lands in `Source.version` via `descriptorToSource`, and what becomes `Evidence.sourceVersion`.
   The alternative (resolving per operation) means a branch moving mid-run yields a bundle whose
   artifacts come from two different revisions while claiming one, which is precisely the failure
   ADR 0013 decision 6 exists to prevent. This is also why `revisionPinning: true` is honest here.

4. **Phoenix never handles a git credential.** `credential.scheme` other than `'none'` is _rejected_
   with a message pointing at git's own credential helper or an SSH agent. ADR 0013 decision 8
   established that a descriptor references a credential and never carries one; resolving that
   reference into a secret would put the secret in this package's memory, upstream of
   `packages/redaction-hardening`'s trust boundary, for no gain — git already has three working
   mechanisms for authenticating, and a pre-authenticated checkout or configured helper covers every
   real deployment. Refusing loudly beats accepting a `ref` and silently ignoring it.

5. **Source files are read from the tree at the pinned revision, never from the working directory.**
   `git ls-tree -r -l -z <sha>` lists and `git cat-file blob <oid>` reads. This makes uncommitted
   edits and untracked files invisible _by construction_ rather than by a filter that could be
   misconfigured — a scan is reproducible from the SHA alone. Three details follow from it: `-z`
   (NUL-delimited) so a path containing a newline parses correctly and git does not quote non-ASCII
   paths; blobs addressed by **object id** rather than `<rev>:<path>`, since git has already
   confirmed the oid exists and a path is caller-influenced; and `contentHash` reported as
   `{ algorithm: 'git-blob-sha1', value: <oid> }` — git's own object id, verifiable outside Phoenix
   with `git cat-file`, rather than a digest this connector computed. Remote clones use
   `--no-checkout`, because a working tree is never read and materializing one is pure cost.

6. **Commit author identity is opt-in (`includeAuthorMetadata`, default false); everything else about
   the commit is always reported.** A name and email are personal data, this package sits _upstream_
   of `packages/redaction-hardening`, and `sourceMetadata` flows toward output. The default therefore
   collects the metadata that describes the _code_ (resolved SHA, committer date, subject, tags,
   default branch, remote URL, shallowness, tracked file count) and omits the metadata that
   identifies a _person_ until a consumer states it needs attribution.

7. **File history costs one extra `git log` pass for the whole repository, not one call per file.**
   `git log --format=%H%x1f%cI --name-only --no-renames <sha>` walks newest-first and the first
   commit seen for a path wins, giving every artifact its `lastModifiedAt` and
   `attributes.lastCommitRevision`. Per-file `git log -1 -- <path>` would be O(files) subprocesses —
   unaffordable on a large repository, which is what would push a caller to disable history
   altogether and leave `ArtifactFilter.changedSince` with nothing to filter on
   (`includeFileHistory: false` remains available for the fastest possible listing). `%x1f` (ASCII
   unit separator) is the field delimiter because a commit subject can legitimately contain any
   printable character a more obvious delimiter might use.

8. **`subpaths` are pushed down to git as pathspecs**, on both the `ls-tree` and the `log` pass,
   rather than listing the whole tree and discarding most of it — which is what makes
   `subtreeFiltering: true` a truthful declaration rather than a restatement of
   `matchesArtifactFilter`. The descriptor's `filter` is still applied through the shared
   `matchesArtifactFilter`, never reimplemented (ADR 0013 decision 5).

9. **Binary content is detected with git's own heuristic and base64-encoded, never decoded as
   text.** `runGitBinary` returns raw bytes; a NUL byte in the first 8000 means binary (exactly
   git's rule); UTF-8 decoding happens only after that check. Decoding a jar as UTF-8 would corrupt
   it silently, which is worse than refusing it.

10. **Identity is decoupled from location (`repository.workingTreePath`).** `descriptor.locator` is
    the stable name that lands on `Source.locator` and, composed with each path, on every
    `Evidence.locator`. Pointing git at a local checkout by putting that checkout's absolute path in
    the locator therefore stamps a machine-local path into OKF output, so the same repository
    analyzed on two build agents produces different provenance — which ADR 0013 decision 9's
    determinism requirement does not allow. `workingTreePath` says where the repository _is_ while
    `locator` says what it _is_. A `repo://` locator with no `workingTreePath` is rejected with that
    instruction, rather than having its scheme stripped and being handed to git as a relative path.

11. **A `file://` locator is passed through to git untouched for a clone, and reduced to a path only
    for `local-directory`.** `git -C` needs a filesystem path, not a URL — hence the reduction. But
    `file://` also _selects git's file transport_, and rewriting it to a bare path silently opts into
    git's local-clone optimization instead, which **ignores `--depth`** (`warning: --depth is ignored
in local clones; use file:// instead`). A caller who asked for `cloneDepth: 1` would get full
    history, with `metadata.shallow` correctly but confusingly reporting `false`.

12. **Failures keep ADR 0013 decision 7's split, with git's stderr as the classifier.** A per-artifact
    problem is data: `classifyReadFailure` maps git's stderr onto the closed `ArtifactFailureReason`
    vocabulary (`not-found`/`access-denied`/`transport-error`/`too-large`/`unreadable`), so one
    unreadable blob does not abort a 40,000-file run. A source-level problem throws: an invalid
    descriptor, an unsupported `kind`, a credential scheme this connector will not resolve, a
    non-existent directory, or a failed clone. `GitCommandError` carries argv, exit code, signal, and
    stderr precisely so callers can make that distinction instead of pattern-matching a message.

13. **Resource limits are enforced at both layers, and a temporary clone is always cleaned up.**
    Per-command timeout (60s default; 5min for clone, which is network-bound), a bounded stdout
    buffer, bounded stderr accumulation, and a per-artifact ceiling (16 MiB default, tightened by
    `filter.maxSizeBytes` when that is smaller) that produces a `too-large` failure _before_ reading
    rather than after buffering. A clone is removed on `close`, and also if `open` throws after
    creating it — a `try`/`catch` around everything post-clone, since a session the caller never
    receives can never be closed by the caller.

### Amendments to the P3-01 contract

Building the first real connector found three places where ADR 0013's shapes were insufficient. All
three are **additive** — no existing field changed meaning, and the reference connector plus all 119
P3-01 tests continue to pass unmodified:

1. **`ConnectorSession.sourceMetadata?: Record<string, KnowledgeValue>` and
   `RawArtifact.attributes?: Record<string, KnowledgeValue>`.** "Read repository metadata" is a third
   of this ticket and P3-01 had nowhere to put it: `ConnectorSession` exposed only `descriptor`/
   `source`/`revision`, and `RawArtifact` had no room for "the commit this file last changed in".
   Both bags are free-form because the content is irreducibly source-kind-specific — a repository, a
   wiki space, and a ticket project share almost nothing here, so a closed shape would be either
   empty or wrong. Both are typed by `KnowledgeValue` so they are assignable without a cast, and both
   are documented as **facts about the artifact as an artifact**, not a back door for extracted
   meaning (a parsed class name belongs on a `CanonicalKnowledgeObject`). Precedent: the `attributes`
   bag P2-03 added to `CanonicalKnowledgeRelationship`.

2. **`SourceConnector.sourceType` → `sourceTypes: readonly SourceType[]`.** P3-01 modelled a
   connector as serving one `SourceType`. A git repository routinely holds source code, data models,
   tests, and documentation, and it is the _descriptor_ that says which — so a single-value field
   forced either one connector instance per type or a false declaration. `descriptorToSource` still
   records `descriptor.sourceType`; `sourceTypes` only states what the connector is willing to be
   asked for.

3. **`RepositoryCoordinates.workingTreePath?: string`.** See decision 10.

## Testing

`packages/ingestion-connectors/tests/` — 178 tests across 7 files: P3-01's five files unchanged at
119 plus 2 new `descriptor.test.ts` cases for `workingTreePath`, and 57 new ones in the two files
this ticket adds, all against the real `git` binary (decision 1):

- **`git-command.test.ts`** — the safety layer directly: argument-injection rejection
  (leading `-`, NUL, `..`, `ext::`), timeout and max-buffer enforcement, `GitCommandError` carrying
  argv/exit code/stderr, and binary stdout surviving as bytes.
- **`git-connector.test.ts`** — a real Java-shaped repository built in a temp directory with two
  dated commits, a tag, a binary artifact, an excluded `node_modules`/`target`, plus an uncommitted
  edit and an untracked file, organized by the ticket's three deliverables:
  - _repository metadata_ — every field checked against what git independently reports; author
    identity absent by default and present only on opt-in.
  - _revisions_ — a branch and a tag resolving to the same SHA; reading the **first** commit and
    seeing the file as it was then, not as HEAD has it.
  - _source files_ — the tracked tree listed; the uncommitted edit and untracked file provably
    invisible; `contentHash` equal to the oid `git rev-parse <sha>:<path>` reports; a binary artifact
    base64-round-tripping byte-for-byte; sizes available before reading.
  - _file history, filtering, failures, lifecycle, identity vs. location_ — including the temporary
    clone removed on `close`, a shallow clone reported as shallow (which is what pins decision 11),
    `close` idempotent and blocking further use, and machine-local paths provably absent from
    artifact locators under `workingTreePath`.
  - _end to end_ — real git output assembled into a bundle that passes the real
    `validateCanonicalKnowledgeBundle`/`validateSourceReferences`/`validateOkfDocument` and
    round-trips through `serializeOkfYaml`/`parseAndValidateOkfYaml`, with every `Evidence.sourceVersion`
    equal to the real SHA.

Timestamps are compared as **instants**, not strings: git renders `%cI` with a `Z` suffix for a zero
UTC offset from 2.42 onward and `+00:00` before it, so asserting exact text would pin the suite to a
git version while proving nothing extra (`ArtifactFilter.changedSince` compares with `Date.parse`
too).

## Consequences

Phoenix can now ingest a real repository — local checkout or remote clone — and the output plugs into
the canonical model with no hand-assembly: `Source.version` and every `Evidence.sourceVersion` carry
a real immutable SHA, and every `contentHash` is a git object id anyone can verify outside Phoenix.
`extraction-engine` (P3-03 onward) can be developed against real Java files instead of fixtures.

The costs, accepted deliberately:

- **`git` must be installed** wherever ingestion runs, and this package now spawns subprocesses,
  which makes it the first component with an environmental prerequisite beyond Node.
- **Ingestion is now I/O- and time-bound**, so timeouts and size ceilings are load-bearing rather
  than defensive; a caller that overrides them owns the consequences.
- **A remote clone writes to disk** (the OS temp directory by default) for the duration of a session.

## Limitations

- **`archive` is not served.** `supports()` returns false for it so `selectConnector` can hand it to a
  future connector, and `open` rejects it with a specific message.
- **Submodules are not traversed.** `ls-tree -r` reports a submodule as a `commit` entry, which this
  connector skips: reading it would mean recursively cloning a second repository with its own
  authentication and revision, which is a ticket of its own, not a footnote to this one.
- **Git LFS pointers are read as their pointer text**, not the resolved large object. That is what is
  in the tree at the revision; resolving LFS requires a separate fetch and its own credentials.
- **No single-artifact streaming**, inherited from ADR 0013: `RawArtifact.content` is a whole string,
  so `maxArtifactBytes` plus a `too-large` failure remains the mitigation.
- **`--no-renames` on the history pass** means a renamed file's `lastModifiedAt` is the date of the
  rename, not of the content's last real change. Rename detection is O(tree) work per commit and the
  cheaper answer is the one a `changedSince` scan actually wants (the file at this path did change).
- **A shallow clone (the `cloneDepth: 1` default) cannot support real history analysis.** This is why
  `metadata.shallow` exists and is reported: a consumer that needs history must set `cloneDepth: 0`
  rather than assume.
- **`defaultBranch` is only known when `refs/remotes/origin/HEAD` exists**, which is true for a clone
  and often false for a local checkout. It is omitted rather than guessed.
- **No incremental _fetch_.** `changedSince` filters an already-listed tree; it does not narrow what
  git transfers. A genuinely incremental ingestion run (fetch only what changed since the last SHA)
  belongs with run orchestration, which does not exist yet.

## Alternatives considered

- **A pure-JS git implementation (`isomorphic-git`, `nodegit`)** — rejected, see decision 1. Removing
  the `git` prerequisite is genuinely attractive, but it trades it for trusting a reimplementation of
  packfiles, shallow clones, and object-id computation, where being subtly wrong means emitting
  provenance that disagrees with `git` itself.
- **Mocking git in tests** — rejected: it would verify that the mock matches the code's assumptions
  about git, which is the one thing not in doubt. The real cost is ~25s of suite time.
- **Reading the working directory (`fs.readdir`) instead of the tree** — rejected, see decision 5. It
  is simpler and admits uncommitted edits, untracked junk, and `.git` internals into a scan that
  claims to be reproducible from a SHA.
- **Resolving credentials from `credential.ref`** — rejected, see decision 4. It would place secrets
  in this package upstream of the redaction boundary to duplicate what git already does.
- **Always collecting commit author identity** — rejected, see decision 6. Convenient for attribution,
  but it makes personal data the default in a structure that flows to output.
- **One `git log -1 -- <path>` per file for accurate history** — rejected, see decision 7: O(files)
  subprocesses, whose practical effect is that history gets switched off entirely.
- **Computing our own sha256 of each blob** — rejected: git's oid is already there, costs nothing, and
  is verifiable with `git cat-file` outside Phoenix. A second digest would invite the question of
  which one is authoritative.
- **Shelling out via `exec`/`execSync` with a command string** — rejected outright, see decision 2.
- **Reporting `shallow` by counting commits** — rejected: `rev-parse --is-shallow-repository` is git's
  own answer, and a count cannot distinguish a shallow clone from a genuinely short history.
