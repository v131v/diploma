# Glossary for `design_16`

Этот файл расшифровывает основные понятия, сущности и термины из [design_16.md](./design_16.md) и [design_16_diagrams.md](./design_16_diagrams.md).

## 1. Общая идея и framing

- `design_16` - вариант дипломной архитектуры для системы хранения, где схема избыточности меняется по жизненному циклу данных, а сами переходы управляются отдельным control plane.
- `study-plan-driven design` - режим проектирования, где порядок рассуждений задаётся не интуитивно, а reading clusters из `study-plan.md`: сначала pipeline, потом transition constraints, затем orchestration/safety, потом evaluation.
- `dual-loop` / `Dual-loop controller` - двухконтурная логика управления.
  Первый контур выбирает, в каком состоянии данные должны жить.
  Второй контур проверяет, можно ли безопасно перевести данные в это состояние прямо сейчас.
- `core -> policy/transitions/orchestration -> evaluation` - каркас дизайна.
  Сначала задаётся базовый lifecycle pipeline.
  Затем вводятся допустимые переходы.
  Затем добавляется исполнимый protocol и safety gates.
  После этого определяется, как всё это оценивать.
- `evaluation lens` - угол оценки системы.
  В `design_16` оценивается не только экономия места, но и latency, repair cost, waiting time, stability и usefulness of transitions.

## 2. Базовые сущности данных

- `sealed extent` - базовая immutable единица данных после завершения активной записи.
  В этом дизайне именно после sealing данные становятся объектом lifecycle policy.
- `SRU` / `Sealed redundancy unit` - policy-unit дизайна.
  Это один `sealed extent`, для которого хранятся state, desired_state, family_id и прочая metadata.
- `1-3 GiB` - типичный порядок размера одного `SRU` в reference substrate этого варианта.
- `sealed_epoch` - момент или версия sealing для конкретного `SRU`.
  Нужен, чтобы понимать, к какой завершённой sealed generation относится unit.
- `state` - текущее committed redundancy state данного `SRU`.
- `desired_state` - целевое состояние, которое policy считает желательным, но которое ещё не обязательно материализовано.
- `state_epoch` - версия committed state.
  Увеличивается, когда у unit реально меняется зафиксированный layout.
- `policy_epoch` - версия policy-решения.
  Увеличивается, когда policy пересмотрела целевое состояние или когда unit нужно вынуть из cohort и пересобрать план.
- `generation_id` - идентификатор конкретной physical generation layout.
  Нужен, чтобы различать старый, staging и новый committed layout.
- `authoritative generation` - та generation, которая сейчас считается основной и обслуживает корректные reads/repair.
- `staging generation` - ещё не committed layout, который собирается на этапе `prepare`.

## 3. Reference substrate и data model

- `reference substrate` - тот storage context, который выбран как основной операциональный mapping для диплома.
  В `design_16` это replicated stream/object layer с `sealed extents`.
- `replication-first ingest` - новые данные сначала пишутся в replicated hot path, а не сразу в erasure-coded layout.
- `background recoding` - построение coded layout происходит фоном после sealing, а не в критическом пути клиента.
- `mutable ingest path` - участок системы, где данные ещё активно пишутся и могут меняться.
- `lifecycle-managed storage` - часть системы, где живут уже sealed units и где ими управляет policy.
- `coding extent cohort` / `Transition cohort` - execution-unit перехода.
  Несколько `SRU` объединяются в cohort и кодируются или перекодируются как единое целое.
- `partial cohort` - неполный cohort.
  В этом дизайне partial cohort не коммитится.
- `cohort_width` - сколько `SRU` нужно набрать для target transition.
- `waiting_window` - максимальное время ожидания, в течение которого система пытается собрать полный cohort.
- `waiting_deadline` - конкретный дедлайн текущего cohort, вычисленный из `waiting_window`.
- `fragment_size_class` - класс размера fragments/chunks, в рамках которого units считаются совместимыми для одного transition cohort.
- `placement_class` - класс ограничений размещения: fault domains, racks, maintenance zones и т.п.
- `family_id` - идентификатор семейства совместимых layouts и переходов между ними.
- `family registry` - реестр допустимых семейств layouts и допустимых переходов внутри них.
- `allowed_next` - какие следующие состояния разрешены из данного состояния.
- `layout_class` - логический класс раскладки: replication, hybrid, pure EC, archival LRC.
- `transition_type` - тип перехода: cheap adjacent conversion, widening, full re-encode, promotion и т.п.
- `expected_cost_model` - модель ожидаемой цены перехода по IO/network/repair/waiting.

