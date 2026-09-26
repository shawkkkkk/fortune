// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Read-only transfer probe for the custom-pair inspector. It is never
///         deployed: the website places this code at a real holder and at a few
///         empty addresses through eth_call state overrides, then simulates the
///         transfers a custom-pair curve makes and measures every balance
///         change. Nothing is broadcast and no real balance moves.
contract FortunePairTokenProbe {
    struct Leg {
        bool attempted;
        bool ok;
        uint256 amount;
        uint256 senderSpent;
        uint256 recipientReceived;
        bytes revertData;
    }

    struct Report {
        uint256 holderBalance;
        // Holder to the stand-in curve.
        Leg seed;
        // Curve to a wallet, as when a sell pays out.
        Leg payout;
        // Wallet approves the curve, curve pulls: a buy.
        Leg pull;
        // Curve to another contract, as at graduation into the pool.
        Leg toPool;
    }

    /// @notice Call on the holder address. `curve`, `wallet` and `pool` must also carry this code.
    function run(address token, uint256 amount, address curve, address wallet, address pool)
        external
        returns (Report memory report)
    {
        report.holderBalance = _balance(token, address(this));
        report.seed = _send(token, curve, amount);
        if (!report.seed.ok || report.seed.recipientReceived == 0) return report;

        try FortunePairTokenProbe(curve).send(token, wallet, report.seed.recipientReceived / 2) returns (Leg memory leg) {
            report.payout = leg;
        } catch (bytes memory reason) {
            report.payout = _failed(report.seed.recipientReceived / 2, reason);
        }

        uint256 back = report.payout.ok ? report.payout.recipientReceived : 0;
        if (back > 0) {
            FortunePairTokenProbe(wallet).approveSpender(token, curve, back);
            try FortunePairTokenProbe(curve).pullFrom(token, wallet, back) returns (Leg memory leg) {
                report.pull = leg;
            } catch (bytes memory reason) {
                report.pull = _failed(back, reason);
            }
        }

        uint256 rest = _balance(token, curve) / 2;
        if (rest > 0) {
            try FortunePairTokenProbe(curve).send(token, pool, rest) returns (Leg memory leg) {
                report.toPool = leg;
            } catch (bytes memory reason) {
                report.toPool = _failed(rest, reason);
            }
        }
    }

    function send(address token, address to, uint256 amount) external returns (Leg memory) {
        return _send(token, to, amount);
    }

    function pullFrom(address token, address from, uint256 amount) external returns (Leg memory leg) {
        leg.attempted = true;
        leg.amount = amount;
        uint256 fromBefore = _balance(token, from);
        uint256 toBefore = _balance(token, address(this));
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, address(this), amount));
        _finish(leg, token, ok, data, from, fromBefore, address(this), toBefore);
    }

    function approveSpender(address token, address spender, uint256 amount) external {
        (bool ok,) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        ok;
    }

    function _send(address token, address to, uint256 amount) internal returns (Leg memory leg) {
        leg.attempted = true;
        leg.amount = amount;
        uint256 fromBefore = _balance(token, address(this));
        uint256 toBefore = _balance(token, to);
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        _finish(leg, token, ok, data, address(this), fromBefore, to, toBefore);
    }

    function _finish(
        Leg memory leg,
        address token,
        bool ok,
        bytes memory data,
        address from,
        uint256 fromBefore,
        address to,
        uint256 toBefore
    ) internal view {
        if (!ok) {
            leg.revertData = data;
            return;
        }
        // Accept no return value (USDT style) or a nonzero word, like SafeERC20.
        leg.ok = data.length == 0 || (data.length >= 32 && abi.decode(data, (uint256)) != 0);
        uint256 fromAfter = _balance(token, from);
        uint256 toAfter = _balance(token, to);
        leg.senderSpent = fromBefore > fromAfter ? fromBefore - fromAfter : 0;
        leg.recipientReceived = toAfter > toBefore ? toAfter - toBefore : 0;
    }

    function _failed(uint256 amount, bytes memory reason) internal pure returns (Leg memory leg) {
        leg.attempted = true;
        leg.amount = amount;
        leg.revertData = reason;
    }

    function _balance(address token, address account) internal view returns (uint256 value) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", account));
        if (ok && data.length >= 32) value = abi.decode(data, (uint256));
    }
}
