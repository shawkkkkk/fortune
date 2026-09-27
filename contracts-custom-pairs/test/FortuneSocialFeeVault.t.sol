// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneCustomPairToken} from "../src/FortuneCustomPairToken.sol";
import {FortuneSocialFeeVault} from "../src/FortuneSocialFeeVault.sol";
import {IFortuneSocialFeeVault} from "../src/interfaces/IFortuneSocialFeeVault.sol";
import {PlainToken, TaxToken, TaxOnTopToken, RebasingToken, PausableBlacklistToken} from "./mocks/PairTokens.sol";
import {CustomPairBase} from "./CustomPairBase.sol";

/// Stands in for a curve: pays whatever it holds to its fee recipient.
contract FakeFeeSource {
    IERC20 public immutable token;
    address public recipient;

    constructor(IERC20 token_) {
        token = token_;
    }

    function setRecipient(address recipient_) external {
        recipient = recipient_;
    }

    function claimCreatorFees() external returns (uint256) {
        require(msg.sender == recipient, "ONLY_FEE_RECIPIENT");
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "NOTHING_TO_CLAIM");
        token.transfer(recipient, amount);
        return amount;
    }
}

abstract contract SocialVaultBase is CustomPairBase {
    uint8 internal constant X = 1;
    uint8 internal constant GITHUB = 2;
    uint8 internal constant TELEGRAM = 4;

    FortuneSocialFeeVault internal vault;
    uint256 internal attestorKey = 0xA77E57;
    address internal attestor;
    address internal guardian = makeAddr("guardian");
    address internal aliceWallet = makeAddr("aliceWallet");
    address internal aliceNewWallet = makeAddr("aliceNewWallet");
    address internal mallory = makeAddr("mallory");

    function setUp() public virtual override {
        super.setUp();
        attestor = vm.addr(attestorKey);
        vault = new FortuneSocialFeeVault(owner, attestor, guardian);
        vm.startPrank(owner);
        vault.setRegistrar(address(factory), true);
        factory.setSocialFeeVault(address(vault));
        vm.stopPrank();
    }

    function walletShare(address wallet, uint16 bps) internal pure returns (IFortuneSocialFeeVault.FeeShare memory s) {
        s.platform = 0;
        s.wallet = wallet;
        s.shareBps = bps;
    }

    function socialShare(uint8 platform, string memory account, uint16 bps)
        internal
        pure
        returns (IFortuneSocialFeeVault.FeeShare memory s)
    {
        s.platform = platform;
        s.account = account;
        s.shareBps = bps;
    }

    /// creator 50%, X alice 30%, GitHub bob 20%
    function defaultShares() internal view returns (IFortuneSocialFeeVault.FeeShare[] memory shares) {
        shares = new IFortuneSocialFeeVault.FeeShare[](3);
        shares[0] = walletShare(creator, 5_000);
        shares[1] = socialShare(X, "alice", 3_000);
        shares[2] = socialShare(GITHUB, "bob", 2_000);
    }

    function launchSplit(address pairToken, uint256 target, IFortuneSocialFeeVault.FeeShare[] memory shares)
        internal
        returns (FortuneCustomPairCurve curve)
    {
        FortuneCustomPairFactory.LaunchParams memory p = params(pairToken, target);
        p.feeShares = shares;
        vm.prank(creator);
        (, address curveAddress) = factory.createLaunch(p);
        curve = FortuneCustomPairCurve(curveAddress);
        vm.warp(block.timestamp + 16);
    }

    function attest(uint8 platform, string memory account, address wallet, bytes32 stableId, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 id = keccak256(abi.encode(platform, account));
        uint64 nonce = vault.identityOf(id).nonce;
        return sign(attestorKey, vault.bindingDigest(id, wallet, stableId, nonce, deadline));
    }

    function sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function bindAs(address wallet, uint8 platform, string memory account, bytes32 stableId) internal returns (bytes32 id) {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(platform, account, wallet, stableId, deadline);
        vm.prank(wallet);
        (id,) = vault.bind(platform, account, stableId, deadline, signature);
    }

    function one(address token) internal pure returns (address[] memory tokens) {
        tokens = new address[](1);
        tokens[0] = token;
    }

    function tradeForFees(FortuneCustomPairCurve curve, uint256 amount) internal {
        address pair = address(curve.pairToken());
        fund(pair, alice, amount);
        uint256 tokens = buyAs(alice, curve, amount);
        sellAs(alice, curve, tokens / 2);
    }
}

