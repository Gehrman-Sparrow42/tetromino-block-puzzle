import * as Phaser from 'phaser';
import { SHAPES } from './Tetrominoes';

export class MenuScene extends Phaser.Scene {
  private startLevel: number = 1;
  private uiContainer!: Phaser.GameObjects.Container;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private performanceMode: boolean = false;

  private title!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private levelLabel!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private minusBtn!: Phaser.GameObjects.Text;
  private plusBtn!: Phaser.GameObjects.Text;
  private playBtn!: Phaser.GameObjects.Rectangle;
  private playText!: Phaser.GameObjects.Text;

  private titleOffset = { y: 0 };
  private titleBaseY: number = -150;
  
  private fallingShapes: { graphics: Phaser.GameObjects.Graphics, speed: number, size: number }[] = [];
  private nextSpawnTime: number = 0;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    this.performanceMode = localStorage.getItem('blockPuzzlePerformanceMode') === 'true';
    this.cameras.main.setBackgroundColor('#0b0c10'); // matching dark gameplay theme
    
    // Static background graphics for the cyber grid
    this.bgGraphics = this.add.graphics().setDepth(0);
    this.uiContainer = this.add.container(0, 0).setDepth(10);

    const highScore = localStorage.getItem('block_puzzle_highscore') || '0';

