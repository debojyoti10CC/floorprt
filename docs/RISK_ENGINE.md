# AQRA credit risk engine

**Implementation:** `services/underwriting/risk-engine.ts`  
**Interface:** Data → Risk engine  
**Model version:** `aqra-credit-risk-v1`

## Purpose and boundary

The engine prices and stress-tests a proposed portfolio of bonded loans. It does not turn trading performance into probability of default (PD). The Polymarket benchmark supplies historical trader activity and realized P&L, but this dataset contains no matured AQRA loan repayment/default labels, complete account equity, starting bankroll, or timestamped forecast-probability submissions.

Therefore PD, pairwise default correlation, bond recovery under stress, cost of capital, operating cost, and hypothetical reserve are user-controlled scenario inputs. They are never presented as observed rates. The on-screen production credit gate remains **REJECT** until the model has mature loan outcomes, calibrated PD, successful out-of-time validation, and genuinely committed loss-absorbing capital. A scenario reserve slider does not count as committed capital.

Trader performance is kept as separate evidence. It can show how a selection rule behaved on later months; it cannot be used as a repayment label, collateral value, probability forecast, or Brier score.

## Data used for underwriting evidence

The walk-forward dataset collects Polymarket BTC/ETH 15-minute market fills, resolutions, wallet P&L histories and Polygon source-block checks. At each monthly cutoff, the selection policy uses only earlier observations. Forward results measure realized P&L and activity in the next month.

The benchmark currently reports:

- 768 scheduled market sessions across November 2025–October 2026, with source gaps recorded separately.
- Sampled wallet-month observations from activity and large-settled-buy discovery; this is not a venue-wide census.
- UTC boundary block verification for the monthly as-of cutoffs.
- Next-month profitable-wallet frequency, median and total realized P&L by cohort.

The Data page and downloadable `run.json` are the source of the exact current coverage totals. Historical results are vulnerable to survivorship, selection, market-regime and source-coverage bias. Realized P&L is not return on equity when bankroll and full account holdings are absent.

## Credit exposure and recovery

For loan \(i\), let:

- \(EAD_i\) be outstanding principal at default. The current model excludes unearned fee income from principal-loss calculations.
- \(B_i\) be the borrower bond posted in the same repayment token.
- \(h\in[0,1]\) be the stress recovery fraction for that bond.
- \(R_i=hB_i\) be its stress-recoverable value.
- \(LGD_i=\max(0,EAD_i-R_i)/EAD_i\) for positive EAD.
- \(\ell_i=EAD_i\,LGD_i=\max(0,EAD_i-R_i)\) be lender principal loss if the borrower defaults.

The contract escrows the borrower bond and transfers it on a matured default. The UI starts with full bond recovery because the demo bond is held in the repayment token; the recovery slider applies an explicit haircut stress. It is not an estimate of stablecoin depeg, smart-contract exploit, legal recovery, or operational loss.

The model’s expected credit loss is:

\[
EL=\sum_i PD_i\,\ell_i
=\sum_i PD_i\,EAD_i\,LGD_i.
\]

For the current homogeneous-cohort view, each exposure shares principal, bond ratio and PD, so \(EL=Np\ell\). Monetary inputs and outputs use integer micro-USDC; probabilities and tail calculations use floating-point values. The lender-loss calculation is principal-only and does not assume automatic access to the borrower’s trading account.

## Correlated default stress

An independent binomial model can understate clustered losses. AQRA models the default count with a beta-binomial distribution. The user supplies marginal default probability \(p\) and pairwise default-indicator correlation \(\rho\). For \(0<\rho<1\):

\[
\alpha=p\frac{1-\rho}{\rho},\qquad
\beta=(1-p)\frac{1-\rho}{\rho},
\]

\[
P(K=k)=\binom Nk\frac{B(k+\alpha,N-k+\beta)}{B(\alpha,\beta)},
\qquad k=0,\ldots,N.
\]

At \(\rho=0\), the engine uses the binomial limit. At \(\rho=1\), it uses the common-shock limit: no borrowers default with probability \(1-p\), and all default with probability \(p\). Portfolio loss for \(k\) defaults is \(L_k=k\ell\). The chart and table show the complete discrete probability mass and cumulative loss distribution for the selected cohort.

Correlation is a stress assumption, not estimated from trader P&L or from repayment history. A real deployment needs enough simultaneous loan outcomes to estimate common dependence, sector concentration and regime shifts. Pairwise correlation alone will not capture every contagion or wrong-way-risk structure.

## Tail risk, capital and pricing

For confidence \(q\), the engine reports the discrete loss quantile:

\[
VaR_q=\inf\{x:P(L\le x)\ge q\}.
\]

Expected Shortfall averages the worst \(1-q\) probability mass. If a discrete probability atom crosses the boundary, only the necessary fraction of that atom enters the tail average; this avoids the common discrete-tail error of averaging every outcome at or above VaR.

The current capital stress is deliberately conservative:

\[
K_{req}=\max\left(ES_q,\;N\ell\right),\qquad
K_{gap}=\max(0,K_{req}-K_{scenario}).
\]

The second term is the loss if every selected loan defaults. \(K_{scenario}\) is a what-if input only; it cannot satisfy the live approval gate. A shared reserve would require an actual funded and legally/technically ring-fenced contract balance before it can be called committed capital.

