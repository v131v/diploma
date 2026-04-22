# Design 16. Study-plan-driven dual-loop lifecycle controller for hybrid redundancy

## 1. Короткая идея
Этот вариант строит дипломную систему не как фиксированный code design point, а как `dual-loop` архитектуру для sealed data units на одном референсном substrate: stream/storage layer с `sealed extents`, replication-first ingest и background recoding после sealing. Первый контур решает, в каком redundancy state должна жить единица данных с учётом температуры, возраста, заполненности и reliability context. Второй контур решает, можно ли это состояние безопасно материализовать в кластере: собрать cohort, проверить placement, не сорвать repair backlog и уложиться в transition budget.

Главная инженерная ставка здесь такая: `study-plan.md` задаёт не только список статей, а порядок reasoning. Из `ядра` берётся сам lifecycle pipeline, из кластера `policy / transitions / orchestration` - admissible transitions и safety gates, из блока `evaluation` - набор метрик и shape of comparison. Поэтому вариант `design_16` отличается от `design_15`: он остаётся guided synthesis, не сжимается до SSTable-specific design, но при этом фиксирует один операциональный substrate и один reference family profile, а остальные execution models использует как portability/constraint context.

## 2. Design mode
- `study-plan-driven design`
- Этот вариант явно следует каркасу из `study-plan.md`: `core -> policy/transitions/orchestration -> evaluation`.
- Reading cluster `Ядро` даёт `core pipeline`: `R3-Active -> Hy-Bridge -> EC-Convertible -> LRC-Archive`.
- Reading cluster `Теория переходов между схемами` из ядра задаёт `transition constraints`: дешёвыми считаются только заранее объявленные соседние переходы внутри совместимого family, а не любой EC-to-EC jump.
- Reading cluster `Policy, Transitions, Orchestration` задаёт `orchestration/safety`: batch classification, cohort-level execution, throttling, placement gates, reliability gates и запрет на хаотичные миграции.
- Reading cluster `Evaluation и Benchmarking` задаёт `evaluation lens`: измерять нужно не только storage overhead, но и latency, degraded reads, repair traffic, transition IO/network, waiting time и policy stability.
- Влияние `study-plan.md` здесь содержательное, а не формальное: сначала фиксируется архитектурный pipeline, потом для него вводятся ограничения на переходы, потом отдельно добавляется execution/safety слой, и только после этого строится план оценки.

## 3. Учитываемый корпус
Этот вариант использует весь текущий корпус `conspects/*.md`; `sources/meta.json` нужен как карта `source_id`, релевантности и роли источников.

Операциональный reference substrate берётся из `azure_ec_atc_2012`: active extent в replicated stream layer, sealing на уровне extent, background coordinator, persisted progress и metadata update после verify. `morph_sosp_2024` доопределяет для этого substrate hybrid-first и convertible-middle pipeline. `elect_fast_2024`, `f4_osdi_2014` и `er_store_scientific_programming_2021` остаются важными, но используются здесь как portability/examples of control boundaries, а не как равноправные execution mappings.

### Источники, которые задают основной pipeline
- `morph_sosp_2024`: lifecycle pipeline, hybrid first step, placement-aware transcode, separation between storage substrate and external policy.
- `hsm_ieee_access_2024`: связка `heat + utilization`, явные transition modes и простая hysteresis-интуиция.
- `er_store_scientific_programming_2021`: periodic reclassification, metadata-driven switching и разведение data path и conversion path.
- `hyres_arxiv_2025`: formal hybrid baseline по storage cost, repair traffic и reliability loss.
- `azure_ec_atc_2012`: replication-first ingest, seal-then-encode pipeline и practical LRC cold layer.
- `xoring_elephants_arxiv_2013`: cold repair locality как первичный аргумент для deep-cold слоя.
- `wide_lrc_fast_2023`: maintenance-robust placement и multi-metric выбор archival LRC.

