import * as Phaser from 'phaser';
import { CONSTANTS } from './Constants';
import { SHAPES, WALL_KICKS, RandomBag, type TetrominoType } from './Tetrominoes';
import { AudioEngine, AudioSettings } from './ZzFX';

export class GameScene extends Phaser.Scene {
  private isPaused: boolean = false;
  private swipeStartX: number = 0;
  private swipeStartY: number = 0;
  private isSwiping: boolean = false;
  
  private mobileControlType: 'gestures' | 'dpad' = 'gestures';
  private vanillaMode: boolean = false;
  
  private dpadContainer!: Phaser.GameObjects.Container;
  private dpadBtns: {btn: Phaser.GameObjects.Arc, lbl: Phaser.GameObjects.Text}[] = [];
  
  private board: number[][] = [];
  private currentPiece: { type: TetrominoType, x: number, y: number, rotation: number } | null = null;
  private bag: RandomBag;
  
  private holdPiece: TetrominoType | null = null;
  private canHold: boolean = true;
  private dropTimer: number = 0;
  
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private controlState = { left: false, right: false, down: false };
  private keyState = {
    left: { isDown: false, time: 0 },
    right: { isDown: false, time: 0 },
    down: { isDown: false, time: 0 }
  };
  
  private lastDownTime: number = 0;
  private lockTimer: number = 0;
  private lockResets: number = 0;
  private isLocking: boolean = false;
  
  private graphics!: Phaser.GameObjects.Graphics;
  
  private score: number = 0;
  private level: number = 1;
  private linesCleared: number = 0;
  private comboCount: number = 0;
  private isClearingLines: boolean = false;
  private performanceMode: boolean = false;
  
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private holdLabel!: Phaser.GameObjects.Text;
  private nextLabel!: Phaser.GameObjects.Text;
  private holdBox!: Phaser.GameObjects.Rectangle;
  private nextBox!: Phaser.GameObjects.Rectangle;
  private boardBg!: Phaser.GameObjects.Rectangle;
  private pauseBtnText!: Phaser.GameObjects.Text;
  
  private adBannerBg!: Phaser.GameObjects.Rectangle;
  private adBannerText!: Phaser.GameObjects.Text;
  
  private uiBoxSize: number = 0;
  private uiBlockSize: number = 0;
  private uiHoldX: number = 0;
  private uiHoldY: number = 0;
  private uiNextX: number = 0;
  private uiNextY: number = 0;
  
  private pauseMenu!: Phaser.GameObjects.Container;
  private pmTitle!: Phaser.GameObjects.Text;
  private pmResumeBtn!: Phaser.GameObjects.Text;
  private sfxText!: Phaser.GameObjects.Text;
  private gravityText!: Phaser.GameObjects.Text;
  private controlsText!: Phaser.GameObjects.Text;
  private vanillaText!: Phaser.GameObjects.Text;
  private performanceText!: Phaser.GameObjects.Text;
  private pmQuitBtn!: Phaser.GameObjects.Text;

