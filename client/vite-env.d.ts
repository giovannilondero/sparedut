/// <reference types="vite/client" />

/** The launch queue of an installed game (`launch_handler`): Chromium only. */
interface LaunchParams {
  readonly targetURL?: string
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}
