# design_05

## Short Idea
Многоуровневая lifecycle-архитектура для гибридного хранения, где горячие данные живут на replication или replica+EC, затем переводятся в EC, а затем в repair-efficient cold layer на wide LRC; решение принимает policy layer по совокупности hotness, заполненности дисков, reliability guardrail и стоимости перехода.

## Accent Subset
- `azure_ec_atc_2012`
- `elect_fast_2024`
- `heart_fast_2019`
- `hsm_ieee_access_2024`
- `morph_sosp_2024`
- `wide_lrc_fast_2023`

## Corpus Considered
Вариант учитывает весь корпус `conspects/*.md`, а акцентный subset задает приоритеты внутри общей архитектуры.

## Problem
Одна фиксированная схема избыточности плохо держит одновременно hot-read latency, storage overhead, repair cost и migration cost. Репликация слишком дорога по месту, классический EC слишком дорог для горячих данных и для переходов, а pure hot/cold деление не учитывает ни заполненность дисков, ни надежность конкретных групп, ни цену перекодировки между схемами.

## Architecture Components
- `Telemetry plane`: собирает access frequency, lifetime, disk utilization и disk-group AFR; hotness оценивается по логам и сглаживается, а не измеряется на критическом пути.
- `Policy plane`: сравнивает candidate states и решает, нужен ли переход из replication в hybrid, из hybrid в EC, или из EC в wide LRC.
- `Transition planner`: строит только соседние переходы, чтобы использовать дешевые transcode paths и не платить за full re-encode без необходимости.
- `Placement / layout manager`: разводит data, parity и replicas по fault, upgrade и maintenance domains; metadata остается в горячем control plane.
- `Execution plane`: делает background encoding, offloading, reconstruction и recovery, не блокируя write path.
- `Metadata plane`: хранит temperature state, stripe map, ECMeta/TCT-like state и правила hysteresis.

## Data Layout
- Hot tier хранит новые объекты или SSTables как `3-way replication` либо как `hybrid redundancy` в духе `Morph`, если целевая EC-схема известна заранее.
- Warm tier хранит менее горячие данные как уменьшенную replication-форму или как RS-based layout с metadata в hot plane; это соответствует линии `HSM` и `ER-Store`.
- Cold tier хранит стабильные данные как EC-слой, а при необходимости переводит их в wide LRC для более дешевого repair path и better deployment robustness.
- Для LSM-tree deployment managed unit is `SSTable`, и EC применяется на позднем уровне, а metadata остается в hot tier.
- Для file/object deployment managed unit can be a sealed file, extent or stripe; granularity выбирается на уровне substrate, а не policy.
- Data and parity are separated across fault/upgrade/maintenance domains, а local groups в cold layer выравниваются по layout constraints wide LRC.

## Data Flow
1. New data enters the hot tier on the critical path with replication-first semantics or hybrid redundancy.
2. Telemetry continuously updates hotness, utilization and reliability signals.
3. When a unit cools down and the transition cost is justified, the planner запускает background transcode from replication/hybrid to EC.
4. When a unit becomes stable and cold, the planner can convert EC to wide LRC if the access-cost bound is acceptable.
5. Reads on hot data идут через replica path; reads on EC/LRC data use reconstruction or local repair only when needed.
6. Recovery is background-first: local repair, then reconstruction, then rebalancing across domains.
7. If reliability degrades or a disk group moves into an unfavorable phase, the system can back off to the safer baseline scheme for that group.

## Policy Layer
- Primary trigger: data heat, as in `HSM`, `ER-Store`, `Zebra` and `ELECT`.
- Secondary trigger: global disk space utilization, because hotness alone does not capture pressure on capacity.
- Guardrail trigger: disk-group reliability state, as in `HeART`; a hot/cold policy should not push an already risky group into an aggressive code.
- Transition trigger: conversion is allowed only when expected savings exceed the `access cost` of the move, following `Convertible Codes` and `LRC Convertible`.
- Hysteresis rule: the controller keeps separate enter/exit thresholds to avoid oscillation, using the same spirit as `HSM` flags and smoothed demand from `Zebra`.
- Candidate state set: `replication`, `hybrid redundancy`, `RS`, `wide LRC`; the exact state chosen depends on substrate and transition path.

