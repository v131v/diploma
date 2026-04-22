# Design 15. Family-gated lifecycle controller for sealed SSTable redundancy units

## 1. Короткая идея
Вариант `v1` фиксирует один конкретный operational context: Cassandra-like LSM-tree storage, где новые данные сначала живут в обычном mutable `R3-Active` write path, а объектом lifecycle-policy становятся только уже sealed last-level SSTables. После sealing control plane создаёт `sealed redundancy unit` (`SRU`) и ведёт его по одному post-seal автомату: `Hy-RS -> RS-Narrow -> RS-Wide -> LRC-Archive`.

Главная конкретизация этого варианта в том, что `family-gated` здесь не абстракция, а один явный design point. Для `SRU` допускается ровно один `RS`-family `FG-RS-12-4-Cauchy-v1`: `RS-Narrow = RS(6,4)`, `RS-Wide = RS(12,4)`, а `cheap conversion` разрешён только как merge-переход `2 x RS(6,4) -> RS(12,4)` внутри этого family. Архивный слой `LRC-Archive` фиксирован как Azure-style `LRC(12,2,2)` budget с maintenance-robust layout; переход в него в `v1` никогда не считается cheap conversion и идёт только через full re-encode.

## 2. Design mode
- `full-corpus synthesis`
- Вариант остаётся `full-corpus synthesis`: он не выделяет `accent subset`, а собирает policy, layout, lifecycle и evaluation из всего корпуса.
- Конкретность `v1` достигается не сужением корпуса, а фиксированием одного primary substrate и одного code family поверх него: sealed SSTables в LSM-tree storage, один hybrid early-life state, один RS family и один archival LRC target.
- Из всего корпуса берутся четыре кластера идей:
- `sealed lifecycle + hybrid first step`: `morph_sosp_2024`, `azure_ec_atc_2012`, `elect_fast_2024`, `f4_osdi_2014`
- `temperature and reclassification loop`: `hsm_ieee_access_2024`, `er_store_scientific_programming_2021`, `identifying_hot_cold_icde_2013`, `zebra_iwqos_2016`
- `cheap RS-family conversion`: `convertible_codes_it_2022`, `zebra_iwqos_2016`, `morph_sosp_2024`
- `archival reliability and placement`: `azure_ec_atc_2012`, `wide_lrc_fast_2023`, `heart_fast_2019`, `xoring_elephants_arxiv_2013`

## 3. Учитываемый корпус
### Что задаёт primary substrate
- `elect_fast_2024` задаёт самый прямой `v1`-контекст: immutable SSTables, lifecycle по lifetime и access frequency, background transitioning и hot metadata.
- `azure_ec_atc_2012` и `f4_osdi_2014` подтверждают жёсткую границу между mutable ingest и post-seal / locked units, поэтому `SRU` в этом варианте начинается только после sealing.
- `morph_sosp_2024` даёт скелет post-seal pipeline: hybrid early-life state, затем CC-friendly EC family, затем поздний archival tier.

### Что задаёт policy и cost model
- `hsm_ieee_access_2024`, `er_store_scientific_programming_2021` и `identifying_hot_cold_icde_2013` дают batch reclassification, heat + utilization loop, hysteresis и low-overhead smoothing.
- `zebra_iwqos_2016` даёт идею фиксированного `kmax`, ограниченного набора ranks и bounded migration cost внутри одного `RS`-family.
- `convertible_codes_it_2022` даёт язык `access cost` и честную границу того, что дешёвый EC-to-EC transition надо доказывать для конкретного parameter regime, а не обещать в общем виде.
- `rapidraid_arxiv_2012` нужен как напоминание, что даже редкий archival transition надо планировать как отдельную pipeline operation с собственным I/O budget.

### Что задаёт reliability envelope
- `heart_fast_2019` вводит disk-group reliability bands и ограничение, что chunks одной stripe должны жить внутри одного reliability-homogeneous group.
- `wide_lrc_fast_2023` требует учитывать maintenance zones и форму local groups как часть design, а не как постфактум placement detail.
- `xoring_elephants_arxiv_2013` и `azure_ec_atc_2012` мотивируют deep-cold слой, где repair locality и repair traffic важны не меньше storage efficiency.

