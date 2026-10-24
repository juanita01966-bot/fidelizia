const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'FIDELIZIA_CODEBASE_DIGEST.txt');

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.user_uploaded',
  '.system_generated',
  '.gemini',
  'dist',
  'build'
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.cjs',
  '.json',
  '.css',
  '.md'
]);

const EXCLUDED_FILES = new Set([
  'package-lock.json',
  'FIDELIZIA_CODEBASE_DIGEST.txt'
]);

function isSensitiveFile(filename) {
  const lower = filename.toLowerCase();
  return (
    lower.startsWith('dynamind') ||
    lower.startsWith('service-account') ||
    lower.startsWith('.env') ||
    lower.endsWith('.pem') ||
    lower.endsWith('.p12') ||
    lower.endsWith('.key')
  );
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relPath = path.relative(ROOT_DIR, fullPath);

    if (EXCLUDED_FILES.has(file) || isSensitiveFile(file)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.has(file)) {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        arrayOfFiles.push(fullPath);
      }
    }
  }

  return arrayOfFiles;
}

console.log('📦 Empaquetando Fidelizia para Gemini Argón (Navegador)...');

const allFiles = getAllFiles(ROOT_DIR);
let digestContent = '';

digestContent += '================================================================================\n';
digestContent += '🏛️ FIDELIZIA LOYALTY SUITE - CODEBASE COMPLETO PARA AUDITORÍA SUPREMA DE ARGÓN\n';
digestContent += `Fecha de Generación: ${new Date().toISOString()}\n`;
digestContent += `Total de Archivos de Código Fuente: ${allFiles.length}\n`;
digestContent += 'Arquitectura: Next.js 15 App Router + Tailwind CSS + Zustand/LocalStorage + Google Wallet API RS256\n';
digestContent += '================================================================================\n\n';

digestContent += '--- ÁRBOL DE ARCHIVOS INCLUIDOS ---\n';
allFiles.forEach(f => {
  digestContent += `- ${path.relative(ROOT_DIR, f).replace(/\\/g, '/')}\n`;
});
digestContent += '\n================================================================================\n\n';

let totalLines = 0;

for (const filePath of allFiles) {
  const relPath = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    totalLines += lines;

    digestContent += `================================================================================\n`;
    digestContent += `FILE: ${relPath} (${lines} líneas)\n`;
    digestContent += `================================================================================\n`;
    digestContent += content;
    digestContent += '\n\n';
  } catch (err) {
    console.warn(`No se pudo leer ${relPath}:`, err.message);
  }
}

fs.writeFileSync(OUTPUT_FILE, digestContent, 'utf-8');
const stats = fs.statSync(OUTPUT_FILE);
const sizeKb = (stats.size / 1024).toFixed(1);

console.log(`✅ Codebase Digest generado con éxito!`);
console.log(`📄 Archivo: ${OUTPUT_FILE}`);
console.log(`📊 Tamaño: ${sizeKb} KB`);
console.log(`📝 Total de líneas de código empaquetadas: ${totalLines}`);
