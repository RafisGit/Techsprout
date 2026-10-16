# SCOPE CHANGE REQUEST: SCR-P7-01
## Reallocation of Milestone P6.4 (Discussions & Assignments) to Phase 7.4

**Document Identifier:** `TECHSPROUT-SCR-P7-01`  
**Status:** **APPROVED BY SENIOR LEADERSHIP**  
**Decision Date:** October 17, 2026  
**Decision-Maker:** Senior Engineering Lead / Architecture Review  
**Target Impact:** Phase 6 Baseline Closure, Phase 7 Sub-Phasing (`Phase 7.4` Established)  
**Related Architecture Decision:** [`ADR-P7-001`](file:///d:/Work/2026/techsprout-main/docs/architecture/adr/ADR-P7-001-learning-telemetry-privacy-and-fts.md)  
**Senior Decision Record:** [`P7.0_SENIOR_DECISION_RECORD.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_SENIOR_DECISION_RECORD.md)  

---

## 1. Executive Summary & Change Description

### 1.1 Problem Statement
During initial Phase 7 scoping, a preliminary draft proposal ([`docs/research/p7/P7_RESEARCH_AND_PLANNING_REPORT.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7/P7_RESEARCH_AND_PLANNING_REPORT.md)) bundled **Interactive Lesson Discussions (Q&A)** and **Hands-on Project Assignments** as a core P7 work package (**WP-P7-03**).

