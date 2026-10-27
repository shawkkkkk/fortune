// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneTestnetStrategyVault as Vault, IStrategyV3Router} from "../src/FortuneTestnetStrategyVault.sol";

contract StrategyAssetMock is ERC20 {
    constructor() ERC20("Test strategy asset", "TSA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function forceAllowance(address owner, address spender, uint256 amount) external {
        _approve(owner, spender, amount);
    }
}

contract StrategyFactoryMock {
    address public pool;

    function setPool(address p) external {
        pool = p;
    }

    function getPool(address, address, uint24) external view returns (address) {
        return pool;
    }
}

contract StrategyPoolMock {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public constant fee = 500;

    constructor(address f, address a, address b) {
        factory = f;
        (token0, token1) = a < b ? (a, b) : (b, a);
    }
}

contract StrategyRouterMock is IStrategyV3Router {
    address public immutable factory;
    uint256 public mode;
    uint256 public outputOverride;
    uint256 public lastAllowance;
    uint256 public lastMinimum;
    address public lastRecipient;
    bool public caughtReentry;

    constructor(address f) {
        factory = f;
    }

    function configure(uint256 m, uint256 out) external {
        mode = m;
        outputOverride = out;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 result) {
        require(p.fee == 500 && p.sqrtPriceLimitX96 == 0 && p.deadline >= block.timestamp, "wrong route");
        lastAllowance = IERC20(p.tokenIn).allowance(msg.sender, address(this));
        lastMinimum = p.amountOutMinimum;
        lastRecipient = p.recipient;
        if (mode == 4) revert("venue failed");
        uint256 used = mode == 1 ? p.amountIn / 2 : mode == 5 ? p.amountIn + 1 : p.amountIn;
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), used);
        result = outputOverride == 0 ? p.amountIn : outputOverride;
        if (mode == 2) result /= 2;
        IERC20(p.tokenOut).transfer(p.recipient, result);
        if (mode == 3) result += 1;
        if (mode == 6) {
            Vault.Order memory nested = Vault.Order(p.tokenIn, 1, 1, block.timestamp, 0, 0);
            (bool ok,) = msg.sender.call(abi.encodeCall(Vault.executeSwap, (nested)));
            require(!ok, "reentry succeeded");
            caughtReentry = true;
        }
    }
}

contract StrategyVaultFixture is Test {
    StrategyAssetMock internal a;
    StrategyAssetMock internal b;
    StrategyFactoryMock internal factory;
    StrategyRouterMock internal router;
    StrategyPoolMock internal pool;
    Vault internal vault;
    address internal constant GUARDIAN = address(0x600D);
    address internal constant TREASURY = address(0x700D);
    address internal constant AGENT = address(0xA6E);
    uint128 internal constant UNIT = uint128(1 << 96);
    Vault.Infrastructure internal infra;
    Vault.AssetConfig internal ac;
    Vault.AssetConfig internal bc;

    function setUp() public virtual {
        vm.chainId(97);
        vm.warp(10 days);
        a = new StrategyAssetMock();
        b = new StrategyAssetMock();
        factory = new StrategyFactoryMock();
        router = new StrategyRouterMock(address(factory));
        pool = new StrategyPoolMock(address(factory), address(a), address(b));
        factory.setPool(address(pool));
        infra = Vault.Infrastructure(
            address(router),
            address(factory),
            address(pool),
            address(router).codehash,
            address(factory).codehash,
            address(pool).codehash,
            500
        );
        ac = Vault.AssetConfig(address(a), address(a).codehash, 200 ether, 1000 ether, 100 ether);
        bc = Vault.AssetConfig(address(b), address(b).codehash, 200 ether, 1000 ether, 100 ether);
        vault = new Vault(address(this), GUARDIAN, TREASURY, infra, ac, bc);
        a.mint(address(vault), 2000 ether);
        b.mint(address(vault), 2000 ether);
        a.mint(address(router), 10000 ether);
        b.mint(address(router), 10000 ether);
    }

    function _enable() internal {
        vault.setOperator(AGENT);
        vault.setPricingFloor(UNIT, UNIT, block.timestamp + 1 hours);
        vault.unpause();
    }

    function _refresh() internal {
        vault.pause();
        vault.setPricingFloor(UNIT, UNIT, block.timestamp + 1 hours);
        vault.unpause();
    }

    function _order(address token, uint256 amount) internal view returns (Vault.Order memory) {
        return Vault.Order(token, amount, 0, block.timestamp + 60, vault.authorizationEpoch(), vault.nextNonce());
    }

    function _trade(address token, uint256 amount) internal returns (uint256 out) {
        Vault.Order memory order = _order(token, amount);
        vm.prank(AGENT);
        return vault.executeSwap(order);
    }

    function _expect(bytes4 reason, Vault.Order memory order) internal {
        vm.prank(AGENT);
        vm.expectRevert(reason);
        vault.executeSwap(order);
    }
}