  private boardOffset = { y: 0 };
  private ghostAlpha = { value: 0.1 };
  private colorCache: Record<number, { tl: number, br: number }> = {};
  // @ts-ignore
  private cyberParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private blockParticles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flashGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
    this.bag = new RandomBag();
  }

  init(data: { startLevel?: number }) {
    const startLvl = data.startLevel || 1;
    this.level = startLvl;
    this.score = 0;
    this.linesCleared = (startLvl - 1) * 10;
    this.comboCount = 0;
    this.isClearingLines = false;
    this.holdPiece = null;
    this.isPaused = false;
    this.mobileControlType = (localStorage.getItem('blockPuzzleControls') as any) || 'gestures';
    this.vanillaMode = localStorage.getItem('blockPuzzleVanilla') === 'true';
    this.performanceMode = localStorage.getItem('blockPuzzlePerformanceMode') === 'true';
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0c10');
    
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture('particle', 8, 8);
    g.destroy();
    
    this.cyberParticles = this.add.particles(0, 0, 'particle', {
      x: { min: 0, max: 4000 },
      y: { min: 1000, max: 2000 },
      lifespan: { min: 4000, max: 8000 },
      speedY: { min: -10, max: -40 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.15, end: 0 },
      frequency: 150,
      blendMode: 'ADD'
    }).setDepth(0);
    this.cyberParticles.emitting = !this.vanillaMode && !this.performanceMode;

    this.blockParticles = this.add.particles(0, 0, 'particle', {
      lifespan: { min: 200, max: 300 },
      speed: { min: 50, max: 300 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      emitting: false
    }).setDepth(15);
    
    this.graphics = this.add.graphics().setDepth(10);
    this.flashGraphics = this.add.graphics().setDepth(12);

    this.tweens.add({
      targets: this.ghostAlpha,
      value: 0.35,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.board = Array.from({ length: CONSTANTS.ROWS }, () => Array(CONSTANTS.COLS).fill(0));
    
    this.keys = this.input.keyboard!.createCursorKeys();
    this.input.keyboard!.on('keydown-UP', this.rotateRight, this);
    this.input.keyboard!.on('keydown-Z', this.rotateLeft, this);
    this.input.keyboard!.on('keydown-SPACE', this.hardDrop, this);
    this.input.keyboard!.on('keydown-C', this.hold, this);
    this.input.keyboard!.on('keydown-SHIFT', this.hold, this);
    this.input.keyboard!.on('keydown-ESC', () => this.togglePauseMenu());
    this.input.keyboard!.on('keydown-P', () => this.togglePauseMenu());
    
    this.input.keyboard!.on('keydown-DOWN', () => {
      const time = this.time.now;
      if (time - this.lastDownTime < CONSTANTS.HARD_DROP_WINDOW) {
        this.hardDrop();
        this.lastDownTime = 0;
      } else {
        this.lastDownTime = time;
      }
    });

    const txtStyle = { fontSize: '40px', color: '#ffffff', fontFamily: '"Orbitron", monospace', align: 'center' };
    this.scoreText = this.add.text(0, 0, `SCORE\n${this.score}`, { ...txtStyle, color: '#00ffff' }).setOrigin(0.5).setScale(0.5);
    this.levelText = this.add.text(0, 0, `LEVEL\n${this.level}`, { ...txtStyle, color: '#ffaa00' }).setOrigin(0.5).setScale(0.5);
    this.holdLabel = this.add.text(0, 0, 'HOLD', txtStyle).setOrigin(0.5).setScale(0.5);
    this.nextLabel = this.add.text(0, 0, 'NEXT', txtStyle).setOrigin(0.5).setScale(0.5);
    
    this.holdBox = this.add.rectangle(0, 0, 10, 10, 0x0b0c10, 0.8).setStrokeStyle(3, 0x00ffff, 0.8);
    this.nextBox = this.add.rectangle(0, 0, 10, 10, 0x0b0c10, 0.8).setStrokeStyle(3, 0xff00ff, 0.8);
    this.boardBg = this.add.rectangle(0, 0, 10, 10, 0x0b0c10, 0.8);
    
    this.pauseBtnText = this.add.text(0, 0, '||', { fontSize: '60px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5).setScale(0.5).setInteractive().setDepth(20)
      .on('pointerdown', () => this.togglePauseMenu());

    this.adBannerBg = this.add.rectangle(0, 0, 10, 10, 0x111118, 1).setDepth(30);
    this.adBannerText = this.add.text(0, 0, 'AD BANNER PLACEHOLDER', { 
      fontSize: '24px', color: 'rgba(255,255,255,0.3)', fontFamily: '"Orbitron", monospace', align: 'center' 
    }).setOrigin(0.5).setDepth(31);

    this.buildDPad();
    this.buildPauseMenu();
    this.updateMobileControls();
    
    this.scale.on('resize', this.layoutUI, this);

    this.time.addEvent({
      delay: 60000, 
      callback: () => {
        if (!this.isPaused) {
           console.log("[YT SDK Mock] Showing periodic Ad...");
        }
      },
      loop: true
    });

    const onBlur = () => {
      if (!this.isPaused && this.scene.isActive('GameScene')) {
        this.togglePauseMenu();
      }
    };

    const onHidden = () => {
      if (!this.isPaused && this.scene.isActive('GameScene')) {
        this.togglePauseMenu();
      }
    };

    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);

    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.scale.off('resize', this.layoutUI, this);
    });

    this.spawnPiece();
  }

  private handlePointerDown = (pointer: Phaser.Input.Pointer) => {
    this.swipeStartX = pointer.x;
    this.swipeStartY = pointer.y;
    this.isSwiping = true;
  };

  private handlePointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!this.isSwiping || this.isPaused) return;
    const dx = pointer.x - this.swipeStartX;
    const dy = pointer.y - this.swipeStartY;
    const threshold = CONSTANTS.BLOCK_SIZE; 
    
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > threshold) {
        this.controlState.right = true;
        this.controlState.left = false;
        this.swipeStartX = pointer.x; 
      } else if (dx < -threshold) {
        this.controlState.left = true;
        this.controlState.right = false;
        this.swipeStartX = pointer.x;
      } else {
        this.controlState.left = false;
        this.controlState.right = false;
      }
    }
  };

  private handlePointerUp = (pointer: Phaser.Input.Pointer) => {
    this.controlState.left = false;
    this.controlState.right = false;
    this.controlState.down = false;
    if (!this.isSwiping || this.isPaused) return;
    this.isSwiping = false;

    const dx = pointer.x - pointer.downX;
    const dy = pointer.y - pointer.downY;
    const duration = pointer.upTime - pointer.downTime;

    if (duration < 500) {
      if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
        this.rotateRight();
      } else if (dy > 50) {
        this.hardDrop();
      } else if (dy < -50) {
        this.hold();
      }
    }
  };

  private updateMobileControls() {
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.off('pointermove', this.handlePointerMove, this);
    this.input.off('pointerup', this.handlePointerUp, this);
    
    if (this.mobileControlType === 'gestures') {
      this.dpadContainer.setVisible(false);
      this.input.on('pointerdown', this.handlePointerDown, this);
      this.input.on('pointermove', this.handlePointerMove, this);
      this.input.on('pointerup', this.handlePointerUp, this);
    } else {
      this.dpadContainer.setVisible(true);
    }
    this.layoutUI();
  }

  private buildDPad() {
    this.dpadContainer = this.add.container(0, 0).setDepth(25).setVisible(false);
    this.dpadBtns = [];
    
    const addBtn = (text: string, onPress: () => void, onRelease?: () => void) => {
      const btn = this.add.circle(0, 0, 42, 0x333344, 0.9).setInteractive();
      const lbl = this.add.text(0, 0, text, { fontSize: '26px', color: '#fff', fontStyle: 'bold', fontFamily: '"Orbitron"' }).setOrigin(0.5);
      
      btn.on('pointerdown', () => { btn.setFillStyle(0x555577, 1); onPress(); });
      btn.on('pointerup', () => { btn.setFillStyle(0x333344, 0.9); if(onRelease) onRelease(); });
      btn.on('pointerout', () => { btn.setFillStyle(0x333344, 0.9); if(onRelease) onRelease(); });
      
      this.dpadContainer.add([btn, lbl]);
      this.dpadBtns.push({btn, lbl});
    };
    
    addBtn('<-', () => this.controlState.left = true, () => this.controlState.left = false);
    addBtn('V', () => this.controlState.down = true, () => this.controlState.down = false);
    addBtn('->', () => this.controlState.right = true, () => this.controlState.right = false);
    addBtn('HLD', () => this.hold());
    addBtn('ROT', () => this.rotateRight());
    addBtn('DRP', () => this.hardDrop());
  }

  private layoutUI() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    
    const isPortrait = w < h || w < 600;
    const isDPad = this.mobileControlType === 'dpad' && isPortrait;
    const dpadH = isDPad ? 210 : 0;
    
    const bannerH = Math.max(50, h * 0.1);
    this.adBannerBg.setSize(w, bannerH).setPosition(w / 2, h - bannerH / 2);
    this.adBannerText.setPosition(w / 2, h - bannerH / 2);
    
    const availableH = h - bannerH - dpadH;
    const cx = w / 2;
    const cy = availableH / 2;
    
    this.boardBg.setPosition(cx, cy);
    this.boardBg.setSize(CONSTANTS.BOARD_WIDTH, CONSTANTS.BOARD_HEIGHT);
    
    const marginW = (w - CONSTANTS.BOARD_WIDTH) / 2;
    this.uiBoxSize = Math.min(CONSTANTS.BLOCK_SIZE * 5, marginW * 0.85);
    this.uiBlockSize = this.uiBoxSize / 5;
    
    this.holdBox.setSize(this.uiBoxSize, this.uiBoxSize);
    this.nextBox.setSize(this.uiBoxSize, this.uiBoxSize);
    
    if (!this.vanillaMode) {
      this.holdBox.setStrokeStyle(3, 0x00ffff, 0.8);
      this.nextBox.setStrokeStyle(3, 0xff00ff, 0.8);
    } else {
      this.holdBox.setStrokeStyle(2, 0x555555, 1);
      this.nextBox.setStrokeStyle(2, 0x555555, 1);
    }
    
    const flankY = cy - CONSTANTS.BOARD_HEIGHT / 4;
    
    this.uiHoldX = marginW / 2;
    this.uiHoldY = flankY;
    this.holdBox.setPosition(this.uiHoldX, this.uiHoldY);
    
    this.uiNextX = w - marginW / 2;
    this.uiNextY = flankY;
    this.nextBox.setPosition(this.uiNextX, this.uiNextY);
    
    const textScale = Math.min(0.5, (marginW * 0.9) / 100);
    this.holdLabel.setScale(textScale).setPosition(this.uiHoldX, this.uiHoldY - this.uiBoxSize / 2 - 20);
    this.nextLabel.setScale(textScale).setPosition(this.uiNextX, this.uiNextY - this.uiBoxSize / 2 - 20);
    this.scoreText.setScale(textScale).setPosition(this.uiHoldX, this.uiHoldY + this.uiBoxSize / 2 + 40);
    this.levelText.setScale(textScale).setPosition(this.uiNextX, this.uiNextY + this.uiBoxSize / 2 + 40);
    
    if (this.vanillaMode) {
      this.scoreText.setColor('#888888');
      this.levelText.setColor('#888888');
      this.holdLabel.setColor('#888888');
      this.nextLabel.setColor('#888888');
    } else {
      this.scoreText.setColor('#00ffff');
      this.levelText.setColor('#ffaa00');
      this.holdLabel.setColor('#ffffff');
      this.nextLabel.setColor('#ffffff');
    }
    
    this.pauseBtnText.setPosition(w - 40, 40);

    if (isDPad && this.dpadBtns.length === 6) {
       const dpadY = h - bannerH - 110; 
       const leftX = Math.max(90, marginW);
       const lOffsets = [{x: -65, y: 0}, {x: 0, y: 55}, {x: 65, y: 0}];
       for (let i = 0; i < 3; i++) {
         this.dpadBtns[i].btn.setPosition(leftX + lOffsets[i].x, dpadY + lOffsets[i].y);
         this.dpadBtns[i].lbl.setPosition(leftX + lOffsets[i].x, dpadY + lOffsets[i].y);
       }
       
       const rightX = Math.min(w - 90, w - marginW);
       const rOffsets = [{x: -70, y: 0}, {x: 0, y: -55}, {x: 70, y: 0}];
       for (let i = 0; i < 3; i++) {
         this.dpadBtns[i + 3].btn.setPosition(rightX + rOffsets[i].x, dpadY + rOffsets[i].y);
         this.dpadBtns[i + 3].lbl.setPosition(rightX + rOffsets[i].x, dpadY + rOffsets[i].y);
       }
    }

    if (this.pauseMenu) {
      const pW = this.cameras.main.width;
      const pH = this.cameras.main.height;
      const pcX = pW / 2;
      const pcY = pH / 2;
      const overlay = this.pauseMenu.list[0] as Phaser.GameObjects.Rectangle;
      overlay.setSize(pW, pH).setPosition(pcX, pcY);
      
      this.pmTitle.setPosition(pcX, pcY - 220);
      this.pmResumeBtn.setPosition(pcX, pcY - 140);
      this.controlsText.setPosition(pcX, pcY - 80);
      this.vanillaText.setPosition(pcX, pcY - 20);
      this.performanceText.setPosition(pcX, pcY + 40);
      this.sfxText.setPosition(pcX, pcY + 100);
      this.gravityText.setPosition(pcX, pcY + 160);
      this.pmQuitBtn.setPosition(pcX, pcY + 230);
    }
    
    this.draw();
  }

  private togglePauseMenu() {
    this.isPaused = !this.isPaused;
    this.pauseMenu.setVisible(this.isPaused);
    if (this.isPaused) {
      this.sfxText.setText(`SFX: ${AudioSettings.sfxEnabled ? 'ON' : 'OFF'}`);
      this.gravityText.setText(`DYNAMIC GRAVITY: ${AudioSettings.dynamicGravity ? 'ON' : 'OFF'}`);
      this.controlsText.setText(`CONTROLS: ${this.mobileControlType === 'gestures' ? 'GESTURES' : 'D-PAD'}`);
      this.vanillaText.setText(`VANILLA MODE: ${this.vanillaMode ? 'ON' : 'OFF'}`);
      this.performanceText.setText(`PERFORMANCE MODE: ${this.performanceMode ? 'ON' : 'OFF'}`);
    }
  }

  private buildPauseMenu() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.pauseMenu = this.add.container(0, 0).setDepth(100).setVisible(false);
    
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.85).setInteractive();
    overlay.on('pointerdown', () => this.togglePauseMenu());
    this.pauseMenu.add(overlay);

    this.pmTitle = this.add.text(w/2, h/2 - 220, 'PAUSED', { fontSize: '64px', color: '#fff', fontFamily: '"Orbitron"' }).setOrigin(0.5);
    this.pauseMenu.add(this.pmTitle);
    
    this.pmResumeBtn = this.add.text(w/2, h/2 - 140, 'RESUME GAME', { 
      fontSize: '48px', color: '#00ff00', fontStyle: 'bold', fontFamily: '"Orbitron"' 
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setStroke('#004400', 6);
    this.pmResumeBtn.on('pointerdown', () => this.togglePauseMenu());
    this.pauseMenu.add(this.pmResumeBtn);

    const baseStyle = { fontSize: '32px', fontFamily: '"Orbitron"' };
    const createBtn = (yOffset: number, text: string, color: string, onClick: () => void) => {
      const btn = this.add.text(w/2, h/2 + yOffset, text, { ...baseStyle, color }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', onClick);
      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout', () => btn.setColor(color));
      this.pauseMenu.add(btn);
      return btn;
    };

    this.controlsText = createBtn(-80, 'CONTROLS: GESTURES', '#ff00ff', () => {
      this.mobileControlType = this.mobileControlType === 'gestures' ? 'dpad' : 'gestures';
      localStorage.setItem('blockPuzzleControls', this.mobileControlType);
      this.controlsText.setText(`CONTROLS: ${this.mobileControlType === 'gestures' ? 'GESTURES' : 'D-PAD'}`);
      this.updateMobileControls();
    });

    this.vanillaText = createBtn(-20, 'VANILLA MODE: OFF', '#ffa500', () => {
      this.vanillaMode = !this.vanillaMode;
      localStorage.setItem('blockPuzzleVanilla', this.vanillaMode.toString());
      this.vanillaText.setText(`VANILLA MODE: ${this.vanillaMode ? 'ON' : 'OFF'}`);
      this.cyberParticles.emitting = !this.vanillaMode && !this.performanceMode;
      this.layoutUI();
    });

    this.performanceText = createBtn(40, 'PERFORMANCE MODE: OFF', '#00ffcc', () => {
      this.performanceMode = !this.performanceMode;
      localStorage.setItem('blockPuzzlePerformanceMode', this.performanceMode.toString());
      this.performanceText.setText(`PERFORMANCE MODE: ${this.performanceMode ? 'ON' : 'OFF'}`);
      this.cyberParticles.emitting = !this.vanillaMode && !this.performanceMode;
      if (this.performanceMode) {
        this.cyberParticles.stop();
        this.blockParticles.stop();
      } else if (!this.vanillaMode) {
        this.cyberParticles.start();
      }
      this.layoutUI();
    });

    this.sfxText = createBtn(100, 'SFX: ON', '#ffff00', () => {
      AudioSettings.sfxEnabled = !AudioSettings.sfxEnabled;
      this.sfxText.setText(`SFX: ${AudioSettings.sfxEnabled ? 'ON' : 'OFF'}`);
    });

    this.gravityText = createBtn(160, 'DYNAMIC GRAVITY: ON', '#00ffff', () => {
      AudioSettings.dynamicGravity = !AudioSettings.dynamicGravity;
      this.gravityText.setText(`DYNAMIC GRAVITY: ${AudioSettings.dynamicGravity ? 'ON' : 'OFF'}`);
    });
    
    this.pmQuitBtn = createBtn(230, 'QUIT TO MENU', '#ff0000', () => this.scene.start('MenuScene'));
  }

  private spawnPiece() {
    this.currentPiece = {
      type: this.bag.next(),
      x: 3,
      y: 0,
      rotation: 0
    };
    
    this.isLocking = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.dropTimer = 0;
    this.canHold = true;
    
    if (this.checkCollision(0, 0, this.currentPiece.rotation)) {
      this.scene.pause('GameScene');
      this.scene.launch('GameOverScene', { score: this.score, level: this.level, GameScene: this });
    }
  }

  public clearBottomLines(count: number) {
    this.board.splice(CONSTANTS.ROWS - count, count);
    for (let i = 0; i < count; i++) {
      this.board.unshift(Array(CONSTANTS.COLS).fill(0));
    }
    this.spawnPiece();
  }

  update(_time: number, delta: number) {
    if (this.isPaused || this.isClearingLines || !this.currentPiece) return;
    
    if (this.mobileControlType === 'gestures') {
      const pointer = this.input.activePointer;
      if (pointer.isDown && (this.time.now - pointer.downTime) > 150) {
        this.controlState.down = true;
      } else {
        this.controlState.down = false;
      }
    }
    
    this.handleInput(delta);
    
    this.dropTimer += delta;
    const baseGravity = AudioSettings.dynamicGravity ? Math.max(100, 1000 - (this.level - 1) * 100) : 1000;
    const isDownPressed = this.keys.down.isDown || this.controlState.down;
    let gravitySpeed = isDownPressed ? baseGravity / 10 : baseGravity;
    
    const isAtBottom = this.checkCollision(0, 1, this.currentPiece.rotation);
    
    if (isAtBottom) {
      if (!this.isLocking) {
        this.isLocking = true;
        this.lockTimer = 0;
      }
      this.lockTimer += delta;
      
      if (this.lockTimer >= CONSTANTS.LOCK_DELAY) {
        this.lockPiece();
      }
    } else {
      this.isLocking = false;
      if (this.dropTimer >= gravitySpeed) {
        this.currentPiece.y += 1;
        this.dropTimer = 0;
        
        if (isDownPressed) {
          this.score += 1;
          this.scoreText.setText(`SCORE\n${this.score}`);
        }
      }
    }
    
    this.draw();
  }

  private handleInput(delta: number) {
    if (!this.currentPiece) return;
    
    const updateKey = (isDown: boolean, state: { isDown: boolean, time: number }, action: () => void) => {
      if (isDown) {
        if (!state.isDown) {
          state.isDown = true;
          state.time = 0;
          action();
        } else {
          state.time += delta;
          if (state.time > CONSTANTS.DAS_INITIAL_DELAY) {
            state.time -= CONSTANTS.DAS_AUTO_REPEAT;
            action();
          }
        }
      } else {
        state.isDown = false;
        state.time = 0;
      }
    };
    
    updateKey(this.keys.left.isDown || this.controlState.left, this.keyState.left, () => this.move(-1));
    updateKey(this.keys.right.isDown || this.controlState.right, this.keyState.right, () => this.move(1));
  }

  private move(dx: number) {
    if (!this.currentPiece) return;
    if (!this.checkCollision(dx, 0, this.currentPiece.rotation)) {
      this.currentPiece.x += dx;
      AudioEngine.playMove();
      this.resetLockDelay();
    }
  }

  private hardDrop() {
    if (!this.currentPiece) return;
    let dropped = false;
    while (!this.checkCollision(0, 1, this.currentPiece.rotation)) {
      this.currentPiece.y += 1;
      this.score += 2;
      dropped = true;
    }
    this.scoreText.setText(`SCORE\n${this.score}`);
    AudioEngine.playThud();
    this.lockPiece();
    
    if (dropped && !this.vanillaMode) {
      this.cameras.main.shake(100, 0.003);
      this.tweens.add({
        targets: this.boardOffset,
        y: 10,
        yoyo: true,
        duration: 50,
        ease: 'Sine.easeInOut'
      });
    }
  }

  private resetLockDelay() {
    if (this.isLocking && this.lockResets < CONSTANTS.MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private rotateRight() {
    if (!this.currentPiece) return;
    this.attemptRotation((this.currentPiece.rotation + 1) % 4);
  }

  private rotateLeft() {
    if (!this.currentPiece) return;
    this.attemptRotation((this.currentPiece.rotation + 3) % 4);
  }

  private attemptRotation(newRotation: number) {
    if (!this.currentPiece) return;
    
    const kickType = this.currentPiece.type === 'I' ? 'I' : 'NORMAL';
    const kickData = WALL_KICKS[kickType];
    let kicks = [[0, 0]];
    
    if (kickData) {
      const stateStr = `${this.currentPiece.rotation}->${newRotation}`;
      if ((kickData as any)[stateStr]) {
        kicks = (kickData as any)[stateStr];
      }
    }
    
    for (const [dx, dy] of kicks) {
      if (!this.checkCollision(dx, dy, newRotation)) {
        this.currentPiece.x += dx;
        this.currentPiece.y += dy;
        this.currentPiece.rotation = newRotation;
        AudioEngine.playMove();
        this.resetLockDelay();
        return;
      }
    }
  }

  private hold() {
    if (!this.canHold || !this.currentPiece) return;
    
    if (this.holdPiece === null) {
      this.holdPiece = this.currentPiece.type;
      this.spawnPiece();
    } else {
      const temp = this.currentPiece.type;
      this.currentPiece = {
        type: this.holdPiece,
        x: 3,
        y: 0,
        rotation: 0
      };
      this.holdPiece = temp;
      this.isLocking = false;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.dropTimer = 0;
    }
    
    if (!this.vanillaMode) {
      this.punchTween(this.holdBox);
      this.punchTween(this.holdLabel);
    }
    
    this.canHold = false;
  }

  private lockPiece() {
    if (!this.currentPiece) return;
    const shape = SHAPES[this.currentPiece.type][this.currentPiece.rotation];
    
    let bottomY = 0;
    let centerX = 0;
    let pieceCount = 0;

    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardY = this.currentPiece.y + r;
          const boardX = this.currentPiece.x + c;
          if (boardY >= 0 && boardY < CONSTANTS.ROWS && boardX >= 0 && boardX < CONSTANTS.COLS) {
            this.board[boardY][boardX] = CONSTANTS.COLORS[this.currentPiece.type];
          }
          if (boardY > bottomY) bottomY = boardY;
          centerX += boardX;
          pieceCount++;
        }
      }
    }
    
    if (pieceCount > 0) centerX /= pieceCount;

    if (!this.vanillaMode && !this.performanceMode) {
      const w = this.cameras.main.width;
      const h = this.cameras.main.height;
      const isPortrait = w < h || w < 600;
      const isDPad = this.mobileControlType === 'dpad' && isPortrait;
      const dpadH = isDPad ? 140 : 0;
      const bannerH = Math.max(50, h * 0.1);
      const availableH = h - bannerH - dpadH;
      const offsetY = (availableH / 2 - CONSTANTS.BOARD_HEIGHT / 2) + this.boardOffset.y;
      const offsetX = w / 2 - CONSTANTS.BOARD_WIDTH / 2;
      
      const px = offsetX + centerX * CONSTANTS.BLOCK_SIZE;
      const py = offsetY + bottomY * CONSTANTS.BLOCK_SIZE + CONSTANTS.BLOCK_SIZE;
      
      this.blockParticles.setParticleTint(0xaaaaaa);
      this.blockParticles.emitParticleAt(px, py, 10);
    }

    const hasCleared = this.clearLines();
    if (!hasCleared) {
      this.spawnPiece();
    }
  }

  private clearLines(): boolean {
    let rowsCleared: number[] = [];
    
    for (let row = 0; row < CONSTANTS.ROWS; row++) {
      let isFull = true;
      for (let col = 0; col < CONSTANTS.COLS; col++) {
        if (this.board[row][col] === 0) {
          isFull = false;
          break;
        }
      }
      if (isFull) {
        rowsCleared.push(row);
      }
    }
    
    const linesCleared = rowsCleared.length;
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    const isPortrait = w < h || w < 600;
    const isDPad = this.mobileControlType === 'dpad' && isPortrait;
    const dpadH = isDPad ? 140 : 0;
    const bannerH = Math.max(50, h * 0.1);
    const availableH = h - bannerH - dpadH;
    const offsetY = (availableH / 2 - CONSTANTS.BOARD_HEIGHT / 2) + this.boardOffset.y;
    const offsetX = w / 2 - CONSTANTS.BOARD_WIDTH / 2;

    if (linesCleared > 0) {
      this.isClearingLines = true;
      
      this.comboCount++;
      AudioEngine.playChime();
      
      const lineScores = [0, 100, 300, 500, 800];
      const basePoints = lineScores[linesCleared] * this.level;
      const comboBonus = this.comboCount > 1 ? (50 * (this.comboCount - 1) * this.level) : 0;
      
      this.score += basePoints + comboBonus;
      this.scoreText.setText(`SCORE\n${this.score}`);
      if (!this.vanillaMode && !this.performanceMode) this.punchTween(this.scoreText);
      
      if (this.comboCount > 1 && !this.vanillaMode && !this.performanceMode) {
         const comboY = offsetY + rowsCleared[0] * CONSTANTS.BLOCK_SIZE;
         const comboText = this.add.text(w/2, comboY - 20, `COMBO x${this.comboCount - 1}`, {
            fontSize: '32px', color: '#ff00ff', fontFamily: '"Orbitron"', fontStyle: 'bold'
         }).setOrigin(0.5).setStroke('#fff', 4).setDepth(40);
         
         this.tweens.add({
           targets: comboText,
           y: comboY - 60,
           alpha: 0,
           duration: 500,
           ease: 'Cubic.easeOut',
           onComplete: () => comboText.destroy()
         });
      }

      this.linesCleared += linesCleared;
      const targetLevel = Math.floor(this.linesCleared / 10) + 1;
      if (targetLevel > this.level) {
        this.level = targetLevel;
        this.levelText.setText(`LEVEL\n${this.level}`);
        if (!this.vanillaMode && !this.performanceMode) {
           this.punchTween(this.levelText);
           this.cameras.main.flash(200, 0, 191, 255);
           
           const lvlUpText = this.add.text(w/2, h/2, `LEVEL ${this.level}`, {
              fontSize: '60px', color: '#00ffff', fontFamily: '"Orbitron"', fontStyle: 'bold'
           }).setOrigin(0.5).setStroke('#0088ff', 6).setDepth(50).setAlpha(0);
           
           this.tweens.add({
             targets: lvlUpText,
             scale: { start: 0.5, to: 1.5 },
             alpha: { start: 0, to: 1 },
             duration: 200,
             ease: 'Cubic.easeOut',
             onComplete: () => {
               this.time.delayedCall(500, () => {
                 this.tweens.add({
                   targets: lvlUpText,
                   alpha: 0,
                   duration: 200,
                   onComplete: () => lvlUpText.destroy()
                 });
               });
             }
           });
        }
        AudioEngine.playAlert();
      }
      
      if (!this.vanillaMode) {
        if (!this.performanceMode) {
          this.cameras.main.shake(150, 0.005 * linesCleared);
        }
        
        this.flashGraphics.clear();
        this.flashGraphics.setAlpha(1);
        
        rowsCleared.forEach(r => {
           const gy = offsetY + r * CONSTANTS.BLOCK_SIZE;
           this.flashGraphics.fillStyle(0xffffff, 1);
           this.flashGraphics.fillRect(offsetX, gy, CONSTANTS.BOARD_WIDTH, CONSTANTS.BLOCK_SIZE);
           
           if (!this.performanceMode) {
             // Centralized particle manager explosion
             for (let i = 0; i < 15; i++) {
                const gx = offsetX + Math.random() * CONSTANTS.BOARD_WIDTH;
                this.blockParticles.setParticleTint(0xffffff);
                this.blockParticles.emitParticleAt(gx, gy + CONSTANTS.BLOCK_SIZE / 2, 1);
             }
           }
        });
        
        this.tweens.add({
          targets: this.flashGraphics,
          alpha: 0,
          duration: 150,
          onComplete: () => {
            this.flashGraphics.clear();
            this.flashGraphics.setAlpha(1);
            
            this.shiftRows(rowsCleared);
            this.isClearingLines = false;
            this.spawnPiece();
          }
        });
      } else {
        this.shiftRows(rowsCleared);
        this.isClearingLines = false;
        this.spawnPiece();
      }
      
      return true;
    } else {
      this.comboCount = 0;
      return false;
    }
  }

  private shiftRows(rowsCleared: number[]) {
    const sorted = [...rowsCleared].sort((a, b) => b - a);
    sorted.forEach(row => {
      this.board.splice(row, 1);
      this.board.unshift(Array(CONSTANTS.COLS).fill(0));
    });
  }

  private punchTween(target: any) {
    const origScale = target.scale;
    this.tweens.add({
      targets: target,
      scaleX: origScale * 1.3,
      scaleY: origScale * 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        target.setScale(origScale);
      }
    });
  }

  private checkCollision(dx: number, dy: number, rotation: number): boolean {
    if (!this.currentPiece) return false;
    const shape = SHAPES[this.currentPiece.type][rotation];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newX = this.currentPiece.x + c + dx;
          const newY = this.currentPiece.y + r + dy;
          if (newX < 0 || newX >= CONSTANTS.COLS || newY >= CONSTANTS.ROWS) return true;
          if (newY >= 0 && this.board[newY][newX] !== 0) return true;
        }
      }
    }
    return false;
  }

  private getGradient(color: number) {
    if (!this.colorCache[color]) {
      const c = Phaser.Display.Color.ValueToColor(color);
      this.colorCache[color] = {
        tl: Phaser.Display.Color.GetColor(Math.min(255, c.red + 120), Math.min(255, c.green + 120), Math.min(255, c.blue + 120)),
        br: Phaser.Display.Color.GetColor(Math.max(0, c.red - 80), Math.max(0, c.green - 80), Math.max(0, c.blue - 80))
      };
    }
    return this.colorCache[color];
  }

  private getVanillaColor(color: number): number {
    switch(color) {
      case 0x00FFFF: return 0xcccccc; // Light Silver
      case 0x0066FF: return 0x777777; // Slate Gray
      case 0xFF9900: return 0x999999; // Medium Gray
      case 0xFFFF00: return 0xeeeeee; // Bright Gray
      case 0x00FF00: return 0xaaaaaa; // Soft Gray
      case 0xFF00FF: return 0x555555; // Dark Slate
      case 0xFF0055: return 0x333333; // Near Black
      default: return 0x888888;
    }
  }

  private drawBlock(x: number, y: number, color: number, blockSize: number = CONSTANTS.BLOCK_SIZE) {
    if (this.vanillaMode) {
      const vColor = this.getVanillaColor(color);
      this.graphics.fillStyle(vColor, 1);
      this.graphics.fillRect(x, y, blockSize, blockSize);
      // Classic GameBoy inset/outset border style
      this.graphics.lineStyle(2, 0x111111, 1);
      this.graphics.strokeRect(x, y, blockSize, blockSize);
      this.graphics.lineStyle(1, 0xffffff, 0.4);
      this.graphics.strokeRect(x + 2, y + 2, blockSize - 4, blockSize - 4);
      return;
    }
    if (this.performanceMode) {
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(x, y, blockSize, blockSize);
      this.graphics.lineStyle(2, 0xffffff, 1);
      this.graphics.strokeRect(x + 1, y + 1, blockSize - 2, blockSize - 2);
      return;
    }
    
    const grad = this.getGradient(color);
    
    this.graphics.fillGradientStyle(grad.tl, color, color, grad.br, 1, 1, 1, 1);
    this.graphics.fillRect(x, y, blockSize, blockSize);
    
    this.graphics.lineStyle(2, grad.tl, 0.9);
    this.graphics.strokeRect(x, y, blockSize, blockSize);
    
    this.graphics.lineStyle(1, 0xffffff, 0.3);
    this.graphics.strokeRect(x + 2, y + 2, blockSize - 4, blockSize - 4);
  }

  private drawGhostBlock(x: number, y: number, color: number, blockSize: number = CONSTANTS.BLOCK_SIZE) {
    if (this.vanillaMode) {
      const vColor = this.getVanillaColor(color);
      this.graphics.lineStyle(2, vColor, 0.5);
      this.graphics.strokeRect(x + 1, y + 1, blockSize - 2, blockSize - 2);
      return;
    }
    if (this.performanceMode) {
      this.graphics.fillStyle(color, 0.15);
      this.graphics.fillRect(x, y, blockSize, blockSize);
      this.graphics.lineStyle(2, color, 0.8);
      this.graphics.strokeRect(x + 1, y + 1, blockSize - 2, blockSize - 2);
      return;
    }
    
    this.graphics.fillStyle(color, this.ghostAlpha.value * 0.5);
    this.graphics.fillRect(x, y, blockSize, blockSize);
    
    this.graphics.lineStyle(2, color, this.ghostAlpha.value + 0.4);
    
    const dash = blockSize / 4;
    this.graphics.beginPath();
    for (let i = 0; i < blockSize; i += dash * 2) {
      this.graphics.moveTo(x + i, y);
      this.graphics.lineTo(x + Math.min(i + dash, blockSize), y);
      
      this.graphics.moveTo(x + i, y + blockSize);
      this.graphics.lineTo(x + Math.min(i + dash, blockSize), y + blockSize);
      
      this.graphics.moveTo(x, y + i);
      this.graphics.lineTo(x, y + Math.min(i + dash, blockSize));
      
      this.graphics.moveTo(x + blockSize, y + i);
      this.graphics.lineTo(x + blockSize, y + Math.min(i + dash, blockSize));
    }
    this.graphics.strokePath();
  }

  private draw() {
    this.graphics.clear();
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    
    const isPortrait = w < h || w < 600;
    const isDPad = this.mobileControlType === 'dpad' && isPortrait;
    const dpadH = isDPad ? 140 : 0;
    
    const bannerH = Math.max(50, h * 0.1);
    const availableH = h - bannerH - dpadH;
    
    const offsetX = w / 2 - CONSTANTS.BOARD_WIDTH / 2;
    const offsetY = (availableH / 2 - CONSTANTS.BOARD_HEIGHT / 2) + this.boardOffset.y;
    
    if (!this.vanillaMode && !this.performanceMode) {
      // Ambient Background Cyber Grid (Full Screen)
      this.graphics.lineStyle(1, 0x00ffff, 0.04);
      const bgGridSize = 50;
      for (let x = (w / 2) % bgGridSize; x < w; x += bgGridSize) {
        this.graphics.moveTo(x, 0);
        this.graphics.lineTo(x, h);
      }
      for (let y = (h / 2) % bgGridSize; y < h; y += bgGridSize) {
        this.graphics.moveTo(0, y);
        this.graphics.lineTo(w, y);
      }
      this.graphics.strokePath();
    }

    if (!this.performanceMode) {
      // Playfield Grid
      this.graphics.lineStyle(1, 0xffffff, this.vanillaMode ? 0.04 : 0.1);
      for (let r = 0; r <= CONSTANTS.ROWS; r++) {
        this.graphics.moveTo(offsetX, offsetY + r * CONSTANTS.BLOCK_SIZE);
        this.graphics.lineTo(offsetX + CONSTANTS.BOARD_WIDTH, offsetY + r * CONSTANTS.BLOCK_SIZE);
      }
      for (let c = 0; c <= CONSTANTS.COLS; c++) {
        this.graphics.moveTo(offsetX + c * CONSTANTS.BLOCK_SIZE, offsetY);
        this.graphics.lineTo(offsetX + c * CONSTANTS.BLOCK_SIZE, offsetY + CONSTANTS.BOARD_HEIGHT);
      }
      this.graphics.strokePath();
    }
    
    // Playfield Border Glow
    if (!this.vanillaMode) {
      if (!this.performanceMode) {
        this.graphics.lineStyle(3, 0xff00ff, 0.7);
      } else {
        this.graphics.lineStyle(2, 0xff00ff, 1);
      }
    } else {
      this.graphics.lineStyle(2, 0x444444, 1);
    }
    this.graphics.strokeRect(offsetX, offsetY, CONSTANTS.BOARD_WIDTH, CONSTANTS.BOARD_HEIGHT);
    
    for (let row = 0; row < CONSTANTS.ROWS; row++) {
      for (let col = 0; col < CONSTANTS.COLS; col++) {
        if (this.board[row][col] !== 0) {
          this.drawBlock(offsetX + col * CONSTANTS.BLOCK_SIZE, offsetY + row * CONSTANTS.BLOCK_SIZE, this.board[row][col]);
        }
      }
    }
    
    if (this.currentPiece) {
      let ghostY = this.currentPiece.y;
      while (!this.checkCollision(0, ghostY - this.currentPiece.y + 1, this.currentPiece.rotation)) {
        ghostY++;
      }
      
      const shape = SHAPES[this.currentPiece.type][this.currentPiece.rotation];
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            const gx = offsetX + (this.currentPiece.x + col) * CONSTANTS.BLOCK_SIZE;
            const gy = offsetY + (ghostY + row) * CONSTANTS.BLOCK_SIZE;
            this.drawGhostBlock(gx, gy, CONSTANTS.COLORS[this.currentPiece.type]);
          }
        }
      }
      
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            const bx = offsetX + (this.currentPiece.x + col) * CONSTANTS.BLOCK_SIZE;
            const by = offsetY + (this.currentPiece.y + row) * CONSTANTS.BLOCK_SIZE;
            this.drawBlock(bx, by, CONSTANTS.COLORS[this.currentPiece.type]);
          }
        }
      }
    }
    
    if (this.holdPiece) {
      const shape = SHAPES[this.holdPiece][0];
      const color = CONSTANTS.COLORS[this.holdPiece];
      const pw = shape[0].length * this.uiBlockSize;
      const ph = shape.length * this.uiBlockSize;
      const hx = this.uiHoldX - pw / 2;
      const hy = this.uiHoldY - ph / 2 + this.boardOffset.y; // Sync bounce with UI slightly
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
             this.drawBlock(hx + col * this.uiBlockSize, hy + row * this.uiBlockSize, color, this.uiBlockSize);
          }
        }
      }
    }

    const nextPiece = this.bag.peekNext();
    if (nextPiece) {
      const shape = SHAPES[nextPiece][0];
      const color = CONSTANTS.COLORS[nextPiece];
      const pw = shape[0].length * this.uiBlockSize;
      const ph = shape.length * this.uiBlockSize;
      const nx = this.uiNextX - pw / 2;
      const ny = this.uiNextY - ph / 2 + this.boardOffset.y;
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
             this.drawBlock(nx + col * this.uiBlockSize, ny + row * this.uiBlockSize, color, this.uiBlockSize);
          }
        }
      }
    }
  }
}
