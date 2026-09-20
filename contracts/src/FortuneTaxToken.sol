// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import {FortunePoolRegistry} from "./FortunePoolRegistry.sol";

interface IFortuneTaxProcessorActivation {
    function activateDex(
        address officialPool,
        address dexRouter
    ) external;
}

/// @notice Fixed-supply Fortune token variant with immutable post-graduation
///         buy/sell taxes and an optional bounded competing-pool protection window.
/// @dev Tax rates, dividend threshold and anti-farmer duration are immutable.
///      The factory may only bind launch infrastructure once; the frozen
///      graduation adapter may only activate one official DEX pool once.
contract FortuneTaxToken is ERC20, ERC20Burnable {
    uint16 public constant FORTUNE_TAX_TOKEN_VERSION = 1;
    uint16 public constant MAX_TAX_BPS = 1_000; // 10%
    uint32 public constant MAX_ANTI_FARMER_DURATION = 365 days;
    address public constant DEAD =
        0x000000000000000000000000000000000000dEaD;

    struct Checkpoint {
        uint64 nonce;
        uint192 value;
    }

    address public immutable fortuneFactory;
    address public immutable poolConfigurator;
    FortunePoolRegistry public immutable poolRegistry;
    address public immutable quoteAsset;

    uint256 public immutable initialSupply;
    bytes32 public immutable launchManifest;
    uint16 public immutable buyTaxBps;
    uint16 public immutable sellTaxBps;
    uint32 public immutable antiFarmerDuration;
    uint256 public immutable minimumDividendBalance;

    address public taxProcessor;
    address public dividendVault;
    address public curve;
    address public officialPool;
    address public dexRouter;
    uint64 public dexActivatedAt;
    bool public infrastructureBound;

    uint64 public stateNonce;
    uint256 public currentEligibleDividendSupply;

    mapping(address => Checkpoint[]) private _balanceHistory;
    Checkpoint[] private _supplyHistory;
    Checkpoint[] private _eligibleSupplyHistory;

    event TaxInfrastructureBound(
        address indexed processor,
        address indexed dividendVault,
        address indexed curve
    );
    event DexActivated(
        address indexed pool,
        address indexed router,
        uint256 antiFarmerUntil
    );
    event TransferTaxTaken(
        address indexed from,
        address indexed to,
        uint256 grossAmount,
        uint256 taxAmount,
        uint16 taxBps
    );

    constructor(
        address fortuneFactory_,
        address poolConfigurator_,
        address poolRegistry_,
        address quoteAsset_,
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        bytes32 manifest_,
        uint16 buyTaxBps_,
        uint16 sellTaxBps_,
        uint32 antiFarmerDuration_,
        uint256 minimumDividendBalance_
    ) ERC20(name_, symbol_) {
        require(
            fortuneFactory_ != address(0) &&
                poolConfigurator_ != address(0) &&
                poolRegistry_ != address(0) &&
                quoteAsset_ != address(0),
            "ZERO_ADDRESS"
        );
        require(
            poolConfigurator_.code.length > 0 &&
                poolRegistry_.code.length > 0 &&
                quoteAsset_.code.length > 0,
            "MISSING_CODE"
        );
        require(supply_ > 0, "ZERO_SUPPLY");
        require(
            buyTaxBps_ <= MAX_TAX_BPS &&
                sellTaxBps_ <= MAX_TAX_BPS,
            "TAX_TOO_HIGH"
        );
        require(
            buyTaxBps_ > 0 ||
                sellTaxBps_ > 0,
            "ZERO_TAX"
        );
        require(
            antiFarmerDuration_ <=
                MAX_ANTI_FARMER_DURATION,
            "ANTI_FARMER_TOO_LONG"
        );
        require(
            minimumDividendBalance_ <=
                supply_,
            "DIVIDEND_THRESHOLD_TOO_HIGH"
        );

        fortuneFactory = fortuneFactory_;
        poolConfigurator = poolConfigurator_;
        poolRegistry =
            FortunePoolRegistry(
                poolRegistry_
            );
        quoteAsset = quoteAsset_;
        initialSupply = supply_;
        launchManifest = manifest_;
        buyTaxBps = buyTaxBps_;
        sellTaxBps = sellTaxBps_;
        antiFarmerDuration =
            antiFarmerDuration_;
        minimumDividendBalance =
            minimumDividendBalance_;

        _mint(fortuneFactory_, supply_);
    }

    function isFortuneTaxToken()
        external
        pure
        returns (bool)
    {
        return true;
    }

    function bindInfrastructure(
        address processor_,
        address dividendVault_,
        address curve_
    ) external {
        require(
            msg.sender == fortuneFactory,
            "ONLY_FACTORY"
        );
        require(
            !infrastructureBound,
            "INFRA_ALREADY_BOUND"
        );
        require(
            processor_ != address(0) &&
                dividendVault_ != address(0) &&
                curve_ != address(0),
            "ZERO_INFRA"
        );
        require(
            processor_.code.length > 0 &&
                dividendVault_.code.length > 0 &&
                curve_.code.length > 0,
            "INFRA_NO_CODE"
        );

        taxProcessor = processor_;
        dividendVault = dividendVault_;
        curve = curve_;
        infrastructureBound = true;

        emit TaxInfrastructureBound(
            processor_,
            dividendVault_,
            curve_
        );
    }

    function activateDex(
        address pool_,
        address router_
    ) external {
        require(
            msg.sender == poolConfigurator,
            "ONLY_POOL_CONFIGURATOR"
        );
        require(
            infrastructureBound,
            "INFRA_NOT_BOUND"
        );
        require(
            officialPool == address(0),
            "DEX_ALREADY_ACTIVE"
        );
        require(
            pool_ != address(0) &&
                router_ != address(0) &&
                pool_.code.length > 0 &&
                router_.code.length > 0,
            "BAD_DEX"
        );

        uint256 poolEligibleBefore =
            _eligibleCurrent(
                pool_
            );

        officialPool = pool_;
        dexRouter = router_;
        dexActivatedAt = uint64(block.timestamp);

        if (poolEligibleBefore > 0) {
            currentEligibleDividendSupply -=
                poolEligibleBefore;
            _writeSnapshotOnly();
        }

        IFortuneTaxProcessorActivation(
            taxProcessor
        ).activateDex(
            pool_,
            router_
        );

        emit DexActivated(
            pool_,
            router_,
            antiFarmerUntil()
        );
    }

    function antiFarmerUntil()
        public
        view
        returns (uint256)
    {
        if (
            dexActivatedAt == 0 ||
            antiFarmerDuration == 0
        ) {
            return 0;
        }

        return
            uint256(dexActivatedAt) +
            uint256(antiFarmerDuration);
    }

    function antiFarmerActive()
        public
        view
        returns (bool)
    {
        uint256 until =
            antiFarmerUntil();

        return
            until > 0 &&
            block.timestamp < until;
    }

    function isDividendExcluded(
        address account
    ) public view returns (bool) {
        return
            account == address(0) ||
            account == DEAD ||
            account == address(this) ||
            account == curve ||
            account == taxProcessor ||
            account == dividendVault ||
            account == officialPool;
    }

    function balanceAtNonce(
        address account,
        uint64 nonce
    ) public view returns (uint256) {
        return
            _valueAt(
                _balanceHistory[account],
                nonce
            );
    }

    function totalSupplyAtNonce(
        uint64 nonce
    ) public view returns (uint256) {
        return
            _valueAt(
                _supplyHistory,
                nonce
            );
    }

    function eligibleSupplyAtNonce(
        uint64 nonce
    ) external view returns (uint256) {
        return
            _valueAt(
                _eligibleSupplyHistory,
                nonce
            );
    }

    function eligibleBalanceAtNonce(
        address account,
        uint64 nonce
    ) external view returns (uint256) {
        if (
            isDividendExcluded(
                account
            )
        ) {
            return 0;
        }

        uint256 balance =
            balanceAtNonce(
                account,
                nonce
            );

        if (
            balance <
            minimumDividendBalance
        ) {
            return 0;
        }

        return balance;
    }

    function balanceCheckpointCount(
        address account
    ) external view returns (uint256) {
        return
            _balanceHistory[account]
                .length;
    }

    function supplyCheckpointCount()
        external
        view
        returns (uint256)
    {
        return _supplyHistory.length;
    }

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (
            from != address(0) &&
            to != address(0) &&
            antiFarmerActive()
        ) {
            _enforceOfficialPool(
                from,
                to
            );
        }

        uint16 taxBps;

        if (
            officialPool != address(0) &&
            from != address(0) &&
            to != address(0) &&
            from != taxProcessor &&
            to != taxProcessor
        ) {
            if (from == officialPool) {
                taxBps = buyTaxBps;
            } else if (
                to == officialPool
            ) {
                taxBps = sellTaxBps;
            }
        }

        if (
            taxBps > 0 &&
            value > 0
        ) {
            uint256 taxAmount =
                value *
                uint256(taxBps) /
                10_000;
            uint256 netAmount =
                value - taxAmount;

            _move(
                from,
                taxProcessor,
                taxAmount
            );
            _move(
                from,
                to,
                netAmount
            );

            emit TransferTaxTaken(
                from,
                to,
                value,
                taxAmount,
                taxBps
            );

            return;
        }

        _move(
            from,
            to,
            value
        );
    }

    function _move(
        address from,
        address to,
        uint256 value
    ) internal {
        uint256 beforeFrom =
            _eligibleCurrent(
                from
            );
        uint256 beforeTo =
            to == from
                ? beforeFrom
                : _eligibleCurrent(
                    to
                );

        super._update(
            from,
            to,
            value
        );

        uint256 afterFrom =
            _eligibleCurrent(
                from
            );
        uint256 afterTo =
            to == from
                ? afterFrom
                : _eligibleCurrent(
                    to
                );

        currentEligibleDividendSupply =
            currentEligibleDividendSupply +
            afterFrom +
            afterTo -
            beforeFrom -
            beforeTo;

        _writeState(
            from,
            to
        );
    }

    function _eligibleCurrent(
        address account
    ) internal view returns (uint256) {
        if (
            account == address(0) ||
            isDividendExcluded(
                account
            )
        ) {
            return 0;
        }

        uint256 balance =
            balanceOf(account);

        if (
            balance <
            minimumDividendBalance
        ) {
            return 0;
        }

        return balance;
    }

    function _enforceOfficialPool(
        address from,
        address to
    ) internal view {
        if (
            from != officialPool &&
            poolRegistry.registeredPool(
                from
            )
        ) {
            revert(
                "ANTI_FARMER_POOL"
            );
        }

        if (
            to != officialPool &&
            poolRegistry.registeredPool(
                to
            )
        ) {
            revert(
                "ANTI_FARMER_POOL"
            );
        }
    }

    function _writeState(
        address from,
        address to
    ) internal {
        stateNonce += 1;
        uint64 nonce =
            stateNonce;

        if (from != address(0)) {
            _pushCheckpoint(
                _balanceHistory[from],
                nonce,
                balanceOf(from)
            );
        }

        if (
            to != address(0) &&
            to != from
        ) {
            _pushCheckpoint(
                _balanceHistory[to],
                nonce,
                balanceOf(to)
            );
        }

        _pushCheckpoint(
            _supplyHistory,
            nonce,
            totalSupply()
        );

        _pushCheckpoint(
            _eligibleSupplyHistory,
            nonce,
            currentEligibleDividendSupply
        );
    }

    function _writeSnapshotOnly()
        internal
    {
        stateNonce += 1;
        uint64 nonce =
            stateNonce;

        _pushCheckpoint(
            _supplyHistory,
            nonce,
            totalSupply()
        );
        _pushCheckpoint(
            _eligibleSupplyHistory,
            nonce,
            currentEligibleDividendSupply
        );
    }

    function _pushCheckpoint(
        Checkpoint[] storage history,
        uint64 nonce,
        uint256 value
    ) internal {
        require(
            value <=
                type(uint192).max,
            "CHECKPOINT_OVERFLOW"
        );

        history.push(
            Checkpoint({
                nonce: nonce,
                value: uint192(value)
            })
        );
    }

    function _valueAt(
        Checkpoint[] storage history,
        uint64 nonce
    ) internal view returns (uint256) {
        uint256 length =
            history.length;

        if (
            length == 0 ||
            nonce <
                history[0].nonce
        ) {
            return 0;
        }

        if (
            nonce >=
            history[
                length - 1
            ].nonce
        ) {
            return
                history[
                    length - 1
                ].value;
        }

        uint256 low;
        uint256 high =
            length;

        while (low < high) {
            uint256 mid =
                (low + high) /
                2;

            if (
                history[mid].nonce >
                nonce
            ) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return
            history[
                low - 1
            ].value;
    }
}
