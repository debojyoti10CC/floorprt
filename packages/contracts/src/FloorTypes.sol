// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

library FloorTypes {
    uint256 internal constant UNIT = 1_000_000;
    uint256 internal constant HALF = 500_000;
    uint256 internal constant MAX_PRICE = 1e36;
    bytes32 internal constant POLICY = keccak256("FLOOR_SHARED_GEQ_50_50_V1");

    enum ObservationState {
        UNRESOLVED,
        FINALIZED,
        CANCELLED
    }
    enum Side {
        YES,
        NO
    }
    enum PositionState {
        NONE,
        OPEN,
        ENCUMBERED,
        RELEASED,
        REDEEMED
    }
    enum LoanState {
        NONE,
        FUNDED,
        SETTLED,
        REPAID
    }

    struct Observation {
        bytes32 assetId;
        uint64 observationTime;
        uint8 priceDecimals;
        bytes32 sourceId;
        bytes32 resolutionPolicyHash;
        uint64 cancelAfter;
        ObservationState state;
        uint256 price;
        address resolver;
    }

    struct Market {
        uint256 id;
        uint256 observationId;
        uint256 strike;
        bool enabledForNewCollateral;
    }

    struct VerifiedFloor {
        bool valid;
        uint256 floorUsdcBase;
        uint256 observationId;
        bytes32 proofVersion;
        uint16 reasonCode;
    }

    struct Position {
        address owner;
        address beneficiary;
        uint256 marketLower;
        uint256 marketUpper;
        uint64 unitsLower;
        uint64 unitsUpper;
        uint256 observationId;
        uint256 certifiedFloor;
        PositionState state;
        uint256 lienLoanId;
    }

    struct BorrowRequest {
        uint256 principal;
        uint256 maximumDue;
        uint64 expiry;
        bool active;
    }

    struct Loan {
        uint256 positionId;
        address lender;
        address borrower;
        uint256 principal;
        uint256 due;
        uint256 certifiedFloor;
        uint64 fundedAt;
        uint64 targetMaturity;
        LoanState state;
    }
}
