// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ITraderReportReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice A lender accepts fixed terms after a report authenticates the borrower's evidence.
/// @dev The base desk holds the first-loss bond. A position desk may also recover approved outcome collateral.
contract TraderCreditDesk is ReentrancyGuard, IERC165, ITraderReportReceiver {
    using SafeERC20 for IERC20;

    uint256 public constant PRINCIPAL_CAP = 100e6;
    uint256 public constant MIN_BOND_BPS = 2_500;
    uint256 public constant MAX_FEE_BPS = 200;
    uint256 public constant MIN_SCORE = 60;
    uint256 public constant EVIDENCE_MAX_AGE = 35 days;
    bytes32 public constant POLICY_HASH = keccak256("aqra-trader-credit-v1");
    bytes32 private constant WALLET_LINK_TYPEHASH = keccak256(
        "AQRAWalletLink(address desk,uint256 chainId,address borrower,address trader,bytes32 evidenceContext,uint256 nonce)"
    );

    enum State {
        None,
        Requested,
        Funded,
        Repaid,
        Defaulted,
        Cancelled
    }

    struct Terms {
        uint96 principal;
        uint96 due;
        uint96 bond;
        uint32 termSeconds;
        uint64 asOf;
        uint64 linkExpires;
        bytes32 evidenceDigest;
        bytes32 ensNode;
    }

    struct Loan {
        Terms terms;
        address borrower;
        address lender;
        uint64 fundBy;
        uint64 maturity;
        uint8 score;
        State state;
        bytes32 walletSetHash;
    }

    struct ScoreReport {
        address desk;
        uint256 chainId;
        uint256 loanId;
        address borrower;
        bytes32 walletSetHash;
        bytes32 evidenceDigest;
        uint64 asOf;
        uint8 score;
        bytes32 policyHash;
    }

    error InvalidConfiguration();
    error InvalidTerms();
    error InvalidState();
    error InvalidWalletGroup();
    error InvalidWalletConsent(address trader);
    error WalletAlreadyInUse(address trader);
    error InvalidReport();
    error Unauthorized();
    error Deadline();
    error TransferMismatch();

    IERC20 public immutable asset;
    address public immutable forwarder;
    address public immutable workflowOwner;
    address public immutable workflowConfigurator;
    bytes32 public workflowId;

    uint256 public loanCount;
    mapping(address => uint256) public nextNonce;
    mapping(address => uint256) public activeForWallet;
    mapping(uint256 => Loan) private _loans;
    mapping(uint256 => bytes32) public assessmentHashOf;
    mapping(uint256 => bytes32) public assessmentReferenceOf;
    mapping(uint256 => address[]) private _traderWallets;
    mapping(uint256 => address[]) private _traderControllers;

    event TraderCreditRequested(uint256 indexed loanId, address indexed borrower, bytes32 indexed evidenceDigest);
    event ScoreAttested(uint256 indexed loanId, bytes32 indexed evidenceDigest, uint8 score);
    event AssessmentCommitted(uint256 indexed loanId, bytes32 indexed reportHash, bytes32 swarmReference);
    event TraderLoanFunded(uint256 indexed loanId, address indexed lender, uint256 principal, uint64 maturity);
    event TraderLoanRepaid(uint256 indexed loanId, uint256 lenderPaid, uint256 bondReturned);
    event TraderLoanDefaulted(uint256 indexed loanId, uint256 lenderPaid, uint256 unpaidDue, uint256 principalLoss);
    event TraderCreditCancelled(uint256 indexed loanId);
    event WorkflowPinned(bytes32 indexed workflowId);

    constructor(IERC20Metadata asset_, address forwarder_, address workflowOwner_, bytes32 workflowId_) {
        if (
            address(asset_).code.length == 0 || asset_.decimals() != 6 || forwarder_ == address(0)
                || workflowOwner_ == address(0) || (block.chainid != 31337 && forwarder_.code.length == 0)
        ) revert InvalidConfiguration();
        asset = IERC20(address(asset_));
        forwarder = forwarder_;
        workflowOwner = workflowOwner_;
        workflowConfigurator = msg.sender;
        workflowId = workflowId_;
    }

    /// @notice Pins the ID of the workflow built with this desk's address in its config.
    function pinWorkflow(bytes32 id) external {
        if (msg.sender != workflowConfigurator) revert Unauthorized();
        if (workflowId != bytes32(0) || id == bytes32(0)) revert InvalidConfiguration();
        workflowId = id;
        emit WorkflowPinned(id);
    }

    function supportsInterface(bytes4 interfaceId) public pure virtual returns (bool) {
        return interfaceId == type(IERC165).interfaceId || interfaceId == type(ITraderReportReceiver).interfaceId;
    }

    function getLoan(uint256 id) public view returns (Loan memory) {
        return _loans[id];
    }

    function traderWallets(uint256 id) external view returns (address[] memory) {
        return _traderWallets[id];
    }

    function traderControllers(uint256 id) external view returns (address[] memory) {
        return _traderControllers[id];
    }

    /// @notice Sign the raw 32-byte result with personal_sign. A link authorizes use of evidence for one request.
    function linkDigest(address borrower, address trader, bytes32 evidenceContext, uint256 nonce)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(WALLET_LINK_TYPEHASH, address(this), block.chainid, borrower, trader, evidenceContext, nonce)
        );
    }

    function requestLoan(Terms calldata terms, address[] calldata traders, bytes[] calldata consents)
        external
        nonReentrant
        returns (uint256 id)
    {
        return _requestLoan(terms, traders, traders, consents);
    }

    /// @notice Links Polygon trading proxies to consenting controllers. The report must authenticate each proxy.
    function requestLoanWithControllers(
        Terms calldata terms,
        address[] calldata traders,
        address[] calldata controllers,
        bytes[] calldata consents
    ) external nonReentrant returns (uint256 id) {
        return _requestLoan(terms, traders, controllers, consents);
    }

    function _requestLoan(
        Terms calldata terms,
        address[] calldata traders,
        address[] calldata controllers,
        bytes[] calldata consents
    ) internal returns (uint256 id) {
        if (workflowId == bytes32(0)) revert InvalidConfiguration();
        uint256 minimumBond = (uint256(terms.principal) * MIN_BOND_BPS + 9_999) / 10_000;
        uint256 maximumDue = uint256(terms.principal) * (10_000 + MAX_FEE_BPS) / 10_000;
        uint256 evidenceExpires = uint256(terms.asOf) + EVIDENCE_MAX_AGE;
        if (
            terms.principal == 0 || terms.principal > PRINCIPAL_CAP || terms.due < terms.principal
                || terms.due > maximumDue || terms.bond < minimumBond || terms.bond > terms.due
                || terms.termSeconds < 1 days || terms.termSeconds > 30 days || terms.evidenceDigest == bytes32(0)
                || terms.asOf > block.timestamp || block.timestamp >= evidenceExpires
                || terms.linkExpires < block.timestamp || terms.linkExpires > block.timestamp + 7 days
        ) revert InvalidTerms();
        if (
            traders.length == 0 || traders.length > 4 || traders.length != consents.length
                || traders.length != controllers.length
        ) {
            revert InvalidWalletGroup();
        }

        id = ++loanCount;
        _reserveWallet(msg.sender, id);
        _bindTraderWallets(id, terms, traders, controllers, consents);
        nextNonce[msg.sender]++;

        uint256 fundBy = block.timestamp + 2 days;
        if (evidenceExpires < fundBy) fundBy = evidenceExpires;
        Loan storage loan = _loans[id];
        loan.terms = terms;
        loan.borrower = msg.sender;
        loan.fundBy = uint64(fundBy);
        loan.state = State.Requested;
        loan.walletSetHash = keccak256(abi.encode(traders));

        _pullExact(msg.sender, address(this), terms.bond);
        emit TraderCreditRequested(id, msg.sender, terms.evidenceDigest);
    }

    /// @dev Chainlink forwarder metadata is packed workflowId(32) || workflowName(10) || workflowOwner(20).
    function _authenticateReport(bytes calldata metadata) internal view {
        if (
            msg.sender != forwarder || workflowId == bytes32(0) || metadata.length != 62
                || bytes32(metadata[:32]) != workflowId || address(bytes20(metadata[42:62])) != workflowOwner
        ) revert InvalidReport();
    }

    function onReport(bytes calldata metadata, bytes calldata report) public virtual nonReentrant {
        _authenticateReport(metadata);
        ScoreReport memory scoreReport = abi.decode(report, (ScoreReport));
        Loan storage loan = _loans[scoreReport.loanId];
        if (
            scoreReport.desk != address(this) || scoreReport.chainId != block.chainid
                || scoreReport.policyHash != POLICY_HASH || loan.state != State.Requested || loan.score != 0
                || block.timestamp >= loan.fundBy || scoreReport.borrower != loan.borrower
                || scoreReport.walletSetHash != loan.walletSetHash
                || scoreReport.evidenceDigest != loan.terms.evidenceDigest || scoreReport.asOf != loan.terms.asOf
                || scoreReport.score < MIN_SCORE || scoreReport.score > 100
        ) revert InvalidReport();
        address[] storage traders = _traderWallets[scoreReport.loanId];
        for (uint256 index; index < traders.length; ++index) {
            _reserveWallet(traders[index], scoreReport.loanId);
        }
        loan.score = scoreReport.score;
        emit ScoreAttested(scoreReport.loanId, scoreReport.evidenceDigest, scoreReport.score);
    }

    /// @notice Binds a loan to the public Swarm report the borrower consented to publish.
    /// @dev This commits the report bytes and location; lenders still verify the fetched bytes before funding.
    function commitAssessment(uint256 id, bytes32 reportHash, bytes32 swarmReference) external {
        Loan storage loan = _loans[id];
        if (loan.state != State.Requested || loan.score < MIN_SCORE || block.timestamp >= loan.fundBy) {
            revert InvalidState();
        }
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (reportHash == bytes32(0) || swarmReference == bytes32(0)) revert InvalidReport();
        bytes32 currentHash = assessmentHashOf[id];
        bytes32 currentReference = assessmentReferenceOf[id];
        if (currentHash != bytes32(0) || currentReference != bytes32(0)) {
            if (currentHash != reportHash || currentReference != swarmReference) revert InvalidReport();
            return;
        }
        assessmentHashOf[id] = reportHash;
        assessmentReferenceOf[id] = swarmReference;
        emit AssessmentCommitted(id, reportHash, swarmReference);
    }

    function fundLoan(uint256 id) external nonReentrant {
        Loan storage loan = _loans[id];
        if (loan.state != State.Requested || loan.score < MIN_SCORE) revert InvalidState();
        if (block.timestamp >= loan.fundBy) revert Deadline();
        if (assessmentHashOf[id] == bytes32(0) || assessmentReferenceOf[id] == bytes32(0)) revert InvalidReport();
        if (msg.sender == loan.borrower || activeForWallet[msg.sender] == id || msg.sender == address(this)) {
            revert Unauthorized();
        }
        _checkFunding(id, loan);
        loan.lender = msg.sender;
        loan.maturity = uint64(block.timestamp + loan.terms.termSeconds);
        loan.state = State.Funded;
        _pullExact(msg.sender, loan.borrower, loan.terms.principal);
        emit TraderLoanFunded(id, msg.sender, loan.terms.principal, loan.maturity);
    }

    function _checkFunding(uint256, Loan storage) internal view virtual {}

    function repay(uint256 id) external nonReentrant {
        Loan storage loan = _loans[id];
        if (loan.state != State.Funded) revert InvalidState();
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (block.timestamp >= loan.maturity) revert Deadline();
        loan.state = State.Repaid;
        _releaseWallets(id, loan.borrower);
        _pullExact(msg.sender, loan.lender, loan.terms.due);
        _sendExact(loan.borrower, loan.terms.bond);
        _returnUnusedRecovery(id);
        emit TraderLoanRepaid(id, loan.terms.due, loan.terms.bond);
    }

    function settleDefault(uint256 id) external nonReentrant {
        Loan storage loan = _loans[id];
        if (loan.state != State.Funded) revert InvalidState();
        if (block.timestamp < loan.maturity) revert Deadline();
        _settleLoan(id);
    }

    function _settleLoan(uint256 id) internal {
        Loan storage loan = _loans[id];
        if (loan.state != State.Funded) revert InvalidState();
        loan.state = State.Defaulted;
        _releaseWallets(id, loan.borrower);
        uint256 recovered = uint256(loan.terms.bond) + _recoverPositionCollateral(id);
        uint256 due = loan.terms.due;
        uint256 paid = recovered < due ? recovered : due;
        _sendExact(loan.lender, paid);
        if (recovered > paid) _sendExact(loan.borrower, recovered - paid);
        uint256 principal = loan.terms.principal;
        emit TraderLoanDefaulted(id, paid, due - paid, principal > paid ? principal - paid : 0);
    }

    function _recoverPositionCollateral(uint256) internal virtual returns (uint256) {
        return 0;
    }

    function _returnUnusedRecovery(uint256) internal virtual {}

    function cancelRequest(uint256 id) external nonReentrant {
        Loan storage loan = _loans[id];
        if (loan.state != State.Requested) revert InvalidState();
        if (msg.sender != loan.borrower && block.timestamp < loan.fundBy) revert Unauthorized();
        loan.state = State.Cancelled;
        _releaseWallets(id, loan.borrower);
        _sendExact(loan.borrower, loan.terms.bond);
        _returnUnusedRecovery(id);
        emit TraderCreditCancelled(id);
    }

    function _bindTraderWallets(
        uint256 id,
        Terms calldata terms,
        address[] calldata traders,
        address[] calldata controllers,
        bytes[] calldata consents
    ) private {
        address previous;
        uint256 nonce = nextNonce[msg.sender];
        bytes32 evidenceContext =
            keccak256(abi.encode(terms.evidenceDigest, terms.ensNode, terms.asOf, terms.linkExpires));
        for (uint256 index; index < traders.length; ++index) {
            address trader = traders[index];
            address controller = controllers[index];
            if (
                trader <= previous || trader == address(this) || controller == address(0) || controller == address(this)
            ) {
                revert InvalidWalletGroup();
            }
            previous = trader;
            if (controller != msg.sender) {
                bytes32 digest = linkDigest(msg.sender, trader, evidenceContext, nonce);
                if (!SignatureChecker.isValidSignatureNow(
                        controller, MessageHashUtils.toEthSignedMessageHash(digest), consents[index]
                    )) {
                    revert InvalidWalletConsent(controller);
                }
            }
            _reserveWallet(controller, id);
            // A claimed Polygon proxy cannot block another user until authenticated by the report.
            if (activeForWallet[trader] != 0 && activeForWallet[trader] != id) revert WalletAlreadyInUse(trader);
            _traderWallets[id].push(trader);
            _traderControllers[id].push(controller);
        }
    }

    function _reserveWallet(address trader, uint256 id) private {
        if (activeForWallet[trader] != 0 && activeForWallet[trader] != id) revert WalletAlreadyInUse(trader);
        activeForWallet[trader] = id;
    }

    function _releaseWallets(uint256 id, address borrower) private {
        delete activeForWallet[borrower];
        for (uint256 index; index < _traderWallets[id].length; ++index) {
            address trader = _traderWallets[id][index];
            address controller = _traderControllers[id][index];
            if (activeForWallet[trader] == id) delete activeForWallet[trader];
            if (activeForWallet[controller] == id) delete activeForWallet[controller];
        }
    }

    function _pullExact(address from, address to, uint256 amount) internal {
        uint256 beforeBalance = asset.balanceOf(to);
        asset.safeTransferFrom(from, to, amount);
        if (asset.balanceOf(to) != beforeBalance + amount) revert TransferMismatch();
    }

    function _sendExact(address to, uint256 amount) internal {
        uint256 beforeBalance = asset.balanceOf(to);
        asset.safeTransfer(to, amount);
        if (asset.balanceOf(to) != beforeBalance + amount) revert TransferMismatch();
    }
}
