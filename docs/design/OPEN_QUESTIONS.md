# ML Studio design: open questions

These questions came up while writing the end-to-end, cloud-agnostic design for ML Studio
(HLD plus LLD for the key components). The team answered them on 24 Nov 2026. The answers
below are transcribed from photos of that review.

## Original questions and working assumptions

| # | Topic | Question | Working assumption until answered |
|---|---|---|---|
| 1 | Data platform | Where does the VisaNet data the agents read actually live (Hive/Spark on Hadoop, Databricks, Snowflake, something else)? Is VFP the in-house feature platform, and does it have an API for submitting jobs, backfilling and registering features? | Data stays in the existing platform and is read via Spark/SQL. VFP has job submit, backfill and register APIs. |
| 2 | Auto feature generation today | Is it template based (entity x window x aggregation grids)? How is a feature defined and built today? | A deterministic template grammar over entities, windows, measures, aggregations and filters. |
| 3 | Training today | Which frameworks (XGBoost, LightGBM, PyTorch)? How are GPU jobs scheduled (Kubernetes, Slurm, YARN)? Is MLflow or another experiment tracker in use? | Tabular frameworks plus some PyTorch on a shared GPU pool; MLflow for tracking and registry. |
| 4 | Deployment today | Is there an existing model serving platform? Is the target real-time authorization scoring, and if so, what latency budget? | ML Studio deploys to dev/UAT only (KServe); production goes through the existing governance process. |
| 5 | LLM | Which providers are allowed (Anthropic API, Bedrock, Vertex, Azure, self-hosted)? Can sampled rows, even tokenized, be sent to the model, or only schemas and aggregates? | Hosted model through an enterprise LLM gateway with zero data retention; agents see schemas, aggregates and small tokenized samples only. |
| 6 | Compliance | Does PCI DSS scope apply? Any data residency rules? What model risk sign-off is needed before UAT or production? | PCI DSS applies to anything touching transaction data; decision records retained 7 years. |
| 7 | Scale | Roughly how many scientists and concurrent projects in year one? | About 50 scientists, 20 to 40 concurrent projects, a few hundred experiments a week. |
| 8 | Existing tooling | Which SSO and which logging/monitoring stack (Splunk, Datadog, Prometheus/Grafana, ELK)? Is hybrid an option, with data staying on-prem? | OIDC/SAML-compatible SSO; OpenTelemetry exported to whatever backend exists. |

## Answers (24 Nov 2026)

### 1. Data platform: data half holds, VFP API half is wrong

- Data lives on on-prem Hadoop (VDP 3.3.6). Hive tables are read by Spark on YARN with queue `ds`
  and `catalogImplementation=hive`. Jobs run with 100 to 1,000 executors.
- Core tables: `aucdl.tcaef_auth_dtl_full` (auth), `cscdl` (clearing), `opfrd.frd_tran_main_dedup`
  (fraud), `optd` (provisioning), `vctas` (3DS), `opcode.tedc_*` (reference).
- Trino is reachable through the MCP Hub, but any GROUP BY or count(*) on a fact table hits the
  300 s timeout, so Trino is usable for metadata only.
- Migration: VisaNet data is moving to the DPaaS AWS lake (Iceberg, Glue, Lake Formation), 40 to
  45 PB between May and Sep 2026. Whether that is finished is still an assumption. Lake Formation
  fine-grained access control can't share a Spark session with Unity Catalog.
- VFP is the Visa Feature Platform. Its window-aggregation engine is SWAT. The batch path is
  Hive, then SWAT on Spark/YARN, then Parquet. The real-time path is Kafka, then the SWAT Redis
  module. One YAML drives both paths.
- **VFP has no job API.** It is driven by a CLI plus Jenkins: `vfp submit --dry-run` and
  `vfp submit` for experiments. Promotion goes through the Jenkins job `vfp-new-lt-pipeline`,
  then Tuber, then an Airflow DAG. Entity registration is a manual platform step. No backfill API
  was found.

**Revised assumption:** read through Spark on YARN (Kerberos) and use Trino only for schema and
metadata. Put the catalog behind an adapter so DPaaS Iceberg can be added later. ML Studio wraps
the `vfp` CLI in a job runner that uses a keytab and the AD groups `caehadoop_VFP` and
`epiprod_vfp_ro`. Promotion and registration are handoffs to people.

**Still open (VFP team):** is a REST or gRPC API on the roadmap? Who approves entity registration?