### Что остаётся честной границей применимости
- Этот `v1` не является универсальным design для block storage, object storage и LSM-tree одновременно.
- Primary substrate один: sealed last-level SSTables. Перенос на extents, object segments или BLOB volumes возможен только как portability discussion, а не как часть основного design point.

## 4. Проблема и целевая постановка
Для sealed SSTables в LSM-tree storage одна фиксированная схема хранения плохо закрывает сразу четыре требования:
- mutable hot path должен оставаться replication-first;
- после sealing нужен дешёвый выход из replication-heavy режима;
- позднее охлаждение должно уметь снижать storage overhead без полного reread-reencode на каждом шаге;
- deep-cold слой должен быть repair-efficient и placement-safe на неоднородной инфраструктуре.

Целевая постановка `v1` такая:
- `R3-Active` живёт только до sealing и не является состоянием `SRU`;
- `SRU` создаётся в момент sealing last-level SSTable и дальше остаётся immutable lifecycle unit;
- policy выбирает только `hold` или следующий допустимый post-seal шаг;
- cheap conversion в `v1` допустим только для `RS-Narrow -> RS-Wide` внутри одного заранее объявленного `RS`-family;
- переход в archival `LRC` делается редко, в отдельном archival window и только через explicit full re-encode.

## 5. Архитектура компонентов
### Decision engine
- `Lifecycle policy engine` работает только по sealed `SRU` и не владеет mutable write path.
- `Family admission controller` проверяет, что `SRU` принадлежит `FG-RS-12-4-Cauchy-v1` и что для него доступен допустимый следующий шаг.
- `Group admission controller` превращает per-`SRU` решение в group-level execution plan: он проверяет, что для текущего `coding_group` можно собрать или расширить допустимый cohort без нарушения family и placement envelope.
- `Safety gate` отдельно проверяет transition budget, repair backlog, capacity pressure и reliability band disk group.

### Metadata / control plane
- `SRU registry` создаётся в момент sealing и хранит: `sru_id`, `sstable_id`, `state`, `desired_state`, `family_id`, `fragment_size`, `heat_ewma`, `lifetime_stage`, `capacity_band`, `repair_pressure`, `reliability_band`, `layout_id`, `current_coding_group_id`, `state_epoch`, `placement_version`, `pending_job`.
- `Coding-group registry` хранит group-level execution metadata: `coding_group_id`, `group_state`, `family_id`, `fragment_size`, `placement_class`, `code_rank`, `member_sru_ids`, `stripe_generation`, `source_group_ids`, `target_group_id`, `placement_plan_version`, `repair_blocked`, `pending_group_job`.
- `Telemetry collector` собирает access frequency, age, read skew, degraded reads, repair queue length, cross-rack traffic и disk-group health.
- `Heat analyzer` обновляет batch hotness и lifetime stage вне критического read/write path.

### Storage nodes / data plane
- `Mutable ingest pool` держит только `R3-Active` SSTables и находится вне `SRU`-автомата.
- `Hybrid workers` строят `Hy-RS` сразу после sealing: одна full replica остаётся на hot tier, параллельно создаётся systematic `RS(6,4)` stripe для одного `coding_group`.
- `RS workers` умеют только один cheap merge path: `2 x RS(6,4) -> RS(12,4)`.
- `Archival workers` умеют только explicit full re-encode из `RS(12,4)` в Azure-style `LRC(12,2,2)` layout.

### Temperature analysis
- `Classifier` использует только те сигналы, которые прямо поддержаны корпусом для sealed immutable units: `heat_ewma`, `lifetime_stage`, `capacity_band`.
- `Reheat detector` не возвращает `SRU` в mutable phase; он лишь блокирует дальнейшее охлаждение и может инициировать materialization новой hot generation через обычный LSM path.