contract FortuneSocialFeeVaultTest is SocialVaultBase {
    PlainToken internal usd;
    TaxToken internal taxed;

    function setUp() public override {
        super.setUp();
        usd = new PlainToken("USD", 18);
        taxed = new TaxToken("TAX", 18, 500);
    }

    // ------------------------------------------------------------ launches

    function test_splitLaunchSendsCreatorFeesToTheVault() public {
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        assertEq(curve.creatorFeeRecipient(), address(vault));
        assertEq(curve.creator(), creator);

        (address token, bytes32[] memory ids, uint16[] memory shares) = vault.curveSharesOf(address(curve));
        assertEq(token, address(usd));
        assertEq(ids.length, 3);
        assertEq(ids[0], vault.walletIdentityOf(creator));
        assertEq(ids[1], vault.identityIdOf(X, "alice"));
        assertEq(ids[2], vault.identityIdOf(GITHUB, "bob"));
        assertEq(shares[0], 5_000);

        // A wallet share is bound from the start; social shares wait for verification.
        assertEq(vault.walletOf(ids[0]), creator);
        assertEq(vault.walletOf(ids[1]), address(0));
        FortuneSocialFeeVault.IdentityView memory aliceView = vault.identityOf(ids[1]);
        assertTrue(aliceView.exists);
        assertEq(aliceView.platform, X);
        assertEq(aliceView.account, "alice");
        assertEq(aliceView.curveCount, 1);
        assertEq(aliceView.tokenCount, 1);

        // The vault never lets the recipient be changed away from it.
        vm.prank(creator);
        vm.expectRevert("ONLY_FEE_RECIPIENT");
        curve.setCreatorFeeRecipient(creator);
    }

    function test_plainLaunchStillPaysTheCreator() public {
        (FortuneCustomPairCurve curve,) = launch(address(usd), 1_000e18);
        assertEq(curve.creatorFeeRecipient(), creator);
    }

    function test_preflightExplainsBadSplits() public {
        FortuneCustomPairFactory.LaunchParams memory p = params(address(usd), 1_000e18);
        p.feeShares = defaultShares();
        (bool ok, bytes32 reason) = factory.preflight(p);
        assertTrue(ok);
        assertEq(reason, bytes32("OK"));

        p.creatorFeeBps = 0;
        (ok, reason) = factory.preflight(p);
        assertEq(reason, bytes32("SHARES_NEED_CREATOR_FEE"));
        p.creatorFeeBps = CREATOR_FEE_BPS;

        p.feeShares[2].shareBps = 1_999;
        (ok, reason) = factory.preflight(p);
        assertFalse(ok);
        assertEq(reason, bytes32("SHARES_NOT_100"));
        p.feeShares[2].shareBps = 2_000;

        p.feeShares[1].account = "Alice";
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("BAD_ACCOUNT"));

        vm.prank(owner);
        factory.setSocialFeeVault(address(0));
        p.feeShares[1].account = "alice";
        (, reason) = factory.preflight(p);
        assertEq(reason, bytes32("SOCIAL_FEES_DISABLED"));

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(FortuneCustomPairFactory.LaunchPreflightFailed.selector, bytes32("SOCIAL_FEES_DISABLED")));
        factory.createLaunch(p);
    }

    function test_checkSharesRejectsEveryMalformedSplit() public view {
        IFortuneSocialFeeVault.FeeShare[] memory none = new IFortuneSocialFeeVault.FeeShare[](0);
        assertReason(none, "SHARE_COUNT");

        IFortuneSocialFeeVault.FeeShare[] memory eleven = new IFortuneSocialFeeVault.FeeShare[](11);
        for (uint256 i; i < 11; ++i) eleven[i] = walletShare(address(uint160(i + 1)), 909);
        assertReason(eleven, "SHARE_COUNT");

        IFortuneSocialFeeVault.FeeShare[] memory shares = new IFortuneSocialFeeVault.FeeShare[](2);
        shares[0] = walletShare(creator, 9_950);
        shares[1] = socialShare(X, "alice", 50);
        assertReason(shares, "SHARE_TOO_SMALL");

        shares[0] = walletShare(creator, 5_000);
        shares[1] = walletShare(creator, 5_000);
        assertReason(shares, "DUPLICATE_SHARE");

        shares[1] = socialShare(X, "alice", 5_000);
        shares[1].wallet = mallory;
        assertReason(shares, "BAD_SOCIAL_SHARE");

        shares[1] = socialShare(33, "alice", 5_000);
        assertReason(shares, "BAD_SOCIAL_SHARE");

        shares[1] = walletShare(address(0), 5_000);
        assertReason(shares, "BAD_WALLET_SHARE");

        shares[1] = walletShare(address(vault), 5_000);
        assertReason(shares, "BAD_WALLET_SHARE");

        shares[1] = walletShare(mallory, 5_000);
        shares[1].account = "mallory";
        assertReason(shares, "BAD_WALLET_SHARE");

        string[6] memory bad = ["", "@alice", "Alice", "al ice", unicode"aliceé", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
        for (uint256 i; i < bad.length; ++i) {
            shares[1] = socialShare(X, bad[i], 5_000);
            assertReason(shares, "BAD_ACCOUNT");
        }

        shares[1] = socialShare(TELEGRAM, "fortune_pad.bnb-1", 5_000);
        (bool ok,) = vault.checkShares(shares);
        assertTrue(ok);

        // Same handle on two platforms is two different accounts.
        shares[0] = socialShare(X, "alice", 5_000);
        shares[1] = socialShare(GITHUB, "alice", 5_000);
        (ok,) = vault.checkShares(shares);
        assertTrue(ok);
    }

    function assertReason(IFortuneSocialFeeVault.FeeShare[] memory shares, bytes32 expected) internal view {
        (bool ok, bytes32 reason) = vault.checkShares(shares);
        assertFalse(ok);
        assertEq(reason, expected);
    }

    function test_onlyRegistrarsRegisterCurves() public {
        vm.prank(mallory);
        vm.expectRevert("ONLY_REGISTRAR");
        vault.registerCurve(address(0xC0), address(usd), defaultShares());

        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, mallory));
        vault.setRegistrar(mallory, true);

        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        vm.prank(address(factory));
        vm.expectRevert("CURVE_REGISTERED");
        vault.registerCurve(address(curve), address(usd), defaultShares());
    }

    // ------------------------------------------------------------ collecting

    function test_collectSplitsWhatArrivedWithDustToTheFirstRecipient() public {
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        tradeForFees(curve, 100e18 + 7);
        uint256 owedByCurve = curve.creatorFeesOwed();
        assertGt(owedByCurve, 0);

        uint256 received = vault.collect(address(curve));
        assertEq(received, owedByCurve);
        assertEq(curve.creatorFeesOwed(), 0);

        bytes32 creatorId = vault.walletIdentityOf(creator);
        bytes32 aliceId = vault.identityIdOf(X, "alice");
        bytes32 bobId = vault.identityIdOf(GITHUB, "bob");
        uint256 aliceOwed = received * 3_000 / 10_000;
        uint256 bobOwed = received * 2_000 / 10_000;
        assertEq(vault.owed(aliceId, address(usd)), aliceOwed);
        assertEq(vault.owed(bobId, address(usd)), bobOwed);
        assertEq(vault.owed(creatorId, address(usd)), received - aliceOwed - bobOwed);
        assertEq(vault.totalOwed(address(usd)), received);
        assertEq(vault.collectedByCurve(address(curve)), received);
        assertEq(usd.balanceOf(address(vault)), received);

        // Nothing left: collecting again is a harmless no-op.
        assertEq(vault.collect(address(curve)), 0);
    }

    function test_collectCreditsOnlyWhatATaxedPairTokenDelivers() public {
        FortuneCustomPairCurve curve = launchSplit(address(taxed), 1_000e18, defaultShares());
        tradeForFees(curve, 100e18);
        uint256 sent = curve.creatorFeesOwed();
        uint256 received = vault.collect(address(curve));
        assertEq(received, sent - sent * 500 / 10_000);
        assertEq(vault.totalOwed(address(taxed)), received);
        assertEq(taxed.balanceOf(address(vault)), received);
    }

    function test_collectRejectsUnknownCurves() public {
        vm.expectRevert("UNKNOWN_CURVE");
        vault.collect(address(0xC0FFEE));
    }

    function test_rescuedCurvePaysItsCreatorClaimThroughTheVault() public {
        PausableBlacklistToken stock = new PausableBlacklistToken();
        FortuneCustomPairCurve curve = launchSplit(address(stock), 1_000e18, defaultShares());
        stock.mint(alice, 2_000e18);
        buyAs(alice, curve, 2_000e18);
        assertTrue(curve.graduationReady());
        // The issuer blacklists the pool: graduation is impossible, so rescue opens after seven days.
        stock.setBlacklisted(curve.pool(), true);
        vm.expectRevert("BLACKLISTED");
        curve.graduate();
        vm.warp(block.timestamp + curve.GRADUATION_RESCUE_DELAY());
        uint256 creatorFees = curve.creatorFeesOwed();
        curve.activateRescue();
        assertEq(curve.rescueCreatorClaims(), creatorFees);

        uint256 expected = stock.balanceOf(address(curve)) * creatorFees
            / (curve.rescueHolderClaims() + curve.rescueProtocolClaims() + creatorFees);
        uint256 received = vault.collect(address(curve));
        assertGt(received, 0);
        assertEq(received, expected);
        assertEq(vault.totalOwed(address(stock)), received);
    }

    // --------------------------------------------------------------- claims

    function test_walletShareClaimsRightAway() public {
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        tradeForFees(curve, 100e18);
        vault.collect(address(curve));
        bytes32 creatorId = vault.walletIdentityOf(creator);
        uint256 owedAmount = vault.owed(creatorId, address(usd));

        vm.prank(mallory);
        vm.expectRevert("ONLY_BOUND_WALLET");
        vault.claim(creatorId, one(address(usd)));

        vm.prank(creator);
        uint256[] memory paid = vault.claim(creatorId, one(address(usd)));
        assertEq(paid[0], owedAmount);
        assertEq(usd.balanceOf(creator), owedAmount);
        assertEq(vault.owed(creatorId, address(usd)), 0);

        vm.prank(creator);
        vm.expectRevert("NOTHING_TO_CLAIM");
        vault.claim(creatorId, one(address(usd)));
    }

    function test_socialShareClaimsAfterVerifiedBindingTakesEffect() public {
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        tradeForFees(curve, 100e18);
        vault.collect(address(curve));
        bytes32 aliceId = vault.identityIdOf(X, "alice");
        uint256 owedAmount = vault.owed(aliceId, address(usd));

        // Nobody can claim for an account that has not verified.
        vm.prank(aliceWallet);
        vm.expectRevert("ONLY_BOUND_WALLET");
        vault.claim(aliceId, one(address(usd)));

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(X, "alice", aliceWallet, bytes32(uint256(12)), deadline);
        vm.prank(aliceWallet);
        (bytes32 id, uint64 effectiveAt) = vault.bind(X, "alice", bytes32(uint256(12)), deadline, signature);
        assertEq(id, aliceId);
        assertEq(effectiveAt, block.timestamp + vault.FIRST_BIND_DELAY());

        FortuneSocialFeeVault.IdentityView memory pending = vault.identityOf(aliceId);
        assertEq(pending.wallet, address(0));
        assertEq(pending.pendingWallet, aliceWallet);
        assertEq(pending.stableId, bytes32(0));

        vm.prank(aliceWallet);
        vm.expectRevert("ONLY_BOUND_WALLET");
        vault.claim(aliceId, one(address(usd)));

        vm.warp(effectiveAt);
        FortuneSocialFeeVault.IdentityView memory bound = vault.identityOf(aliceId);
        assertEq(bound.wallet, aliceWallet);
        assertEq(bound.pendingWallet, address(0));
        assertEq(bound.stableId, bytes32(uint256(12)));

        vm.prank(aliceWallet);
        uint256[] memory paid = vault.claim(aliceId, one(address(usd)));
        assertEq(paid[0], owedAmount);
        assertEq(usd.balanceOf(aliceWallet), owedAmount);

        bytes32[] memory mine = vault.identitiesOfWallet(aliceWallet, 0, 10);
        assertEq(mine.length, 1);
        assertEq(mine[0], aliceId);
    }

    function test_verifyingBeforeAnyLaunchWorks() public {
        bytes32 id = bindAs(aliceWallet, X, "alice", bytes32(0));
        vm.warp(block.timestamp + vault.FIRST_BIND_DELAY());
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        tradeForFees(curve, 100e18);
        address[] memory curves = new address[](1);
        curves[0] = address(curve);
        vm.prank(aliceWallet);
        uint256[] memory paid = vault.collectAndClaim(curves, id, one(address(usd)));
        assertGt(paid[0], 0);
        assertEq(usd.balanceOf(aliceWallet), paid[0]);
    }

    function test_collectAndClaimAcrossCurvesAndTokens() public {
        FortuneCustomPairCurve first = launchSplit(address(usd), 1_000e18, defaultShares());
        FortuneCustomPairCurve second = launchSplit(address(usd), 2_000e18, defaultShares());
        FortuneCustomPairCurve third = launchSplit(address(taxed), 1_000e18, defaultShares());
        tradeForFees(first, 50e18);
        tradeForFees(second, 80e18);
        tradeForFees(third, 60e18);
        bytes32 bobId = bindAs(bob, GITHUB, "bob", bytes32(uint256(77)));
        vm.warp(block.timestamp + 1 hours);

        assertEq(vault.identityOf(bobId).curveCount, 3);
        address[] memory curves = vault.curvesOf(bobId, 0, 10);
        assertEq(curves[0], address(third));
        address[] memory tokens = vault.tokensOf(bobId, 0, 10);
        assertEq(tokens.length, 2);

        uint256 usdBefore = usd.balanceOf(bob);
        uint256 taxedBefore = taxed.balanceOf(bob);
        vm.prank(bob);
        uint256[] memory paid = vault.collectAndClaim(curves, bobId, tokens);
        assertEq(usd.balanceOf(bob) - usdBefore, paid[tokens[0] == address(usd) ? 0 : 1]);
        // The taxed token takes its tax again on the way to bob.
        uint256 taxedPaid = paid[tokens[0] == address(taxed) ? 0 : 1];
        assertEq(taxed.balanceOf(bob) - taxedBefore, taxedPaid - taxedPaid * 500 / 10_000);
        assertEq(vault.owed(bobId, address(usd)), 0);
        assertEq(vault.owed(bobId, address(taxed)), 0);
    }

    // -------------------------------------------------------------- binding

    function test_bindRejectsForgedReplayedExpiredAndStolenAttestations() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory forged = sign(0xBAD, vault.bindingDigest(vault.identityIdOf(X, "alice"), aliceWallet, 0, 0, deadline));
        vm.prank(aliceWallet);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", 0, deadline, forged);

        bytes memory signature = attest(X, "alice", aliceWallet, 0, deadline);
        // A signature for Alice's wallet is useless from any other wallet.
        vm.prank(mallory);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", 0, deadline, signature);
        // ...or for another account, platform or stable id.
        vm.startPrank(aliceWallet);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice2", 0, deadline, signature);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(GITHUB, "alice", 0, deadline, signature);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", bytes32(uint256(1)), deadline, signature);

        vault.bind(X, "alice", 0, deadline, signature);
        vm.expectRevert("ALREADY_PENDING");
        vault.bind(X, "alice", 0, deadline, signature);
        vm.stopPrank();

        // Replay from a fresh wallet state fails: the nonce moved on.
        bytes32 aliceId = vault.identityIdOf(X, "alice");
        vm.prank(aliceWallet);
        vault.cancelPendingBinding(aliceId);
        vm.prank(aliceWallet);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", 0, deadline, signature);

        bytes memory late = attest(X, "alice", aliceWallet, 0, deadline);
        vm.warp(deadline + 1);
        vm.prank(aliceWallet);
        vm.expectRevert("ATTESTATION_EXPIRED");
        vault.bind(X, "alice", 0, deadline, late);
    }

    function test_bindRejectsWalletPlatformAndNonCanonicalHandles() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.startPrank(aliceWallet);
        vm.expectRevert("BAD_PLATFORM");
        vault.bind(0, "alice", 0, deadline, "");
        vm.expectRevert("BAD_PLATFORM");
        vault.bind(33, "alice", 0, deadline, "");
        vm.expectRevert("BAD_ACCOUNT");
        vault.bind(X, "Alice", 0, deadline, "");
        vm.stopPrank();
    }

    function test_walletChangeWaitsAndTheBoundWalletCanVetoIt() public {
        bytes32 id = bindAs(aliceWallet, X, "alice", bytes32(uint256(12)));
        vm.warp(block.timestamp + 1 hours);
        assertEq(vault.walletOf(id), aliceWallet);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(X, "alice", mallory, bytes32(uint256(12)), deadline);
        vm.prank(mallory);
        (, uint64 effectiveAt) = vault.bind(X, "alice", bytes32(uint256(12)), deadline, signature);
        assertEq(effectiveAt, block.timestamp + vault.REBIND_DELAY());

        // Until then fees keep going to the bound wallet.
        vm.warp(effectiveAt - 1);
        assertEq(vault.walletOf(id), aliceWallet);

        vm.prank(bob);
        vm.expectRevert("NOT_ALLOWED");
        vault.cancelPendingBinding(id);

        vm.prank(aliceWallet);
        vault.cancelPendingBinding(id);
        vm.warp(effectiveAt + 1);
        assertEq(vault.walletOf(id), aliceWallet);

        // A real wallet change goes through after the delay.
        bindAs(aliceNewWallet, X, "alice", bytes32(uint256(12)));
        vm.warp(block.timestamp + vault.REBIND_DELAY());
        assertEq(vault.walletOf(id), aliceNewWallet);
    }

    function test_firstBindingPinsThePermanentAccountId() public {
        bytes32 id = bindAs(aliceWallet, X, "alice", bytes32(uint256(12)));
        vm.warp(block.timestamp + 1 hours);

        // Someone who registers the handle later has a different permanent id.
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(X, "alice", mallory, bytes32(uint256(99)), deadline);
        vm.prank(mallory);
        vm.expectRevert("STABLE_ID_MISMATCH");
        vault.bind(X, "alice", bytes32(uint256(99)), deadline, signature);
        assertEq(vault.identityOf(id).stableId, bytes32(uint256(12)));
    }

    function test_cancelledBindingPinsNothing() public {
        bytes32 id = bindAs(mallory, X, "alice", bytes32(uint256(99)));
        vm.prank(guardian);
        vault.cancelPendingBinding(id);
        vm.warp(block.timestamp + 2 hours);
        assertEq(vault.walletOf(id), address(0));
        assertEq(vault.identityOf(id).stableId, bytes32(0));

        bindAs(aliceWallet, X, "alice", bytes32(uint256(12)));
        vm.warp(block.timestamp + 1 hours);
        assertEq(vault.walletOf(id), aliceWallet);
        assertEq(vault.identityOf(id).stableId, bytes32(uint256(12)));
    }

    function test_pendingBindingsCannotBeCancelledOnceActive() public {
        bytes32 id = bindAs(aliceWallet, X, "alice", 0);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(guardian);
        vm.expectRevert("NOTHING_PENDING");
        vault.cancelPendingBinding(id);
    }

    function test_guardianPausesBindingsButOnlyTheOwnerResumes() public {
        vm.prank(mallory);
        vm.expectRevert("NOT_ALLOWED");
        vault.setBindingsPaused(true);

        vm.prank(guardian);
        vault.setBindingsPaused(true);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(X, "alice", aliceWallet, 0, deadline);
        vm.prank(aliceWallet);
        vm.expectRevert("BINDINGS_PAUSED");
        vault.bind(X, "alice", 0, deadline, signature);

        vm.prank(guardian);
        vm.expectRevert("NOT_ALLOWED");
        vault.setBindingsPaused(false);

        vm.prank(owner);
        vault.setBindingsPaused(false);
        vm.prank(aliceWallet);
        vault.bind(X, "alice", 0, deadline, signature);
    }

    function test_rotatingTheAttestorInvalidatesItsUnusedSignatures() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory signature = attest(X, "alice", aliceWallet, 0, deadline);
        vm.prank(owner);
        vault.setAttestor(makeAddr("newAttestor"));
        vm.prank(aliceWallet);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", 0, deadline, signature);
    }

    function test_zeroAttestorBindsNobody() public {
        vm.prank(owner);
        vault.setAttestor(address(0));
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes32 id = vault.identityIdOf(X, "alice");
        bytes memory signature = sign(0x5EED, vault.bindingDigest(id, aliceWallet, 0, 0, deadline));
        vm.prank(aliceWallet);
        vm.expectRevert("BAD_ATTESTATION");
        vault.bind(X, "alice", 0, deadline, signature);
        // An all-zero signature does not recover to the zero address either.
        vm.prank(aliceWallet);
        vm.expectRevert();
        vault.bind(X, "alice", 0, deadline, new bytes(65));
    }

    /// The same constants are asserted in tests/web/social-fees.test.mjs, so the
    /// website's EIP-712 signing and ids can never drift from the contract.
    function test_websiteSigningMatchesTheVault() public {
        vm.chainId(97);
        address at = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
        deployCodeTo("FortuneSocialFeeVault.sol:FortuneSocialFeeVault", abi.encode(owner, attestor, guardian), at);
        FortuneSocialFeeVault pinned = FortuneSocialFeeVault(at);
        bytes32 id = 0x935b450ef3bbe9c6a7771a42e8197c6f437f2b7d862d50bf7f8986296593dedb;
        address wallet = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        assertEq(pinned.identityIdOf(1, "fortunepad"), id);
        assertEq(pinned.walletIdentityOf(wallet), 0xd3a93e7218b271cb9ca81fec1cdfcf6e7686ea0002660580b37e3bb93bc52785);
        assertEq(
            pinned.bindingDigest(id, wallet, bytes32(uint256(12)), 3, 1_900_000_000),
            0xd66a5bd92f5a4ed8c1faa95a893b7b551ab27febe7a5d30997195b1dafb2eb71
        );
    }

    function test_recipientViewsForTheWebsite() public {
        FortuneCustomPairCurve curve = launchSplit(address(usd), 1_000e18, defaultShares());
        bindAs(aliceWallet, X, "alice", bytes32(uint256(12)));
        (FortuneSocialFeeVault.IdentityView[] memory recipients, uint16[] memory shares) =
            vault.curveRecipients(address(curve));
        assertEq(recipients.length, 3);
        assertEq(recipients[0].wallet, creator);
        assertEq(recipients[1].account, "alice");
        assertEq(recipients[1].pendingWallet, aliceWallet);
        assertEq(recipients[2].account, "bob");
        assertEq(recipients[2].wallet, address(0));
        assertEq(shares[2], 2_000);

        assertEq(vault.walletIdentityCount(creator), 1);
        assertEq(vault.identitiesOfWallet(creator, 0, 10)[0], vault.walletIdentityOf(creator));
        assertEq(vault.identitiesOfWallet(creator, 1, 10).length, 0);
        assertEq(vault.curvesOf(recipients[1].identityId, 5, 10).length, 0);
    }
}

