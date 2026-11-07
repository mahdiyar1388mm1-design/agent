'use strict';
const shared = ['github-tools.cjs', 'github-errors.cjs', 'github-policy.cjs', 'github-projects.cjs', 'session-permissions.cjs', 'terminal-protocol.cjs', 'tool-paths.cjs', 'site-adapter.cjs', 'policy.cjs'];
module.exports = {
  appId: 'io.github.mahdiyar1388mm1.orbit-agent', productName: 'Orbit Agent', copyright: 'Unofficial independent local workbench. Not affiliated with Arena or Dahl.',
  asar: true, npmRebuild: false, compression: 'maximum', electronDownload: { checksums: require('electron/checksums.json') },
  directories: { output: 'dist', buildResources: 'assets' },
  files: ['src/**/*', 'assets/icon.png', 'assets/icon.ico', 'assets/fonts/**/*', 'README.md', 'THIRD-PARTY.md', 'package.json',
    { from: '../desktop/src', to: 'src/shared', filter: shared }, { from: '../desktop/GITHUB.md', to: 'GITHUB.md' }],
  extraResources: [{ from: '../desktop/build/portable-tools/tools', to: 'tools' }],
  electronFuses: { runAsNode: false, enableCookieEncryption: true, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true },
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/icon.ico', requestedExecutionLevel: 'asInvoker', signExecutable: false, artifactName: 'Orbit-Agent-Setup-${version}-${arch}.${ext}' },
  nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true,
    shortcutName: 'Orbit Agent', uninstallDisplayName: 'Orbit Agent (Unofficial)', installerIcon: 'assets/icon.ico', uninstallerIcon: 'assets/icon.ico', deleteAppDataOnUninstall: false },
};
