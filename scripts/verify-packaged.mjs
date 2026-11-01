import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const executable = process.env.SAVEX_DESKTOP_EXECUTABLE || (process.platform === 'darwin'
  ? resolve('dist/desktop', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'saveXtension.app/Contents/MacOS/saveXtension')
  : resolve('dist/desktop/win-unpacked/saveXtension.exe'));
const child = spawn(process.execPath, ['--test', 'tests/desktop/packaged.test.mjs'], { stdio: 'inherit', env: { ...process.env, SAVEX_DESKTOP_EXECUTABLE: executable } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
