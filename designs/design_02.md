# Temperature-Aware Lifecycle Pipeline with Conversion-Aware Cold Tier

## 1. Короткая идея
Вариант строит гибридную систему хранения как управляемый жизненный цикл данных: новые и горячие данные живут на replication-like уровне, затем переводятся в промежуточный warm tier, а после остывания - в EC/LRC cold tier. Главный акцент не на одном классе кодов, а на том, что переходы между режимами должны быть дешёвыми, безопасными и подчиняться не только температуре данных, но и состоянию кластера. В этой постановке один control substrate - sealed extent, и именно extent является единицей hotness, migration и metadata commit.

## 2. Accent subset
- `convertible_codes_it_2022`
- `elect_fast_2024`
- `heart_fast_2019`
- `hsm_ieee_access_2024`
- `morph_sosp_2024`
- `wide_lrc_fast_2023`
- Этот набор задаёт акценты на three-stage lifecycle, дешёвую EC-to-EC conversion, hotness-aware tiering, infrastructure-aware tuning и реалистичный cold-tier LRC.

## 3. Учитываемый корпус
- `ec_survey_tos_2024` задаёт общую карту trade-off: storage efficiency, performance, reliability и `redundancy transitioning`.
- `azure_ec_atc_2012` даёт production-шаблон для перехода от 3-way replication к EC после sealing и для placement по fault/upgrade domains.
- `er_store_scientific_programming_2021` показывает temperature-aware policy с hot/warm/cold и batch conversion на уровне tablets.
- `ec_store_icdcs_2018` нужен как latency-aware EC layer: placement, access planning и chunk movement могут быть важнее самого decode.
- `f4_osdi_2014` подтверждает, что warm tier и transparent migration между hot и warm storage реальны в production.
- `zebra_iwqos_2016` задаёт multi-tier demand-aware selection внутри одного EC family и показывает, что температура не обязана быть бинарной.
- `lrc_convertible_arxiv_2023` уточняет, что conversion cost и locality можно связывать формально, а не только эвристически.
- `hyres_arxiv_2025` служит теоретическим фоном для гибридной избыточности как семейства параметризованных схем.
- `xoring_elephants_arxiv_2013` даёт ремонтно-эффективный LRC baseline и практический язык locality.
- `rapidraid_arxiv_2012` нужен как пример дешёвой migration from replication to EC через pipelined coding.
- `identifying_hot_cold_icde_2013` поддерживает batch-классификацию hot/cold по журналам доступа и smoothing.
- `benchmarking_ec_object_storage_fgcs_2025` задаёт экспериментальные метрики: upload/download/delete/waiting time и fault tolerance.
- `ec_survey_tos_2024` и `azure_ec_atc_2012` вместе задают строгую терминологию stripe, locality, repair и transition.

## 4. Проблема и целевая постановка
Современное распределённое хранилище должно одновременно:
- обслуживать hot data с низкой latency;
- хранить cold data экономично;
- не терять reliability при смене схем;
- минимизировать I/O, network traffic и repair load при миграции;
- учитывать не только температуру данных, но и глобальную заполненность дисков и состояние disk groups.

Целевая постановка этого варианта - не выбрать один "лучший" код, а спроектировать policy-driven lifecycle pipeline, где схема хранения выбирается по состоянию данных и инфраструктуры, а сам переход выполняется через conversion-aware механизмы, а не через полный reread-reencode-rewrite.

## 5. Архитектура компонентов
- `Control substrate` - sealed extent: это единица hotness, migration, rollback и metadata commit. Object/file-level control здесь не используется.
- `Decision engine` принимает решение о состоянии extent по temperature, disk utilization и reliability signal, но только после проверки hard constraints.
- `Metadata / control plane` хранит current state, target scheme, transition state и hotness history; именно здесь живут hysteresis, dwell-time и commit rules.
- `Storage nodes / data plane` исполняют write, read, repair и background transition jobs, но не принимают глобальное policy-решение самостоятельно.
- `Temperature analysis` собирает access history, age/lifetime, access frequency и сглаженные оценки hotness для того же extent.
- `Transition orchestration` запускает replication-to-hybrid, hybrid-to-EC и EC-to-EC moves, throttles их и отслеживает completion.

Логически система похожа на контрольный цикл:
`observe -> classify -> select scheme -> schedule transition -> verify -> update metadata`.

