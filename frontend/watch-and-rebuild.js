const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let lastHashes = {};
let isBuilding = false;

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  } catch (e) {
    return null;
  }
}

function getFilesRecursive(dir, filter = []) {
  const files = [];
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (item === 'node_modules' || item === 'dist' || item.startsWith('.')) return;

      if (stat.isDirectory()) {
        files.push(...getFilesRecursive(fullPath, filter));
      } else if (item.endsWith('.ts') || item.endsWith('.html') || item.endsWith('.scss')) {
        files.push(fullPath);
      }
    });
  } catch (e) {
    console.error('Error reading dir:', e.message);
  }
  return files;
}

function checkForChanges() {
  const files = getFilesRecursive(path.join(__dirname, 'src'));
  const tsConfigFile = path.join(__dirname, 'tsconfig.server.json');
  files.push(tsConfigFile);

  let changed = false;
  const currentHashes = {};

  files.forEach(file => {
    const hash = hashFile(file);
    currentHashes[file] = hash;

    if (!lastHashes[file] || lastHashes[file] !== hash) {
      changed = true;
      console.log(`[WATCH] File changed: ${path.relative(__dirname, file)}`);
    }
  });

  // Check for deleted files
  Object.keys(lastHashes).forEach(file => {
    if (!currentHashes[file]) {
      changed = true;
      console.log(`[WATCH] File deleted: ${path.relative(__dirname, file)}`);
    }
  });

  lastHashes = currentHashes;
  return changed;
}

function rebuild() {
  if (isBuilding) return;

  isBuilding = true;
  console.log('\n[BUILD] Starting rebuild...');

  const build = spawn('npm', ['run', 'build:ssr'], {
    stdio: 'inherit',
    shell: true,
  });

  build.on('close', (code) => {
    if (code === 0) {
      console.log('[BUILD] Build complete, restarting server...\n');
      // Kill existing server and restart
      process.exit(0);
    } else {
      console.error(`[BUILD] Build failed with code ${code}`);
    }
    isBuilding = false;
  });
}

// Start server immediately
const serve = spawn('npm', ['run', 'serve:ssr'], {
  stdio: 'inherit',
  shell: true,
});

serve.on('close', () => {
  console.log('Server stopped, exiting...');
  process.exit(0);
});

// Poll for changes every 1 second
console.log('[WATCH] Starting file watcher (polling every 1s)...\n');
setInterval(() => {
  if (checkForChanges()) {
    rebuild();
  }
}, 1000);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[WATCH] Received SIGTERM, cleaning up...');
  serve.kill();
  process.exit(0);
});
