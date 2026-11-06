module.exports = {
  appId: 'io.github.mahdiyar1388mm1.arena-desktop',
  productName: 'Arena Desktop',
  copyright: 'Unofficial community wrapper. Not affiliated with Arena.',
  asar: true,
  npmRebuild: false,
  compression: 'maximum',
  // The pinned official npm package includes Electron's SHA-256 manifest.
  // Verify against it without a second network request for SHASUMS256.txt.
  electronDownload: { checksums: require('electron/checksums.json') },
  directories: {
    output: 'dist',
    buildResources: 'assets',
  },
  files: [
    'src/**/*',
    'assets/icon.png',
    'assets/icon.ico',
    'assets/icon.svg',
    'README.md',
    'TERMINAL.md',
    'GITHUB.md',
    'THIRD-PARTY.md',
    'assets/portable-tools.json',
    'package.json',
  ],
  extraResources: [{ from: 'build/portable-tools/tools', to: 'tools' }],
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/icon.ico',
    requestedExecutionLevel: 'asInvoker',
    // Builder 26.18 edits PE resources in JavaScript, so Wine is not required.
    // Apply the custom icon/metadata, but do not claim a signed publisher.
    signExecutable: false,
    artifactName: 'Arena-Desktop-Setup-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Arena Desktop',
    uninstallDisplayName: 'Arena Desktop (Unofficial)',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    deleteAppDataOnUninstall: false,
  },
};