## 4. Состояния lifecycle pipeline

- `R3-Active` - горячее состояние с тремя репликами.
  Здесь живут новые и активно используемые данные.
- `Hy-Bridge` - гибридный промежуточный слой.
  У данных ещё есть replica component для быстрых reads, но EC component уже подготовлен.
- `EC-Convertible` - coded state внутри заранее объявленного compatible family.
  Это не “любой EC”, а только тот EC, для которого cheap/bounded-cost transition заранее доказан.
- `EC-Convertible(next)` - следующий соседний coded state в том же family.
  Обычно это более широкий или более экономичный вариант в пределах того же compatibility graph.
- `LRC-Archive` - архивное deep-cold состояние на базе LRC с упором на repair locality и maintenance robustness.
- `R3-Active -> Hy-Bridge -> EC-Convertible -> LRC-Archive` - основной cooling path жизненного цикла.
- `reheating` - ситуация, когда ранее остывшие данные снова становятся горячее.
- `Reheating promotion` - подъём данных в более горячее состояние.
  Важно: здесь это не считается бесплатным обратным переходом.
- `promotion copy-out job` - promotion как отдельная materialization-задача, где создаётся новый hotter layout, а не ломается in-place существующий coded cohort.

## 5. Reference family и кодовые обозначения

- `F_ref` - reference family profile, выбранный для прототипирования и объяснения переходов.
- `R3-Active -> Hy(1, RS(6,2)) -> RS(6,2) -> RS(12,2) -> LRC(12,2,2)` - опорная цепочка состояний внутри `F_ref`.
- `RS` - Reed-Solomon erasure code.
- `RS(6,2)` - код с 6 data fragments и 2 parity fragments.
- `RS(12,2)` - более широкий вариант RS с 12 data fragments и 2 parity fragments.
- `LRC(12,2,2)` - locally repairable code с 12 data fragments, 2 global parity и 2 local groups в логике reference profile.
- `Hy(1, RS(6,2))` - shorthand для hybrid bridge layout, где единица всё ещё имеет replica component и уже связана с целевым `RS(6,2)` path.
- `(k, r, l)` - обобщённое обозначение параметров кода.
  Обычно это data width, parity/redundancy и local-structure параметр.
- `cheap adjacent path` - заранее объявленный соседний переход внутри одного family, для которого цена перехода считается bounded и инженерно приемлемой.
- `full re-encode` - дорогой переход с полноценным reread/recompute layout, без обещания дешёвой конверсии.
- `access cost` - формальная или инженерная цена перехода/конверсии между code states.

## 6. Компоненты decision engine

- `Decision engine` - часть control plane, которая принимает policy-решения.
- `State classifier` - классифицирует unit по сигналам `heat`, `lifetime`, `utilization`, `reliability`, `repair pressure`.
- `State scorer` - не ищет “лучший код вообще”, а выбирает лучший `next admissible state` из разрешённых соседних состояний.
- `next admissible state` - ближайшее допустимое следующее состояние, а не любой произвольный state.
- `Transition registry` - реестр всех допустимых переходов и их параметров.
- `Promotion/demotion arbiter` - логика, которая различает cooling и reheating и решает, что именно предлагать.

## 7. Компоненты metadata/control plane

- `Metadata / control plane` - слой, который хранит состояние системы и оркестрирует переходы, но не переносит пользовательские данные напрямую.
- `Unit registry` - metadata-таблица по каждому `SRU`.
- `Cohort registry` - metadata-таблица по execution cohorts и их generations.
- `Telemetry store` - хранилище сигналов наблюдения: access stats, repair events, health, waiting time.
- `Policy snapshot store` - история policy-решений.
  Нужна для hysteresis, оценки oscillation и policy stability.
- `pending_job` - ссылка на текущую активную migration/promotion/recovery задачу для unit.
- `cohort_id` - идентификатор cohort, к которому сейчас привязан unit.

## 8. Компоненты data plane

- `Storage nodes / data plane` - слой, где реально лежат fragments, replicas и где выполняются I/O операции.
- `Replica ingest pool` - узлы/процессы, которые обслуживают запись в `R3-Active`.
- `Hybrid workers` - фоновые workers, которые materialize `Hy-Bridge`.
- `Convertible EC workers` - workers для дешёвых или bounded-cost EC-to-EC переходов внутри одного family.
- `Archive LRC workers` - workers, которые строят архивный `LRC-Archive`.
- `Repair workers` - подсистема восстановления после отказов.
  В этом варианте repair имеет более высокий приоритет, чем migration.

