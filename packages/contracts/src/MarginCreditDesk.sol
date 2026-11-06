// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IConditionalTokens} from "./PositionCreditDesk.sol";
import {TraderCreditDesk} from "./TraderCreditDesk.sol";

/// @notice Local directional outcome pilot with prefunded recovery.
contract MarginCreditDesk is TraderCreditDesk, IERC1155Receiver {
    uint256 public constant ORIGINATION_BPS = 8_000;
    uint256 public constant LIQUIDATION_BPS = 9_000;
    uint256 public constant MAX_MARK_AGE = 15 minutes;
    uint256 public constant SHARE_UNIT = 1e6;
    bytes32 public constant MARK_SCHEMA = keccak256("aqra-market-mark-v1");

    struct Backstop {
        address provider;
        address borrower;
        uint96 shares;
        uint96 proceeds;
        uint256 loanId;
        bool closed;
    }

    struct Quote {
        uint96 price;
        uint64 observedAt;
        bytes32 sourceHash;
    }

    struct MarkReport {
        bytes32 schema;
        uint256 chainId;
        address desk;
        uint256 loanId;
        uint256 referenceTokenId;
        uint96 price;
        uint64 observedAt;
        bytes32 sourceHash;
    }

    error InvalidBackstop();
    error InvalidMark();
    error AboveOriginationLtv();

    IConditionalTokens public immutable positionToken;
    uint256 public immutable tokenId;
    uint256 public immutable referenceTokenId;
    uint256 public backstopCount;
    mapping(uint256 => Backstop) public backstops;
    mapping(uint256 => uint256) public loanBackstop;
    mapping(uint256 => Quote) public quotes;
    mapping(uint256 => bool) public sharesClaimed;
    bytes32 private _expectedDeposit;

    event BackstopPosted(
        uint256 indexed offer, address indexed borrower, address indexed provider, uint256 shares, uint256 proceeds
    );
    event MarginPledged(uint256 indexed loanId, uint256 indexed offer, uint256 shares, uint256 proceeds);
    event MarketMark(
        uint256 indexed loanId, uint256 price, uint256 backing, uint64 observedAt, bytes32 indexed sourceHash
    );
    event MarginLiquidated(uint256 indexed loanId, uint256 backing, uint256 proceeds);
    event MarginSharesReleased(uint256 indexed loanId, address indexed recipient, uint256 shares);

    constructor(
        IERC20Metadata asset_,
        address forwarder_,
        address workflowOwner_,
        bytes32 workflowId_,
        IConditionalTokens positionToken_,
        bytes32 condition_,
        uint256 referenceTokenId_
    ) TraderCreditDesk(asset_, forwarder_, workflowOwner_, workflowId_) {
        if (
            block.chainid != 31337 || address(positionToken_).code.length == 0 || referenceTokenId_ == 0
                || positionToken_.getOutcomeSlotCount(condition_) != 2
        ) revert InvalidConfiguration();
        positionToken = positionToken_;
        referenceTokenId = referenceTokenId_;
        tokenId =
            positionToken_.getPositionId(address(asset_), positionToken_.getCollectionId(bytes32(0), condition_, 1));
    }

    function postBackstop(address borrower, uint96 shares, uint96 proceeds) external nonReentrant returns (uint256 id) {
        if (
            borrower == address(0) || borrower == address(this) || borrower == msg.sender || shares == 0
                || proceeds == 0 || proceeds > shares
        ) revert InvalidBackstop();
        _pullExact(msg.sender, address(this), proceeds);
        id = ++backstopCount;
        backstops[id] = Backstop(msg.sender, borrower, shares, proceeds, 0, false);
        emit BackstopPosted(id, borrower, msg.sender, shares, proceeds);
    }

    function withdrawBackstop(uint256 id) external nonReentrant {
        Backstop storage bid = backstops[id];
        if (msg.sender != bid.provider || bid.loanId != 0 || bid.closed) revert InvalidBackstop();
        _refundBackstop(bid);
    }

    function requestMarginLoan(
        Terms calldata terms,
        address[] calldata traders,
        address[] calldata controllers,
        bytes[] calldata consents,
        uint256 offer
    ) external nonReentrant returns (uint256 id) {
        Backstop storage bid = backstops[offer];
        if (
            bid.borrower != msg.sender || bid.loanId != 0 || bid.closed
                || uint256(terms.bond) + bid.proceeds < terms.due
        ) {
            revert InvalidBackstop();
        }
        id = _requestLoan(terms, traders, controllers, consents);
        bid.loanId = id;
        loanBackstop[id] = offer;
        uint256 balance = positionToken.balanceOf(address(this), tokenId);
        _expectedDeposit = keccak256(abi.encode(msg.sender, bid.shares));
        positionToken.safeTransferFrom(msg.sender, address(this), tokenId, bid.shares, "");
        if (_expectedDeposit != bytes32(0) || positionToken.balanceOf(address(this), tokenId) != balance + bid.shares) {
            revert TransferMismatch();
        }
        emit MarginPledged(id, offer, bid.shares, bid.proceeds);
    }

    function health(uint256 id) public view returns (uint256 backing, uint256 debtLtvBps, bool fresh) {
        Loan memory loan = getLoan(id);
        Backstop storage bid = backstops[loanBackstop[id]];
        Quote storage quote = quotes[id];
        backing = uint256(loan.terms.bond) + uint256(bid.shares) * quote.price / SHARE_UNIT;
        debtLtvBps = backing == 0 ? 0 : uint256(loan.terms.due) * 10_000 / backing;
        fresh = quote.observedAt != 0 && block.timestamp - quote.observedAt <= MAX_MARK_AGE;
    }

    function onReport(bytes calldata metadata, bytes calldata report) public override {
        if (report.length == 9 * 32) {
            super.onReport(metadata, report);
        } else {
            _acceptMarketMark(metadata, report);
        }
    }

    function _acceptMarketMark(bytes calldata metadata, bytes calldata payload) private nonReentrant {
        _authenticateReport(metadata);
        MarkReport memory report = abi.decode(payload, (MarkReport));
        Loan memory loan = getLoan(report.loanId);
        if (
            report.schema != MARK_SCHEMA || report.chainId != block.chainid || report.desk != address(this)
                || report.referenceTokenId != referenceTokenId || loanBackstop[report.loanId] == 0
                || (loan.state != State.Requested && loan.state != State.Funded) || report.price > SHARE_UNIT
                || report.observedAt > block.timestamp || report.observedAt <= quotes[report.loanId].observedAt
                || block.timestamp - report.observedAt > MAX_MARK_AGE || report.sourceHash == bytes32(0)
        ) revert InvalidMark();
        quotes[report.loanId] = Quote(report.price, report.observedAt, report.sourceHash);
        (uint256 backing,,) = health(report.loanId);
        emit MarketMark(report.loanId, report.price, backing, report.observedAt, report.sourceHash);
        if (loan.state == State.Funded && uint256(loan.terms.due) * 10_000 >= backing * LIQUIDATION_BPS) {
            _settleLoan(report.loanId);
            emit MarginLiquidated(report.loanId, backing, backstops[loanBackstop[report.loanId]].proceeds);
        }
    }

    function claimPositionCollateral(uint256 id, address recipient) external nonReentrant {
        Loan memory loan = getLoan(id);
        Backstop storage bid = backstops[loanBackstop[id]];
        address beneficiary = loan.state == State.Defaulted ? bid.provider : loan.borrower;
        if (
            !bid.closed || sharesClaimed[id] || recipient == address(0) || recipient == address(this)
                || (msg.sender != beneficiary && recipient != beneficiary)
        ) revert InvalidBackstop();
        sharesClaimed[id] = true;
        positionToken.safeTransferFrom(address(this), recipient, tokenId, bid.shares, "");
        emit MarginSharesReleased(id, recipient, bid.shares);
    }

    function _checkFunding(uint256 id, Loan storage loan) internal view override {
        if (loanBackstop[id] == 0) revert InvalidBackstop();
        (uint256 backing,, bool fresh) = health(id);
        if (!fresh) revert InvalidMark();
        if (uint256(loan.terms.due) * 10_000 > backing * ORIGINATION_BPS) revert AboveOriginationLtv();
    }

    function _returnUnusedRecovery(uint256 id) internal override {
        if (loanBackstop[id] != 0) _refundBackstop(backstops[loanBackstop[id]]);
    }

    function _refundBackstop(Backstop storage bid) private {
        bid.closed = true;
        _sendExact(bid.provider, bid.proceeds);
    }

    function _recoverPositionCollateral(uint256 id) internal override returns (uint256) {
        uint256 offer = loanBackstop[id];
        if (offer == 0) return 0;
        Backstop storage bid = backstops[offer];
        if (
            bid.closed || positionToken.balanceOf(address(this), tokenId) < bid.shares
                || asset.balanceOf(address(this)) < uint256(getLoan(id).terms.bond) + bid.proceeds
        ) revert InvalidBackstop();
        bid.closed = true;
        return bid.proceeds;
    }

    function supportsInterface(bytes4 interfaceId) public pure override(TraderCreditDesk, IERC165) returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || super.supportsInterface(interfaceId);
    }

    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata)
        external
        returns (bytes4)
    {
        if (
            msg.sender != address(positionToken) || operator != address(this) || id != tokenId
                || _expectedDeposit == bytes32(0) || keccak256(abi.encode(from, value)) != _expectedDeposit
        ) revert InvalidBackstop();
        delete _expectedDeposit;
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert InvalidBackstop();
    }
}
