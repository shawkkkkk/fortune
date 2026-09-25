// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice ISOLATED RESEARCH. This contract is not connected to the Standard factory.
/// @dev Pair rewards enter by direct deposit. There is no sell or conversion path.
contract FortuneRewardTokenV2 is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant MAGNITUDE = 2 ** 96;
    IERC20 public immutable pairAsset;
    mapping(address => bool) public excluded;
    mapping(address => int256) private correction;
    mapping(address => uint256) public withdrawnRewards;
    uint256 public eligibleSupply;
    uint256 public magnifiedRewardPerShare;
    uint256 public totalFunded;
    uint256 public totalClaimed;
    uint256 public totalBurned;

    error BadConfiguration();
    error EmptyReward();
    error NoEligibleHolders();
    error NonStandardPairAsset();
    error RewardMathLimit();

    event RewardsFunded(address indexed pairAsset, address indexed source, uint256 amount, uint256 cumulativeFunded);
    event RewardClaimed(address indexed holder, address indexed pairAsset, uint256 amount);
    event TokenBurned(address indexed burner, uint256 amount, uint256 cumulativeBurned);

    /// @param permanentlyExcluded Pool, hook, locker and burn addresses. Fixed at construction.
    constructor(
        string memory name_,
        string memory symbol_,
        address pairAsset_,
        address initialHolder,
        uint256 supply,
        address[] memory permanentlyExcluded
    ) ERC20(name_, symbol_) {
        if (pairAsset_ == address(0) || pairAsset_.code.length == 0 || initialHolder == address(0) || supply == 0 || supply > type(uint128).max) revert BadConfiguration();
        pairAsset = IERC20(pairAsset_);
        for (uint256 i; i < permanentlyExcluded.length; ++i) {
            address holder = permanentlyExcluded[i];
            if (holder == address(0) || excluded[holder]) revert BadConfiguration();
            excluded[holder] = true;
        }
        _mint(initialHolder, supply);
    }

    function fundRewards(uint256 amount) external nonReentrant {
        if (amount == 0) revert EmptyReward();
        if (eligibleSupply == 0) revert NoEligibleHolders();
        uint256 beforeBalance = pairAsset.balanceOf(address(this));
        pairAsset.safeTransferFrom(msg.sender, address(this), amount);
        if (pairAsset.balanceOf(address(this)) - beforeBalance != amount) revert NonStandardPairAsset();
        uint256 increment = Math.mulDiv(amount, MAGNITUDE, eligibleSupply);
        uint256 next = magnifiedRewardPerShare + increment;
        // Keep all signed correction calculations valid even after repeated funding.
        if (next > uint256(type(int256).max) / totalSupply()) revert RewardMathLimit();
        magnifiedRewardPerShare = next;
        totalFunded += amount;
        emit RewardsFunded(address(pairAsset), msg.sender, amount, totalFunded);
    }

    function accumulativeRewardOf(address holder) public view returns (uint256) {
        if (excluded[holder]) return 0;
        uint256 share = magnifiedRewardPerShare * balanceOf(holder);
        int256 accrued = int256(share) + correction[holder];
        if (accrued < 0) revert RewardMathLimit();
        return uint256(accrued) / MAGNITUDE;
    }

    function claimableRewardOf(address holder) public view returns (uint256) {
        return accumulativeRewardOf(holder) - withdrawnRewards[holder];
    }

    function claim() external nonReentrant returns (uint256 amount) {
        amount = claimableRewardOf(msg.sender);
        if (amount == 0) return 0;
        withdrawnRewards[msg.sender] += amount;
        totalClaimed += amount;
        pairAsset.safeTransfer(msg.sender, amount);
        emit RewardClaimed(msg.sender, address(pairAsset), amount);
    }

    /// @notice Burns caller-owned tokens. A future hook can burn only tokens it actually collected.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        totalBurned += amount;
        emit TokenBurned(msg.sender, amount, totalBurned);
    }

    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
        if (amount == 0) return;
        int256 adjustment = int256(magnifiedRewardPerShare * amount);
        if (from != address(0) && !excluded[from]) {
            correction[from] += adjustment;
            eligibleSupply -= amount;
        }
        if (to != address(0) && !excluded[to]) {
            correction[to] -= adjustment;
            eligibleSupply += amount;
        }
    }
}