### Transition orchestration
- `Transition planner` знает только три post-seal job types: `drop-hot-replica`, `cheap-rs-merge`, `full-archive-reencode`.
- `Cohort assembler` формирует `coding_group` из совместимых `SRU` и для `RS-Narrow -> RS-Wide` связывает ровно две narrow groups в один temporary merge cohort.
- `Placement manager` проверяет rack / maintenance-zone envelope до запуска job, а не после.
- `Transition coordinator` ведёт prepare / verify / atomic-flip / retire protocol и считает состояние `SRU` изменённым только после committed metadata epoch.
- `Migration scheduler` приостанавливает downgrades, если растёт repair backlog или группа дисков выходит из safe reliability band.

## 6. Data layout
`R3-Active` в `v1` не является layout-state `SRU`: это pre-seal replicated storage для mutable SSTables. Ниже перечислены только post-seal layouts, которыми владеет lifecycle controller.

### Execution entities
- `SRU` - policy unit: один sealed SSTable, одна heat/lifetime траектория и один authoritative `state`.
- `coding_group` - execution unit: набор `SRU`, которые в текущем поколении реально образуют одну stripe-конфигурацию и должны переходить между layout'ами согласованно.
- Для `Hy-RS` и `RS-Narrow` один `coding_group` содержит `6` member `SRU`; для `RS-Wide` и `LRC-Archive` один `coding_group` содержит `12` member `SRU`.
- `stripe_generation` монотонно растёт при каждом successful group-level transition; per-`SRU` поле `state_epoch` указывает, к какому поколению stripe этот `SRU` уже привязан.
- Temporary `merge cohort` в `v1` - это ровно пара source `RS-Narrow` coding groups, которые coordinator эксклюзивно резервирует для одной операции `cheap-rs-merge`.

### Membership rules
- При sealing `Cohort assembler` кладёт `SRU` в narrow-compatible pool по ключу `{family_id, fragment_size, reliability_band, placement_class}`.
- Новый narrow `coding_group` формируется только из шести `SRU` с одинаковым `family_id`, одинаковым fragment size, одним reliability-homogeneous disk group envelope и достаточно близким seal epoch, чтобы их lifetime policy не расходилась сразу после старта.
- `RS-Wide` membership формируется не из произвольных двенадцати `SRU`, а как union двух уже существующих `RS-Narrow` coding groups; partial regrouping в `v1` запрещён.
- `LRC-Archive` использует те же `12` data `SRU`, что и исходный `RS-Wide` group, но меняет parity layout и maintenance-zone placement.

### `Hy-RS`
- `SRU` уже sealed и immutable.
- Логическое содержимое SSTable представлено одной full replica на hot tier и одной systematic stripe `RS(6,4)` в `FG-RS-12-4-Cauchy-v1`.
- Каждый `SRU` уже прикреплён к одному narrow `coding_group`, но authoritative state меняется на `Hy-RS` только после initial verify-and-flip этого group.
- Этот слой существует для дешёвого первого шага: переход в `RS-Narrow` равен удалению hot replica после verify-and-flip.

### `RS-Narrow`
- `SRU` участвует в systematic `RS(6,4)` stripe как member одного narrow `coding_group`.
- Это единственный narrow EC state в `v1`.
- Он intentionally дороже по storage, чем `RS-Wide`, но даёт более короткую stripe width и более дешёвые degraded reads на ранней warm/cool фазе.

### `RS-Wide`
- `SRU` участвует в systematic `RS(12,4)` stripe того же family `FG-RS-12-4-Cauchy-v1`.
- Один `RS-Wide` `coding_group` всегда создаётся как target generation для двух source `RS-Narrow` groups; после flip source groups становятся `superseded`, а не живут параллельно как active layout.
- Это основной cold-state в `v1`.
- Переход сюда cheap только если два `RS(6,4)` sister stripes можно законно смержить в один `RS(12,4)` stripe.

### `LRC-Archive`
- Архивный target фиксирован как Azure-style `LRC(12,2,2)` budget: `12` data fragments, `2` global parities и `2` local parities.
- `LRC-Archive` остаётся group-level layout для одного `RS-Wide` `coding_group`; membership data fragments не меняется, меняется только coding/placement generation.
- Layout обязан иметь ровные local groups и maintenance-robust placement, то есть в одной maintenance zone не оказывается более одного блока из local group.
- Этот слой нужен не как ещё один cheap tier, а как поздний repair-efficient archival state.

