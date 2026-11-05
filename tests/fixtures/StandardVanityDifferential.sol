// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Copied into contracts/test only while running the isolated differential.
import {FortuneTest} from "./Fortune.t.sol";
import {FortuneFactory} from "../src/FortuneFactory.sol";
import {FortuneToken} from "../src/FortuneToken.sol";

contract StandardVanityDifferential is FortuneTest {
    struct Context {
        uint256 chainId;
        address factory;
        address registry;
        address automationRegistry;
        address metadataRegistry;
        address tokenDeployer;
        address vaultDeployer;
        address feeRouterDeployer;
        address curveDeployer;
        address automationExecutor;
        address graduationAdapter;
    }

    function testCompiledStandardVanityDifferential() public {
        vm.chainId(97);
        FortuneFactory.LaunchParams memory p = _params(1_000e18);
        (bytes32 salt, address candidate,, uint256 nonce) = _vector("VANITY_FIRST", address(this), p);
        assertEq(nonce, 0);
        assertEq(candidate.code.length, 0);
        assertEq(vm.getNonce(candidate), 0);

        // CODE and NONCE each independently make the actual deployment revert.
        vm.etch(candidate, hex"00");
        vm.expectRevert();
        factory.createLaunchPrepared(p, salt);
        assertEq(factory.creatorLaunchNonce(address(this)), nonce);
        assertEq(candidate.code, hex"00");
        vm.etch(candidate, hex"");
        vm.setNonce(candidate, 1);
        vm.expectRevert();
        factory.createLaunchPrepared(p, salt);
        assertEq(factory.creatorLaunchNonce(address(this)), nonce);
        assertEq(candidate.code.length, 0);
        assertEq(vm.getNonce(candidate), 1);
        vm.resetNonce(candidate);
        assertEq(vm.getNonce(candidate), 0);

        FortuneFactory.LaunchInfo memory launched = factory.createLaunchPrepared(p, salt);
        assertEq(launched.token, candidate);
        assertGt(candidate.code.length, 0);
        assertEq(factory.creatorLaunchNonce(address(this)), 1);

        (, address next,, uint256 nextNonce) = _vector("VANITY_NEXT", address(this), p);
        assertEq(nextNonce, 1);
        assertTrue(next != candidate);
        (, address other,, uint256 otherNonce) = _vector("VANITY_OTHER", user, p);
        assertEq(otherNonce, 0);
        assertTrue(other != candidate);
    }

    function _vector(string memory label, address creator, FortuneFactory.LaunchParams memory p)
        internal
        returns (bytes32 salt, address predicted, bytes32 manifest, uint256 nonce)
    {
        (salt, predicted, manifest, nonce) = factory.previewPreparedVanity(creator, p);
        assertEq(
            tokenDeployer.predict(address(factory), p.name, p.symbol, p.totalSupply, manifest, salt),
            predicted
        );
        Context memory context = Context(
            block.chainid, address(factory), address(factory.registry()), address(factory.automationRegistry()),
            address(factory.metadataRegistry()), address(factory.tokenDeployer()), address(factory.vaultDeployer()),
            address(factory.feeRouterDeployer()), address(factory.curveDeployer()), factory.automationExecutor(),
            factory.graduationAdapter()
        );
        bytes memory code = type(FortuneToken).creationCode;
        bytes32 initCodeHash = keccak256(abi.encodePacked(code, abi.encode(address(factory), p.name, p.symbol, p.totalSupply, manifest)));
        emit log_named_bytes(label, abi.encode(context, p, creator, nonce, manifest, salt, predicted, keccak256(code), initCodeHash));
    }
}