### Источники, которые задают ограничения на переходы
- `convertible_codes_it_2022`: `access cost` как формальная метрика conversion.
- `lrc_convertible_arxiv_2023`: locality-preserving conversion и ограничение, что дешёвые переходы нужно доказывать, а не обещать.
- `zebra_iwqos_2016`: многоуровневые tiers, bounded migration и важность ограниченного пространства rank choices.
- `rapidraid_arxiv_2012`: migration path сам по себе должен быть спроектирован и оптимизирован.

### Источники, которые задают orchestration и safety
- `elect_fast_2024`: group-level metadata, background transitioning, hot metadata / cold data split, честная цена degraded reads.
- `identifying_hot_cold_icde_2013`: low-overhead batch classification и smoothing вне критического пути.
- `ec_store_icdcs_2018`: control plane vs data plane, cost-aware access / movement planning, chunk mover as first-class subsystem.
- `f4_osdi_2014`: warm tier, transparent migration и importance of controller/router separation.
- `heart_fast_2019`: reliability heterogeneity и отдельный infrastructure safety signal сверх температуры.

### Источники, которые задают framing и оценку
- `ec_survey_tos_2024`: общая карта trade-off и `redundancy transitioning` как отдельной проблемы.
- `benchmarking_ec_object_storage_fgcs_2025`: benchmark vocabulary, `upload/download/delete/waiting time`, `fault tolerance`, `fragment size`.

## 4. Проблема и целевая постановка
Для дипломной темы недостаточно просто выбрать одну хорошую схему хранения. Проблема состоит в том, что система должна одновременно:
- оставлять горячий write/read path replication-friendly;
- переводить остывающие данные в более экономичный режим без дорогого полного reread-reencode на каждом шаге;
- не ломать repair locality и degraded-read behavior на холодном хвосте;
- учитывать не только температуру данных, но и system-wide pressure: заполненность, placement envelope, repair backlog, reliability heterogeneity.

Целевая постановка `design_16`:
- reference substrate для дипломной архитектуры - stream/object storage с replicated active extents и background recoding только после sealing;
- mutable ingest path живёт в `R3-Active`, а policy управляет только sealed units;
- для sealed units вводится явный lifecycle graph из четырёх состояний;
- per-unit policy сначала выбирает желаемый следующий класс избыточности;
- cohort-level orchestrator затем проверяет, можно ли этот переход безопасно выполнить в текущем кластере;
- дешёвые переходы разрешены только по registry совместимых соседних состояний;
- reverse promotion допускается, но не считается бесплатной и не обязана идти тем же путём, что cooling;
- `study-plan-driven` каркас сохраняется: `ядро` задаёт lifecycle и substrate assumptions, `policy/orchestration` задаёт control protocol, `evaluation` задаёт проверку waiting time, rollback cost и stability.

## 5. Архитектура компонентов

### Decision engine
- `State classifier` получает для каждой sealed unit сигналы `heat`, `age/lifetime`, `global utilization`, `repair pressure`, `reliability band`.
- `State scorer` выбирает не “лучшую схему вообще”, а лучший `next admissible state` из registry соседних состояний.
- `Transition registry` хранит `state_id`, `family_id`, `layout_class`, `allowed_next`, `transition_type`, `placement_class`, `cohort_width`, `waiting_window`, `expected_cost_model`.
- `Promotion/demotion arbiter` различает cooling и reheating: cooling может идти по cheap adjacent path, reheating чаще требует materialization нового более горячего layout.