## 9. Компоненты temperature analysis

- `Temperature analysis` - подсистема определения “горячести” данных.
- `Access-log collector` - собирает access telemetry вне критического пути.
- `Batch classifier` - пересчитывает heat по окнам, а не на каждом отдельном запросе.
- `Smoothing layer` - сглаживает кратковременные всплески, чтобы не дёргать policy зря.
- `Lifetime tracker` - добавляет возраст и стадию жизни как отдельный сигнал.
- `heat` - интенсивность обращений к данным.
- `heat_score` - числовое представление heat для policy.
- `age/lifetime` / `lifetime stage` / `lifetime_stage` - возраст и фаза жизни данных.
  Нужны, чтобы отличать “только что созданные” данные от “долго живущих холодных”.
- `fresh` - очень ранняя стадия жизни данных, когда cooling обычно ещё не разрешается.
- `global utilization` - общий pressure по занятости ёмкости в системе.
- `utilization_band` - дискретизированный класс давления по capacity.
- `reliability band` - дискретизированный класс текущей надёжности инфраструктуры.
- `reliability_band` - metadata-представление этого же safety-сигнала.
- `repair pressure` - давление от recovery/repair workload.

## 10. Policy rules и triggers

- `Policy layer` - правила, по которым система решает, должен ли unit менять redundancy state.
- `Cooling eligible` - unit считается готовым к охлаждению, если его heat устойчиво низкий, он не `fresh`, и нет hard veto по reliability/repair.
- `Utilization accelerator` - ускоритель cooling под давлением capacity.
  Он может ускорить только один соседний шаг и не может перепрыгивать через graph.
- `Promotion trigger` - условие, при котором данные нужно поднимать в более горячее состояние.
- `Transition debt` - “долг перехода”, то есть стоимость самого перехода: prepare, network, waiting, possible repair side effects.
- `Transition debt check` - проверка, окупится ли переход.
- `hard gate` / `hard veto` - стоп-фактор, при котором переход запрещён независимо от выгодности.
- `hysteresis` - защита от oscillation.
  Система требует повторного подтверждения сигналов на нескольких policy windows.
- `policy stability` - стабильность policy-решений.
  Грубо говоря, как редко policy отменяет, переигрывает или быстро откатывает свои же решения.

## 11. Orchestration и protocol

- `Transition orchestration` - исполнение переходов как управляемого, restart-safe процесса.
- `Cohort assembler` - собирает совместимые `SRU` в один cohort.
- `Placement gate` - проверяет, можно ли безопасно разложить target fragments по fault domains/racks/zones.
- `Budget gate` - проверяет, хватает ли сейчас допустимого IO/network budget и не мешает ли repair backlog.
- `Commit coordinator` - центральный координатор перехода.
  Он ведёт protocol `prepare -> verify -> metadata flip -> retire`.
- `Fallback planner` - решает, когда переход лучше отложить, а не форсировать.
- `Cleanup daemon` - убирает временные fragments, abandoned staging generations и retired layouts после grace period.
- `Prepare stage` / `prepare` - создание target layout в staging, резервирование ресурсов, запись progress/checksums.
- `Verify stage` / `verify` - проверка полноты fragments, корректности checksums, соблюдения placement и budget constraints.
- `Metadata flip` - атомарное переключение cohort на новый committed `generation_id`.
- `state := desired_state` - момент, когда после успешного flip текущий committed state становится равен ранее выбранному desired_state.
- `Retire stage` / `retire` - ленивое удаление старого layout после grace period и завершения активных readers/repair jobs.
- `Prepare/verify/flip/retire` - весь persisted control protocol перехода.
- `restart-safe` - протокол спроектирован так, чтобы переживать сбои координатора и перезапуски.
- `deferred` - переход отложен, обычно потому что не собрался cohort, не прошёл gate или не сошёлся debt check.
- `aborted` - переход прерван после старта протокола, authoritative layout не меняется.
- `retiring` - старый layout уже не authoritative, но ещё не удалён физически.
- `desired_state desync` / `Desired_state desync` - рассогласование внутри cohort, когда у разных units или у того же unit цель успела измениться.
- `mixed-desired_state cohort` - cohort, где units хотят разные target states.
  В `design_16` такой cohort запрещён.
