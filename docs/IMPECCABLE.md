# Using Impeccable

Impeccable 4.7.0 is installed user-wide at `C:\Users\Berkay\.agents\skills\impeccable`. It can be used from other projects without copying it into each repository. The upstream source checkout is `C:\Tools\impeccable`.

## In Codex

Use the skill picker or type `$impeccable` followed by a task. Natural language also works: “Use Impeccable to review this settings screen.” A newly installed skill becomes available on the next turn; reload the app if it does not appear in the picker.

| Request                                       | Purpose                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `$impeccable init`                            | Capture a new project's purpose, users and constraints in `PRODUCT.md`.                      |
| `$impeccable shape settings`                  | Plan a particular interface or flow before implementation.                                   |
| `$impeccable critique controls`               | Review hierarchy, clarity and usability.                                                     |
| `$impeccable audit`                           | Inspect measurable accessibility, performance, theme and responsive issues; report findings. |
| `$impeccable polish settings`                 | Fix details while preserving the existing design and behavior.                               |
| `$impeccable distill home`                    | Reduce unnecessary content and interface clutter.                                            |
| `$impeccable adapt controls for small phones` | Improve a named surface for a device class.                                                  |
| `$impeccable document`                        | Record an existing visual system in `DESIGN.md`.                                             |
| `$impeccable live`                            | Start an interactive browser iteration session when requested.                               |

For a new project, give the agent the project path, describe its purpose and ask it to initialize Impeccable. For an existing project, specify whether you want a review, small fixes or a redesign. An audit reports issues; ask for fixes as well when that is what you want. The skill provides procedures for the coding agent; these design commands are not standalone AI model calls made by the terminal engine.

## Afterblock setup

- `PRODUCT.md` records the confirmed product brief.
- `.impeccable/config.json` sets code-first as the project default. It is a project preference, not a global aesthetic rule.
- `.impeccable/live/config.json` identifies the Vite `index.html` shell. No CSP was found, so no security policy was changed. Live mode has not been started or injected into the shipped game.
- `.impeccable/critique/setup-audit.md` records the first audit, its small settings-target fix and remaining limits.
- `DESIGN.md` and `.impeccable/design.json` record the completed thirteen-theme system. `.impeccable/surfaces/theme-pack.md` records the user's approval of all nine proposals and the shared gameplay constraints.
- Automatic edit hooks are not installed or active. Commands work through the skill and the detector can be run explicitly. If hooks are installed later, Codex may require approval through its hooks UI; do not treat installation as proof that hooks are running.

## Terminal tools on Windows

From a project's directory:

```powershell
& C:\Users\Berkay\.agents\skills\impeccable\scripts\impeccable.cmd --version
& C:\Users\Berkay\.agents\skills\impeccable\scripts\impeccable.cmd detect --json src/
& C:\Users\Berkay\.agents\skills\impeccable\scripts\impeccable.cmd update --providers=codex --scope=global
```

Detection exit code 0 means no primary findings, 2 means findings, and 1 means an operational failure. A clean detector result does not replace visual inspection or interaction tests. After updating personal skills, sync and verify the private `agent-skills` backup under the workspace instructions.

`C:\Tools\LAUNCHERS\Launch_Impeccable.bat` opens CLI help and accepts engine arguments. The skill does not add a runtime dependency to Afterblock or its APK.

Upstream: [pbakaus/impeccable](https://github.com/pbakaus/impeccable).