## Metrics / Evaluation Plan
- Storage overhead.
- Hot-read latency and write throughput.
- Repair I/O and repair network traffic.
- Degraded-read latency.
- Transition I/O, transition time and cross-rack traffic.
- Recovery time and reliability proxy such as `MTTDL`.
- Metadata overhead and fraction of data placed in the state matching its observed temperature.
- Compare against `3-way replication`, static RS, binary hot/cold tiering, and a hybrid system without multi-step transitions.
- Run the plan on skewed traces with explicit cooling transitions, plus reliability scenarios that force repair and fallback paths.

## Trade-offs / Risks / Assumptions
- The policy depends on stable estimation of hotness, lifetime and utilization; noisy telemetry can create bad transitions.
- More signals improve decisions but make the control plane heavier and the metadata more complex.
- Convertible-code families constrain which EC states can be reached cheaply.
- Wide LRC improves cold repair and deployment robustness, but it adds placement constraints and a less flexible layout.
- Migration remains cheaper than naive re-encode only if the system keeps transitions local and state-adjacent.
- The architecture assumes that the storage substrate can expose a manageable unit such as file, extent, tablet, SSTable or stripe.
- Degraded reads and full recovery are still more expensive than pure replication, so hot data should not be pushed too early into cold EC states.

## Source Map
| Source | Role in this variant |
|---|---|
| `ec_survey_tos_2024` | Gives the overall EC trade-off frame and the term `redundancy transitioning`. |
| `benchmarking_ec_object_storage_fgcs_2025` | Defines the evaluation vocabulary: upload/download/delete/waiting time and fault tolerance. |
| `hsm_ieee_access_2024` | Main policy baseline for heat plus global disk utilization, with hysteresis and rack-aware layout. |
| `morph_sosp_2024` | Main lifecycle substrate for cheap transitions: hybrid redundancy, EC-to-EC transcode and parameterized pipeline. |
| `elect_fast_2024` | Shows SSTable-level hotness-aware replication-to-EC tiering and metadata kept in the hot tier. |
| `heart_fast_2019` | Adds infrastructure reliability as a second control signal and a guardrail for safe tuning. |
| `azure_ec_atc_2012` | Supports sealed-unit EC layout, placement across fault/upgrade domains and cheap reconstruction with LRC. |
| `wide_lrc_fast_2023` | Supplies the cold-layer design point: wide LRC placement, maintenance zones and practical reliability criteria. |
| `convertible_codes_it_2022` | Provides the access-cost criterion for EC-to-EC conversion. |
| `lrc_convertible_arxiv_2023` | Supports optimal access-cost conversion when the cold layer needs locality-aware transitions. |
| `er_store_scientific_programming_2021` | Adds the hot/warm/cold split, periodic conversion table and update-path split. |
| `hyres_arxiv_2025` | Gives a formal hybrid redundancy family and a clean comparison frame for replication versus EC versus hybrid. |
| `zebra_iwqos_2016` | Supports multi-level demand-aware tiering and smoothed demand instead of binary hot/cold classification. |
| `f4_osdi_2014` | Adds production evidence for a warm tier and transparent migration between hot and lower-cost storage. |
| `ec_store_icdcs_2018` | Contributes latency-aware EC access planning and chunk movement inside the EC layer. |
| `xoring_elephants_arxiv_2013` | Gives the repair-efficient EC baseline and the locality argument for cold archival codes. |
| `rapidraid_arxiv_2012` | Supports cheap replication-to-EC archival via pipelined redundancy generation. |
| `identifying_hot_cold_icde_2013` | Provides a practical, log-based hot/cold classifier with offline smoothing. |