- `grace period` - безопасный интервал, в течение которого старый layout ещё сохраняется после flip.

## 12. Paths: ingest, read, update, repair, migration

- `ingest` - запись новых данных в систему.
- `read path` - как система обслуживает чтения в разных states.
- `replica-first reads` - для горячих состояний чтение предпочитает реплики.
- `systematic EC path` - чтение данных напрямую из data fragments без decode, если нет отказа.
- `degraded read` - чтение при отказавшем fragment/node, когда нужен decode.
- `degraded-read latency` - задержка чтения именно в degraded режиме.
- `update` - изменение данных.
  В этом дизайне sealed units inline не переписываются.
- `mutable delta / ingest layer` - место, куда пишутся новые версии, пока не будет создан новый sealed unit.
- `repair` - восстановление отказавших fragments/replicas.
- `replica-assisted repair` - repair с опорой на replica component в hybrid state.
- `EC repair` - repair на базе erasure-coded fragments.
- `local repair` - repair с ограниченным числом локальных fragments, типичный плюс LRC.
- `migration` / `transition` - перенос unit между redundancy states.

## 13. Метрики и эксперименты

- `storage overhead` - сколько дополнительного места требует выбранная схема избыточности.
- `read latency` - задержка чтения.
- `write latency` - задержка записи.
- `repair traffic` - сетевой и дисковый трафик, возникающий во время восстановления.
- `repair duration` - длительность repair-операций.
- `recovery time` - время возврата системы в healthy state после отказа.
- `transition IO` - дисковая цена переходов.
- `transition network traffic` - сетевой трафик переходов.
- `queueing / waiting time` - сколько migration jobs ждут ресурсов или полного cohort.
- `transition usefulness` - доля переходов, которые реально принесли пользу и окупили `transition debt`.
- `state accuracy` - насколько текущий layout соответствует реальной температуре и стадии жизни данных.
- `fault tolerance` - способность переживать отказы.
- `fault tolerance / reliability proxies` - практические показатели надёжности вместо одной абстрактной цифры.
- `MTTDL` - mean time to data loss, стандартная proxy-метрика надёжности.
- `trace replay` - прогон реальных или синтетических access traces через модель системы.
- `lifecycle replay` - прогон сценариев постепенного охлаждения sealed units.
- `capacity-pressure sweep` - серия экспериментов по разным уровням заполненности.
- `repair-storm injection` - сценарий, где искусственно создаётся большой recovery/repair pressure.
- `placement sensitivity` - анализ чувствительности к ограничениям размещения.
- `transition accounting` - раздельный учёт цены стадий `prepare`, `flip`, `retire` и waiting time.
- `upload/download/delete/waiting time` - vocabulary из benchmarking framing для оценки storage systems.
- `fragment size` - размер fragments/chunks, влияющий на стоимость IO, queueing и rebuild.

## 14. Baselines и сравнения

- `3-way replication` - базовый baseline, где всё хранится в трёх репликах.
- `replication -> archival EC` - простой переход сразу из replication в архивный coded state без intermediate middle layer.
- `hot/cold` baseline - двухуровневая политика без тонких промежуточных состояний.
- `HSM` - здесь shorthand для простого heat-aware storage management baseline.

## 15. Роли cited systems/papers внутри дизайна

- `Azure` / `azure_ec_atc_2012` - даёт reference substrate: seal-then-encode, coordinator, metadata update, persisted progress.
- `Morph` / `morph_sosp_2024` - даёт lifecycle intuition: hybrid-first и convertible-middle pipeline.
- `ELECT` / `elect_fast_2024` - подсказывает group-level metadata, background transitions и hot-metadata/cold-data split.
- `ER-Store` / `er_store_scientific_programming_2021` - усиливает идею periodic reclassification и metadata-driven switching.
- `f4` / `f4_osdi_2014` - подтверждает важность controller/router separation и transparent migration.
- `HEART` / `heart_fast_2019` - добавляет infrastructure-aware reliability signal.
- `HSM` / `hsm_ieee_access_2024` - даёт простую policy-интуицию `heat + utilization`.
- `wide_lrc_fast_2023` - помогает обосновывать archival LRC через maintenance robustness, а не только locality.
- `convertible_codes_it_2022` и `lrc_convertible_arxiv_2023` - задают ограничения на то, когда EC-to-EC transition вообще можно считать дешёвым.
- `zebra_iwqos_2016` и `rapidraid_arxiv_2012` - напоминают, что migration path надо проектировать отдельно, а не считать бесплатным.
