# Design 09. Demand-ranked EC ladder with reliability guardrails

## Short Idea
Этот вариант строит систему как управляемую лестницу состояний: горячие данные держатся на репликации, переходный слой убирает стоимость первого охлаждения через асинхронный `replica -> EC` путь, а холодный слой уходит в wide `LRC`-размещение. Внутри EC-слоя система не ограничивается одним кодом: для более горячих warm-данных она подбирает rank и `k` по demand, для менее горячих - смещается к более экономичным и repair-friendly схемам. Решение принимает не только по температуре, но и по latency, reliability и состоянию кластера.

## Accent Subset
Этот вариант специально акцентирует:
- `azure_ec_atc_2012` - sealed extents, asynchronous background EC и LRC как практический cold-layer baseline.
- `ec_store_icdcs_2018` - latency is often dominated by distributed retrieval, so access planning and chunk movement matter.
- `heart_fast_2019` - disk-group reliability heterogeneity and online redundancy tuning as a second control signal.
- `rapidraid_arxiv_2012` - pipelined `replication -> EC` conversion for cheap archival migration.
- `wide_lrc_fast_2023` - practical wide LRC design, maintenance zones and placement robustness.
- `zebra_iwqos_2016` - demand-aware tiering and rank selection inside EC.

Именно этот набор задаёт тон варианту: не бинарный `hot/cold split`, а лестница состояний, где выбор схемы зависит от спроса, latency, reliability и того, насколько дёшево будет следующая миграция.

## Corpus Considered
Весь корпус `conspects/*.md` используется как общий контекст и как ограничение на допустимые design choices. В этой версии особенно опираюсь на:
- lifecycle и hybrid storage: `morph_sosp_2024`, `hsm_ieee_access_2024`, `er_store_scientific_programming_2021`, `elect_fast_2024`, `hyres_arxiv_2025`.
- EC theory and transition cost: `ec_survey_tos_2024`, `convertible_codes_it_2022`, `xoring_elephants_arxiv_2013`, `azure_ec_atc_2012`, `wide_lrc_fast_2023`.
- demand/access/reliability: `zebra_iwqos_2016`, `ec_store_icdcs_2018`, `heart_fast_2019`, `rapidraid_arxiv_2012`.
- the rest of the corpus stays available as evaluation and comparison context.

## Problem
Одна фиксированная схема не закрывает сразу несколько требований:
- горячие данные должны читаться и писаться с низкой latency;
- холодные данные должны храниться дешево по объёму;
- переходы между схемами не должны съедать выгоду от экономии;
- выбор схемы должен учитывать не только temperature/demand, но и reliability конкретных групп дисков;
- placement должен оставаться совместимым с maintenance and failure domains.

Проблема здесь не только в выборе конечного кода. Система обязана понимать, как пройти путь между состояниями, сколько I/O и сети съест переход, и не начнёт ли фонова миграция мешать клиентскому пути.

## Architecture Components
- `Telemetry collector`: собирает access frequency, lifetime/age, occupancy, load, failure signals и rough reliability signals по группам.
- `Temperature and demand estimator`: переводит историю обращений в heat classes и demand ranks; при шумном workload использует сглаживание и hysteresis.
- `Policy engine`: выбирает target state и target code family, а затем проверяет, не нарушает ли решение reliability и utilization guardrails.
- `Access planner`: строит дешёвый read path внутри EC-слоя, включая выбор chunks и минимизацию эффекта stragglers.
- `Transition planner`: организует background migration between tiers и следит, чтобы conversion шла асинхронно и вне критического пути.
- `Layout manager`: раскладывает data, parity и replicas across fault domains and maintenance zones, а для cold layer удерживает local repair groups.
- `Repair service`: обслуживает degraded reads, single-group repair и recovery after failures.
- `Metadata service`: хранит текущую схему, transition state, target parameters и mapping между tier и placement.
- `Code family registry`: ограничивает search space только теми схемами, для которых переходы и repair реально осмысленны.

## Data Layout
- `Hot tier`: 3-way replication для данных с высокой частотой доступа и чувствительным write path.
- `Bridge tier`: hybrid `replica + EC` для стадии, где горячие данные уже можно частично выводить из replication, но ещё нужен быстрый read/write path.
- `Warm tier`: demand-ranked EC, где `k` и rank выбираются по спросу; более горячие warm-данные получают меньший `k`, более холодные - больший `k`.
- `Cold tier`: wide `LRC` с maintenance-zone-aware placement и local repair groups, если приоритет смещается к storage efficiency и repair robustness.
- `Archive condition`: переходы выполняются только для sealed or transition-eligible units, чтобы не ломать write path.

Layout constraints:
- data и parity не должны попадать в один fault domain;
- local groups должны оставаться repairable без полного чтения stripe;
- wide LRC должен размещаться так, чтобы maintenance events не делали stripe недоступным;
- EC families для warm tier должны быть transition-friendly, а не только теоретически экономичными;
- metadata о состоянии tier хранится отдельно от самих data/parity chunks.

