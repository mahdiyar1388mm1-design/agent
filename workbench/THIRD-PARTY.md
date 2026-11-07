# Orbit Agent — third-party notices

Orbit Agent is an independent, unofficial local application, not endorsed by Arena, Dahl, OpenAI, Microsoft or Google. Names of hosted services and model IDs identify user-selected services; no model weights, account cookies, API keys or service entitlement are bundled.

## Added runtime components

- **Vazirmatn Variable font** — Vazirmatn Project Authors, SIL Open Font License 1.1. Pinned fontsource distribution 5.3.0. Original source: https://github.com/rastikerdar/vazirmatn . Arabic and Latin WOFF2 subsets and the original OFL are included under `assets/fonts/`. No external font request is made.


- **Playwright Core 1.65.0** — Microsoft Corporation, Apache License 2.0. Source: https://github.com/microsoft/playwright . License and notices are retained in the packaged production dependency. No Playwright browser distribution is bundled; the user installs Google Chrome separately. https://github.com/microsoft/playwright/blob/v1.65.0/LICENSE
- **Model Context Protocol TypeScript SDK 1.32.2** — Anthropic, PBC, MIT License. Source: https://github.com/modelcontextprotocol/typescript-sdk . Its MIT license and licenses of production dependencies are retained in the packaged application. https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE

Build-only Electron Builder, test tools and their dependencies are not installed as runtime tools on the user's system. Production JavaScript dependency license files are packaged under `resources/app.asar/node_modules/`; applicable source/license URLs also appear in their package metadata.

## Electron and portable Git/GitHub CLI

The Windows build contains Electron 45.2.3 and the same pinned official MinGit 2.56.0.4 / GitHub CLI 2.103.3 distributions documented below. Their license/source notices and available distribution license files are included. No credentials or environment/configuration from the build machine are copied.

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