A strict roadmap provenance audit ([`docs/research/p7.0/P7.0_SCOPE_AND_ROADMAP_RECONCILIATION.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_SCOPE_AND_ROADMAP_RECONCILIATION.md)) established that:
1. In the authoritative Phase 6 Scope Freeze ([`docs/qa/p6.0-scope.md`](file:///d:/Work/2026/techsprout-main/docs/qa/p6.0-scope.md)), Discussions and Assignments were formally chartered under **Milestone P6.4** ("SHOULD HAVE for Phase 6").
2. No previous governance record authorized transferring P6.4 into Phase 7.
3. Unilaterally bundling P6.4 into Phase 7 inflated the milestone into a 33.5-day mega-release, combining real-time streaming telemetry with social community forums and file grading workflows.

### 1.2 Approved Resolution (Option B)
On October 17, 2026, Senior Engineering Leadership formally approved **Option B**:
- **Formal Phase 6 Closure:** Phase 6 is closed as completed with Milestone P6.3 (Analytics Platform) verified in production at commit `491b0d055f14a84bfcce45c0576c685f1017d661`.
- **Reassignment to Proposed Phase 7.4:** Interactive Discussions and Hands-on Project Assignments are officially reassigned from Milestone P6.4 to a dedicated, decoupled milestone: **Phase 7.4 (Interactive Community & Project Grading)**.
- **Strict Sub-Phase Sequencing:** Phase 7.4 is scheduled strictly *after* the core data and intelligence milestones:
  $$\text{Phase 7.1 (Telemetry)} \longrightarrow \text{Phase 7.2 (AI Tutoring)} \longrightarrow \text{Phase 7.3 (Monetization)} \longrightarrow \text{Phase 7.4 (Discussions \& Assignments)}$$
- **Phase 7.1 Boundary Protection:** Phase 7.1 implementation remains strictly confined to the Learning Telemetry Foundation (WP-P7-01, WP-P7-02, and the limited benchmark/staging subset of WP-P7-06). **Discussions, Assignments, AI Tutoring, and Monetization are strictly excluded from Phase 7.1.**

---

## 2. Affected Roadmap & Specification Documents

The following documents are governed and modified by this Scope Change Request:

| Document Path | Role in Roadmap | Required Action Under SCR-P7-01 |
|---|---|---|
| [`docs/qa/p6.0-scope.md`](file:///d:/Work/2026/techsprout-main/docs/qa/p6.0-scope.md) | Historical Phase 6 Master Scope | Annotated to record that Milestone P6.4 was superseded by SCR-P7-01 and moved to Phase 7.4. |
| [`docs/research/p7.0/P7.0_SCOPE_AND_ROADMAP_RECONCILIATION.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_SCOPE_AND_ROADMAP_RECONCILIATION.md) | Scope Governance Artifact | Updated from UNRESOLVED to RESOLVED (Option B selected). |
| [`docs/research/p7.0/P7.0_ARCHITECTURE_AND_WORK_PACKAGES.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_ARCHITECTURE_AND_WORK_PACKAGES.md) | Phase 7 Architecture Specification | WP-P7-03 designated as Phase 7.4 follow-on; pure-P7 effort subtotals reconciled. |
| [`docs/research/p7.0/P7.0_MASTER_REVIEW_SUMMARY.md`](file:///d:/Work/2026/techsprout-main/docs/research/p7.0/P7.0_MASTER_REVIEW_SUMMARY.md) | Master Synthesis & Checklist | Decision Gate A marked approved; checklist updated. |
| [`docs/architecture/adr/ADR-P7-001-learning-telemetry-privacy-and-fts.md`](file:///d:/Work/2026/techsprout-main/docs/architecture/adr/ADR-P7-001-learning-telemetry-privacy-and-fts.md) | Canonical Architecture Decision | Direct cross-reference to SCR-P7-01 established. |

---

## 3. Effort Estimates & Scope Accounting

Scope accounting is strictly partitioned to avoid conflating the core data/intelligence platform with social/pedagogical follow-ons:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RECONCILED EFFORT ACCOUNTING                              │
├────────────────────┬────────────────────────────────────────┬─────────────┬────────────┤
│ Milestone Package  │ Scope Deliverables                     │ Range (d)   │ Most-Likely│
├────────────────────┼────────────────────────────────────────┼─────────────┼────────────┤
│ Phase 7.1 (Target) │ WP-P7-01 (Telemetry Pipeline)          │ 3.0 – 5.5   │ 4.0 days   │
│                    │ WP-P7-02 (Video Retention Analytics)   │ 2.5 – 4.5   │ 3.5 days   │
│                    │ WP-P7-06 Subset (Benchmark & Staging)  │ 1.0 – 2.0   │ 1.5 days   │
│                    ├────────────────────────────────────────┼─────────────┼────────────┤
│                    │ **Phase 7.1 Immediate Subtotal**       │ 6.5 – 12.0  │ **9.0 d**  │
├────────────────────┼────────────────────────────────────────┼─────────────┼────────────┤
│ Pure-P7 Follow-ons │ WP-P7-04 (AI Tutoring Engine)          │ 5.0 – 8.5   │ 6.5 days   │
│                    │ WP-P7-05 (Instructor Monetization)     │ 5.0 – 8.0   │ 6.5 days   │
│                    │ WP-P7-06 Remainder (Hardening/Soak)    │ 1.5 – 3.0   │ 2.0 days   │
├────────────────────┼────────────────────────────────────────┼─────────────┼────────────┤
│ **Core Pure-P7**   │ **All 5 Core Pure-P7 Packages**        │ 18.0 – 31.5 │ **24.0 d** │
│ **Subtotal**       │ **(Excluding Discussions/Assignments)**│             │            │
├────────────────────┼────────────────────────────────────────┼─────────────┼────────────┤
│ **Phase 7.4**      │ **Discussions & Project Assignments**  │ 5.5 – 9.0   │ **7.0 d**  │
│ **(Former P6.4)**  │ **(Former Candidate WP-P7-03)**        │             │            │
└────────────────────┴────────────────────────────────────────┴─────────────┴────────────┘
```

*Governance Accounting Principle:* The 5.5 – 9.0 engineering days for Phase 7.4 remain **strictly decoupled and separate** from the Core Pure-P7 subtotal (18.0 low / 24.0 most-likely / 31.5 high days).

---

## 4. Technical Dependencies & Implementation Boundaries

1. **Database Schema Isolation:**  
   - Phase 7.1 introduces Migration 0009 (`learning_events` append-only table).
   - Phase 7.4 will introduce separate migrations (e.g., `discussions`, `discussion_replies`, `assignments`, `assignment_submissions`). Zero discussion or assignment tables may be created during Phase 7.1.
2. **Media Storage Isolation:**  
   - Phase 7.4 assignment submissions (student ZIP/PDF uploads) will require Cloudinary or S3 bucket authorization. This dependency is completely deferred to Phase 7.4.
3. **OutboxService Independence:**  
   - Telemetry ingestion in Phase 7.1 does not rely on the best-effort [`OutboxService`](file:///d:/Work/2026/techsprout-main/apps/api/src/modules/outbox/outbox.service.ts). Discussion notifications in Phase 7.4 will interface with notification pipelines once Outbox transactional durability is resolved.

---

## 5. Scope Approval History

| Role | Approver | Date | Decision |
|---|---|---|---|
| **Senior Engineering Lead** | Architecture Review Panel | October 17, 2026 | **APPROVED (Option B)** |
| **Technical Program Lead** | QA & Governance Lead | October 17, 2026 | **VERIFIED & RECORDED** |

```text
========================================================================================
STATUS: SCR-P7-01 FORMALLY APPROVED
DISCUSSIONS & ASSIGNMENTS REASSIGNED TO PHASE 7.4
PHASE 7.1 REMAINS CONFINED TO LEARNING TELEMETRY (9.0 DAYS MOST-LIKELY)
NO CODE IMPLEMENTATION OR MIGRATION AUTHORIZED BY THIS DOCUMENT
========================================================================================
```