### `FG-RS-12-4-Cauchy-v1` envelope
- `family_id` один и фиксированный для `v1`.
- Допустимые `RS` ranks: только `k in {6, 12}` при фиксированном `r = 4`.
- Все stripes семейства используют один fragment size, один coefficient set и один checksum domain.
- Cheap conversion разрешён только для пары `RS(6,4) -> RS(12,4)`; других `RS` states в `v1` нет.

### Условия cheap conversion
- обе narrow stripes имеют одинаковый `family_id` и одинаковый fragment size;
- обе narrow stripes принадлежат одному reliability-homogeneous disk group;
- итоговый `RS(12,4)` stripe можно разложить без collocation conflicts по fault domains и racks;
- на момент перехода нет active repair для любого fragment из обеих narrow stripes;
- planner выполняет merge-regime conversion как bounded `access cost` operation, а не как полный reread всех logical SSTable bytes.

### Граница для `LRC-Archive`
- `RS(12,4) -> LRC(12,2,2)` в `v1` никогда не считается cheap conversion.
- Причина честная и source-backed: `convertible_codes_it_2022` и `lrc_convertible_arxiv_2023` дают сильные результаты для merge-regime и для LRC-to-LRC с одинаковой locality, но не дают основания объявить cheap переход из `RS`-family в archival `LRC` с другой locality и maintenance-zone constraints.
- Поэтому archival gate разрешает только full re-encode в отдельном background window.

## 7. Data flow
### Ingest and sealing
1. Новые записи идут в обычный LSM write path и живут в `R3-Active`.
2. После compaction в last-level SSTable и завершения sealing control plane создаёт `SRU` record и помещает его в narrow-compatible pool для `coding_group` assembly.
3. Когда `Cohort assembler` набирает шесть совместимых `SRU`, background worker строит для этого `coding_group` layout `Hy-RS`.
4. Только после group-level verify-and-flip registry одновременно проставляет каждому member `SRU` поля `state = Hy-RS`, `current_coding_group_id` и `state_epoch`; именно с этого момента lifecycle-policy видит объект как committed immutable `SRU`.

### Read
1. Пока `SRU` находится в `Hy-RS`, normal reads обслуживаются replica-first.
2. В `RS-Narrow` и `RS-Wide` normal reads идут по systematic fragments; reconstruction включается только при деградации.
3. В `LRC-Archive` degraded read старается замкнуться внутри local group; global decode - только fallback.
4. Если у sealed SSTable появляется sustained reheating, controller не делает обратный переход в mutable phase, а инициирует создание новой hot generation через обычный compaction/read-promotion path.

### Update
1. Сам `SRU` не обновляется inline: SSTable immutable.
2. Любые новые версии ключей попадают в новый mutable `R3-Active` path.
3. Старый sealed `SRU` остаётся в своём состоянии до compaction-based obsolescence и GC.
4. Поэтому lifecycle-policy управляет только sealed generations, а не логическим объектом целиком.

### Repair
1. Для `Hy-RS` cheapest repair path обычно идёт через оставшуюся hot replica.
2. Для `RS-Narrow` и `RS-Wide` repair идёт как standard systematic RS repair внутри текущего family.
3. Для `LRC-Archive` сначала пробуется local repair, а global decode используется только если локальная группа недоступна.
4. Repair backlog имеет приоритет над migration jobs и может полностью заморозить дальнейшее охлаждение.