### Metadata / control plane
- `Unit registry` хранит `unit_id`, `sealed_epoch`, `state`, `desired_state`, `family_id`, `heat_score`, `lifetime_stage`, `utilization_band`, `reliability_band`, `placement_class`, `cohort_id`, `pending_job`, `state_epoch`, `policy_epoch`.
- `Cohort registry` хранит execution-level структуру: какие sealed units сейчас образуют один coding cohort, какой layout committed, какие source/target cohorts участвуют в migration, какой `generation_id` сейчас authoritative и когда истекает `waiting_deadline`.
- `Telemetry store` принимает access logs, read/write counters, repair events, node/disk health, waiting time для transition jobs.
- `Policy snapshot store` хранит исторические решения, чтобы считать hysteresis, policy stability и usefulness of transitions.

### Storage nodes / data plane
- `Replica ingest pool` обслуживает `R3-Active` и принимает обычные writes.
- `Hybrid workers` создают `Hy-Bridge` для sealed units так, чтобы первый выход из replica-heavy состояния был дешёвым.
- `Convertible EC workers` выполняют только такие EC-to-EC переходы, которые registry помечает как bounded-cost / cheap-convertible.
- `Archive LRC workers` строят late-life `LRC-Archive` layout как отдельный background path.
- `Repair workers` имеют приоритет над migration jobs и умеют выбирать replica path, EC repair или local repair в зависимости от текущего state.

### Temperature analysis
- `Access-log collector` собирает обращения вне критического пути.
- `Batch classifier` пересчитывает heat по окнам, а не inline на каждом запросе.
- `Smoothing layer` подавляет кратковременные всплески и предотвращает oscillation.
- `Lifetime tracker` добавляет возраст и стадию жизни как отдельный сигнал, а не заменяет ими heat.

### Transition orchestration
- `Cohort assembler` группирует совместимые units в execution cohorts.
- `Placement gate` проверяет fault domains, racks, maintenance zones и collocation constraints.
- `Budget gate` учитывает IO/network budgets и текущий repair backlog.
- `Commit coordinator` проводит `prepare -> verify -> metadata flip -> retire old layout` и пишет persisted progress для restart-safe resume/cleanup.
- `Fallback planner` умеет откладывать переход, а не форсировать unsafe conversion.
- `Cleanup daemon` удаляет staging generations, зависшие target fragments и retired layouts после grace period.

## 6. Data layout
`design_16` не фиксирует один конкретный `(k, r, l)` design point, но фиксирует четыре логических layout class и registry допустимых family.

### Референсный substrate и mapping
- Референсный substrate - replicated stream/object layer со `sealed extent` как базовой immutable data unit после append/ingest. Это основной operational mapping диплома.
- Остальные execution models не выбрасываются: `Morph` задаёт hybrid-first и convertible-middle path, `ELECT` подсказывает group metadata и hot-metadata/cold-data split, `f4` и `ER-Store` подтверждают жизнеспособность sealing/locking semantics в других storage contexts.
- `SRU` в этом дизайне фиксируется как один `sealed extent` размера одного sealing class. Практически это extent порядка `1-3 GiB`, закрытый для in-place updates, с одним `sealed_epoch`, одной placement class и одной lifecycle trajectory.
- `Transition cohort` в этом дизайне фиксируется как набор `SRU`, которые кодируются или перекодируются как одна `coding extent cohort`. Cohort существует только внутри одного `family_id`, одного `fragment_size_class`, одного `placement_class` и одной target transition.
- Для `R3-Active -> Hy-Bridge` cohort может быть тривиальным (`1 SRU`), потому что переход materializes hybrid layout для одного sealed extent.
- Для `Hy-Bridge -> EC-Convertible` и `EC-Convertible -> EC-Convertible(next)` cohort должен содержать ровно столько `SRU`, сколько требует target stripe width из registry; partial cohort не коммитится.

### Единицы раскладки
- `Sealed redundancy unit` (`SRU`) - policy unit на reference extent-level substrate.
- `Transition cohort` - execution unit. Именно cohort кодируется, перекодируется и atomically переключается между layout generations.
- `Metadata` для policy и orchestration всегда остаётся на горячем replicated control plane.

