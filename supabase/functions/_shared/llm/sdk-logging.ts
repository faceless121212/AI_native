// A logger that drops everything, for the Anthropic SDK clients: their debug logs include request
// options and bodies (message text). Used together with logLevel 'off'.
const drop = (..._args: unknown[]): void => {};

export const SILENT_LOGGER = { error: drop, warn: drop, info: drop, debug: drop };
