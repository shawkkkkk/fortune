// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FortuneCustomPairFactory} from "../src/FortuneCustomPairFactory.sol";
import {FortuneLaunchRules} from "../src/FortuneLaunchRules.sol";
import {FortuneCustomPairCurve} from "../src/FortuneCustomPairCurve.sol";
import {FortuneSocialFeeVault} from "../src/FortuneSocialFeeVault.sol";
import {IFortuneSocialFeeVault} from "../src/interfaces/IFortuneSocialFeeVault.sol";
import {MockPancakeV2Factory} from "./mocks/MockPancakeV2.sol";
import {PlainToken, TaxToken} from "./mocks/PairTokens.sol";

contract SocialVaultHandler is Test {
    FortuneSocialFeeVault public immutable vault;
    FortuneCustomPairCurve[] internal curves;
    address[] internal pairTokens;
    address[] internal traders;
    address[] internal wallets;
    bytes32[] public identities;
    uint8[] internal platforms;
    string[] internal accounts;
    uint256 internal immutable attestorKey;

    mapping(address => uint256) public collected;
    mapping(address => uint256) public debited;
    uint256 public claims;
    uint256 public binds;

    constructor(
        FortuneSocialFeeVault vault_,
        FortuneCustomPairCurve[] memory curves_,
        address[] memory pairTokens_,
        bytes32[] memory ids,
        uint256 key
    ) {
        vault = vault_;
        attestorKey = key;
        for (uint256 i; i < curves_.length; ++i) curves.push(curves_[i]);
        pairTokens = pairTokens_;
        for (uint256 i; i < ids.length; ++i) identities.push(ids[i]);
        platforms = [1, 4];
        accounts = ["alice", "fortune_chan"];
        traders = [makeAddr("t1"), makeAddr("t2"), makeAddr("t3")];
        wallets = [makeAddr("w1"), makeAddr("w2"), makeAddr("w3")];
        for (uint256 i; i < pairTokens.length; ++i) {
            for (uint256 j; j < traders.length; ++j) PlainToken(pairTokens[i]).mint(traders[j], 1_000_000e18);
        }
    }

    function identityCount() external view returns (uint256) {
        return identities.length;
    }

    function buy(uint256 curveSeed, uint256 traderSeed, uint256 amount) external {
        FortuneCustomPairCurve curve = curves[curveSeed % curves.length];
        address trader = traders[traderSeed % traders.length];
        amount = bound(amount, 1e12, 300e18);
        vm.startPrank(trader);
        curve.pairToken().approve(address(curve), amount);
        try curve.buy(amount, 0) {} catch {}
        vm.stopPrank();
    }

    function sell(uint256 curveSeed, uint256 traderSeed, uint256 amount) external {
        FortuneCustomPairCurve curve = curves[curveSeed % curves.length];
        address trader = traders[traderSeed % traders.length];
        IERC20 token = IERC20(address(curve.launchToken()));
        uint256 held = token.balanceOf(trader);
        if (held == 0) return;
        amount = bound(amount, 1, held);
        vm.startPrank(trader);
        token.approve(address(curve), amount);
        try curve.sell(amount, 0) {} catch {}
        vm.stopPrank();
    }

    function collect(uint256 curveSeed) external {
        FortuneCustomPairCurve curve = curves[curveSeed % curves.length];
        address pair = address(curve.pairToken());
        collected[pair] += vault.collect(address(curve));
    }

    function bind(uint256 accountSeed, uint256 walletSeed) external {
        uint256 index = accountSeed % accounts.length;
        address wallet = wallets[walletSeed % wallets.length];
        bytes32 id = keccak256(abi.encode(platforms[index], accounts[index]));
        FortuneSocialFeeVault.IdentityView memory identity = vault.identityOf(id);
        if (identity.wallet == wallet || identity.pendingWallet == wallet) return;
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes32 stableId = bytes32(index + 1);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(attestorKey, vault.bindingDigest(id, wallet, stableId, identity.nonce, deadline));
        vm.prank(wallet);
        vault.bind(platforms[index], accounts[index], stableId, deadline, abi.encodePacked(r, s, v));
        binds++;
    }

    function claim(uint256 identitySeed) external {
        bytes32 id = identities[identitySeed % identities.length];
        address wallet = vault.walletOf(id);
        if (wallet == address(0)) return;
        address[] memory tokens = pairTokens;
        uint256[] memory before = new uint256[](tokens.length);
        for (uint256 i; i < tokens.length; ++i) before[i] = vault.owed(id, tokens[i]);
        vm.prank(wallet);
        try vault.claim(id, tokens) {
            claims++;
            for (uint256 i; i < tokens.length; ++i) {
                debited[tokens[i]] += before[i] - vault.owed(id, tokens[i]);
            }
        } catch {}
    }

    function warp(uint256 seconds_) external {
        vm.warp(vm.getBlockTimestamp() + bound(seconds_, 1, 2 days));
    }
}