### 2. Auto feature generation today: mostly right, but the system has two layers

- The grammar is real. 309 production `rtp_*` features follow
  `prefix_source_entity_agg_window_key_measure_rollup`, for example
  `rtp_vnet_beneacct_c_dy30_pan_hriskmrcht_mean`.
  - Windows: mn1/5/30, hr1/2/6/12, dy1/2/7/30/60/90/180.
  - Aggregations: c, s, std, min, delta_dy30_dy180.
  - They are produced upstream (`fe_visadirect_global_optimized_v2`), most likely from SWAT YAML.
    The generator code isn't in either repo.
- The toolchain is hypothesis-first, then grammar:
  1. LLM agents build a hypothesis tree, then a catalog.
  2. A deterministic grammar enforces coverage: 15 taxonomy patterns x inventory axes, stats
     {count, sum, mean, median, std}, and gates G1 to G5.
  3. A deterministic SQL renderer turns the spec into Spark SQL.
  4. A SWAT YAML packager handles the last step.
- Version gap: the in-house SWAT jar is v3.3.7, and the target version is 5.8.1.
- Leakage control: PRE90d/30d/7d/1d windows are used, and POST* windows are training-only.

**Revised assumption:** the LLM proposes, and a deterministic grammar that is a subset of SWAT
YAML is the contract. Every generated feature must render to both Spark SQL and SWAT YAML.

**Still open (feature-engineering owners):** who owns the `rtp_*` generator? Which SWAT version
is in production?

### 3. Training today: frameworks right, GPU pool half right, MLflow wrong

- Frameworks: PyTorch 2.0 or later with transformers, XGBoost, and LightGBM 4.5.0.
- GPU jobs run on **MLP Kubernetes**, not Slurm or YARN. They are submitted with `ml create`
  using Pharos auth in the namespace `rais-aiml`.
  - A100 sizes: g3.medium is a 20 GB MIG slice, g3.large is 40 GB, and g3.xlarge is a full 80 GB card.
  - Jobs have a 24 h TTL.
  - Everything is single-GPU, with no DDP.
- Data prep runs on Spark/YARN. Training data is copied to POSIX mounts.
- Tracking: some projects use JSON sidecar files plus `experiments.tsv`, and some use a local
  file-based MLflow store. The toolchain design says "if MLflow is not approved…". An MLP
  cloud pilot runs on SageMaker with MLflow.

**Revised assumption:** training goes through an MLP adapter that wraps `ml create`, with
GPU-hour budgets per project. The tracker sits behind an interface: start with file-based
tracking or MLflow, then switch to whatever MLP standardises on.

**Still open (MLP team):** is there a managed MLflow on-prem? What are the GPU quotas per
namespace? Is multi-GPU training allowed?

### 4. Deployment today: dev/UAT scope holds, but KServe is only a proposal

- **No serving platform was found.** What exists:
  - Standalone handoff packages (`engineering_handoff/encoder_context_50_prod`) that do CPU batch scoring.
  - A per-project FastAPI service in agentic-commerce.
  - KServe only appears as a "recommended… benchmark" (toolchain design §28.6).
- **The target is real-time pre-authorization scoring.**
  - `FRIENDLY_FRAUD_KB.md:18-19`: "scored in real time before authorization".
  - The visa_direct_transformer use-case catalog lists "inline auth, sub-100 ms" as a mode.
  - The UI mock defaults to a 50 ms p99 budget.
- **The real-time feature path exists in VFP.** Short-term features come from Redbadger (Redis),
  and transforms run as UDFs in `aias-serve`.
- Scope: v2 gives serving to AI Studio/MLP.

**Revised assumption:** ML Studio stops at a validated, packaged model plus a dev/UAT endpoint
with a p99 check. Production goes through AI Studio/MLP and governance, with online features
served by VFP short-term features.

**Still open:** what is the production auth scoring platform called? What is the real latency
budget? The 50 ms and 100 ms figures come from mocks and docs, not from an SLA.

### 5. LLM: the gateway part holds, but the data policies conflict between the two designs

- **Current gateway:** Anthropic models through the Visa GenAI gateway.
  - Toolchain: `genai_base_url = https://genai-api-v2-global-qa.trusted.visa.com`
    (`app/backend/src/mltc/config.py:76-90`).
  - Models: `claude-sonnet-5-5`, `claude-haiku-4-5`, `claude-opus-4-5`.
  - Auth is a CorpDev service-account login or a token.
  - visa_direct_transformer AutoResearch uses `ANTHROPIC_BASE_URL` via `ml setup-claude`.
  - OpenAI models are also used, through `genai-api.visa.com/v1` (scam-detect-agent, PI-genai-eda).