    this.title = this.add.text(0, -150, 'TETROMINO BLOCK PUZZLE', {
      fontSize: '128px',
      color: '#00ffff',
      fontStyle: '900',
      fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5).setStroke('#0088ff', 8);
    this.uiContainer.add(this.title);

    this.tweens.add({
      targets: this.titleOffset,
      y: -10,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    this.highScoreText = this.add.text(0, -70, `HIGH SCORE: ${highScore}`, {
      fontSize: '56px',
      color: '#ff00ff',
      fontFamily: '"Orbitron", monospace'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(this.highScoreText);

    this.tweens.add({
      targets: this.highScoreText,
      alpha: 0.6,
      scaleX: 0.52,
      scaleY: 0.52,
      duration: 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    this.levelLabel = this.add.text(0, 0, 'STARTING LEVEL', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(this.levelLabel);

    this.levelText = this.add.text(0, 40, `${this.startLevel}`, {
      fontSize: '96px',
      color: '#ffff00',
      fontStyle: 'bold',
      fontFamily: '"Orbitron", monospace'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(this.levelText);

    this.minusBtn = this.add.text(-80, 40, '<', {
      fontSize: '96px', color: '#ffaa00', fontStyle: 'bold', fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5).setInteractive({ useHandCursor: true });
    this.minusBtn.on('pointerdown', () => this.changeLevel(-1));
    this.uiContainer.add(this.minusBtn);

    this.plusBtn = this.add.text(80, 40, '>', {
      fontSize: '96px', color: '#ffaa00', fontStyle: 'bold', fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5).setInteractive({ useHandCursor: true });
    this.plusBtn.on('pointerdown', () => this.changeLevel(1));
    this.uiContainer.add(this.plusBtn);

    this.playBtn = this.add.rectangle(0, 150, 240, 60, 0x111111, 1)
      .setStrokeStyle(3, 0x00ff00)
      .setInteractive({ useHandCursor: true });
    this.uiContainer.add(this.playBtn);
    
    this.playText = this.add.text(0, 150, 'PLAY NOW', {
      fontSize: '56px',
      color: '#00ff00',
      fontStyle: 'bold',
      fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(this.playText);

    this.tweens.add({
      targets: this.playBtn,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    this.playBtn.on('pointerdown', () => {
      this.tweens.add({
        targets: [this.playBtn, this.playText],
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 100,
        yoyo: true,
        onComplete: () => {
          this.scene.start('GameScene', { startLevel: this.startLevel });
        }
      });
    });

    this.handleResize();
    this.scale.on('resize', this.handleResize, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.handleResize, this);
    });
  }

  update(time: number, delta: number) {
    if (this.title) {
      this.title.y = this.titleBaseY + this.titleOffset.y;
    }

    // Spawn falling background outlines
    if (time > this.nextSpawnTime) {
      this.spawnFallingShape();
      this.nextSpawnTime = time + Phaser.Math.Between(800, 1500);
    }

    const dt = delta / 1000;
    const height = this.cameras.main.height;
    
    if (this.performanceMode) {
      if (this.fallingShapes.length > 0) {
        this.fallingShapes.forEach(s => s.graphics.destroy());
        this.fallingShapes = [];
      }
      return;
    }

    for (let i = this.fallingShapes.length - 1; i >= 0; i--) {
      const s = this.fallingShapes[i];
      s.graphics.y += s.speed * dt;
      if (s.graphics.y > height + s.size) {
        s.graphics.destroy();
        this.fallingShapes.splice(i, 1);
      }
    }
  }

  private spawnFallingShape() {
    const w = this.cameras.main.width;
    const shapeTypes: ('I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L')[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    const type = Phaser.Utils.Array.GetRandom(shapeTypes);
    const matrix = SHAPES[type][0];
    
    const size = Phaser.Math.Between(15, 25);
    const startX = Phaser.Math.Between(50, w - 100);
    const speed = Phaser.Math.Between(40, 75);
    
    const graphics = this.add.graphics().setDepth(1);
    const neonColors = [0x00ffff, 0xff00ff, 0xffff00, 0x00ff00, 0xff0000];
    const color = Phaser.Utils.Array.GetRandom(neonColors);
    
    graphics.lineStyle(1.5, color, 0.08); // faint outline opacity
    
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          graphics.strokeRect(c * size, r * size, size, size);
        }
      }
    }
    
    graphics.setPosition(startX, -100);
    this.fallingShapes.push({
      graphics,
      speed,
      size: matrix.length * size
    });
  }

  private changeLevel(delta: number) {
    this.startLevel += delta;
    if (this.startLevel < 1) this.startLevel = 1;
    if (this.startLevel > 10) this.startLevel = 10;
    this.levelText.setText(`${this.startLevel}`);

    // Snappy level text bounce
    this.tweens.add({
      targets: this.levelText,
      scaleX: 0.7 * Math.min(1.0, this.cameras.main.width / 600),
      scaleY: 0.7 * Math.min(1.0, this.cameras.main.width / 600),
      duration: 50,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.levelText.setScale(0.5 * Math.min(1.0, this.cameras.main.width / 600));
      }
    });
  }

  private handleResize() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    if (this.uiContainer) {
      this.uiContainer.setPosition(width / 2, height / 2);
    }

    const scaleFactor = Math.min(1.0, width / 600);
    
    this.titleBaseY = Math.min(-120, height * -0.2);
    if (this.title) {
      const targetScale = Math.min(0.5, (width * 0.9) / this.title.width);
      this.title.setScale(targetScale);
    }

    if (this.highScoreText) {
      this.highScoreText.y = Math.min(-65, height * -0.1);
      const targetScale = Math.min(0.5, (width * 0.8) / this.highScoreText.width);
      this.highScoreText.setScale(targetScale);
    }

    if (this.levelLabel) {
      this.levelLabel.y = 0;
      this.levelLabel.setScale(0.5 * scaleFactor);
    }

    if (this.levelText) {
      const lvlY = Math.max(35, height * 0.06);
      this.levelText.y = lvlY;
      this.levelText.setScale(0.5 * scaleFactor);
      
      if (this.minusBtn) {
        this.minusBtn.y = lvlY;
        this.minusBtn.x = -80 * scaleFactor;
        this.minusBtn.setScale(0.5 * scaleFactor);
      }
      if (this.plusBtn) {
        this.plusBtn.y = lvlY;
        this.plusBtn.x = 80 * scaleFactor;
        this.plusBtn.setScale(0.5 * scaleFactor);
      }
    }

    if (this.playBtn && this.playText) {
      const btnY = Math.max(110, height * 0.2);
      this.playBtn.y = btnY;
      this.playText.y = btnY;
      
      const btnScale = Math.min(1.0, (width * 0.6) / 240);
      this.playBtn.setScale(btnScale);
      this.playText.setScale(0.5 * btnScale);
    }

    if (this.bgGraphics) {
      this.bgGraphics.clear();
      if (!this.performanceMode) {
        this.bgGraphics.lineStyle(1, 0x00ffff, 0.03); // faint blue lines
        const bgGridSize = 50;
        for (let x = (width / 2) % bgGridSize; x < width; x += bgGridSize) {
          this.bgGraphics.moveTo(x, 0);
          this.bgGraphics.lineTo(x, height);
        }
        for (let y = (height / 2) % bgGridSize; y < height; y += bgGridSize) {
          this.bgGraphics.moveTo(0, y);
          this.bgGraphics.lineTo(width, y);
        }
        this.bgGraphics.strokePath();
      }
    }
  }
}