### Migration / transition
1. `Hy-RS -> RS-Narrow`: per-`SRU` policy ставит `desired_state = RS-Narrow`, но transition запускается на уровне текущего narrow `coding_group`; coordinator удаляет hot replica только после checksums, replica health check и group-level metadata flip.
2. `RS-Narrow -> RS-Wide`: merge инициирует не отдельный `SRU`, а `Group admission controller`, когда он видит две source `RS-Narrow` groups, у которых все `12` member `SRU` уже individually request `RS-Wide`, совпадают `family_id` и fragment size, нет active repair, и placement manager подтверждает новый `RS(12,4)` envelope.
3. Membership merge cohort фиксируется как union двух source groups; если хотя бы один member `SRU` reheats, получает repair lock или теряет placement admissibility, весь cohort остаётся в `RS-Narrow`, а не переходит частично.
4. Prepare-stage для cheap merge пишет target `RS(12,4)` fragments и staging metadata, но authoritative `state` каждого `SRU` остаётся `RS-Narrow` до commit.
5. Atomic metadata flip одним control-plane transaction создаёт target `coding_group`, переводит все `12` member `SRU` на новый `current_coding_group_id/layout_id/state_epoch`, помечает source groups как `superseded` и только в этот момент считает `state` каждого `SRU` изменённым на `RS-Wide`.
6. Если failure случился до flip, coordinator удаляет staging writes, снимает group locks и retry делает idempotently из `RS-Narrow`; если failure случился после flip, reads уже используют новый `RS-Wide`, а retire старых fragments выполняется отдельным retryable cleanup job.
7. `RS-Wide -> LRC-Archive`: запускается на одном wide `coding_group`, когда все его member `SRU` individually archive-eligible и вся группа проходит maintenance-zone gate; re-encode пишет новый archival layout, затем проходит такой же atomic flip и lazy retirement старого `RS-Wide`.

## 8. Policy layer
### Temperature model
- Базовый сигнал - log-based access frequency с EWMA.
- Второй сигнал - `lifetime_stage`: `freshly sealed`, `stable warm`, `stable cold`, `archive candidate`.
- Третий сигнал - `capacity_band`, чтобы сильное давление по ёмкости ускоряло cooling только в пределах допустимого envelope.
- Четвёртый сигнал - `reliability_band` disk group; он может запретить downgrade даже для холодного `SRU`.

### Scheme selection discipline
- `R3-Active` не участвует в выборе post-seal states.
- Для sealed `SRU` policy рассматривает только `hold` или следующий шаг автомата и записывает это решение в `desired_state`.
- Per-`SRU` policy не меняет stripe membership сама: она только объявляет intent, а group-level execution решает, можно ли этот intent материализовать для всего `coding_group`.
- Любой шаг сначала проходит `family admission`, затем `placement admission`, затем `budget admission`; для group transitions после этого обязателен ещё `cohort admission`.
- Если хотя бы один gate не проходит, authoritative `state` `SRU` не меняется и `SRU` остаётся в текущем committed layout.

### Разрешённый автомат `v1`
- pre-seal: `R3-Active`
- post-seal: `Hy-RS -> RS-Narrow -> RS-Wide -> LRC-Archive`

### Смысл переходов
- `seal -> Hy-RS`: отделить mutable path от post-seal lifecycle и сразу подготовить cheap exit из early-hot режима.
- `Hy-RS -> RS-Narrow`: убрать лишнюю hot replica, когда краткая after-seal hotness прошла.
- `RS-Narrow -> RS-Wide`: объединить две sister stripes и снизить storage overhead без full re-encode.
- `RS-Wide -> LRC-Archive`: перевести very-cold data в repair-local archival layout, но только если cluster готов обеспечить maintenance-robust placement.

### Per-SRU policy vs group-level execution
- `Lifecycle policy engine` оценивает каждый `SRU` отдельно и первым решает, что конкретный sealed SSTable уже готов к `RS-Narrow`, `RS-Wide` или `LRC-Archive`.
- `Hy-RS -> RS-Narrow` использует уже существующий narrow `coding_group`, поэтому membership не пересобирается: group coordinator лишь проверяет, что все member `SRU` не заблокированы repair/backlog gate.
- `RS-Narrow -> RS-Wide` инициирует `Group admission controller`: он ищет sister stripe не по одному `SRU`, а по целой narrow group, и merge начинается только когда обе narrow groups полностью eligible.
- Cohort блокируется, если нет sister stripe, если хотя бы один member `SRU` не прошёл repair/reliability gate, если placement manager не нашёл допустимый `RS(12,4)` расклад, или если transition budget уже исчерпан.
- `RS-Wide -> LRC-Archive` также стартует только как whole-group job: individual `SRU` не может уйти в archive вне своего wide group.
- Reheating меняет только `desired_state`: если `SRU` уже committed в `RS-Wide`, он остаётся в `RS-Wide`; если он лишь ждал merge в `RS-Narrow`, cohort распускается и ждёт новый admissible момент.