contract FortuneSocialFeeVaultInvariantTest is Test {
    SocialVaultHandler internal handler;
    FortuneSocialFeeVault internal vault;
    address[] internal pairTokens;

    function setUp() public {
        vm.warp(1_800_000_000);
        address owner = makeAddr("owner");
        uint256 attestorKey = 0xA77E57;
        MockPancakeV2Factory pancake = new MockPancakeV2Factory();
        FortuneCustomPairFactory factory =
            new FortuneCustomPairFactory(owner, address(pancake), 50, makeAddr("treasury"), FortuneLaunchRules(address(0)));
        vault = new FortuneSocialFeeVault(owner, vm.addr(attestorKey), makeAddr("guardian"));
        vm.startPrank(owner);
        vault.setRegistrar(address(factory), true);
        factory.setSocialFeeVault(address(vault));
        vm.stopPrank();

        pairTokens.push(address(new PlainToken("USD", 18)));
        pairTokens.push(address(new TaxToken("TAX", 18, 500)));

        IFortuneSocialFeeVault.FeeShare[] memory shares = new IFortuneSocialFeeVault.FeeShare[](3);
        shares[0] = IFortuneSocialFeeVault.FeeShare(0, "", makeAddr("launcher"), 4_000);
        shares[1] = IFortuneSocialFeeVault.FeeShare(1, "alice", address(0), 3_500);
        shares[2] = IFortuneSocialFeeVault.FeeShare(4, "fortune_chan", address(0), 2_500);

        FortuneCustomPairCurve[] memory curves = new FortuneCustomPairCurve[](3);
        for (uint256 i; i < 3; ++i) {
            FortuneCustomPairFactory.LaunchParams memory p;
            p.name = "Split";
            p.symbol = "SPLIT";
            p.supply = 1_000_000_000e18;
            p.pairToken = pairTokens[i % 2];
            p.graduationTarget = 5_000e18;
            p.creatorFeeBps = 100;
            p.feeShares = shares;
            vm.prank(makeAddr("launcher"));
            (, address curve) = factory.createLaunch(p);
            curves[i] = FortuneCustomPairCurve(curve);
        }
        vm.warp(block.timestamp + 16);

        bytes32[] memory ids = new bytes32[](3);
        ids[0] = vault.walletIdentityOf(makeAddr("launcher"));
        ids[1] = keccak256(abi.encode(uint8(1), "alice"));
        ids[2] = keccak256(abi.encode(uint8(4), "fortune_chan"));
        handler = new SocialVaultHandler(vault, curves, pairTokens, ids, attestorKey);
        targetContract(address(handler));
    }

    function invariant_owedAddsUpToTheTotal() public view {
        for (uint256 t; t < pairTokens.length; ++t) {
            uint256 sum;
            for (uint256 i; i < handler.identityCount(); ++i) sum += vault.owed(handler.identities(i), pairTokens[t]);
            assertEq(sum, vault.totalOwed(pairTokens[t]));
        }
    }

    function invariant_vaultHoldsEverythingItOwes() public view {
        for (uint256 t; t < pairTokens.length; ++t) {
            assertEq(IERC20(pairTokens[t]).balanceOf(address(vault)), vault.totalOwed(pairTokens[t]));
        }
    }

    function invariant_collectedEqualsOwedPlusClaimed() public view {
        for (uint256 t; t < pairTokens.length; ++t) {
            address token = pairTokens[t];
            assertEq(handler.collected(token), vault.totalOwed(token) + handler.debited(token));
        }
    }

    /// After every run: collect everything, verify every account, wait out the
    /// delays and claim. Every fee ever collected must be paid out and the
    /// vault must end empty.
    function afterInvariant() external {
        for (uint256 i; i < 3; ++i) handler.collect(i);
        handler.bind(0, 0);
        handler.bind(1, 1);
        vm.warp(block.timestamp + 3 days + 1);
        for (uint256 i; i < handler.identityCount(); ++i) handler.claim(i);
        for (uint256 t; t < pairTokens.length; ++t) {
            assertEq(vault.totalOwed(pairTokens[t]), 0);
            assertEq(IERC20(pairTokens[t]).balanceOf(address(vault)), 0);
            assertEq(handler.collected(pairTokens[t]), handler.debited(pairTokens[t]));
        }
    }
}
