export const CONSTANTS = {
  COLS: 10,
  ROWS: 20,
  get BLOCK_SIZE() { 
    const h = window.innerHeight;
    const w = window.innerWidth;
    const bannerH = Math.max(50, h * 0.1);
    
    const isDPad = localStorage.getItem('blockPuzzleControls') === 'dpad';
    const isPortrait = w < h || w < 600;
    const dpadH = (isDPad && isPortrait) ? 140 : 0;
    
    const availableH = h - bannerH - dpadH;
    
    if (isPortrait) {
      // Mobile Portrait: Maximize width (up to 70%) or height
      const maxW = (w * 0.7) / 10;
      const maxH = (availableH * 0.95) / 20;
      return Math.max(15, Math.floor(Math.min(maxW, maxH)));
    } else {
      // Desktop Landscape
      return Math.max(20, Math.floor((availableH * 0.85) / 20)); 
    }
  },
  get BOARD_WIDTH() { return this.COLS * this.BLOCK_SIZE; },
  get BOARD_HEIGHT() { return this.ROWS * this.BLOCK_SIZE; },
  DAS_INITIAL_DELAY: 200, // ms
  DAS_AUTO_REPEAT: 50, // ms
  LOCK_DELAY: 500, // ms
  MAX_LOCK_RESETS: 15,
  HARD_DROP_WINDOW: 250, // ms window for double tap
  COLORS: {
    I: 0x00FFFF, // Neon Cyan
    J: 0x0066FF, // Bright Royal Blue
    L: 0xFF9900, // Orange
    O: 0xFFFF00, // Bright Yellow
    S: 0x00FF00, // Neon Green
    T: 0xFF00FF, // Vivid Purple
    Z: 0xFF0055, // Red
    GHOST: 0xFFFFFF 
  }
};
