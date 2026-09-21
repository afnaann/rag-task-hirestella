# Project: AnomalyGuard — Real-Time Fraud Detection System

## Overview

AnomalyGuard is a real-time transaction anomaly detection system Alex built at DataStream between 2019 and 2021. It processes streaming financial transaction events and flags suspicious activity using a combination of statistical models and machine learning classifiers. The system operates at 1.2 million events per second and achieves 94% precision on flagged transactions.

AnomalyGuard serves financial services clients who require low-latency fraud detection with auditable, explainable decisions. As of the project handover date (when Alex left DataStream in 2021), it was processing transactions for three retail banking clients.

## Problem Statement

Traditional rule-based fraud detection systems suffer from two failure modes:

1. **Low recall**: Novel fraud patterns that do not match existing rules are missed entirely.
2. **High false-positive rate**: Overly aggressive rules flag legitimate transactions, degrading customer experience and generating unnecessary manual review work.

AnomalyGuard addresses this by combining:
- A statistical baseline (rolling z-score per account) for high-confidence, low-latency detection of obvious anomalies
- An ML classifier (gradient boosting) for pattern-based detection of more subtle fraud signals
- A rule-based post-filter for regulatory compliance requirements that cannot be expressed as ML objectives

## Alex's Role

Alex was the primary engineer responsible for the ML components of AnomalyGuard. Specific contributions:

- Designed the three-layer detection architecture (statistical → ML → rule-based)
- Implemented the gradient boosting model in XGBoost with a feature set of 47 engineered features
- Built the Rust-based event ingestion service that processes 1.2 million events/second
- Developed the feature store that provides low-latency (P99 < 5ms) feature lookups at inference time
- Worked with the data science team to build the training pipeline and model evaluation framework
- Contributed to the explainability layer that provides human-readable reasons for each flagged transaction

## Technical Architecture

### Event Ingestion (Rust Service)

The event ingestion layer is a Rust service that:
- Reads from a Kafka topic with 24 partitions
- Deserialises transaction events from Avro format
- Enriches events with account-level features from Redis (P99 lookup latency: 3.2ms)
- Forwards enriched events to the detection pipeline via an internal gRPC interface

Rust was chosen for this component because the latency and throughput requirements were incompatible with a Python service. The Rust service contributes less than 0.5ms of overhead to the end-to-end processing latency.

### Statistical Layer

For each transaction, a rolling z-score is computed using a 30-day exponential moving average of transaction amounts per account. Transactions with z-score > 3.5 are flagged immediately without invoking the ML model. This layer catches approximately 40% of fraud cases with a false positive rate of 0.8%.

### ML Layer (XGBoost Classifier)

The ML classifier receives enriched transaction events and produces a fraud probability score (0–1). Features include:

- Transaction amount, currency, merchant category
- Account-level statistics: 7-day, 30-day, and 90-day transaction averages and standard deviations
- Time-based features: hour of day, day of week, time since last transaction
- Network features: distance from account's home geography, first-time merchant flag
- Velocity features: number of transactions in the last 1, 5, and 15 minutes

Model performance on the held-out test set:
- Precision: 94% at the operating threshold
- Recall: 76%
- AUC-ROC: 0.97
- Inference latency: 4.1ms (P99)

The model is retrained weekly using a sliding 6-month window of labelled transactions. Labels are provided by the clients' fraud operations teams.

### Rule-Based Post-Filter

Certain decisions must be made by rule rather than ML model for regulatory and audit reasons. Examples:
- Transactions above a statutory reporting threshold are always flagged regardless of ML score
- Transactions involving sanctioned entities are always blocked
- Certain geographic patterns trigger mandatory review under AML regulations

This layer sits downstream of the ML layer and applies deterministic rules as a final gate.

### Explainability Layer

Every flagged transaction is accompanied by a human-readable explanation. The system uses SHAP values to identify the top 3 features driving the ML model's decision and maps them to templated natural language explanations:

"This transaction was flagged because: (1) the amount is 4.2 standard deviations above the account's 30-day average, (2) it is the account's first transaction with this merchant, and (3) it occurred at 03:14 UTC, which is outside the account's typical transaction window."

This explainability requirement was a hard client requirement for regulatory compliance.

## Engineering Challenges

**Feature store latency.** The initial feature store implementation used PostgreSQL and exceeded latency requirements at peak load. Migrating to Redis reduced P99 lookup latency from 47ms to 3.2ms, bringing the end-to-end detection pipeline within the 10ms SLA.

**Class imbalance.** Fraud events represent approximately 0.03% of all transactions. Training the XGBoost model naively produced a classifier that predicted "not fraud" for all inputs (99.97% accuracy, 0% recall). This was addressed by undersampling the majority class and tuning the decision threshold on the validation set using the F-beta metric with beta=0.5 to weight precision over recall.

**Model drift.** Fraud patterns change as fraudsters adapt to detection systems. The weekly retraining cadence and a drift monitoring dashboard (tracking feature distribution shifts and prediction score distributions) were implemented to detect model degradation early.

**Audit requirements.** Financial services clients required complete audit logs: every transaction's feature vector, model score, and decision reason must be stored and retrievable for 7 years. This required designing a cost-effective archival pipeline (Parquet on S3 with Glue for querying).

## Technology Stack

- **Ingestion**: Rust, Kafka (Confluent Cloud), Avro, gRPC
- **Feature store**: Redis Cluster
- **ML model**: XGBoost, Python (scikit-learn for preprocessing, SHAP for explainability)
- **Training pipeline**: AWS SageMaker, PostgreSQL (label store)
- **Infrastructure**: AWS EKS, Terraform
- **Monitoring**: Prometheus, Grafana, Weights & Biases (model performance)
- **Data archival**: Apache Parquet, AWS S3, AWS Glue

## Impact

- 94% precision on flagged transactions (vs. 71% for the previous rule-based system)
- False positive rate reduced from 4.1% to 0.8%, reducing manual review volume by 81%
- Processing throughput: 1.2 million events per second sustained
- Estimated fraud losses prevented: £4.8M in the first 12 months of operation across three client deployments
- System uptime: 99.94% over 18 months of operation (measured from GA launch to Alex's departure)