- **AWS path (v2):** Bedrock over PrivateLink, with ZDR, CMK and Guardrails (SA SLE-SA-190033). It
  warns that Fable 5 needs a provider data-sharing opt-in, so avoid it.
- **The data policies conflict:**
  - The toolchain gives agents 10 to 20 row sample CSVs with tokenized PANs
    (`knowledge/sample_data/core/*.sample.csv`).
  - v2 says "models never see rows": code runs on a masked sample, and the LLM only sees results.
- ZDR on the internal gateway is unverified.

**Revised assumption:** the Visa GenAI gateway is the only egress, and Bedrock sits behind it for
the AWS path. By default the LLM sees schemas and aggregates only. Tokenized samples need explicit
approval.

**Still open (GenAI Hub):** does the gateway have ZDR or a retention policy? Is prompt logging on?
Are tokenized samples allowed?

### 6. Compliance: PCI DSS applies, and the model-risk process is a complete gap

- **PCI scope is real:**
  - Raw PANs are read directly (`pymt_crd_acct_num_raw`,
    `visa_direct_transformer/data_sampling_all/eda_2/INITIAL_PULL_README.md:44`).
  - `mrch_nm_raw` holds real customer names.
  - Pulling aggregates into AWS makes the account PCI-connected (critique A4 #22).
- **Residency:** v2 confines Bedrock use to us-east-1.
- **Retention (v2 §8.8):** tool-call audit 7 years; transcripts 1 year under Object Lock; problem
  and spec history for the life of the problem plus 2 years. The toolchain marks retention as
  [DECISION NEEDED].
- **No model-risk sign-off process is described anywhere.**
- **Security findings to fix:**
  - Unsalted `F.sha1` on PANs (`data_sampling/07_explode_anchor_windows.py:101`). An unsalted
    hash of a card number can be reversed by brute force; use a keyed HMAC or SDS tokenization.
  - The AutoResearch agent runs with `--permission-mode bypassPermissions` (`AutoResearch/agent.py:740`).
  - Gateway tokens are passed as `--env` in the pod spec (`submit_batch.sh:222-224`). Use secrets instead.
  - Merchant names are pasted into source code (`02_1_check_id_reference_tables.py:270`).

**Still open:** who owns model risk management, and what evidence pack does it need before UAT?
Is DPaaS data allowed in AWS?

### 7. Scale: no evidence on headcount, but the working assumption agrees with v2's critique

- People: v2's critique assumes 50 users and 20 concurrent stage pods. Toolchain v1 is single-user.
  The visa_direct_transformer project had 5 contributors.
- Quotas in the toolchain: at most 3 runs per scientist, at most 5 attempts per stage, and a $5
  cap per stage.
- LLM cost per stage: pc-01 costs a median $0.31 and 3.2 min on Sonnet, and about $1.4 and 7 min on Opus.
- Rough LLM cost at the assumed scale: about 300 experiments a week x about 10 stages comes to
  roughly $900 to $4,200 a week. The stage count is a guess.
- Data: 5.91B Visa Direct OCT transactions over 9 months; 1.14B authorizations a day worldwide;
  sequence length p99 452, max 72,822.

**Revised assumption:** keep 50 scientists and 20 to 40 projects. Size the Spark side for 100 to
1,000 executors per job, and the GPU side for MIG slices.

**Still open:** what are the confirmed year-one onboarding numbers?

### 8. Existing tooling: hybrid isn't optional, because it's how things already work. SSO is undecided

- **SSO:** nothing is implemented ("Visa SSO later", toolchain D-013).
  - The toolchain design names Entra/ForgeRock for OIDC.
  - v2 uses Cognito with AD-group roles; IAM Identity Center is not yet approved.
  - The platforms underneath use other identity systems: Kerberos for Hadoop, Pharos for MLP.
- **Logs and monitoring:**
  - Toolchain: structlog JSON.
  - PI-genai-eda: a Splunk log formatter (`dda/logger.py:98`).
  - merchant-insights: OTLP exporters.
  - v2: CloudWatch, Managed Prometheus and Managed Grafana.

**Design response:** OIDC behind an adapter, so whichever provider is approved plugs in. Use
OpenTelemetry everywhere, with Collector exporters to Splunk and to the AWS-managed backends.