/// The vault on its own, with stand-in fee sources.
contract FortuneSocialFeeVaultAccountingTest is SocialVaultBase {
    function registerFake(IERC20 token, IFortuneSocialFeeVault.FeeShare[] memory shares) internal returns (FakeFeeSource source) {
        source = new FakeFeeSource(token);
        source.setRecipient(address(vault));
        vm.prank(owner);
        vault.setRegistrar(address(this), true);
        vault.registerCurve(address(source), address(token), shares);
    }

    function twoWallets() internal view returns (IFortuneSocialFeeVault.FeeShare[] memory shares) {
        shares = new IFortuneSocialFeeVault.FeeShare[](2);
        shares[0] = walletShare(alice, 5_000);
        shares[1] = walletShare(bob, 5_000);
    }

    function test_claimsShareAHaircutWhenTheVaultBalanceShrinks() public {
        RebasingToken reb = new RebasingToken();
        FakeFeeSource source = registerFake(IERC20(address(reb)), twoWallets());
        reb.mint(address(source), 100e18);
        assertEq(vault.collect(address(source)), 100e18);

        reb.rebase(0.8e18);
        bytes32 aliceId = vault.walletIdentityOf(alice);
        bytes32 bobId = vault.walletIdentityOf(bob);
        assertEq(vault.claimable(aliceId, address(reb)), 40e18);

        vm.prank(alice);
        uint256[] memory alicePaid = vault.claim(aliceId, one(address(reb)));
        vm.prank(bob);
        uint256[] memory bobPaid = vault.claim(bobId, one(address(reb)));
        assertEq(alicePaid[0], 40e18);
        assertEq(bobPaid[0], 40e18);
        assertEq(vault.totalOwed(address(reb)), 0);
    }

    function test_aTokenThatTakesExtraFromTheVaultCannotBeClaimed() public {
        TaxOnTopToken top = new TaxOnTopToken(500);
        FakeFeeSource source = registerFake(IERC20(address(top)), twoWallets());
        top.mint(address(source), 100e18);
        vault.collect(address(source));
        // Even with spare balance to cover the tax, the vault refuses to lose
        // more than it pays, because that would come out of other claims.
        top.mint(address(vault), 10e18);

        bytes32 aliceId = vault.walletIdentityOf(alice);
        vm.prank(alice);
        vm.expectRevert("TOKEN_TAKES_EXTRA");
        vault.claim(aliceId, one(address(top)));
        assertEq(vault.owed(aliceId, address(top)), 50e18);
    }

    function test_donationsNeverInflateClaims() public {
        PlainToken usd = new PlainToken("USD", 18);
        FakeFeeSource source = registerFake(IERC20(address(usd)), twoWallets());
        usd.mint(address(source), 10e18);
        vault.collect(address(source));
        usd.mint(address(vault), 1_000e18);

        bytes32 aliceId = vault.walletIdentityOf(alice);
        assertEq(vault.claimable(aliceId, address(usd)), 5e18);
        vm.prank(alice);
        uint256[] memory paid = vault.claim(aliceId, one(address(usd)));
        assertEq(paid[0], 5e18);
    }

    function test_aFailingSourceCollectsNothingAndBlocksNothing() public {
        PlainToken usd = new PlainToken("USD", 18);
        FakeFeeSource source = registerFake(IERC20(address(usd)), twoWallets());
        source.setRecipient(mallory);
        usd.mint(address(source), 10e18);
        assertEq(vault.collect(address(source)), 0);
        assertEq(vault.totalOwed(address(usd)), 0);
    }

    function testFuzz_splitCreditsExactlyWhatArrived(uint256 amount, uint16 a, uint16 b, uint16 c) public {
        amount = bound(amount, 1, 1e36);
        uint16 first = uint16(bound(a, 100, 9_700));
        uint16 second = uint16(bound(b, 100, 9_900 - first));
        uint16 third = 10_000 - first - second;
        vm.assume(third >= 100);
        IFortuneSocialFeeVault.FeeShare[] memory shares = new IFortuneSocialFeeVault.FeeShare[](3);
        shares[0] = walletShare(alice, first);
        shares[1] = socialShare(X, "someone", second);
        shares[2] = socialShare(TELEGRAM, "a_channel", third);
        c;

        PlainToken usd = new PlainToken("USD", 18);
        FakeFeeSource source = registerFake(IERC20(address(usd)), shares);
        usd.mint(address(source), amount);
        vault.collect(address(source));

        uint256 x = vault.owed(vault.identityIdOf(X, "someone"), address(usd));
        uint256 t = vault.owed(vault.identityIdOf(TELEGRAM, "a_channel"), address(usd));
        uint256 w = vault.owed(vault.walletIdentityOf(alice), address(usd));
        assertEq(x + t + w, amount);
        assertEq(x, amount * second / 10_000);
        assertEq(t, amount * third / 10_000);
        assertLe(w - amount * first / 10_000, 2);
        assertEq(vault.totalOwed(address(usd)), amount);
    }
}