## Data Flow
1. Новые записи сначала попадают в hot tier и получают replication-first placement.
2. Когда unit seal'ится или стабилизируется, transition planner может перевести его в bridge tier.
3. Для первого охлаждения используется асинхронный `replication -> EC` path; source replicas не должны становиться узким местом на клиентском критическом пути.
4. После стабилизации demand system переводит данные в warm EC ranks, выбирая `k` и кодовую конфигурацию по current rank.
5. Если данные продолжают остывать, warm tier migrates them into wide `LRC` cold storage.
6. Read path для hot data идёт через replicas; warm и cold tiers используют EC access planning, chunk selection и, при необходимости, degraded reconstruction.
7. Repair и migration выполняются фоново и throttled, чтобы не конкурировать с клиентским I/O.

## Policy Layer
- Температура и demand оцениваются по access history на фиксированном окне, как в temperature-aware и demand-aware работах.
- `Zebra`-style ranking используется внутри EC-слоя: система не обязана сводить всё к одному cold code, а может двигаться по нескольким rank levels.
- Global disk utilization остаётся вторым управляющим сигналом, потому что один только спрос не показывает pressure на capacity.
- `HeART`-style reliability guardrail не позволяет системе отправлять данные в слишком агрессивный код, если конкретные группы дисков выглядят хуже остальных.
- `EC-Store`-style latency guardrail не даёт policy выбирать хороший по объёму, но медленный по retrieval вариант там, где важна пользовательская latency.
- `RapidRAID`-style conversion cost проверяется явно: переход разрешается только если он не съедает ожидаемую экономию.
- Hysteresis нужен, чтобы система не oscillate'ила между соседними состояниями на шумных traces.

## Metrics / Evaluation Plan
- `storage overhead` по tier'ам и по всей системе.
- `read latency` и `tail latency` для hot, warm и cold tiers.
- `write latency` и влияние на ingest path.
- `degraded-read latency` и `repair traffic`.
- `transition I/O` и `transition network traffic`.
- `recovery time` и `MTTDL`/reliability margin.
- `policy stability`, то есть частота лишних переключений.
- `migration efficiency`, то есть отношение полезной экономии к стоимости перехода.
- `placement robustness`, особенно для wide LRC и maintenance-zone-sensitive layouts.

План сравнения:
- против `3-way replication`;
- против static RS и static wide LRC;
- против hot/cold split без intermediate bridge tier;
- против policy без access planner;
- против policy без reliability guardrail;
- против policy, которая не учитывает transition cost.

## Trade-offs / Risks / Assumptions
- Больше tier'ов и больше допустимых переходов дают гибкость, но усложняют control plane и metadata.
- Demand smoothing снижает шум, но может запаздывать за резкими сдвигами workload.
- Wide LRC улучшает cold repair, но требует аккуратного placement и может ограничивать freedom в раскладке.
- Access-aware chunk movement снижает latency, но добавляет background traffic.
- Reliability guardrails защищают систему, но могут временно уменьшать storage efficiency.
- Асинхронная миграция предполагает, что данные можно делить на sealed transition-eligible units.
- Если backend не поддерживает понятные failure/maintenance domains, часть placement logic придётся упростить.

## Source Map
- `formal-brief.md`: цель диплома, проблема, метрики успеха и необходимость связать temperature, I/O cost и placement.
- `study-plan.md`: структура корпуса и приоритеты чтения, особенно линии `Morph`, `HSM`, `Zebra`, `EC-Store`, `HeART`, `RapidRAID`, `Azure`, `Wide LRC`.
- `azure_ec_atc_2012`: sealed extents, asynchronous EC, repair-friendly LRC and placement across fault/upgrade domains.
- `ec_store_icdcs_2018`: distributed retrieval latency, access planning, chunk movement and cost-aware EC access.
- `heart_fast_2019`: reliability heterogeneity, anomaly/change-point style tuning and conservative redundancy selection.
- `rapidraid_arxiv_2012`: pipelined archival conversion from replication to EC.
- `wide_lrc_fast_2023`: practical wide LRC design, maintenance-zone constraints and repair robustness.
- `zebra_iwqos_2016`: demand-aware tiering, EC ranks and migration between ranks.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy and transcode-aware placement.
- `hsm_ieee_access_2024`: heat plus global disk utilization and hysteresis-style switching.
- `er_store_scientific_programming_2021`: hot/warm/cold policy and periodic conversion table.
- `convertible_codes_it_2022`: explicit conversion cost and why EC-to-EC transitions should be treated as a separate cost.
- `ec_survey_tos_2024`: redundancy transitioning as a first-class EC problem and the broader trade-off framing.
- `hyres_arxiv_2025`: formal hybrid redundancy as a comparison baseline for storage cost, loss probability and repair traffic.
- `xoring_elephants_arxiv_2013`: locality and repair-efficient EC as a low-level baseline for cold storage.
- `elect_fast_2024`: selective replication-to-EC tiering and background offloading in an LSM-tree setting.
