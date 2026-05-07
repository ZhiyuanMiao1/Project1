let dotLottiePlayerPromise = null;

export function loadDotLottiePlayer() {
  if (!dotLottiePlayerPromise) {
    dotLottiePlayerPromise = import('@dotlottie/react-player').then((mod) => {
      const PlayerComponent =
        mod?.Player
        || mod?.default
        || mod?.default?.Player
        || mod?.DotLottiePlayer;

      if (!PlayerComponent) {
        throw new Error('[dotlottie] no player component found');
      }

      return PlayerComponent;
    });
  }

  return dotLottiePlayerPromise;
}

export function preloadDotLottiePlayer() {
  loadDotLottiePlayer().catch(() => {});
}