### Safety / throttling
- один `SRU` не может иметь больше одного активного transition job;
- один `coding_group` не может одновременно участвовать и в merge, и в archival re-encode;
- downgrade запрещён при high repair backlog;
- downgrade запрещён, если disk group не находится в safe useful-life band;
- archival gate запрещён для SSTables с продолжающимся churn на уровне logical keyspace;
- если для `RS-Narrow` нет подходящей sister stripe под `FG-RS-12-4-Cauchy-v1`, `SRU` не перескакивает в другой code family, а остаётся в `RS-Narrow`;
- reheating в `v1` останавливает дальнейший downgrade, но не превращает sealed `SRU` обратно в mutable объект.

## 9. Метрики и план оценки
### Главный experimental context
- Один основной контекст `v1`: Cassandra-like LSM-tree cluster c immutable last-level SSTables, background compaction и selective post-seal transitioning.
- Главная experimental matrix: trace replay по SSTable access history + controlled failure / maintenance injection на одном и том же substrate.

### Ключевые метрики
- `storage overhead` по каждому состоянию и в steady state;
- `read latency` для freshly sealed и stable warm SSTables;
- `degraded-read latency`;
- `transition IO` и `transition network traffic`;
- `repair traffic`, `repair duration`, `queue delay`;
- `cross-rack traffic` во время merge и repair;
- `sister-stripe availability`: доля `RS-Narrow` groups, для которых в пределах waiting window находится хотя бы один admissible sister group;
- `merge eligibility rate`: доля `SRU` и доля whole `coding_group`, которые реально проходят все gates для `RS-Narrow -> RS-Wide`;
- `time stuck in RS-Narrow` и `cohort assembly latency`;
- `prepare failures`, `atomic-flip retries` и `post-flip cleanup lag`;
- `policy stability`: доля отменённых или отложенных transitions;
- `state accuracy`: насколько post-seal state соответствует фактической heat/lifetime зоне;
- `reliability proxies`: `MTTDL`-style оценка и maintenance-robust recoverability.

### Baselines
- статическая `3-way replication` для всего жизненного цикла;
- статический `RS(12,4)` после sealing без `Hy-RS` и без `RS-Narrow`;
- бинарная policy `R3-Active -> RS(12,4)` без family-gated merge step;
- policy `Hy-RS -> RS(6,4)` без позднего `RS-Wide` и archival `LRC`;
- тот же staged pipeline `Hy-RS -> RS(6,4) -> RS(12,4) -> LRC`, но шаг `RS(6,4) -> RS(12,4)` выполняется через full reread-reencode-rewrite вместо cheap merge.

### Что должен показать вариант
- по сравнению со статическим `3x` replication он должен уменьшать steady-state storage overhead;
- по сравнению с прямым `R3 -> RS(12,4)` он должен уменьшать early post-seal transition cost;
- по сравнению со статическим `RS(12,4)` cold tier он должен лучше контролировать degraded-read cost на warm/cool фазе;
- по сравнению с вариантом без archival gate он должен лучше ограничивать repair traffic в very-cold tail при сохранении placement safety;
- по сравнению с тем же pipeline, но с full re-encode на шаге `RS(6,4) -> RS(12,4)`, он должен показать меньшие `transition IO`, `transition network traffic` и меньший `cleanup lag`, иначе cheap merge path в `v1` не оправдан.