contract FortuneTestnetStrategyVaultTest is StrategyVaultFixture {
    function test_DefaultPausedNoAuthorityOrApprovals() public {
        assertTrue(vault.paused());
        assertEq(vault.operator(), address(0));
        assertEq(a.allowance(address(vault), address(router)), 0);
        vm.expectRevert(Vault.PolicyExpired.selector);
        vault.unpause();
        Vault.Order memory order = _order(address(a), 1 ether);
        _expect(Vault.Unauthorized.selector, order);
        vault.setOperator(AGENT);
        _expect(Vault.ExecutionPaused.selector, _order(address(a), 1 ether));
    }

    function test_ExactInputExactApprovalFixedRecipientAndBothDirections() public {
        _enable();
        assertEq(_trade(address(a), 25 ether), 25 ether);
        assertEq(router.lastAllowance(), 25 ether);
        assertEq(router.lastMinimum(), 25 ether);
        assertEq(router.lastRecipient(), address(vault));
        assertEq(a.allowance(address(vault), address(router)), 0);
        assertEq(b.allowance(address(vault), address(router)), 0);
        assertEq(_trade(address(b), 10 ether), 10 ether);
        assertEq(vault.nextNonce(), 2);
        (, uint256 spentA,,) = vault.spendWindow(address(a));
        (, uint256 spentB,,) = vault.spendWindow(address(b));
        assertEq(spentA, 25 ether);
        assertEq(spentB, 10 ether);
    }

    function test_OperatorCannotChangePolicyWithdrawOrCallArbitraryTargets() public {
        _enable();
        vm.startPrank(AGENT);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.setOperator(address(99));
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.setPricingFloor(1, 1, block.timestamp + 60);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.withdrawToTreasury(address(a), 1);
        (bool ok,) = address(vault).call(abi.encodeWithSignature("execute(address,bytes)", address(a), bytes("")));
        assertFalse(ok);
        vm.stopPrank();
        vm.expectRevert(Vault.MustBePaused.selector);
        vault.setPricingFloor(UNIT, UNIT, block.timestamp + 60);
    }

    function test_PerTradeCapReserveAndUnknownAsset() public {
        _enable();
        _expect(Vault.BudgetExceeded.selector, _order(address(a), 201 ether));
        _expect(Vault.InvalidOrder.selector, _order(address(99), 1));
        _expect(Vault.InvalidOrder.selector, _order(address(a), 0));
        vault.pause();
        vault.withdrawToTreasury(address(a), 1850 ether);
        vault.unpause();
        _expect(Vault.InsufficientReserve.selector, _order(address(a), 51 ether));
        assertEq(_trade(address(a), 50 ether), 50 ether);
        assertEq(a.balanceOf(address(vault)), 100 ether);
    }

    function test_RollingCapDoesNotResetAtPolicyChangesOrWindowBoundary() public {
        _enable();
        _trade(address(a), 1 ether);
        uint256 start = block.timestamp;
        vm.warp(start + 1 days - 1);
        _refresh();
        for (uint256 i; i < 4; ++i) {
            _trade(address(a), 200 ether);
        }
        _trade(address(a), 199 ether);
        _expect(Vault.BudgetExceeded.selector, _order(address(a), 1));
        vm.warp(start + 1 days); // Only the first 1-token spend expires, not the later 999.
        _expect(Vault.BudgetExceeded.selector, _order(address(a), 2 ether));
        assertEq(_trade(address(a), 1 ether), 1 ether);
        (, uint256 spent,,) = vault.spendWindow(address(a));
        assertEq(spent, 1000 ether);
    }

    function test_RingLimitFailsClosedAndPrunesOnlyExpiredTrades() public {
        _enable();
        for (uint256 i; i < 64; ++i) {
            _trade(address(a), 1);
        }
        _expect(Vault.BudgetExceeded.selector, _order(address(a), 1));
        vm.warp(block.timestamp + 1 days);
        _refresh();
        _trade(address(a), 1);
        (, uint256 spent,, uint256 count) = vault.spendWindow(address(a));
        assertEq(spent, 1);
        assertEq(count, 1);
    }

    function test_ExpiredPolicyAndBadDeadlinesNoncesEpochs() public {
        _enable();
        Vault.Order memory order = _order(address(a), 1 ether);
        order.deadline = block.timestamp + 121;
        _expect(Vault.InvalidOrder.selector, order);
        order = _order(address(a), 1 ether);
        order.deadline = block.timestamp - 1;
        _expect(Vault.InvalidOrder.selector, order);
        order = _order(address(a), 1 ether);
        order.nonce = 1;
        _expect(Vault.InvalidOrder.selector, order);
        order = _order(address(a), 1 ether);
        order.epoch = 0;
        _expect(Vault.InvalidOrder.selector, order);
        vm.warp(vault.policyExpiresAt());
        _expect(Vault.PolicyExpired.selector, _order(address(a), 1 ether));
    }

    function test_RevocationAndPauseInvalidateSavedOrdersWithoutResettingBudgets() public {
        _enable();
        _trade(address(a), 10 ether);
        Vault.Order memory saved = _order(address(a), 1 ether);
        vm.prank(GUARDIAN);
        vault.revokeOperator();
        assertTrue(vault.paused());
        _expect(Vault.Unauthorized.selector, saved);
        vm.prank(GUARDIAN);
        vm.expectRevert(Vault.Unauthorized.selector);
        vault.unpause();
        vault.setOperator(AGENT);
        vault.unpause();
        _expect(Vault.InvalidOrder.selector, saved);
        (, uint256 spent,,) = vault.spendWindow(address(a));
        assertEq(spent, 10 ether);
    }

    function test_ReplayFailsAndRouterReentryCannotEscape() public {
        _enable();
        Vault.Order memory order = _order(address(a), 1 ether);
        vm.prank(AGENT);
        vault.executeSwap(order);
        _expect(Vault.InvalidOrder.selector, order);
        router.configure(6, 0);
        _trade(address(a), 1 ether);
        assertTrue(router.caughtReentry());
    }

    function test_BadVenueFillsRollBackBalancesAllowanceBudgetAndNonce() public {
        _enable();
        for (uint256 mode = 1; mode <= 5; ++mode) {
            router.configure(mode, 0);
            Vault.Order memory order = _order(address(a), 10 ether);
            vm.prank(AGENT);
            vm.expectRevert();
            vault.executeSwap(order);
            assertEq(a.balanceOf(address(vault)), 2000 ether);
            assertEq(b.balanceOf(address(vault)), 2000 ether);
            assertEq(vault.nextNonce(), 0);
            assertEq(a.allowance(address(vault), address(router)), 0);
            (, uint256 spent,,) = vault.spendWindow(address(a));
            assertEq(spent, 0);
        }
    }

    function test_StaleCodeCanonicalPoolAndResidualAllowancesFailClosed() public {
        _enable();
        a.forceAllowance(address(vault), address(router), 1);
        _expect(Vault.AllowanceNotZero.selector, _order(address(a), 1 ether));
        a.forceAllowance(address(vault), address(router), 0);
        factory.setPool(address(99));
        _expect(Vault.InvalidConfiguration.selector, _order(address(a), 1 ether));
        factory.setPool(address(pool));
        vm.etch(address(router), hex"60006000fd");
        _expect(Vault.UntrustedCode.selector, _order(address(a), 1 ether));
    }

    function test_TreasuryRecoveryOnlyWhilePausedAndNoNativeInput() public {
        _enable();
        vm.expectRevert(Vault.MustBePaused.selector);
        vault.withdrawToTreasury(address(a), 1);
        vm.prank(GUARDIAN);
        vault.pause();
        vault.withdrawToTreasury(address(a), 2000 ether);
        assertEq(a.balanceOf(TREASURY), 2000 ether);
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(vault).call{value: 1}("");
        assertFalse(ok);
    }

    function test_MainnetDeploymentAndRuntimeChainChangeReject() public {
        vm.chainId(56);
        vm.expectRevert(Vault.WrongChain.selector);
        new Vault(address(this), GUARDIAN, TREASURY, infra, ac, bc);
        vm.chainId(97);
        _enable();
        vm.chainId(56);
        _expect(Vault.WrongChain.selector, _order(address(a), 1 ether));
        vm.expectRevert(Vault.WrongChain.selector);
        vault.pause();
        vm.expectRevert(Vault.WrongChain.selector);
        vault.withdrawToTreasury(address(a), 1);
    }

    function test_InvalidConfigurationAndPricingPolicyReject() public {
        Vault.AssetConfig memory bad = ac;
        bad.maxPerTrade = 0;
        vm.expectRevert(Vault.InvalidConfiguration.selector);
        new Vault(address(this), GUARDIAN, TREASURY, infra, bad, bc);
        vm.expectRevert(Vault.InvalidConfiguration.selector);
        vault.setPricingFloor(0, UNIT, block.timestamp + 1);
        vm.expectRevert(Vault.InvalidConfiguration.selector);
        vault.setPricingFloor(UNIT, UNIT, block.timestamp + 1 hours + 1);
        vm.expectRevert(Vault.InvalidConfiguration.selector);
        vault.setOperator(address(router));
    }

    function testFuzz_CeilingPriceFloorCannotRoundDown(uint128 rawAmount, uint128 rawRate) public {
        uint256 amount = bound(uint256(rawAmount), 1, 200 ether);
        uint128 rate = uint128(bound(uint256(rawRate), 1, uint256(UNIT) * 2));
        uint256 minimum = (amount * rate + UNIT - 1) / UNIT;
        vault.setOperator(AGENT);
        vault.setPricingFloor(rate, UNIT, block.timestamp + 1 hours);
        vault.unpause();
        router.configure(0, minimum);
        assertEq(_trade(address(a), amount), minimum);
        assertEq(router.lastMinimum(), minimum);
    }

    function testFuzz_RequestedMinimumCannotWeakenGovernorFloor(uint128 rawAmount) public {
        uint256 amount = bound(uint256(rawAmount), 1, 200 ether);
        _enable();
        Vault.Order memory order = _order(address(a), amount);
        order.minAmountOut = amount + 1;
        vm.prank(AGENT);
        vm.expectRevert(Vault.BadFill.selector);
        vault.executeSwap(order);
        assertEq(vault.nextNonce(), 0);
        assertEq(a.allowance(address(vault), address(router)), 0);
    }
}

