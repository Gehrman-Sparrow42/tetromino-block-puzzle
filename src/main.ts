import * as Phaser from 'phaser';
import { GameScene } from './GameScene';
import { MenuScene } from './MenuScene';
import { GameOverScene } from './GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'app',
  backgroundColor: '#1a1a2e',
  antialias: true,
  // @ts-ignore
  resolution: Math.max(2, window.devicePixelRatio || 2),
  scene: [MenuScene, GameScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

new Phaser.Game(config);
