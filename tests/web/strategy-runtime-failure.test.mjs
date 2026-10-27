import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeFailureKind } from '../../contracts-omnichain/scripts/runtime-failure.mjs';
test('runtime diagnostics distinguish assertions, timeouts, state pruning and reverts without raw details',()=>{
  for(const [message,label] of [['missing trie node PRIVATE-URL','FORK_STATE_UNAVAILABLE'],['request timed out PRIVATE-CREDENTIAL','TIMEOUT'],['execution reverted PRIVATE-CALLDATA','CONTRACT_REVERT'],['PRIVATE-UNKNOWN','UNCLASSIFIED_FAILURE']])assert.equal(runtimeFailureKind(Error(message)),label);
  assert.equal(runtimeFailureKind({code:'ERR_ASSERTION',message:'PRIVATE-ACTUAL-EXPECTED'}),'ASSERTION_FAILED');
});
test('nested causes are bounded and cycles/unexpected values do not expose exceptions',()=>{
  assert.equal(runtimeFailureKind({cause:Error('header not found secret')}),'FORK_STATE_UNAVAILABLE');
  const cycle={message:'secret'};cycle.cause=cycle;assert.equal(runtimeFailureKind(cycle),'UNCLASSIFIED_FAILURE');
  for(const input of [null,undefined,'secret',42,{}])assert.equal(runtimeFailureKind(input),'UNCLASSIFIED_FAILURE');
});