contract StrategyVaultHandler is Test {
    Vault public immutable vault;
    address public immutable a;
    address public immutable b;
    uint256 public successes;
    uint256 public attempts;
    uint256 public unexpectedReverts;

    constructor(Vault v, address a_, address b_) {
        vault = v;
        a = a_;
        b = b_;
    }

    function swap(uint128 raw, bool reverse) external {
        uint256 amount = bound(uint256(raw), 1, 200 ether);
        Vault.Order memory order = Vault.Order(
            reverse ? b : a, amount, 0, block.timestamp + 60, vault.authorizationEpoch(), vault.nextNonce()
        );
        ++attempts;
        try vault.executeSwap(order) {
            ++successes;
        } catch (bytes memory reason) {
            bytes4 selector;
            if (reason.length >= 4) assembly { selector := mload(add(reason, 32)) }
            if (selector != Vault.BudgetExceeded.selector) ++unexpectedReverts;
        }
    }
}

contract FortuneStrategyVaultInvariantTest is StdInvariant, StrategyVaultFixture {
    StrategyVaultHandler internal handler;

    function setUp() public override {
        StrategyVaultFixture.setUp();
        handler = new StrategyVaultHandler(vault, address(a), address(b));
        vault.setOperator(address(handler));
        vault.setPricingFloor(UNIT, UNIT, block.timestamp + 1 hours);
        vault.unpause();
        targetContract(address(handler));
    }

    function invariant_AllowancesAlwaysReturnToZero() public view {
        assertEq(a.allowance(address(vault), address(router)), 0);
        assertEq(b.allowance(address(vault), address(router)), 0);
    }

    function invariant_CapsReservesAndNonceAlwaysReconcile() public view {
        (, uint256 sa,, uint256 ca) = vault.spendWindow(address(a));
        (, uint256 sb,, uint256 cb) = vault.spendWindow(address(b));
        assertLe(sa, 1000 ether);
        assertLe(sb, 1000 ether);
        assertLe(ca, 64);
        assertLe(cb, 64);
        assertGe(a.balanceOf(address(vault)), 100 ether);
        assertGe(b.balanceOf(address(vault)), 100 ether);
        assertEq(vault.nextNonce(), handler.successes());
        assertEq(handler.unexpectedReverts(), 0);
        if (handler.attempts() != 0) assertGt(handler.successes(), 0);
        assertEq(a.balanceOf(address(vault)) + a.balanceOf(address(router)), 12000 ether);
        assertEq(b.balanceOf(address(vault)) + b.balanceOf(address(router)), 12000 ether);
    }
}
