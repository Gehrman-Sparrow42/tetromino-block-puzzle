import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const gameScenePath = path.resolve('src/GameScene.ts');
const gameSceneBackup = path.resolve('src/GameScene.ts.bak');

if (!fs.existsSync(gameScenePath)) {
  console.error('src/GameScene.ts not found!');
  process.exit(1);
}

// 1. Back up the original file
fs.copyFileSync(gameScenePath, gameSceneBackup);

try {
  let content = fs.readFileSync(gameScenePath, 'utf8');
  
  // 2. Perform replacements to disable ads and make bannerH = 0
  content = content.replaceAll('const bannerH = Math.max(50, h * 0.1);', 'const bannerH = 0;');
  
  // Hide ad banner components
  content = content.replace(
    'this.adBannerBg = this.add.rectangle(0, 0, 10, 10, 0x111118, 1).setDepth(30);',
    'this.adBannerBg = this.add.rectangle(0, 0, 10, 10, 0x111118, 1).setDepth(30).setVisible(false);'
  );
  content = content.replace(
    `this.adBannerText = this.add.text(0, 0, 'AD BANNER PLACEHOLDER', {`,
    `this.adBannerText = this.add.text(0, 0, 'AD BANNER PLACEHOLDER', {`
  );
  content = content.replace(
    'this.adBannerBg.setSize(w, bannerH).setPosition(w / 2, h - bannerH / 2);',
    'this.adBannerBg.setSize(w, bannerH).setPosition(w / 2, h - bannerH / 2).setVisible(false);'
  );
  content = content.replace(
    'this.adBannerText.setPosition(w / 2, h - bannerH / 2);',
    'this.adBannerText.setPosition(w / 2, h - bannerH / 2).setVisible(false);'
  );

  // Write temporary file
  fs.writeFileSync(gameScenePath, content, 'utf8');
  console.log('Temporary GameScene.ts created (ads removed).');

  // 3. Run production build
  console.log('Building clean package...');
  execSync('npm run build', { stdio: 'inherit' });

  // 4. Move output files to temp location outside dist to avoid Vite emptyOutDir wiping them
  const indexHtml = path.resolve('dist/index.html');
  const indexOHtml = path.resolve('dist/index_o.html');
  
  const tempCleanHtml = path.resolve('index_clean.tmp');
  const tempCleanOHtml = path.resolve('index_clean_o.tmp');

  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, tempCleanHtml);
    console.log('Saved clean HTML to temp backup.');
  }
  if (fs.existsSync(indexOHtml)) {
    fs.copyFileSync(indexOHtml, tempCleanOHtml);
    console.log('Saved clean Obfuscated HTML to temp backup.');
  }

} catch (err) {
  console.error('Error during clean build:', err);
} finally {
  // 5. Restore original GameScene.ts
  if (fs.existsSync(gameSceneBackup)) {
    fs.copyFileSync(gameSceneBackup, gameScenePath);
    fs.unlinkSync(gameSceneBackup);
    console.log('Original GameScene.ts restored.');
  }
  
  // 6. Re-run normal build to restore normal dist/index.html & dist/index_o.html (wipes dist folder)
  console.log('Re-building original package with ads...');
  execSync('npm run build', { stdio: 'inherit' });

  // 7. Move temp files back to dist/
  const cleanHtml = path.resolve('dist/index_clean.html');
  const cleanOHtml = path.resolve('dist/index_clean_o.html');
  const tempCleanHtml = path.resolve('index_clean.tmp');
  const tempCleanOHtml = path.resolve('index_clean_o.tmp');

  if (fs.existsSync(tempCleanHtml)) {
    fs.copyFileSync(tempCleanHtml, cleanHtml);
    fs.unlinkSync(tempCleanHtml);
    console.log('Created clean HTML: ' + cleanHtml);
  }
  if (fs.existsSync(tempCleanOHtml)) {
    fs.copyFileSync(tempCleanOHtml, cleanOHtml);
    fs.unlinkSync(tempCleanOHtml);
    console.log('Created clean Obfuscated HTML: ' + cleanOHtml);
  }
}
