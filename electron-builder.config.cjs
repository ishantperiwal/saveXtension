module.exports = {
  appId: 'com.savextension.desktop', productName: 'saveXtension',
  directories: { output: 'dist/desktop', buildResources: 'desktop/assets' },
  files: ['desktop/**', 'server/**', 'public/**', 'package.json', '!**/*.map', '!public/fonts/*OFL*'],
  extraResources: [{ from: 'public/fonts', to: 'licenses', filter: ['*OFL*'] }, { from: 'extension', to: 'extension' }],
  asar: true, npmRebuild: false, publish: null,
  mac: { target: 'dmg', icon: 'desktop/assets/icon.icns', category: 'public.app-category.productivity', identity: '-', hardenedRuntime: true, entitlements: 'desktop/assets/entitlements.mac.plist', entitlementsInherit: 'desktop/assets/entitlements.mac.plist', notarize: false },
  dmg: { title: 'Install saveXtension', sign: false, contents: [{ x: 130, y: 130 }, { x: 410, y: 130, type: 'link', path: '/Applications' }] },
  win: { target: 'nsis', icon: 'desktop/assets/icon.ico', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, deleteAppDataOnUninstall: false, installerIcon: 'desktop/assets/icon.ico', uninstallerIcon: 'desktop/assets/icon.ico' },
  artifactName: 'saveXtension-${version}-${os}-${arch}.${ext}'
};
