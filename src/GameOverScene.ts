import * as Phaser from 'phaser';
import { YTSDK } from './YTSDK';
import { GameScene } from './GameScene';

export class GameOverScene extends Phaser.Scene {
  private finalScore: number = 0;
  private level: number = 1;
  private GameScene!: GameScene;
  private hasUsedContinue: boolean = false;
  private uiContainer!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { score: number, level: number, GameScene: GameScene }) {
    this.finalScore = data.score || 0;
    this.level = data.level || 1;
    this.GameScene = data.GameScene;
    this.hasUsedContinue = false;
  }

  async create() {
    this.cameras.main.setBackgroundColor('rgba(26, 26, 46, 0.9)'); 
    this.uiContainer = this.add.container(0, 0);

    // Fetch and Submit Leaderboard async
    YTSDK.submitHighScore(this.finalScore);
    const highScore = await YTSDK.fetchLeaderboard();

    const title = this.add.text(0, -150, 'GAME OVER', {
      fontSize: '128px',
      color: '#ff0033',
      fontStyle: '900',
      fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(title);

    const scoreText = this.add.text(0, -50, `FINAL SCORE: ${this.finalScore}`, {
      fontSize: '64px',
      color: '#ffffff',
      fontFamily: '"Orbitron", monospace'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(scoreText);

    const highScoreText = this.add.text(0, 0, `HIGH SCORE: ${highScore}`, {
      fontSize: '56px',
      color: '#00ffff',
      fontFamily: '"Orbitron", monospace'
    }).setOrigin(0.5).setScale(0.5);
    this.uiContainer.add(highScoreText);

    // Watch Ad to Continue Button
    if (!this.hasUsedContinue && this.GameScene) {
      const continueBtn = this.add.rectangle(0, 100, 440, 50, 0x00aa00, 1)
        .setStrokeStyle(3, 0x00ff00)
        .setInteractive({ useHandCursor: true });
        
      const continueText = this.add.text(0, 100, 'WATCH AD TO CONTINUE', {
        fontSize: '32px', color: '#ffffff', fontStyle: 'bold', fontFamily: '"Orbitron", sans-serif'
      }).setOrigin(0.5).setScale(0.5);
      
      this.uiContainer.add([continueBtn, continueText]);

      continueBtn.on('pointerdown', async () => {
        const success = await YTSDK.showRewardedAd(
          () => console.log("Ad opened"), 
          () => console.log("Ad closed")
        );
        if (success) {
          this.hasUsedContinue = true;
          this.GameScene.clearBottomLines(4);
          this.scene.resume('GameScene');
          this.scene.stop();
        } else {
          alert("Ad failed or skipped. Cannot continue.");
        }
      });
    }

    // Restart Button
    const restartBtn = this.add.rectangle(0, 170, 240, 50, 0x111111, 1)
      .setStrokeStyle(3, 0x00ffff)
      .setInteractive({ useHandCursor: true });
    
    const restartText = this.add.text(0, 170, 'RESTART', {
      fontSize: '48px', color: '#00ffff', fontStyle: 'bold', fontFamily: '"Orbitron", sans-serif'
    }).setOrigin(0.5).setScale(0.5);
    
    this.uiContainer.add([restartBtn, restartText]);

    restartBtn.on('pointerdown', () => {
      if (this.GameScene) this.scene.stop('GameScene');
      this.scene.start('GameScene', { startLevel: this.level });
    });

    this.handleResize();
    this.scale.on('resize', this.handleResize, this);
  }

  private handleResize() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    if (this.uiContainer) {
      this.uiContainer.setPosition(width / 2, height / 2);
    }
  }
}