### Состояния layout
- `R3-Active`: три реплики для mutable ingest и самого горячего короткого окна жизни.
- `Hy-Bridge`: sealed unit хранится в hybrid layout, где replica component остаётся для fast reads, а EC component уже подготовлен.
- `EC-Convertible`: pure EC state внутри заранее объявленного compatible family; в одном deployment это может быть узкий и затем более широкий rank той же RS/LRC family.
- `LRC-Archive`: deep-cold layout с local repair groups и maintenance-robust placement.

### Правила хранения data / parity / replicas
- В `R3-Active` и `Hy-Bridge` replicas разносятся по fault/rack domains.
- В `Hy-Bridge` и `EC-Convertible` data/parity chunks раскладываются так, чтобы не ломать будущую conversion path.
- В `EC-Convertible` exact parameters выбираются из `family registry`; это сознательно ограниченное пространство, а не любой произвольный RS/LRC.
- В `LRC-Archive` local groups и global parities раскладываются с учётом maintenance zones; одна maintenance zone не должна делать stripe unrecoverable.
- Для всех coded layouts запрещена collocation blocks одной stripe на одном узле/диске/rack.

### Family registry
- `family_id` задаёт совместимые состояния и разрешённые соседние переходы.
- Для прототипа фиксируется reference profile `F_ref`: `R3-Active -> Hy(1, RS(6,2)) -> RS(6,2) -> RS(12,2) -> LRC(12,2,2)`.
- В `F_ref` дешёвыми считаются только два шага: `R3-Active -> Hy(1, RS(6,2))` как post-seal background materialization и `RS(6,2) -> RS(12,2)` как merge-regime family-local widening с постоянным parity count. Шаг `RS(12,2) -> LRC(12,2,2)` допускается только как late-life full re-encode.
- Registry может содержать и другие family, но сам дизайн требует не любую цепочку, а объявленный и проверяемый переходный граф с `cohort_width` и `waiting_window` для каждого ребра.
- Если переход требует сменить locality model или chunking так, что cheap conversion не доказана, registry помечает его как `full re-encode`.

## 7. Data flow

### Ingest
1. Новые данные пишутся в `R3-Active`.
2. После sealing создаётся `SRU`, заполняется metadata record и unit становится transition-eligible.
3. Background worker строит `Hy-Bridge`, не вынося encode path в client critical path.
4. После verify-and-flip lifecycle controller считает sealed unit committed в `Hy-Bridge`.

### Read
1. В `R3-Active` и `Hy-Bridge` normal reads идут replica-first.
2. В `EC-Convertible` normal reads идут по systematic EC path, а degraded reads обслуживаются decode path.
3. В `LRC-Archive` сначала пробуется local repair/read path внутри local group.
4. Если archived data reheats, controller инициирует promotion job; быстрый read fallback допустим, но не подменяет собой policy transition.

### Update
1. Sealed units не переписываются inline.
2. Новые версии данных идут в mutable delta / ingest layer.
3. Policy управляет только sealed generations и их переходами.
4. Merge/compaction или object-versioning позже создают новый sealed unit и новую lifecycle trajectory.

### Repair
1. Для `Hy-Bridge` быстрый repair может использовать replica component.
2. Для `EC-Convertible` repair идёт по текущему EC family.
3. Для `LRC-Archive` local repair предпочитается global decode.
4. Repair jobs выше приоритета, чем cooling transitions.

