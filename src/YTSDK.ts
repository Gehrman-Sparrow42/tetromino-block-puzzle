export class YTSDK {
  /**
   * Mocks a standard interstitial ad.
   */
  static async showInterstitialAd(onPause: () => void, onResume: () => void): Promise<void> {
    return new Promise(resolve => {
      console.log("[YT SDK] Showing Interstitial Ad...");
      onPause();
      setTimeout(() => {
        console.log("[YT SDK] Interstitial Ad Closed.");
        onResume();
        resolve();
      }, 1500);
    });
  }

  /**
   * Mocks a rewarded ad with an 80% success rate.
   */
  static async showRewardedAd(onPause: () => void, onResume: () => void): Promise<boolean> {
    return new Promise(resolve => {
      console.log("[YT SDK] Showing Rewarded Ad...");
      onPause();
      const success = true; // Forced 100% success for testing
      setTimeout(() => {
        console.log(`[YT SDK] Rewarded Ad Finished. Success: ${success}`);
        onResume();
        resolve(success);
      }, 2000);
    });
  }

  /**
   * Mocks leaderboards API by using localStorage.
   */
  static async submitHighScore(score: number): Promise<void> {
    console.log(`[YT SDK] Submitting high score: ${score}`);
    const current = await this.fetchLeaderboard();
    if (score > current) {
      localStorage.setItem('block_puzzle_highscore', score.toString());
      console.log("[YT SDK] New High Score Saved!");
    }
  }

  /**
   * Retrieves high score from mock leaderboard.
   */
  static async fetchLeaderboard(): Promise<number> {
    console.log("[YT SDK] Fetching leaderboard...");
    return Number(localStorage.getItem('block_puzzle_highscore') || 0);
  }
}
