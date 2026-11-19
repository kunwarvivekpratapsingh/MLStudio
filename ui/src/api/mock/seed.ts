import type {
  Constraints,
  Feature,
  FeatureBuildStatus,
  Hypothesis,
  ProblemSpec,
  ProblemType,
  ReviewStatus,
  SubHypothesis,
} from '../types';

/* Compact authoring format for seed content. Each project lists hypotheses,
   their sub-hypotheses, and the features built for each sub-hypothesis. */
interface FeatDef {
  name: string;
  desc: string;
  entity: Feature['entity'];
  window: string;
  dtype?: Feature['dtype'];
  tables: string[];
  logic?: string;
  status?: FeatureBuildStatus;
  excluded?: string;
  stats?: [iv: number, cov: number, psi: number, leak?: 'pass' | 'fixed' | 'fail', note?: string];
}
interface SubDef { title: string; signal: string; status?: ReviewStatus; features?: FeatDef[] }
interface HypDef { title: string; rationale: string; evidence: string; tables: string[]; lift: Hypothesis['expectedLift']; status: ReviewStatus; subs: SubDef[] }

export interface ProjectSeed {
  id: string;
  name: string;
  problemType: ProblemType;
  owner: string;
  statement: string;
  spec: ProblemSpec;
  constraints: Constraints;
  createdDaysAgo: number;
  hyps: HypDef[];
  /** Model loop configuration for the simulator. */
  model: { baseline: number; ceiling: number; seedRuns: number; metricName: string; unit: '%' | '' };
}

const base: Omit<Constraints, 'tables' | 'excludedColumns'> = {
  dataWindow: { from: '2025-01-01', to: '2026-09-30' },
  featureWindows: ['1h', '24h', '7d', '30d', '90d'],
  maxFeatures: 60,
  maxLatencyMs: 50,
  computeBudgetGpuHours: 40,
  maxExperiments: 60,
  earlyStopAfter: 12,
  requireExplainability: true,
  deployTarget: 'uat',
  requireApprovalBeforeDeploy: true,
};