### Migration / transition
1. `State classifier` выставляет `desired_state`, но сам переход не запускает.
2. `Cohort assembler` кладёт `SRU` в open cohort только если совпадают `current_state`, `desired_state`, `family_id`, `fragment_size_class`, `placement_class` и `policy_epoch`, а также если до `waiting_deadline` можно набрать `cohort_width` для target state.
3. Если `waiting_window` истёк и cohort не собран, partial cohort не кодируется: `SRU` либо остаются в текущем состоянии и получают `deferred` reason, либо переводятся только в mandatory adjacent step, если это явно требует registry для post-seal safety.
4. Если один `SRU` reheats или меняет `desired_state` до старта `prepare`, он удаляется из open cohort, `policy_epoch` увеличивается, cohort пересобирается; mixed-`desired_state` cohort запрещён.
5. `Placement gate` и `Budget gate` решают, можно ли начинать conversion сейчас.
6. `Prepare stage` выбирает coordinator, резервирует target nodes, пишет target fragments в staging generation, сохраняет per-fragment progress/checksums и держит старый layout authoritative.
7. `Verify stage` проверяет checksums, placement diversity, fragment completeness, budget compliance и отсутствие активного repair conflict.
8. `Metadata flip` atomically переводит весь cohort на новый `generation_id`; после flip `state := desired_state`, `desired_state` синхронизируется с новым committed state, а старый layout получает статус `retiring`.
9. `Retire stage` лениво удаляет старый layout только после grace period, отсутствия активных readers/repair jobs и подтверждения, что promoted replacement уже committed, если promotion шёл параллельно.
10. Если `prepare` или `verify` падают, authoritative layout не меняется: job уходит в `aborted`, staging generation чистится `cleanup daemon`, а `SRU` возвращаются в re-evaluation queue.
11. Если promotion приходит для `SRU`, который уже находится в committed coded cohort, promotion создаёт новый hotter generation copy-out job и не меняет текущий cohort in-place; старый coded layout живёт до verify-and-flip promoted generation.

## 8. Policy layer

### Temperature model
- Базовый сигнал - access frequency по окнам наблюдения.
- Второй сигнал - `lifetime stage`, потому что very fresh и stable-cold data не стоит трактовать одинаково.
- Третий сигнал - `global utilization`, чтобы pressure по ёмкости ускорял cooling только внутри admissible envelope.
- Четвёртый сигнал - `reliability band` или health state инфраструктуры; он может запретить downgrade даже для холодных данных.
- Пятый сигнал - `repair pressure`, потому что migration во время recovery storm может быть вреднее самой экономии по storage.
- Референсное arbitration rule простое: `reliability band` и `repair pressure` работают как hard gates, затем `heat + lifetime` задают базовый temperature class, и только потом `global utilization` может ускорить один adjacent cooling step; utilization никогда не перепрыгивает через family-local state и никогда не перебивает reheating.

### Scheme selection
- Policy рассматривает только соседние состояния из registry, а не весь space of codes.
- Cooling path по умолчанию такой: `R3-Active -> Hy-Bridge -> EC-Convertible -> LRC-Archive`.
- Внутри `EC-Convertible` допускаются только family-local transitions, заранее объявленные как cheap or bounded-cost.
- Для reference profile `F_ref` базовый path такой: `R3-Active -> Hy(1, RS(6,2)) -> RS(6,2) -> RS(12,2) -> LRC(12,2,2)`.
- Если expected gain не покрывает `transition debt`, unit остаётся в текущем состоянии.
- Если placement или reliability gate не проходит, policy откладывает переход, а не выбирает произвольную альтернативу.

### Transition triggers
- `Cooling eligible`: smoothed heat ниже cold-threshold в двух подряд policy windows, `lifetime_stage` не `fresh`, нет hard veto по reliability/repair.
- `Utilization accelerator`: если `Cooling eligible` уже выполнен и utilization выше pressure-threshold, policy может предложить только следующий adjacent state из registry.
- `Promotion trigger`: smoothed heat выше hot-threshold в двух подряд окнах или read amplification/degraded reads превысили лимит; promotion override сильнее utilization-driven cooling.
- `Transition debt check`: перед запуском оркестрации controller сравнивает ожидаемую экономию по storage/repair с prepare+network+waiting debt и откладывает переход, если окупаемость не проходит.