For principal \(P\), upfront/fixed fee \(F\), per-period capital charge \(r_K\), and operating cost \(C\), the prototype compares:

\[
Revenue_{fee}=N(1-p)F,
\]

\[
Cost_{capital}=r_K\max(0,ES_q-EL),
\]

\[
Price_{risk}=EL+Cost_{capital}+NC,
\qquad Margin=Revenue_{fee}-Price_{risk}.
\]

The break-even PD is found by searching the assumed PD range for the greatest PD whose modeled margin remains non-negative. It is a scenario threshold, not a borrower's PD estimate. The current app terms are $100 principal, $102 due and a $25 bond; these are demonstration terms and the benchmark does not claim that a $2 fee compensates for measured credit risk.

## Binding decision policy

`decideCreditLimit` returns one of `REJECT`, `REDUCE_LIMIT` or `APPROVE`. Before sizing the limit, it requires all of:

1. Mature repayment/default labels exist.
2. PD has been calibrated from those loan outcomes.
3. Out-of-time validation has passed.
4. Requested exposure is nonzero.
5. Committed capital covers the modeled capital requirement and stress economics produce non-negative margin.

When all data gates pass, the engine searches integer loan counts up to the request. It returns the largest count whose stressed capital is covered and whose expected risk-adjusted margin is non-negative. The current product supplies zero repayment labels, false calibration/validation gates and zero committed pool capital, so pooled underwriting rejects. A direct lender may fund the local demo only after acknowledging that they can lose principal beyond the bond.

## Calibration and validation required before any production approval

The following is a future calibration plan, not a claim about the current dataset:

1. Record contract-native origination features and loan terms at the cutoff; never backfill features from after default or repayment.
2. Label only matured loans. Keep extensions, partial repayments, cancellations and right-censored loans distinct from full repayment/default.
3. Split by origination time, with a final untouched out-of-time period. Avoid random row splits that leak wallet histories or market regimes across time.
4. Fit a cohort PD prior only after enough matured labels exist. A simple Beta-Binomial baseline with prior \(PD\sim Beta(a_0,b_0)\), \(d\) defaults among \(m\) matured loans, gives posterior \(Beta(a_0+d,b_0+m-d)\) and mean \((a_0+d)/(a_0+b_0+m)\). Report credible intervals and use a conservative posterior quantile for limits; do not treat a point estimate as certainty.
5. Evaluate discrimination and calibration separately. Report Brier score, log loss, calibration curves, observed/expected defaults and uncertainty by time and cohort. A Brier score requires timestamped probability forecasts paired with binary outcomes; trading P&L is not a substitute.
6. Estimate recovery after realized bond proceeds and costs, not from the nominal bond amount alone. Stress dependence, exposure concentration, liquidity and loss reserves before sizing a pool.
7. Backtest policies with only point-in-time eligible data; charge fees and losses at the contract level; include defaults, partial recovery, late repayment, servicing costs and funding utilization. Compare against fixed-rule and random baselines with confidence intervals.

Until these steps have real outcome data, the live gate must remain closed.

## Implementation and operational safeguards

- Core calculations are isolated in `services/underwriting/risk-engine.ts`; the interface imports that module and does not recompute financial values separately.
- Invalid counts, basis points and money inputs throw range errors instead of silently clamping.
- The probability distribution is normalized before quantile calculations. VaR is discrete and Expected Shortfall uses fractional boundary mass.
- Model assumptions and computed values are shown separately; scenario inputs are labeled assumptions.
- The approval control is independent of UI slider values. Changing the scenario capital cannot make a loan eligible.
- Future realized trader P&L never reduces loan balance, collateral shortfall, or the calculated loss.
- Model changes must bump `RISK_ENGINE_VERSION`, update this specification, and be assessed against deterministic reference cases and independent numerical calculations before deployment.

## References

- Basel Committee on Banking Supervision, [CRE 30: Internal ratings-based approach](https://www.bis.org/committees/bcbs/basel-framework/standard/cre.htm), for PD/LGD/EAD definitions and expected-loss framing.
- G. W. Brier, “Verification of forecasts expressed in terms of probability,” *Monthly Weather Review*, vol. 78, no. 1, 1950, [doi:10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2](https://doi.org/10.1175/1520-0493(1950)078%3C0001%3AVOFEIT%3E2.0.CO%3B2), for proper scoring of probability forecasts.
- R. T. Rockafellar and S. Uryasev, “Conditional Value-at-Risk for general loss distributions,” *Journal of Banking & Finance*, vol. 26, 2002, [author manuscript](https://sites.math.washington.edu/~rtr/papers/rtr187-CVaR2.pdf), for tail-loss optimization and Expected Shortfall.
- M. B. Gordy, “A risk-factor model foundation for ratings-based bank capital rules,” *Journal of Financial Intermediation*, vol. 12, 2003, [doi:10.1016/S1042-9573(03)00040-8](https://www.sciencedirect.com/science/article/pii/S1042957303000408), for systematic dependence and portfolio concentration.
- P. F. Christoffersen, “Evaluating interval forecasts,” *International Economic Review*, vol. 39, no. 4, 1998, [paper](https://users.ssc.wisc.edu/~bhansen/718/Christoffersen1998.pdf), for out-of-sample forecast validation concepts.
- [Polymarket user P&L endpoint](https://docs.polymarket.com/api-reference/wallet/get-a-users-pnl-series), the public performance source used by the current benchmark.
