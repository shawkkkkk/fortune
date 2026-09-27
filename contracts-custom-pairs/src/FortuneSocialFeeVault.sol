// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IFortuneSocialFeeVault, IFortuneCreatorFeeSource} from "./interfaces/IFortuneSocialFeeVault.sol";

/// @notice Splits custom-pair creator fees between wallets and social
///         accounts. A social account claims after proving it controls the
///         account: Fortune's verifier checks a public challenge post and signs
///         an EIP-712 binding, which the account's wallet then submits.
/// @dev UNAUDITED BETA.
///
///      Trust. The attestor decides which wallet a social account pays. It
///      cannot move funds or change any launch's split. A first binding waits
///      FIRST_BIND_DELAY and a wallet change waits REBIND_DELAY; until then the
///      guardian, the owner, the currently bound wallet or the pending wallet
///      can cancel it. The first binding to take effect pins the platform's
///      permanent account id (when the platform has one), so a recycled handle
///      cannot take the account over later. Claims can never be paused.
///
///      Accounting. Fees are pooled per pair token. Collecting measures what
///      actually arrived, so transfer taxes never reach the books. A claim pays
///      exactly what is owed, unless the vault's balance of that token has
///      fallen below the total owed (a negative rebase, a seizure); then every
///      claim in that token takes the same pro-rata haircut. A token that takes
///      more from the vault than the vault sends can never be claimed, so it
///      can never short other claimants.
contract FortuneSocialFeeVault is IFortuneSocialFeeVault, Ownable2Step, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Identity {
        address wallet;
        uint64 nonce;
        uint8 platform;
        bool exists;
        address pendingWallet;
        uint64 pendingAt;
        bytes32 stableId;
        bytes32 pendingStableId;
        string account;
    }

    struct IdentityView {
        bytes32 identityId;
        bool exists;
        uint8 platform;
        string account;
        address wallet;
        address pendingWallet;
        uint64 pendingAt;
        bytes32 stableId;
        uint64 nonce;
        uint256 curveCount;
        uint256 tokenCount;
    }

    struct CurveShares {
        address token;
        bytes32[] identities;
        uint16[] shares;
    }

    uint16 public constant BPS = 10_000;
    uint256 public constant MAX_SHARES = 10;
    uint16 public constant MIN_SHARE_BPS = 100;
    uint8 public constant WALLET_PLATFORM = 0;
    uint8 public constant MAX_PLATFORM = 32;
    uint256 public constant MAX_ACCOUNT_LENGTH = 64;
    uint64 public constant FIRST_BIND_DELAY = 1 hours;
    uint64 public constant REBIND_DELAY = 3 days;
    bytes32 public constant BINDING_TYPEHASH =
        keccak256("Binding(bytes32 identityId,address wallet,bytes32 stableId,uint64 nonce,uint64 deadline)");

    address public attestor;
    address public guardian;
    bool public bindingsPaused;
    mapping(address => bool) public isRegistrar;

    /// Pair tokens owed to each identity, and in total per token.
    mapping(bytes32 => mapping(address => uint256)) public owed;
    mapping(address => uint256) public totalOwed;
    /// Everything ever collected from each curve, after transfer taxes.
    mapping(address => uint256) public collectedByCurve;

    mapping(bytes32 => Identity) private _identities;
    mapping(address => CurveShares) private _curves;
    mapping(bytes32 => address[]) private _identityCurves;
    mapping(bytes32 => address[]) private _identityTokens;
    mapping(bytes32 => mapping(address => bool)) private _identityHasToken;
    mapping(address => bytes32[]) private _walletIdentities;
    mapping(address => mapping(bytes32 => bool)) private _walletHasIdentity;

    event AttestorSet(address indexed attestor);
    event GuardianSet(address indexed guardian);
    event RegistrarSet(address indexed registrar, bool allowed);
    event BindingsPausedSet(bool paused);
    event IdentityRegistered(bytes32 indexed identityId, uint8 indexed platform, string account, address wallet);
    event CurveRegistered(address indexed curve, address indexed token, bytes32[] identities, uint16[] shares);
    event Collected(address indexed curve, address indexed token, uint256 received);
    event BindingRequested(bytes32 indexed identityId, address indexed wallet, bytes32 stableId, uint64 effectiveAt);
    event BindingActivated(bytes32 indexed identityId, address indexed previousWallet, address indexed wallet);
    event BindingCancelled(bytes32 indexed identityId, address indexed pendingWallet, address indexed by);
    event Claimed(
        bytes32 indexed identityId,
        address indexed token,
        address indexed wallet,
        uint256 debited,
        uint256 paid,
        uint256 delivered
    );

    error BadShares(bytes32 reasonCode);

    constructor(address initialOwner, address attestor_, address guardian_)
        Ownable(initialOwner)
        EIP712("FortuneSocialFeeVault", "1")
    {
        attestor = attestor_;
        guardian = guardian_;
        emit AttestorSet(attestor_);
        emit GuardianSet(guardian_);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Bindings already requested keep their signatures; the guardian
    ///         cancels any it does not trust.
    function setAttestor(address attestor_) external onlyOwner {
        attestor = attestor_;
        emit AttestorSet(attestor_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function setRegistrar(address registrar, bool allowed) external onlyOwner {
        require(registrar != address(0), "ZERO_ADDRESS");
        isRegistrar[registrar] = allowed;
        emit RegistrarSet(registrar, allowed);
    }

    /// @notice The guardian can only pause new bindings; only the owner resumes them.
    function setBindingsPaused(bool paused) external {
        require(msg.sender == owner() || (paused && msg.sender == guardian), "NOT_ALLOWED");
        bindingsPaused = paused;
        emit BindingsPausedSet(paused);
    }

    // ------------------------------------------------------------ identities

    function identityIdOf(uint8 platform, string calldata account) public pure returns (bytes32) {
        return keccak256(abi.encode(platform, account));
    }

    function walletIdentityOf(address wallet) public pure returns (bytes32) {
        return keccak256(abi.encode(WALLET_PLATFORM, wallet));
    }

    /// @notice Handles are stored lowercase with only a-z, 0-9, "_", "." and "-",
    ///         so one account can never be named two different ways.
    function isCanonicalAccount(string calldata account) public pure returns (bool) {
        bytes calldata b = bytes(account);
        uint256 length = b.length;
        if (length == 0 || length > MAX_ACCOUNT_LENGTH) return false;
        for (uint256 i; i < length; ++i) {
            bytes1 c = b[i];
            bool allowed = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f || c == 0x2e || c == 0x2d;
            if (!allowed) return false;
        }
        return true;
    }

    /// @notice Free check of a launch's fee split. Returns the first problem.
    function checkShares(FeeShare[] calldata shares) public view returns (bool ok, bytes32 reasonCode) {
        uint256 count = shares.length;
        if (count == 0 || count > MAX_SHARES) return (false, "SHARE_COUNT");
        bytes32[] memory ids = new bytes32[](count);
        uint256 sum;
        for (uint256 i; i < count; ++i) {
            FeeShare calldata share = shares[i];
            if (share.shareBps < MIN_SHARE_BPS) return (false, "SHARE_TOO_SMALL");
            sum += share.shareBps;
            bytes32 id;
            if (share.platform == WALLET_PLATFORM) {
                if (share.wallet == address(0) || share.wallet == address(this) || bytes(share.account).length != 0) {
                    return (false, "BAD_WALLET_SHARE");
                }
                id = walletIdentityOf(share.wallet);
            } else {
                if (share.platform > MAX_PLATFORM || share.wallet != address(0)) return (false, "BAD_SOCIAL_SHARE");
                if (!isCanonicalAccount(share.account)) return (false, "BAD_ACCOUNT");
                id = identityIdOf(share.platform, share.account);
            }
            for (uint256 j; j < i; ++j) {
                if (ids[j] == id) return (false, "DUPLICATE_SHARE");
            }
            ids[i] = id;
        }
        if (sum != BPS) return (false, "SHARES_NOT_100");
        return (true, "OK");
    }

    /// @notice Called by the factory in the launch transaction, after the curve
    ///         was created with this vault as its only creator-fee recipient.
    function registerCurve(address curve, address token, FeeShare[] calldata shares) external {
        require(isRegistrar[msg.sender], "ONLY_REGISTRAR");
        require(curve != address(0) && token != address(0), "ZERO_ADDRESS");
        require(_curves[curve].token == address(0), "CURVE_REGISTERED");
        (bool ok, bytes32 reason) = checkShares(shares);
        if (!ok) revert BadShares(reason);

        CurveShares storage record = _curves[curve];
        record.token = token;
        uint256 count = shares.length;
        bytes32[] memory ids = new bytes32[](count);
        uint16[] memory bps = new uint16[](count);
        for (uint256 i; i < count; ++i) {
            FeeShare calldata share = shares[i];
            bytes32 id = share.platform == WALLET_PLATFORM
                ? walletIdentityOf(share.wallet)
                : identityIdOf(share.platform, share.account);
            Identity storage identity = _identities[id];
            if (!identity.exists) {
                identity.exists = true;
                identity.platform = share.platform;
                if (share.platform == WALLET_PLATFORM) {
                    identity.wallet = share.wallet;
                    _indexWallet(share.wallet, id);
                } else {
                    identity.account = share.account;
                }
                emit IdentityRegistered(id, share.platform, share.account, share.wallet);
            }
            record.identities.push(id);
            record.shares.push(share.shareBps);
            _identityCurves[id].push(curve);
            if (!_identityHasToken[id][token]) {
                _identityHasToken[id][token] = true;
                _identityTokens[id].push(token);
            }
            ids[i] = id;
            bps[i] = share.shareBps;
        }
        emit CurveRegistered(curve, token, ids, bps);
    }

    // -------------------------------------------------------------- binding

    /// @notice Submit the verifier's signed binding from the wallet it names.
    ///         It takes effect after FIRST_BIND_DELAY (or REBIND_DELAY when a
    ///         wallet is already bound) unless it is cancelled first.
    function bind(uint8 platform, string calldata account, bytes32 stableId, uint64 deadline, bytes calldata signature)
        external
        returns (bytes32 identityId, uint64 effectiveAt)
    {
        require(!bindingsPaused, "BINDINGS_PAUSED");
        require(platform != WALLET_PLATFORM && platform <= MAX_PLATFORM, "BAD_PLATFORM");
        require(isCanonicalAccount(account), "BAD_ACCOUNT");
        require(block.timestamp <= deadline, "ATTESTATION_EXPIRED");

        identityId = identityIdOf(platform, account);
        _settle(identityId);
        Identity storage identity = _identities[identityId];
        if (!identity.exists) {
            identity.exists = true;
            identity.platform = platform;
            identity.account = account;
            emit IdentityRegistered(identityId, platform, account, address(0));
        }
        require(identity.wallet != msg.sender, "ALREADY_BOUND");
        require(identity.pendingWallet != msg.sender, "ALREADY_PENDING");
        require(identity.stableId == bytes32(0) || identity.stableId == stableId, "STABLE_ID_MISMATCH");

        uint64 nonce = identity.nonce;
        address signer = ECDSA.recover(bindingDigest(identityId, msg.sender, stableId, nonce, deadline), signature);
        require(signer == attestor, "BAD_ATTESTATION");

        identity.nonce = nonce + 1;
        effectiveAt = uint64(block.timestamp) + (identity.wallet == address(0) ? FIRST_BIND_DELAY : REBIND_DELAY);
        identity.pendingWallet = msg.sender;
        identity.pendingAt = effectiveAt;
        identity.pendingStableId = stableId;
        _indexWallet(msg.sender, identityId);
        emit BindingRequested(identityId, msg.sender, stableId, effectiveAt);
    }

    /// @notice Stops a binding that has not taken effect yet.
    function cancelPendingBinding(bytes32 identityId) external {
        _settle(identityId);
        Identity storage identity = _identities[identityId];
        address pending = identity.pendingWallet;
        require(pending != address(0), "NOTHING_PENDING");
        require(
            msg.sender == guardian ||
                msg.sender == owner() ||
                msg.sender == pending ||
                (identity.wallet != address(0) && msg.sender == identity.wallet),
            "NOT_ALLOWED"
        );
        identity.pendingWallet = address(0);
        identity.pendingAt = 0;
        identity.pendingStableId = bytes32(0);
        emit BindingCancelled(identityId, pending, msg.sender);
    }

    // ---------------------------------------------------------------- fees

    /// @notice Permissionless. Pulls a curve's creator fees and splits what
    ///         arrived between its recipients. Returns zero when there is nothing
    ///         to pull.
    function collect(address curve) external nonReentrant returns (uint256 received) {
        received = _collect(curve);
    }

    /// @notice Pays the identity's bound wallet everything it is owed in `tokens`.
    function claim(bytes32 identityId, address[] calldata tokens) external nonReentrant returns (uint256[] memory paid) {
        paid = _claimAll(identityId, tokens);
    }

    /// @notice Collects from `curves` first, then claims.
    function collectAndClaim(address[] calldata curves, bytes32 identityId, address[] calldata tokens)
        external
        nonReentrant
        returns (uint256[] memory paid)
    {
        for (uint256 i; i < curves.length; ++i) _collect(curves[i]);
        paid = _claimAll(identityId, tokens);
    }

    // ---------------------------------------------------------------- views

    function bindingDigest(bytes32 identityId, address wallet, bytes32 stableId, uint64 nonce, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(BINDING_TYPEHASH, identityId, wallet, stableId, nonce, deadline)));
    }

    /// @notice Identity as it stands now: a pending binding past its delay counts as bound.
    function identityOf(bytes32 identityId) public view returns (IdentityView memory view_) {
        Identity storage identity = _identities[identityId];
        view_.identityId = identityId;
        view_.exists = identity.exists;
        view_.platform = identity.platform;
        view_.account = identity.account;
        view_.nonce = identity.nonce;
        (view_.wallet, view_.pendingWallet, view_.pendingAt, view_.stableId) = _effective(identity);
        view_.curveCount = _identityCurves[identityId].length;
        view_.tokenCount = _identityTokens[identityId].length;
    }

    function walletOf(bytes32 identityId) external view returns (address wallet) {
        (wallet,,,) = _effective(_identities[identityId]);
    }

    function curveSharesOf(address curve)
        external
        view
        returns (address token, bytes32[] memory identities, uint16[] memory shares)
    {
        CurveShares storage record = _curves[curve];
        return (record.token, record.identities, record.shares);
    }

    /// @notice A curve's recipients with their current binding state.
    function curveRecipients(address curve) external view returns (IdentityView[] memory recipients, uint16[] memory shares) {
        CurveShares storage record = _curves[curve];
        uint256 count = record.identities.length;
        recipients = new IdentityView[](count);
        for (uint256 i; i < count; ++i) recipients[i] = identityOf(record.identities[i]);
        shares = record.shares;
    }

    /// @notice What a claim would pay now, after any haircut.
    function claimable(bytes32 identityId, address token) public view returns (uint256) {
        uint256 amount = owed[identityId][token];
        if (amount == 0) return 0;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 total = totalOwed[token];
        return balance >= total ? amount : Math.mulDiv(amount, balance, total);
    }

    /// @notice Newest first.
    function curvesOf(bytes32 identityId, uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _newestFirst(_identityCurves[identityId], offset, limit);
    }

    /// @notice Newest first.
    function tokensOf(bytes32 identityId, uint256 offset, uint256 limit) external view returns (address[] memory) {
        return _newestFirst(_identityTokens[identityId], offset, limit);
    }

    /// @notice Identities this wallet was ever bound to or asked to be bound to,
    ///         newest first. Check `identityOf` for the current state.
    function identitiesOfWallet(address wallet, uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        bytes32[] storage ids = _walletIdentities[wallet];
        uint256 total = ids.length;
        if (offset >= total || limit == 0) return new bytes32[](0);
        uint256 count = Math.min(total - offset, limit);
        page = new bytes32[](count);
        for (uint256 i; i < count; ++i) page[i] = ids[total - 1 - offset - i];
    }

    function walletIdentityCount(address wallet) external view returns (uint256) {
        return _walletIdentities[wallet].length;
    }

    // ------------------------------------------------------------- internal

    function _collect(address curve) internal returns (uint256 received) {
        CurveShares storage record = _curves[curve];
        address token = record.token;
        require(token != address(0), "UNKNOWN_CURVE");
        IERC20 pairToken = IERC20(token);
        uint256 balanceBefore = pairToken.balanceOf(address(this));
        // A curve with nothing owed reverts; that is not an error here.
        (bool success,) = curve.call(abi.encodeCall(IFortuneCreatorFeeSource.claimCreatorFees, ()));
        if (!success) return 0;
        uint256 balanceAfter = pairToken.balanceOf(address(this));
        if (balanceAfter <= balanceBefore) return 0;
        received = balanceAfter - balanceBefore;

        uint256 count = record.identities.length;
        uint256 assigned;
        for (uint256 i = 1; i < count; ++i) {
            uint256 part = received * record.shares[i] / BPS;
            owed[record.identities[i]][token] += part;
            assigned += part;
        }
        // Rounding dust goes to the first recipient.
        owed[record.identities[0]][token] += received - assigned;
        totalOwed[token] += received;
        collectedByCurve[curve] += received;
        emit Collected(curve, token, received);
    }

    function _claimAll(bytes32 identityId, address[] calldata tokens) internal returns (uint256[] memory paid) {
        _settle(identityId);
        address wallet = _identities[identityId].wallet;
        require(wallet != address(0) && msg.sender == wallet, "ONLY_BOUND_WALLET");
        paid = new uint256[](tokens.length);
        bool claimedAny;
        for (uint256 i; i < tokens.length; ++i) {
            uint256 amount = owed[identityId][tokens[i]];
            if (amount == 0) continue;
            paid[i] = _pay(identityId, tokens[i], wallet, amount);
            claimedAny = true;
        }
        require(claimedAny, "NOTHING_TO_CLAIM");
    }

    function _pay(bytes32 identityId, address token, address wallet, uint256 amount) internal returns (uint256 paid) {
        IERC20 pairToken = IERC20(token);
        uint256 balance = pairToken.balanceOf(address(this));
        uint256 total = totalOwed[token];
        paid = balance >= total ? amount : Math.mulDiv(amount, balance, total);
        owed[identityId][token] = 0;
        totalOwed[token] = total - amount;

        uint256 delivered;
        if (paid > 0) {
            uint256 walletBefore = pairToken.balanceOf(wallet);
            pairToken.safeTransfer(wallet, paid);
            require(pairToken.balanceOf(address(this)) + paid >= balance, "TOKEN_TAKES_EXTRA");
            uint256 walletAfter = pairToken.balanceOf(wallet);
            delivered = walletAfter > walletBefore ? walletAfter - walletBefore : 0;
        }
        emit Claimed(identityId, token, wallet, amount, paid, delivered);
    }

    /// @dev Makes a pending binding past its delay the bound wallet.
    function _settle(bytes32 identityId) internal {
        Identity storage identity = _identities[identityId];
        address pending = identity.pendingWallet;
        if (pending == address(0) || block.timestamp < identity.pendingAt) return;
        address previous = identity.wallet;
        identity.wallet = pending;
        if (identity.stableId == bytes32(0)) identity.stableId = identity.pendingStableId;
        identity.pendingWallet = address(0);
        identity.pendingAt = 0;
        identity.pendingStableId = bytes32(0);
        emit BindingActivated(identityId, previous, pending);
    }

    function _effective(Identity storage identity)
        internal
        view
        returns (address wallet, address pendingWallet, uint64 pendingAt, bytes32 stableId)
    {
        wallet = identity.wallet;
        pendingWallet = identity.pendingWallet;
        pendingAt = identity.pendingAt;
        stableId = identity.stableId;
        if (pendingWallet != address(0) && block.timestamp >= pendingAt) {
            wallet = pendingWallet;
            if (stableId == bytes32(0)) stableId = identity.pendingStableId;
            pendingWallet = address(0);
            pendingAt = 0;
        }
    }

    function _indexWallet(address wallet, bytes32 identityId) internal {
        if (_walletHasIdentity[wallet][identityId]) return;
        _walletHasIdentity[wallet][identityId] = true;
        _walletIdentities[wallet].push(identityId);
    }

    function _newestFirst(address[] storage items, uint256 offset, uint256 limit) internal view returns (address[] memory page) {
        uint256 total = items.length;
        if (offset >= total || limit == 0) return new address[](0);
        uint256 count = Math.min(total - offset, limit);
        page = new address[](count);
        for (uint256 i; i < count; ++i) page[i] = items[total - 1 - offset - i];
    }
}
