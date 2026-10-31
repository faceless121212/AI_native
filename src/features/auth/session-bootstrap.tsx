import { useSession } from './use-session';

/**
 * Starts the silent anonymous sign-in at launch and keeps the session cache in sync. Renders
 * nothing and never blocks the UI: the app (and the keyboard) work offline; the session arrives
 * when the network does.
 */
export function SessionBootstrap() {
  useSession();
  return null;
}