## 6. Data layout
- Hot tier: 3-way replication для mutable или freshly sealed extents, чтобы сохранить fast reads and writes.
- Warm tier: hybrid redundancy на sealed extent, где одна replicated serving copy остаётся доступной, а EC-coded shadow уже строится в background; это staging state перед окончательным commit в cold tier.
- Cold tier: EC/LRC слой, где хранятся sealed, rarely accessed or fully cooled extents.
- Inside cold tier: wide LRC как practical layout для больших stripes внутри одного extent, особенно если важны repair cost, degraded reads и maintenance robustness.
- Metadata: отдельно от data and parity, чтобы controller мог безопасно менять state, не смешивая control state с data blocks.

Layout-принцип:
- replication components держатся ближе к hot path;
- data blocks и parity blocks для cold tier раскладываются по fault / upgrade / maintenance domains;
- transitions допускаются только между схемами, у которых conversion path заранее известен или доказан как приемлемый.

## 7. Data flow
- `Ingest`: новые данные пишутся в hot/replication-friendly режим; ACK идёт по replication-like path, как в `morph_sosp_2024`, `azure_ec_atc_2012` и `f4_osdi_2014`.
- `HotReplicated -> WarmHybrid`: trigger - hotness падает ниже warm-enter threshold или extent sealed; mechanism - background creation of EC-coded shadow while replicated serving copy remains authoritative; rollback possible until metadata commit.
- `WarmHybrid -> ColdEC`: trigger - hotness stays below warm-exit threshold for the dwell window, and cluster constraints are stable; mechanism - replication-to-EC pipeline from `morph_sosp_2024` / `rapidraid_arxiv_2012`, with metadata commit after verification.
- `ColdEC -> ColdLRC`: trigger - policy prefers better locality / repair profile for the same sealed extent family; mechanism - EC-to-EC conversion from `convertible_codes_it_2022` and `lrc_convertible_arxiv_2023`, not full reread-reencode-rewrite.
- `Read`: hot reads обслуживаются без decode; warm reads идут либо через replication, либо через selective EC access; cold reads используют EC/LRC access path.
- `Update`: частые updates остаются на hot/warm стороне, чтобы не раздувать parity churn; bulk updates и sealing trigger later conversion.
- `Repair`: repair выбирается по текущему layout. Для hot data предпочтителен replication repair, для cold data - locality-aware EC repair.
- `Rollback / failure`: if transition job fails before metadata commit, source layout remains authoritative and the partial target is dropped; after commit, rollback follows the reverse conversion path only if the reverse scheme is still feasible.

Для этого варианта важен принцип разделения:
- client-facing path остаётся максимально простым;
- background path принимает на себя стоимость re-layout и transcode;
- migration jobs должны быть throttled, чтобы не убивать foreground latency.

## 8. Policy layer
- `Temperature model`: основой служит сглаженная access frequency, age/lifetime и период наблюдения. Это согласуется с `identifying_hot_cold_icde_2013`, `f4_osdi_2014`, `elect_fast_2024` и `hsm_ieee_access_2024`.
- `Hard constraints`: candidate layout must satisfy reliability floor, placement-domain separation and capacity budget before it can be considered.
- `Decision rule`: if hotness is above `T_keep_hot`, keep the current replicated state; if hotness drops below `T_demote` for `N` windows or sealing is complete, demote the extent; if multiple target layouts are feasible, choose the one with the lowest `expected access cost + transition cost + repair penalty`. This makes `temperature`, `utilization` and `reliability shift` comparable instead of unordered signals.
- `Hysteresis`: the controller uses separate enter/exit thresholds and a minimum dwell time, so a borderline extent does not oscillate between hot, warm and cold states.
- `Transition authority`: only the metadata / control plane can initiate migration; data-plane workers execute the job and report completion, but cannot change scheme autonomously.
- `Target choice`: hot data остаются replicated; warm data получают hybrid treatment; cold data переводятся в EC/LRC. Among cold candidates, EC-to-EC transition may be preferred if the target layout is conversion-friendly and the gain exceeds the threshold.
- `Trigger ordering`: reliability shift and disk-space pressure can accelerate demotion, but they do not bypass hard constraints or hysteresis.

Policy здесь двухуровневая:
- первый уровень решает, держать extent в current state или запускать transition;
- второй уровень выбирает конкретную target scheme с учётом conversion cost, locality и storage budget.

Это важно, потому что `convertible_codes_it_2022` и `lrc_convertible_arxiv_2023` показывают: выбор target scheme нельзя отделять от цены самого перехода, а `hsm_ieee_access_2024`, `heart_fast_2019` и `zebra_iwqos_2016` показывают, что heat, utilization и reliability лучше использовать как упорядоченные constraints, а не как набор равноправных сигналов.

