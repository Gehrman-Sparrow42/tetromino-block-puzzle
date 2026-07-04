import fs from 'fs';
import path from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const htmlPath = path.resolve('dist/index.html');
if (!fs.existsSync(htmlPath)) {
  console.error('dist/index.html not found! Run npm run build first.');
  process.exit(1);
}

let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Find the script tag
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
const match = htmlContent.match(scriptRegex);

if (match) {
  const originalJs = match[1];
  console.log('Obfuscating JavaScript content (length: ' + originalJs.length + ')...');
  
  const obfuscatedResult = JavaScriptObfuscator.obfuscate(originalJs, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false, // keep file size manageable
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 0.75
  });
  
  const obfuscatedJs = obfuscatedResult.getObfuscatedCode();
  
  // Replace the original JS inside the script tag
  const scriptTagMatch = match[0];
  const openingTag = scriptTagMatch.substring(0, scriptTagMatch.indexOf('>') + 1);
  const newScriptTag = openingTag + '\n' + obfuscatedJs + '\n</script>';
  
  htmlContent = htmlContent.replace(scriptTagMatch, newScriptTag);
  
  const obfHtmlPath = path.resolve('dist/index_o.html');
  fs.writeFileSync(obfHtmlPath, htmlContent, 'utf8');
  console.log('Obfuscation complete! Saved obfuscated version as: dist/index_o.html');
} else {
  console.error('Could not find script tag in dist/index.html');
}
