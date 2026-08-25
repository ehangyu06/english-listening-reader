/**
 * Browser speechSynthesis TTS is disabled.
 * Listening uses uploaded audio files instead.
 */
export function stopTts() {}
export function speak() {
  return Promise.resolve();
}