### Разрешённые переходы
- `R3-Active -> Hy-Bridge`: базовый post-seal шаг, который отделяет mutable ingest от lifecycle-managed storage.
- `Hy-Bridge -> EC-Convertible`: preferred cooling step, если replica component уже не нужен для hot window.
- `EC-Convertible -> EC-Convertible(next)`: допустим только как adjacent family-local conversion с известным `access cost`.
- `EC-Convertible -> LRC-Archive`: late-life archival step; cheapness не предполагается автоматически.
- `Reheating promotion`: разрешён как explicit promote-copy/materialize job в более горячее состояние, но не считается cheap reverse conversion по умолчанию.

### Safety / throttling / orchestration
- Transition не стартует при high repair backlog.
- Transition не стартует, если node/disk group вышла из safe reliability band.
- Один cohort не может одновременно участвовать в repair-heavy recovery и background recoding.
- Metadata flip делается только на cohort-level, а не по отдельным fragments.
- Доля IO/network, занятая migration, ограничивается отдельным budget.
- Если classifier шумит, hysteresis требует повторного подтверждения `desired_state` на нескольких окнах.
- Если family registry не подтверждает cheap adjacent path, используется full re-encode или отказ от перехода.
- `Waiting window` проверяется явно: partial cohort не кодируется и не flip-ается, пока не достигнут `cohort_width`.
- `Desired_state` desync до `prepare` ведёт к cohort rebuild, а desync после `prepare` ведёт к abort+cleanup, потому что committed cohort должен иметь один target generation.
- `Prepare/verify/flip/retire` трактуются как persisted control protocol, а не как best-effort background task.
- Promotion jobs имеют приоритет над cooling flips только на этапе до commit; после commit они идут как separate materialization jobs и не ломают уже зафиксированный coded cohort in-place.

## 9. Метрики и план оценки

### Expected metrics
- `storage overhead` по состояниям и по steady-state системе.
- `read latency` и `write latency` для горячего пути.
- `degraded-read latency`.
- `repair traffic`, `repair duration`, `recovery time`.
- `transition IO` и `transition network traffic`.
- `queueing / waiting time` для migration jobs.
- `policy stability`: частота отменённых, отложенных и быстро откатываемых решений.
- `transition usefulness`: доля переходов, которые реально окупили transition debt.
- `state accuracy`: насколько текущий layout соответствует фактической температуре и стадии жизни данных.
- `fault tolerance / reliability proxies`: `MTTDL`-style оценка, recoverability under maintenance, file loss probability proxy.

### Baselines
- статическая `3-way replication`;
- статический `RS` или другой pure EC layer без lifecycle transitions;
- простой `hot/cold` baseline уровня `HSM`;
- hybrid storage без многошагового `EC-Convertible` middle layer;
- staged lifecycle without safety/orchestration gates;
- staged lifecycle, где все EC-to-EC transitions считаются full re-encode.

### План экспериментов
- `trace replay` для hot/warm/cold access traces;
- `lifecycle replay` на sealed units с разной скоростью охлаждения;
- `capacity-pressure sweep`, чтобы проверить роль `global utilization`;
- `repair-storm injection`, чтобы проверить throttling и postponement behavior;
- `placement sensitivity`, чтобы проверить влияние rack / maintenance-zone constraints;
- `transition accounting`, где отдельно считаются prepare, flip, retire и waiting time.

### Что должен показать вариант
- что hybrid + convertible middle layer уменьшает transition cost по сравнению с прямым `replication -> archival EC`;
- что group-level orchestration безопаснее и стабильнее, чем naively per-unit switching;
- что archival LRC оправдан только тогда, когда выигрыш по repair locality и maintenance robustness перекрывает цену late re-encode;
- что влияние `study-plan` на дизайн реально измеримо: core pipeline, transition constraints и evaluation lens дают разные, а не смешанные метрики успеха.