export const SEEDS: ProjectSeed[] = [
  /* ------------------------------------------------------------- */
  {
    id: 'cnp-fraud',
    name: 'CNP fraud early warning',
    problemType: 'fraud',
    owner: 'Priya Raman',
    createdDaysAgo: 6,
    statement:
      'Card-not-present fraud on US-issued cards rose 23% quarter over quarter, concentrated at e-commerce merchants the cardholder has never used. Build a model that scores every CNP authorization within 50 ms so issuers can step up to a 3DS challenge before approving, without stepping up more than 0.5% of genuine transactions.',
    spec: {
      objective: 'Classify each CNP authorization as fraud or not fraud',
      label: 'TC40 fraud report or chargeback reason 10.4 within 90 days of authorization',
      unitOfScoring: 'One e-commerce authorization (POS entry mode 81)',
      population: 'US-issued credit and debit, Jan 2025 to Sep 2026 · 2.1B authorizations · fraud rate 0.11%',
      primaryMetric: 'Recall at 0.5% false-positive rate',
      secondaryMetrics: ['AUC-PR', 'p99 scoring latency'],
      timeSplit: { train: 'Jan 2025 to Mar 2026', validate: 'Apr to Jun 2026', outOfTime: 'Jul to Sep 2026' },
    },
    constraints: { ...base, tables: ['vn_authorization', 'vn_authentication', 'vn_clearing_settlement', 'vn_fraud', 'vn_merchant_profile'], excludedColumns: ['iss_country', 'vaa_score'] },
    model: { baseline: 52.1, ceiling: 72.4, seedRuns: 46, metricName: 'Recall @ 0.5% FPR', unit: '%' },
    hyps: [
      {
        title: 'Card testing precedes fraud', status: 'accepted', lift: 5, tables: ['vn_authorization'],
        rationale: 'Fraudsters validate stolen cards with small CNP authorizations across many merchants before a large purchase.',
        evidence: 'Cards with **3+ sub-$2 CNP authorizations in one hour** are **14.2×** more likely to report fraud in the next 7 days (sample of 40M authorizations).',
        subs: [
          { title: 'Bursts of tiny authorizations signal testing', signal: 'Count of sub-$2 CNP auths per card in short windows', features: [
            { name: 'cnp_small_auth_cnt_card_1h', desc: 'CNP authorizations under $2 on the card in the previous hour', entity: 'card', window: '1h', dtype: 'int', tables: ['vn_authorization'], stats: [0.41, 99.8, 0.02] },
            { name: 'cnp_small_auth_cnt_card_24h', desc: 'CNP authorizations under $2 in the previous 24 hours', entity: 'card', window: '24h', dtype: 'int', tables: ['vn_authorization'], stats: [0.34, 99.8, 0.03] },
          ] },
          { title: 'Testing spreads across many merchants', signal: 'Distinct merchants touched by the card in a short window', features: [
            { name: 'distinct_merchants_card_1h', desc: 'Distinct merchants with a CNP auth on the card in the previous hour', entity: 'card', window: '1h', dtype: 'int', tables: ['vn_authorization'], stats: [0.36, 99.8, 0.03] },
          ] },
          { title: 'A large purchase follows a run of declines', signal: 'Decline ratio before the current authorization', features: [
            { name: 'decline_rate_card_cnp_24h', desc: 'Share of CNP auths declined on the card in the previous 24 hours', entity: 'card', window: '24h', dtype: 'float', tables: ['vn_authorization'], stats: [0.33, 99.8, 0.05] },
            { name: 'amt_to_max_prior_ratio_card_24h', desc: 'Current amount divided by the largest approved amount in 24 hours', entity: 'card', window: '24h', dtype: 'float', tables: ['vn_authorization'], stats: [0.27, 97.1, 0.04] },
          ] },
        ],
      },
      {
        title: 'Frictionless or skipped 3DS carries the fraud', status: 'accepted', lift: 4, tables: ['vn_authentication', 'vn_authorization'],
        rationale: 'Fraud concentrates where 3DS ran without a challenge, or where the merchant did not attempt authentication.',
        evidence: 'Frictionless 3DS (**ARes = Y, no challenge**) carries **3.1×** the fraud rate of challenged flows at high-risk merchants.',
        subs: [
          { title: 'The card rarely gets challenged', signal: 'Share of frictionless outcomes for the card', features: [
            { name: 'threeds_frictionless_share_card_30d', desc: 'Share of the card’s 3DS attempts that were frictionless in 30 days', entity: 'card', window: '30d', dtype: 'float', tables: ['vn_authentication'], stats: [0.22, 91.4, 0.06] },
          ] },
          { title: 'The merchant often skips authentication', signal: 'Gap between CNP auths and 3DS attempts at the merchant', features: [
            { name: 'threeds_attempt_gap_merchant_7d', desc: 'Share of the merchant’s CNP auths with no 3DS attempt in 7 days', entity: 'merchant', window: '7d', dtype: 'float', tables: ['vn_authentication', 'vn_authorization'], stats: [0.18, 88.0, 0.07] },
            { name: 'eci_downgrade_flag', desc: 'ECI indicates authentication was attempted but not completed', entity: 'transaction', window: 'txn', dtype: 'bool', tables: ['vn_authentication'], status: 'excluded', excluded: 'PSI 0.31 across months. Unstable, so the Validator excluded it.', stats: [0.12, 91.4, 0.31] },
          ] },
        ],
      },
      {
        title: 'New merchants with rising cross-issuer fraud are compromise points', status: 'accepted', lift: 4, tables: ['vn_merchant_profile', 'vn_fraud'],
        rationale: 'Recently onboarded merchants with fraud reported by several issuers are likely compromised or collusive.',
        evidence: 'Merchants under **30 days since first authorization** account for **19%** of CNP fraud but **4%** of volume.',
        subs: [
          { title: 'Merchant age predicts risk', signal: 'Days since the merchant first appeared', features: [
            { name: 'merchant_age_days', desc: 'Days since the merchant’s first authorization on VisaNet', entity: 'merchant', window: '—', dtype: 'int', tables: ['vn_merchant_profile'], stats: [0.27, 99.9, 0.01] },
          ] },
          { title: 'Fraud reports cluster by merchant across issuers', signal: 'Fraud rate at the merchant across all issuers, lagged', features: [
            { name: 'merchant_cross_issuer_fraud_rate_30d', desc: 'Fraud-reported share of the merchant’s CNP volume in 30 days, with a 2-day lag', entity: 'merchant', window: '30d', dtype: 'float', tables: ['vn_fraud', 'vn_authorization'], stats: [0.38, 96.5, 0.04, 'fixed', 'The 30-day window overlapped the label window. A 2-day reporting lag was added; information value fell from 0.61 to 0.38.'] },
          ] },
        ],
      },
      {
        title: 'A sudden shift in cross-border spend signals a compromised card', status: 'accepted', lift: 3, tables: ['vn_authorization'],
        rationale: 'Compromised cards are used from new countries soon after the compromise.',
        evidence: 'A **+40 point** jump in 7-day cross-border share against the 90-day baseline lifts fraud odds **6.8×**.',
        subs: [
          { title: 'Cross-border share departs from the card’s baseline', signal: '7-day share minus 90-day share', features: [
            { name: 'cross_border_share_delta_7d_90d', desc: '7-day cross-border share minus the 90-day share for the card', entity: 'card', window: '7d vs 90d', dtype: 'float', tables: ['vn_authorization'], stats: [0.21, 99.2, 0.03] },
            { name: 'new_acq_country_flag_card_180d', desc: 'Acquirer country never seen for the card in 180 days', entity: 'card', window: '180d', dtype: 'bool', tables: ['vn_authorization'], stats: [0.17, 99.2, 0.04] },
          ] },
        ],
      },
      {
        title: 'Spend in categories the cardholder never uses is a tell', status: 'accepted', lift: 3, tables: ['vn_authorization'],
        rationale: 'Fraudsters monetise through specific categories such as digital goods and money transfer.',
        evidence: 'First-ever spend in **MCC 5967, 4829 or 5816** is **9.3×** more likely to be fraud.',
        subs: [
          { title: 'Novel MCC for the card', signal: 'MCC never seen on the card in a year', features: [
            { name: 'mcc_novelty_card_365d', desc: 'MCC not seen on the card in the previous 365 days', entity: 'card', window: '365d', dtype: 'bool', tables: ['vn_authorization'], stats: [0.24, 98.7, 0.02] },
            { name: 'high_risk_mcc_share_card_7d', desc: 'Share of the card’s spend in high-risk MCCs over 7 days', entity: 'card', window: '7d', dtype: 'float', tables: ['vn_authorization'], stats: [0.15, 98.7, 0.05] },
          ] },
        ],
      },
      {
        title: 'Authorizations that never clear point to merchant manipulation', status: 'rejected', lift: 2, tables: ['vn_authorization', 'vn_clearing_settlement'],
        rationale: 'Merchants that authorize but rarely clear may be testing cards for fraud rings.',
        evidence: 'Signal is real (**2.4×**) but lags by 2 to 5 days, too late for authorization-time scoring. Rejected by Priya Raman.',
        subs: [],
      },
    ],
  },
  /* ------------------------------------------------------------- */
  {
    id: 'xb-false-declines',
    name: 'Cross-border false declines',
    problemType: 'false_decline',
    owner: 'Priya Raman',
    createdDaysAgo: 1,
    statement:
      'Genuine cross-border e-commerce transactions are declined far more often than domestic ones, costing issuers revenue and cardholder trust. Predict which declined cross-border authorizations were genuine, so issuers can tune decline rules and recover approvals without raising fraud above today’s basis points.',
    spec: {
      objective: 'Predict whether a declined cross-border CNP authorization was genuine',
      label: 'Declined auth followed by an approved retry at the same merchant within 24h and no fraud report within 90 days',
      unitOfScoring: 'One declined cross-border CNP authorization',
      population: 'Cross-border CNP declines with response codes 05, 59 and 63, Jan 2025 to Sep 2026 · 310M declines',
      primaryMetric: 'Genuine declines recovered at a fixed 2 bps fraud cost',
      secondaryMetrics: ['AUC-ROC', 'Approval rate uplift'],
      timeSplit: { train: 'Jan 2025 to Mar 2026', validate: 'Apr to Jun 2026', outOfTime: 'Jul to Sep 2026' },
    },
    constraints: { ...base, tables: ['vn_authorization', 'vn_authentication', 'vn_fraud'], excludedColumns: ['iss_country'], maxExperiments: 50 },
    model: { baseline: 31.0, ceiling: 48.0, seedRuns: 0, metricName: 'Genuine declines recovered', unit: '%' },
    hyps: [
      {
        title: 'Travelling cardholders trigger country-mismatch declines', status: 'proposed', lift: 5, tables: ['vn_authorization'],
        rationale: 'Cardholders who recently transacted in-person abroad are genuine when they shop online in that country.',
        evidence: '**61%** of declined cross-border CNP auths follow a card-present auth in the same country within 14 days; their fraud rate is **0.03%**.',
        subs: [
          { title: 'Recent card-present use in the merchant’s country', signal: 'Days since card-present auth in the acquirer country', status: 'proposed', features: [
            { name: 'days_since_cp_auth_in_acq_country', desc: 'Days since the card’s last card-present auth in the acquirer’s country', entity: 'card', window: '90d', dtype: 'int', tables: ['vn_authorization'], status: 'spec' },
            { name: 'cp_auth_cnt_in_acq_country_14d', desc: 'Card-present auths in the acquirer’s country in 14 days', entity: 'card', window: '14d', dtype: 'int', tables: ['vn_authorization'], status: 'spec' },
          ] },
          { title: 'Travel corridors are stable per cardholder', signal: 'Repeat visits to the same country pair', status: 'proposed', features: [
            { name: 'country_pair_visits_card_365d', desc: 'Prior months with spend in the same acquirer country in 365 days', entity: 'card', window: '365d', dtype: 'int', tables: ['vn_authorization'], status: 'spec' },
          ] },
        ],
      },
      {
        title: 'Strong 3DS authentication marks genuine cross-border buyers', status: 'proposed', lift: 4, tables: ['vn_authentication'],
        rationale: 'Declines after a successful challenge are almost never fraud.',
        evidence: 'Declines that followed a **passed 3DS challenge** had a fraud rate of **0.01%** across 22M cases.',
        subs: [
          { title: 'Challenge passed on this transaction', signal: 'challenge_outcome = pass for the declined txn', status: 'proposed', features: [
            { name: 'threeds_challenge_passed_flag', desc: '3DS challenge passed on the declined transaction', entity: 'transaction', window: 'txn', dtype: 'bool', tables: ['vn_authentication'], status: 'spec' },
            { name: 'threeds_pass_rate_card_30d', desc: 'Share of the card’s challenges passed in 30 days', entity: 'card', window: '30d', dtype: 'float', tables: ['vn_authentication'], status: 'spec' },
          ] },
        ],
      },
      {
        title: 'Merchant cross-border history reduces risk', status: 'proposed', lift: 3, tables: ['vn_authorization', 'vn_fraud'],
        rationale: 'Merchants that serve many foreign cards with low fraud are safe destinations.',
        evidence: 'Merchants with **>30% foreign card share and <5 bps fraud** account for **38%** of false declines.',
        subs: [
          { title: 'Merchant serves many foreign cards safely', signal: 'Foreign card share and fraud bps at the merchant', status: 'proposed', features: [
            { name: 'foreign_card_share_merchant_30d', desc: 'Share of the merchant’s auths from foreign-issued cards in 30 days', entity: 'merchant', window: '30d', dtype: 'float', tables: ['vn_authorization'], status: 'spec' },
            { name: 'fraud_bps_merchant_90d', desc: 'Fraud basis points at the merchant over 90 days, 2-day lag', entity: 'merchant', window: '90d', dtype: 'float', tables: ['vn_fraud', 'vn_authorization'], status: 'spec' },
          ] },
        ],
      },
      {
        title: 'Retries with the same amount within minutes are genuine', status: 'proposed', lift: 3, tables: ['vn_authorization'],
        rationale: 'Real customers retry the exact purchase quickly; fraudsters vary amounts or move on.',
        evidence: 'Same-amount retries within **10 minutes** show a **0.04%** fraud rate.',
        subs: [
          { title: 'Same amount retried quickly', signal: 'Prior declined auth with the same amount at the merchant', status: 'proposed', features: [
            { name: 'same_amt_retry_cnt_card_merchant_1h', desc: 'Prior auths for the same amount at the merchant in the last hour', entity: 'card_merchant', window: '1h', dtype: 'int', tables: ['vn_authorization'], status: 'spec' },
          ] },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------- */
  {
    id: 'friendly-fraud',
    name: 'Friendly fraud dispute prediction',
    problemType: 'friendly_fraud',
    owner: 'Priya Raman',
    createdDaysAgo: 19,
    statement:
      'A growing share of fraud and not-received chargebacks are first-party misuse: the cardholder made the purchase and disputes it anyway. Predict at dispute time how likely a dispute is friendly fraud, so issuers can route it to representment review instead of automatic write-off.',
    spec: {
      objective: 'Score each new dispute for the likelihood it is first-party misuse',
      label: 'Dispute lost by the cardholder at pre-arbitration or arbitration, or withdrawn after compelling evidence',
      unitOfScoring: 'One dispute at first chargeback',
      population: 'CNP disputes with reason codes 10.4, 13.1 and 13.3, Jan 2025 to Sep 2026 · 18.4M disputes',
      primaryMetric: 'Precision at 20% review rate',
      secondaryMetrics: ['AUC-ROC', 'p99 scoring latency'],
      timeSplit: { train: 'Jan 2025 to Feb 2026', validate: 'Mar to May 2026', outOfTime: 'Jun to Sep 2026' },
    },
    constraints: { ...base, tables: ['vn_disputes', 'vn_authorization', 'vn_authentication', 'vn_clearing_settlement'], excludedColumns: [], maxLatencyMs: 200, maxExperiments: 40 },
    model: { baseline: 41.5, ceiling: 63.0, seedRuns: 38, metricName: 'Precision @ 20% review', unit: '%' },
    hyps: [
      {
        title: 'Cardholders who used the merchant before rarely face real fraud there', status: 'accepted', lift: 5, tables: ['vn_authorization', 'vn_disputes'],
        rationale: 'A dispute at a merchant with a long, undisputed purchase history from the same card points to misuse.',
        evidence: 'Disputes where the card had **5+ undisputed purchases** at the merchant lose at arbitration **4.6×** more often.',
        subs: [
          { title: 'Purchase history with the merchant', signal: 'Undisputed approved purchases at the merchant before the dispute', features: [
            { name: 'prior_undisputed_txn_cnt_card_merchant_365d', desc: 'Approved, undisputed purchases by the card at the merchant in 365 days', entity: 'card_merchant', window: '365d', dtype: 'int', tables: ['vn_authorization', 'vn_disputes'], stats: [0.52, 99.1, 0.02] },
            { name: 'days_since_first_txn_card_merchant', desc: 'Days since the card first bought from the merchant', entity: 'card_merchant', window: '—', dtype: 'int', tables: ['vn_authorization'], stats: [0.31, 99.1, 0.01] },
          ] },
          { title: 'Repeat purchase after the disputed one', signal: 'Card buys again at the merchant after the disputed transaction', features: [
            { name: 'post_txn_repeat_purchase_flag_7d', desc: 'Card bought again at the merchant within 7 days after the disputed purchase', entity: 'card_merchant', window: '7d', dtype: 'bool', tables: ['vn_authorization'], stats: [0.44, 99.1, 0.03] },
          ] },
        ],
      },
      {
        title: 'Strong authentication makes a fraud claim implausible', status: 'accepted', lift: 4, tables: ['vn_authentication'],
        rationale: 'A passed 3DS challenge on the disputed transaction contradicts an unauthorised-use claim.',
        evidence: 'Reason 10.4 disputes on **challenged and passed** transactions are lost by cardholders **71%** of the time.',
        subs: [
          { title: 'Disputed transaction was strongly authenticated', signal: 'Challenge passed or app-based authentication', features: [
            { name: 'threeds_challenge_passed_flag', desc: '3DS challenge passed on the disputed transaction', entity: 'transaction', window: 'txn', dtype: 'bool', tables: ['vn_authentication'], stats: [0.29, 92.3, 0.02] },
            { name: 'device_channel_app_flag', desc: 'Authentication ran in the issuer app', entity: 'transaction', window: 'txn', dtype: 'bool', tables: ['vn_authentication'], stats: [0.14, 92.3, 0.04] },
          ] },
        ],
      },
      {
        title: 'Serial disputers dispute again', status: 'accepted', lift: 4, tables: ['vn_disputes'],
        rationale: 'Cardholders with several recent disputes, especially ones they lost, are more likely to misuse the process.',
        evidence: 'Cards with **3+ disputes in 180 days** account for **27%** of friendly fraud and **3%** of disputes overall.',
        subs: [
          { title: 'Dispute frequency on the card', signal: 'Disputes opened on the card recently', features: [
            { name: 'dispute_cnt_card_180d', desc: 'Disputes opened on the card in 180 days', entity: 'card', window: '180d', dtype: 'int', tables: ['vn_disputes'], stats: [0.47, 100, 0.03] },
            { name: 'lost_dispute_share_card_365d', desc: 'Share of the card’s resolved disputes the cardholder lost in 365 days', entity: 'card', window: '365d', dtype: 'float', tables: ['vn_disputes'], stats: [0.39, 64.2, 0.05, 'fixed', 'Excluded disputes still open at the scoring date to avoid using future outcomes.'] },
          ] },
        ],
      },
      {
        title: 'Digital goods with immediate delivery attract misuse', status: 'accepted', lift: 3, tables: ['vn_authorization'],
        rationale: 'Instant-delivery goods (gaming, streaming) are easy to consume and then dispute.',
        evidence: 'MCCs **5816, 5818 and 4899** have **2.9×** the friendly fraud share of physical goods.',
        subs: [
          { title: 'Merchant category of the disputed purchase', signal: 'Digital-goods MCC', features: [
            { name: 'digital_goods_mcc_flag', desc: 'Disputed transaction is in a digital-goods MCC', entity: 'transaction', window: 'txn', dtype: 'bool', tables: ['vn_authorization'], stats: [0.19, 100, 0.01] },
          ] },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------- */
  {
    id: 'merchant-compromise',
    name: 'Merchant compromise detection',
    problemType: 'merchant_risk',
    owner: 'Priya Raman',
    createdDaysAgo: 3,
    statement:
      'Find merchants that are likely common points of purchase for compromised cards days before the fraud wave hits, so Visa can alert acquirers and issuers can reissue at-risk cards early.',
    spec: {
      objective: 'Score each merchant daily for the likelihood it is a compromise point',
      label: 'Merchant confirmed as a common point of purchase in a network investigation within 60 days',
      unitOfScoring: 'One merchant-day',
      population: 'Merchants with 500+ CNP auths per month, Jan 2025 to Sep 2026 · 4.2M merchants',
      primaryMetric: 'Recall at top 1,000 merchants per day',
      secondaryMetrics: ['Median days of early warning', 'AUC-PR'],
      timeSplit: { train: 'Jan 2025 to Mar 2026', validate: 'Apr to Jun 2026', outOfTime: 'Jul to Sep 2026' },
    },
    constraints: { ...base, tables: ['vn_authorization', 'vn_fraud', 'vn_merchant_profile', 'vn_clearing_settlement'], excludedColumns: [], featureWindows: ['7d', '30d', '90d'], maxLatencyMs: 1000, deployTarget: 'dev' },
    model: { baseline: 38.0, ceiling: 61.0, seedRuns: 0, metricName: 'Recall @ top 1,000', unit: '%' },
    hyps: [
      {
        title: 'Cards later reporting fraud share a recent merchant', status: 'accepted', lift: 5, tables: ['vn_fraud', 'vn_authorization'],
        rationale: 'A compromise point appears in the purchase history of many cards that later report fraud elsewhere.',
        evidence: 'Confirmed compromise points appear in the 30-day history of **12×** more later-fraud cards than peer merchants.',
        subs: [
          { title: 'Share of the merchant’s cards that later report fraud', signal: 'Downstream fraud rate of cards that shopped at the merchant', features: [
            { name: 'downstream_fraud_rate_merchant_30d', desc: 'Share of cards used at the merchant that reported fraud elsewhere within 30 days', entity: 'merchant', window: '30d', dtype: 'float', tables: ['vn_fraud', 'vn_authorization'], status: 'building' },
            { name: 'downstream_fraud_lift_vs_mcc_30d', desc: 'Downstream fraud rate divided by the MCC peer median', entity: 'merchant', window: '30d', dtype: 'float', tables: ['vn_fraud', 'vn_authorization'], status: 'building' },
          ] },
          { title: 'Fraud appears soon after the visit', signal: 'Days between the visit and the first fraud', features: [
            { name: 'median_days_to_fraud_merchant_90d', desc: 'Median days from the card’s visit to its first fraud report', entity: 'merchant', window: '90d', dtype: 'float', tables: ['vn_fraud', 'vn_authorization'], status: 'queued' },
          ] },
        ],
      },
      {
        title: 'Card testing appears at the compromise point first', status: 'accepted', lift: 4, tables: ['vn_authorization'],
        rationale: 'Attackers test harvested cards, often at the same small merchants.',
        evidence: 'Spikes in sub-$1 auths precede confirmed compromises by a median of **9 days**.',
        subs: [
          { title: 'Small-amount spikes at the merchant', signal: 'Sub-$1 auth count versus the merchant’s baseline', features: [
            { name: 'micro_auth_spike_ratio_merchant_7d', desc: 'Sub-$1 auths in 7 days divided by the 90-day weekly average', entity: 'merchant', window: '7d vs 90d', dtype: 'float', tables: ['vn_authorization'], status: 'queued' },
          ] },
        ],
      },
      {
        title: 'Recently changed acquirers or MCCs signal risk', status: 'accepted', lift: 2, tables: ['vn_merchant_profile'],
        rationale: 'Merchants that move acquirer or change category may be evading monitoring.',
        evidence: 'Weak signal (**1.8×**) but cheap to compute.',
        subs: [
          { title: 'Acquirer change in the last 90 days', signal: 'Acquirer BIN differs from 90 days ago', features: [
            { name: 'acquirer_change_flag_90d', desc: 'Merchant changed acquirer BIN in the last 90 days', entity: 'merchant', window: '90d', dtype: 'bool', tables: ['vn_merchant_profile'], status: 'spec' },
          ] },
        ],
      },
    ],
  },
  /* ------------------------------------------------------------- */
  {
    id: 'token-abuse',
    name: 'Token provisioning abuse',
    problemType: 'fraud',
    owner: 'Priya Raman',
    createdDaysAgo: 0,
    statement:
      'Fraudsters provision stolen cards into mobile wallets and spend before the issuer notices. Score each token provisioning request for abuse risk.',
    spec: {
      objective: 'Score each token provisioning request for abuse',
      label: 'Fraud reported on the token within 30 days of provisioning',
      unitOfScoring: 'One provisioning request',
      population: 'To be confirmed',
      primaryMetric: 'Recall at 1% review rate',
      secondaryMetrics: ['AUC-PR'],
      timeSplit: { train: 'Jan 2025 to Mar 2026', validate: 'Apr to Jun 2026', outOfTime: 'Jul to Sep 2026' },
    },
    constraints: { ...base, tables: ['vn_authorization', 'vn_fraud'], excludedColumns: [] },
    model: { baseline: 30, ceiling: 50, seedRuns: 0, metricName: 'Recall @ 1% review', unit: '%' },
    hyps: [],
  },
];

/* ------------------------------------------------------------------ */
/* Expansion into API shapes                                           */
/* ------------------------------------------------------------------ */

export function defaultLogic(f: FeatDef): string {
  const t = f.tables[0];
  const key = f.entity === 'merchant' ? 'merchant_id' : f.entity === 'card_merchant' ? 'pan_token, merchant_id' : f.entity === 'transaction' ? 'txn_id' : 'pan_token';
  const win = /^\d+[hd]$/.test(f.window) ? f.window.replace('h', ' HOURS').replace('d', ' DAYS') : '30 DAYS';
  return `-- ${f.name}
-- ${f.desc}
-- entity: ${f.entity} · window: ${f.window} · point-in-time correct
SELECT
  t.txn_id,
  ${f.dtype === 'bool' ? 'CAST(' : ''}AGG_EXPR(t)${f.dtype === 'bool' ? ' > 0 AS INT)' : ''}
    OVER (
      PARTITION BY ${key.split(', ').map((k) => `t.${k}`).join(', ')}
      ORDER BY t.auth_ts
      RANGE BETWEEN INTERVAL ${win} PRECEDING AND INTERVAL 1 SECOND PRECEDING
    ) AS ${f.name}
FROM ${t} t
WHERE t.auth_ts BETWEEN :window_start AND :window_end`;
}

export function expandHypotheses(seed: ProjectSeed) {
  const hypotheses: Hypothesis[] = [];
  const subs: SubHypothesis[] = [];
  const features: Feature[] = [];
  seed.hyps.forEach((h, hi) => {
    const hid = `H${hi + 1}`;
    hypotheses.push({ id: hid, title: h.title, rationale: h.rationale, evidence: h.evidence, tables: h.tables, expectedLift: h.lift, status: h.status, reviewedBy: h.status === 'proposed' ? undefined : seed.owner });
    h.subs.forEach((s, si) => {
      const sid = `${hid}.${si + 1}`;
      subs.push({ id: sid, hypothesisId: hid, title: s.title, signal: s.signal, status: s.status ?? (h.status === 'accepted' ? 'accepted' : 'proposed') });
      (s.features ?? []).forEach((f) => {
        const st: FeatureBuildStatus = f.status ?? 'ready';
        const realLogic = f.logic ?? defaultLogic(f).replace('AGG_EXPR(t)', aggFor(f));
        features.push({
          id: `${seed.id}:${f.name}`,
          name: f.name,
          hypothesisId: hid,
          subHypothesisId: sid,
          description: f.desc,
          entity: f.entity,
          window: f.window,
          dtype: f.dtype ?? 'float',
          tables: f.tables,
          logic: realLogic,
          buildStatus: st,
          excludedReason: f.excluded,
          vfpJobId: st === 'spec' ? undefined : `vfp-${seed.id.slice(0, 3)}-${1000 + features.length}`,
          stats: f.stats ? { informationValue: f.stats[0], coveragePct: f.stats[1], psi: f.stats[2], leakage: f.stats[3] ?? 'pass', leakageNote: f.stats[4] } : undefined,
        });
      });
    });
  });
  return { hypotheses, subs, features };
}

function aggFor(f: FeatDef): string {
  const n = f.name;
  if (n.includes('_cnt_')) return `COUNT_IF(${n.includes('small') ? 't.amount_usd < 2 AND ' : ''}t.pos_entry_mode = '81')`;
  if (n.startsWith('distinct_')) return 'APPROX_COUNT_DISTINCT(t.merchant_id)';
  if (n.includes('rate') || n.includes('share')) return 'AVG(CASE WHEN t.flag THEN 1.0 ELSE 0.0 END)';
  if (n.includes('flag')) return 'COUNT_IF(t.flag)';
  if (n.includes('days')) return 'DATEDIFF(t.auth_ts, MIN(t.auth_ts))';
  return 'AVG(t.value)';
}
