import type { AgentInfo, CatalogTable } from '../types';

export const AGENTS: AgentInfo[] = [
  { id: 'orchestrator', name: 'Orchestrator', loop: 'mission', role: 'Turns the problem statement into a spec, plans the three loops and hands work between them.', skills: ['/mltc', 'plan-project', 'draft-spec'], produces: ['project/problem_statement.md', 'project/spec.yaml', 'project/constraints.yaml'] },
  { id: 'hypothesis', name: 'Hypothesis agent', loop: 'features', role: 'Proposes testable hypotheses about the problem, each with evidence sampled from VisaNet data.', skills: ['hypothesis-gen', 'evidence-sampler'], produces: ['features/hypothesis.md'] },
  { id: 'sub_hypothesis', name: 'Sub-hypothesis agent', loop: 'features', role: 'Breaks each accepted hypothesis into narrow, measurable sub-hypotheses.', skills: ['sub-hypothesis-gen'], produces: ['features/sub_hypothesis.md'] },
  { id: 'feature_engineer', name: 'Feature engineer', loop: 'features', role: 'Designs features for each sub-hypothesis and writes their logic within your constraints.', skills: ['feature-spec', 'pyspark-codegen'], produces: ['features/feature_catalog.md', 'features/feature_logic.sql'] },
  { id: 'vfp_builder', name: 'VFP builder', loop: 'features', role: 'Submits feature jobs to VFP, backfills the data window and registers the results.', skills: ['VFP.submit_job', 'VFP.backfill', 'VFP.register'], produces: ['features/vfp_build_spec.yaml'] },
  { id: 'validator', name: 'Validator', loop: 'features', role: 'Checks each feature for leakage, coverage, information value and drift before modelling.', skills: ['leakage-check', 'iv-psi', 'coverage'], produces: ['features/validation_report.md'] },
  { id: 'researcher', name: 'Researcher', loop: 'models', role: 'Runs the auto-research loop: forms a hypothesis for each experiment, reads the result, decides what to try next, and selects the best model.', skills: ['plan-experiment', 'analyze-run', 'select-model'], produces: ['models/experiment_log.md', 'models/model_selection.md'] },
  { id: 'trainer', name: 'Trainer', loop: 'models', role: 'Trains each experiment on the GPU pool and reports metrics.', skills: ['train.gpu_job', 'evaluate'], produces: ['models/leaderboard.csv', 'models/model_card.md'] },
  { id: 'deployer', name: 'Deployer', loop: 'deploy', role: 'Packages the selected model, runs readiness checks, deploys to the lower environment and exposes the inference API.', skills: ['package-model', 'readiness-checks', 'deploy.lower_env'], produces: ['deploy/deployment.yaml', 'deploy/readiness_report.md', 'deploy/inference_api.md'] },
];

export const CATALOG: CatalogTable[] = [
  {
    name: 'vn_authorization', description: 'Authorization messages: approvals and declines', rows: '4.7B', freshness: '5 min', joinKeys: ['txn_id', 'pan_token', 'merchant_id'],
    columns: [
      { name: 'txn_id', type: 'string', description: 'Transaction identifier' },
      { name: 'pan_token', type: 'string', description: 'Tokenized PAN' },
      { name: 'auth_ts', type: 'timestamp', description: 'Authorization time (UTC)' },
      { name: 'amount_usd', type: 'decimal', description: 'Amount in USD' },
      { name: 'merchant_id', type: 'string', description: 'Card acceptor ID' },
      { name: 'mcc', type: 'string', description: 'Merchant category code' },
      { name: 'pos_entry_mode', type: 'string', description: '81 = e-commerce, 05 = chip …' },
      { name: 'response_code', type: 'string', description: '00 approve, 05 do not honor, 51 insufficient funds …' },
      { name: 'acq_country', type: 'string', description: 'Acquirer country' },
      { name: 'iss_country', type: 'string', description: 'Issuer country' },
      { name: 'vaa_score', type: 'int', description: 'Network risk score at authorization' },
    ],
  },
  {
    name: 'vn_authentication', description: '3DS authentication requests and results', rows: '1.9B', freshness: '15 min', joinKeys: ['txn_id', 'pan_token'],
    columns: [
      { name: 'txn_id', type: 'string', description: 'Transaction identifier' },
      { name: 'pan_token', type: 'string', description: 'Tokenized PAN' },
      { name: 'auth_ts', type: 'timestamp', description: 'Authentication time' },
      { name: 'three_ds_version', type: 'string', description: '2.1, 2.2, 2.3' },
      { name: 'eci', type: 'string', description: 'Electronic commerce indicator' },
      { name: 'ares_status', type: 'string', description: 'Y, N, A, C, R, U' },
      { name: 'challenge_outcome', type: 'string', description: 'pass, fail, abandoned' },
      { name: 'device_channel', type: 'string', description: 'app or browser' },
    ],
  },
  {
    name: 'vn_clearing_settlement', description: 'Clearing records and settlement positions', rows: '4.3B', freshness: 'Daily', joinKeys: ['txn_id', 'merchant_id'],
    columns: [
      { name: 'txn_id', type: 'string', description: 'Transaction identifier' },
      { name: 'clearing_ts', type: 'timestamp', description: 'Clearing time' },
      { name: 'settle_date', type: 'date', description: 'Settlement date' },
      { name: 'amount_usd', type: 'decimal', description: 'Cleared amount' },
      { name: 'merchant_id', type: 'string', description: 'Card acceptor ID' },
      { name: 'acquirer_bin', type: 'string', description: 'Acquirer BIN' },
      { name: 'reversal_flag', type: 'bool', description: 'Reversed after clearing' },
    ],
  },
  {
    name: 'vn_fraud', description: 'Issuer-reported fraud (TC40) and classifications', rows: '38M', freshness: 'Daily', joinKeys: ['txn_id', 'pan_token'],
    columns: [
      { name: 'txn_id', type: 'string', description: 'Transaction identifier' },
      { name: 'pan_token', type: 'string', description: 'Tokenized PAN' },
      { name: 'fraud_type', type: 'string', description: 'Lost, stolen, CNP, counterfeit, ATO …' },
      { name: 'report_date', type: 'date', description: 'Date reported' },
      { name: 'fraud_amount_usd', type: 'decimal', description: 'Amount' },
    ],
  },
  {
    name: 'vn_disputes', description: 'Chargebacks and dispute lifecycle', rows: '61M', freshness: 'Daily', joinKeys: ['txn_id', 'pan_token', 'merchant_id'],
    columns: [
      { name: 'txn_id', type: 'string', description: 'Transaction identifier' },
      { name: 'dispute_ts', type: 'timestamp', description: 'Dispute opened' },
      { name: 'reason_code', type: 'string', description: '10.4 fraud CNP, 13.1 not received, 13.3 not as described …' },
      { name: 'dispute_stage', type: 'string', description: 'first_chargeback, pre_arb, arbitration' },
      { name: 'outcome', type: 'string', description: 'issuer_won, merchant_won, withdrawn' },
    ],
  },
  {
    name: 'vn_merchant_profile', description: 'Merchant reference data and onboarding', rows: '92M', freshness: 'Daily', joinKeys: ['merchant_id'],
    columns: [
      { name: 'merchant_id', type: 'string', description: 'Card acceptor ID' },
      { name: 'first_seen_date', type: 'date', description: 'First authorization on network' },
      { name: 'mcc', type: 'string', description: 'Primary MCC' },
      { name: 'country', type: 'string', description: 'Merchant country' },
      { name: 'acquirer_bin', type: 'string', description: 'Acquirer BIN' },
    ],
  },
];