## 10. Trade-offs, риски, assumptions
- Вариант намеренно не сводится к одному SSTable-specific design point, но теперь фиксирует один reference substrate и один family profile; это уменьшает абстрактность, хотя и делает прототип менее “универсальным на бумаге”.
- Остальные execution models из корпуса используются как portability/constraint context, а не как параллельные operational mappings; это честнее инженерно, но уже требует явно объяснять границы переноса.
- `Dual-loop` control plane уменьшает риск unsafe transitions, но делает metadata и orchestration заметно сложнее.
- `Hy-Bridge` снижает цену первого перехода, но временно держит extra redundancy.
- `EC-Convertible` хорош только если соседние states действительно совместимы по conversion cost; без этого middle layer может превратиться в лишнюю сложность.
- `LRC-Archive` оправдан не по storage minimum, а по совокупности `repair locality + recoverability + maintenance robustness`; для некоторых deployment contexts pure RS может оказаться честнее.
- Reheating promotion не считается бесплатной: если workload oscillates слишком быстро, система может тратить слишком много ресурсов на promotion jobs.
- Предполагается, что policy работает batch-wise и что metadata/telemetry остаются на replicated hot control plane.
- Предполагается, что lifecycle-managed units становятся transition-eligible только после sealing или логического завершения активных updates.
- Предполагается, что `waiting_window` и `cohort_width` задаются консервативно: слишком маленькие окна ухудшат заполняемость cohorts, слишком большие - увеличат waiting time и риск policy drift.

## 11. Source map

### Core pipeline drivers from `study-plan.md`
- `morph_sosp_2024`: lifecycle line, hybrid early-life storage, cheap first step, placement-aware transcode.
- `hsm_ieee_access_2024`: temperature + utilization loop, explicit transition logic, rack-aware placement.
- `er_store_scientific_programming_2021`: metadata-driven periodic reclassification, hot/warm/cold policy, separation of write path and conversion path.
- `hyres_arxiv_2025`: formal comparison of hybrid redundancy regimes by storage cost, repair traffic and reliability.
- `azure_ec_atc_2012`: seal-then-encode substrate, background EC, LRC cold baseline.
- `xoring_elephants_arxiv_2013`: repair-efficient cold tier and importance of repair traffic.
- `wide_lrc_fast_2023`: archival LRC should be justified by multiple reliability and maintenance metrics, not by locality alone.

### Transition constraints from `study-plan.md`
- `convertible_codes_it_2022`: formal `access cost` and lower bounds for conversion.
- `lrc_convertible_arxiv_2023`: locality-preserving conversion works only under explicit structural constraints.
- `zebra_iwqos_2016`: tiered demand-aware policy, bounded migration and restricted rank space.
- `rapidraid_arxiv_2012`: migration path is a design object of its own.

### Orchestration / safety from `study-plan.md`
- `elect_fast_2024`: group-level metadata, background transitioning, hot metadata / cold data split, degraded-read costs.
- `identifying_hot_cold_icde_2013`: cheap batch classification and smoothing.
- `ec_store_icdcs_2018`: control-plane/data-plane split, movement planner, cost-aware access planning.
- `f4_osdi_2014`: warm tier, transparent migration, controller/router separation.
- `heart_fast_2019`: infrastructure-aware safety signal via reliability heterogeneity.

### Evaluation lens from `study-plan.md`
- `benchmarking_ec_object_storage_fgcs_2025`: `upload/download/delete/waiting time`, fragment-size sensitivity, local/remote benchmark framing.
- `ec_survey_tos_2024`: survey-level trade-off map and `redundancy transitioning` as a first-class evaluation target.

### Corpus-wide boundary
- Весь текущий корпус учтён, но не все источники играют одинаковую роль: часть задаёт pipeline, часть - ограничения, часть - evaluation framing.
- Этот вариант сознательно не приписывает источникам того, чего в них нет: papers по convertible codes не подменяют собой control plane, а system papers по Azure/f4/ELECT не дают готовую универсальную temperature policy.
