# Separately bundled command-line tools

Arena Desktop is an unofficial wrapper, not a product of Arena, Git, or GitHub. The Windows installer includes two unmodified, separately executed, official portable tools so the user does not need to install them or edit PATH. No account, credential file, token, Git config, or developer authentication is included.

## Git for Windows / MinGit

- Version: 2.56.0.windows.4, Windows x64, official MinGit distribution.
- Official release and binary archive: https://github.com/git-for-windows/git/releases/tag/v2.56.0.windows.4
- Corresponding Git for Windows source: https://github.com/git-for-windows/git/tree/v2.56.0.windows.4
- Source archive: https://github.com/git-for-windows/git/archive/refs/tags/v2.56.0.windows.4.tar.gz
- Git is licensed under GNU GPL version 2. The original archive's copyright, license and third-party notices are retained, unmodified, under `resources/tools/git/`. Bundled libraries and shell utilities have their own notices there. Git for Windows build/source-package information is maintained at https://github.com/git-for-windows/build-extra and https://github.com/git-for-windows/MINGW-packages.

This is aggregation of a separately invoked executable, not a claim that this application owns Git or changes its license. Consult the original distributed notices and source repositories for each component's license and source. Git's license and copyright must remain with redistributed copies.

## GitHub CLI

- Version: 2.103.3, Windows amd64, official portable ZIP.
- Release: https://github.com/cli/cli/releases/tag/v2.103.3
- Corresponding source and MIT license: https://github.com/cli/cli/tree/v2.103.3
- Original license and notices are preserved, unmodified, under `resources/tools/gh/`.

## Verification and updates

Pinned archive URLs, sizes and SHA-256 hashes are in `assets/portable-tools.json`. Build preparation verifies both size and SHA-256 before extraction. Package verification checks every prepared tool file against the packaged resource; Windows smoke tests actually run the packaged Git and gh with a temporary, empty configuration. Updating these executables requires a newly reviewed/rebuilt installer; the application does not silently install or update tools.

Electron, Chromium and JavaScript build dependencies retain their respective licenses/notices. No affiliation, signed-publisher status or permanent website compatibility is implied.
