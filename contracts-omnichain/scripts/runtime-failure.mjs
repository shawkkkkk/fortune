// Fixed diagnostic labels only. Never serialize provider exceptions, URLs, calldata or credentials.
export function runtimeFailureKind(error) {
  const seen = new Set(); let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object' && !seen.has(current); depth++) {
    seen.add(current);
    if (current.code === 'ERR_ASSERTION') return 'ASSERTION_FAILED';
    const message = typeof current.message === 'string' ? current.message.slice(0, 20000).toLowerCase() : '';
    if (/missing trie node|historical state|state is not available|header not found/.test(message)) return 'FORK_STATE_UNAVAILABLE';
    if (/timed out|timeout|time out/.test(message)) return 'TIMEOUT';
    if (/execution reverted|contractfunctionrevertederror/.test(message)) return 'CONTRACT_REVERT';
    current = current.cause;
  }
  return 'UNCLASSIFIED_FAILURE';
}
