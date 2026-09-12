import type { NflDataProvider } from '../types';
import { MockNflProvider } from './mock';
import { SleeperNflProvider } from './sleeper';

/**
 * Picks the live provider when configured, and always keeps the mock around as
 * the degradation target. Callers use `withFallback` so one flaky endpoint can
 * never take the app down.
 */
export function getNflProvider(): NflDataProvider {
  const sleeper = new SleeperNflProvider();
  return sleeper.isConfigured() ? sleeper : new MockNflProvider();
}

export function getFallbackNflProvider(): NflDataProvider {
  return new MockNflProvider();
}

export { SleeperNflProvider, MockNflProvider };