## 10. Trade-offs, риски, assumptions
- Вариант сознательно жёсткий: один substrate, один `RS` family и один archival target. Это снижает универсальность, но снимает расплывчатость.
- `SRU` начинается только после sealing, поэтому дизайн хорошо ложится на immutable SSTables и хуже подходит для truly mutable block storage.
- `RS(6,4)` как narrow tier платит более высоким overhead ради дешёвого early post-seal path и совместимости с `RS(12,4)` merge step.
- `RS-Narrow -> RS-Wide` зависит от наличия admissible sister stripe, поэтому часть `SRU` может задерживаться в `RS-Narrow`; это acceptable в `v1`, но должно быть явно измерено.
- `RS-Wide -> LRC-Archive` не обещает cheapness: это редкий late-life transition, который должен окупаться repair locality и maintenance robustness, а не только capacity savings.
- Если cluster не может обеспечить правильный placement envelope, `SRU` честно остаётся в `RS-Wide`.
- Вариант предполагает, что metadata для SSTables и health telemetry всегда остаются на hot replicated control plane.

## 11. Source map
### Direct architectural sources
- `morph_sosp_2024`: hybrid early-life state, lifecycle-oriented pipeline, hybrid-block metadata и transcode coordination для group-level transitions.
- `elect_fast_2024`: primary substrate `sealed SSTables`, `access frequency + lifetime`, background transitioning, coding-group metadata и разделение mutable path и sealed objects.
- `azure_ec_atc_2012`: жёсткая граница `seal -> background EC`, systematic EC pipeline и practical `LRC(12,2,2)` target.
- `zebra_iwqos_2016`: фиксированный `kmax`, ограниченный набор ranks и bounded migration внутри одного `RS` family.
- `convertible_codes_it_2022`: `access cost` как критерий cheap conversion и merge-regime границы применимости.
- `lrc_convertible_arxiv_2023`: честная граница применимости convertible-LRC results, из-за которой archival `LRC` не объявляется cheap target для `RS` family.
- `er_store_scientific_programming_2021` и `identifying_hot_cold_icde_2013`: batch reclassification, EWMA-like smoothing и metadata-driven transition control.
- `rapidraid_arxiv_2012`: pipeline-мышление для редких archival jobs, где сама конверсия рассматривается как отдельная costed operation.

### Reliability and layout constraints
- `heart_fast_2019`: reliability bands disk groups и запрет смешивать chunks stripe через неоднородные disk groups.
- `wide_lrc_fast_2023`: maintenance-zone constraints и требование равномерных local groups для archival LRC layout.
- `xoring_elephants_arxiv_2013`: cold-layer приоритет repair locality и reduction of repair traffic.
- `azure_ec_atc_2012`: placement по fault / upgrade domains как обязательный нижний слой layout policy.

### Baselines and benchmark vocabulary
- `hsm_ieee_access_2024`: `heat + utilization` как baseline policy intuition.
- `hyres_arxiv_2025`: vocabulary для сравнения hybrid redundancy по storage cost, repair traffic и file loss probability.
- `ec_store_icdcs_2018`: latency-aware reading of EC states и movement throttling vocabulary.
- `ec_survey_tos_2024`: общий язык trade-off между efficiency, latency, reliability и transitioning.
- `f4_osdi_2014`: production motivation для warm/deep-warm lifecycle, но не direct substrate `v1`.
- `benchmarking_ec_object_storage_fgcs_2025`: полезен только как фоновый benchmarking vocabulary; в основной evaluation matrix `v1` не доминирует.

### Corpus framing, not direct mechanism
- `formal-brief.md`: задаёт цель диплома и требование многоступенчатого pipeline с cost-aware transitions.
- `study-plan.md`: подтверждает, что дизайн собран как `full-corpus synthesis`, а не из 3-4 удобных paper.
- `sources/meta.json`: фиксирует состав корпуса и помогает держать честные границы применимости.

### Что в этом варианте является synthesis
- `SRU` как post-seal lifecycle unit только для immutable last-level SSTables;
- конкретный family `FG-RS-12-4-Cauchy-v1` с единственным cheap merge path `RS(6,4) -> RS(12,4)`;
- явная граница: `LRC(12,2,2)` archival state существует, но only via full re-encode;
- объединение `heat`, `lifetime`, `capacity` и `reliability band` в один admission-controlled lifecycle loop.