## 9. Метрики и план оценки
Оценка должна сравнивать не только steady-state storage, но и стоимость смены схем.

Основные метрики:
- storage overhead;
- read latency for hot, warm and cold data;
- write latency on the hot path;
- conversion cost in read/write accesses;
- migration I/O and network traffic;
- repair traffic and degraded-read latency;
- time to transition between tiers;
- доля данных, чья схема соответствует фактической температуре;
- resilience / durability under failure and maintenance events.

План оценки:
- baseline against 3-way replication;
- baseline against static RS / static wide LRC;
- baseline against one-step hot/cold policy without warm tier;
- baseline against temperature-aware policy without conversion-aware EC-to-EC path;
- workload split into hot, warm and cooling phases;
- failure and maintenance scenarios at stripe and disk-group level;
- sensitivity to threshold choice, smoothing window and throttling rate.

Для benchmark-части уместны I/O-oriented метрики из `benchmarking_ec_object_storage_fgcs_2025`, а для system comparison - latency, repair and migration metrics from `morph_sosp_2024`, `elect_fast_2024`, `ec_store_icdcs_2018` и `azure_ec_atc_2012`.

## 10. Trade-offs, risks, assumptions
- Тепловая модель не должна быть слишком грубой: binary hot/cold split плохо отражает life-cycle data, поэтому нужен multi-stage policy.
- Hybrid tier увеличивает архитектурную сложность и требует дополнительных metadata and orchestration paths.
- EC-to-EC conversion может быть дешевле полного re-encode, но не бесплатна; поэтому target schemes must be chosen with conversion cost in mind.
- Wide LRC даёт более реалистичный cold tier, но требует careful placement and repair assumptions.
- Если background transitions будут слишком агрессивными, система может ухудшить foreground latency.
- Если policy будет слишком conservative, storage savings окажутся ниже ожидаемых.
- Assumption: data temperature можно оценивать по access history, age and smoothing window; это подтверждается `identifying_hot_cold_icde_2013`, `f4_osdi_2014` и `elect_fast_2024`, но не даёт идеальной классификации.
- Assumption: cluster already has monitoring for disk space and failure / maintenance events, как в `hsm_ieee_access_2024` and `heart_fast_2019`.
- Assumption: exact code family for cold tier can be chosen from a finite menu of EC/LRC schemes, а не конструироваться с нуля.

## 11. Source map
- `convertible_codes_it_2022`: access cost, merge regime, lower bounds, multi-target conversion.
- `elect_fast_2024`: hotness-aware tiering, background conversion, metadata in hot tier.
- `heart_fast_2019`: anomaly detection, change point detection, disk-group-level reliability-aware tuning.
- `hsm_ieee_access_2024`: heat + global utilization, hysteresis, tier selection by disk-space state.
- `morph_sosp_2024`: lifecycle pipeline, hybrid redundancy, free replication-to-EC transition, transcode-aware placement.
- `wide_lrc_fast_2023`: practical cold-tier choice, locality, placement robustness, MTTDL / degraded read trade-offs.
- `ec_survey_tos_2024`: overall EC trade-off map and `redundancy transitioning` as a first-class topic.
- `azure_ec_atc_2012`: sealed extents, stream-layer EC, placement by fault/upgrade domains, cheap reconstruction.
- `er_store_scientific_programming_2021`: hot/warm/cold policy, temperature conversion table, batch reclassification.
- `ec_store_icdcs_2018`: access planning, chunk movement, latency-aware EC control plane.
- `f4_osdi_2014`: warm tier, router tier, transparent migration, production routing and recovery patterns.
- `zebra_iwqos_2016`: multi-tier demand-aware EC parameter selection and smoothing.
- `lrc_convertible_arxiv_2023`: conversion cost with locality, merge-regime lower bounds, LRCC design.
- `hyres_arxiv_2025`: formal hybrid redundancy family and storage / repair / loss-probability trade-off.
- `xoring_elephants_arxiv_2013`: LRC and repair-efficient EC baseline, HDFS-Xorbas pipeline.
- `rapidraid_arxiv_2012`: pipelined migration from replication to EC.
- `identifying_hot_cold_icde_2013`: offline hot/cold classification via access logs and smoothing.
- `benchmarking_ec_object_storage_fgcs_2025`: benchmark metrics and testbed design for EC in object storage.
