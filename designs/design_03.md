# Design 03: policy-driven hybrid object storage

## Короткая идея
Построить объектное хранилище со stateful жизненным циклом: горячие объекты обслуживаются репликацией, промежуточные объекты проходят через гибридный режим `replica + EC`, а холодные переводятся в более экономичные `EC/LRC`-схемы. Переходы между режимами должны быть отдельной частью архитектуры с явными guard conditions, hysteresis и проверкой стоимости конверсии до смены схемы.

## Accent subset
Акценты этого варианта задают:

- `benchmarking_ec_object_storage_fgcs_2025` - метрики и экспериментальная рамка для object storage.
- `ec_store_icdcs_2018` - latency-aware access planner и control/data plane для EC-слоя.
- `f4_osdi_2014` - production-контекст warm layer и жизненный цикл данных.
- `identifying_hot_cold_icde_2013` - базовая формализация hot/cold classification.
- `lrc_convertible_arxiv_2023` - дешёвые EC-to-EC переходы для LRC.
- `rapidraid_arxiv_2012` - pipelined migration from replication to EC для archival.

## Учитываемый корпус
Вариант учитывает весь корпус `conspects/*.md` как общий контекст:

- обзор EC и redundancy transitioning: `ec_survey_tos_2024`, `azure_ec_atc_2012`, `xoring_elephants_arxiv_2013`, `wide_lrc_fast_2023`;
- гибридные схемы и lifecycle management: `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `morph_sosp_2024`, `elect_fast_2024`;
- temperature-aware policy и инфраструктурные сигналы: `hsm_ieee_access_2024`, `identifying_hot_cold_icde_2013`, `heart_fast_2019`, `zebra_iwqos_2016`;
- conversion / repair foundations: `convertible_codes_it_2022`, `lrc_convertible_arxiv_2023`, `rapidraid_arxiv_2012`, `wide_lrc_fast_2023`;
- measurement and benchmark framing: `benchmarking_ec_object_storage_fgcs_2025`, plus production baselines above.

## Проблема
Дипломная система должна одновременно закрыть четыре конфликта:

- горячие данные требуют низкой latency и простого write path, поэтому репликация остаётся полезной;
- холодные данные должны быть дешёвыми по storage overhead, поэтому EC/LRC нужен как целевой слой;
- переходы между схемами сами по себе стоят I/O, сети и CPU, и их нельзя считать бесплатными;
- выбор схемы зависит не только от температуры данных, но и от состояния кластера: заполненности дисков, доступного bandwidth и надежности групп хранения.

При этом policy должна работать на уровне объекта или stripe group, а исполняться на уровне chunks и failure domains. Иначе смешиваются логика выбора схемы и substrate, на котором эта схема реально раскладывается.

## Архитектура компонентов
Архитектура строится как control plane поверх object storage data plane.

- `Telemetry collector` собирает access history, read/write intensity, object age, disk utilization и failure / health signals.
- `Heat classifier` переводит историю обращений в temperature class или demand rank для объекта, bucket или stripe group.
- `Policy engine` выбирает целевой режим хранения: replication, hybrid `replica + EC`, plain EC, LRC или wide LRC.
- `Placement manager` раскладывает data/parity/replicas по failure domains и учитывает rack / node / group constraints.
- `Access planner` строит план чтения для EC-объектов и минимизирует latency от slow chunks и stragglers.
- `Transition manager` исполняет conversion как асинхронный pipeline, а не как блокирующий full rewrite.
- `Repair service` обслуживает rebuild, degraded reads и recovery после отказов.
- `Metadata service` хранит текущий redundancy mode, допустимые target modes и состояние незавершённых переходов.

## Substrate и granularity
Чтобы не смешивать уровни abstraction, в этой архитектуре logical state и physical substrate разделены.

- `Logical state` у объекта один из четырёх: `hot`, `warm`, `cold`, `archive`; это policy-level состояния, а не отдельные носители.
- `Physical substrate` - это replicas, stripes, parity chunks и placement domains, на которые раскладывается выбранное состояние.
- `Policy engine` принимает решение на уровне объекта, bucket или stripe group, но не делает chunk-by-chunk selection.
- `Placement manager`, `Access planner` и `Repair service` работают на уровне stripe/chunk и уже исполняют выбранный state.
- `Transition manager` связывает оба уровня: он готовит target layout, но не меняет policy state до atomic metadata commit.

## Data layout
Базовый layout организуется по ступеням жизненного цикла.

- `Hot tier`: 3-way replication для объектов с высокой частотой доступа и высокой write sensitivity.
- `Warm tier`: hybrid layout `Hy(1, EC(k,n))` или аналогичный вариант, где реплика обеспечивает быстрый критический путь, а EC stripe уже готов для дешёвого перехода.
- `Cold tier`: EC/LRC-слой с параметрами, выбранными под repair cost и storage efficiency, когда demand уже устойчиво ниже warm threshold.
- `Archive tier`: более широкие EC/LRC конфигурации для объектов, которые долго остаются ниже archive threshold и уже не оправдывают частый fast-path.

Layout-ограничения:

- data и parity нельзя размещать в одном fault domain;
- для LRC local groups должны сохранять возможность локального repair;
- для migration-friendly схем желательно заранее подбирать target codes так, чтобы transition cost был приемлемым;
- metadata о схеме и стадии жизни объекта хранится отдельно от самих chunks.

Границы между tier'ами задаются не только температурой, но и временем удержания в состоянии:

- `hot -> warm`: объект должен несколько окон подряд оставаться ниже hot threshold и одновременно проходить по capacity/reliability guard;
- `warm -> cold`: объект должен оставаться ниже cold threshold дольше, чем требуется для перехода hot -> warm, и не иметь свежих write spikes;
- `cold -> archive`: объект должен стабильно находиться в самом нижнем хвосте demand distribution, где дополнительная savings от wider EC/LRC перекрывает extra encode cost.

## Data flow
Поток данных устроен как жизненный цикл объекта.

1. Новая запись приходит в hot tier и получает replicated placement.
2. Если объект остаётся горячим, он продолжает обслуживаться replication path без смены authoritative layout.
3. Когда объект остывает, transition manager создаёт shadow target в warm hybrid layout, но source остаётся единственным authoritative copy до atomic metadata commit.
4. После завершения warm stage policy может перейти в plain EC/LRC, если объект и дальше проходит по cold guard conditions.
5. Для архивных объектов применяются более широкие cold schemas и pipelined archival conversion, если archive target дешевле удержания в cold.
6. При чтении hot и warm объектов используется replica path, а для cold и archive - EC-aware access planner, который минимизирует число читаемых chunks и влияние stragglers.
7. При отказе repair service восстанавливает недостающие chunks в рамках текущего layout.

Write/update semantics:

- Клиентская запись всегда идёт в текущий authoritative state, а не в частично собранный target layout.
- Если объект обновляется во время migration, незавершённый target считается stale и пересобирается с новой версии, чтобы не смешивать версии внутри одного объекта.
- Partial chunk exposure для читателя не допускается: пока metadata commit не завершён, target layout invisible.

State machine and transitions:

- `hot -> warm`: триггером служит устойчивое падение demand и прохождение capacity guard; инициатором выступает policy engine, исполнитель - transition manager.
- `warm -> cold`: триггером служит дальнейшее охлаждение объекта и положительный conversion benefit после учёта repair cost и placement cost.
- `cold -> archive`: триггером служит очень низкий demand на длинном окне и допустимость более широкого EC/LRC layout.
- `cold/warm -> hot`: триггером служит возврат объекта в горячую зону; policy запрещает дожимать старую migration, если объект уже снова активно пишется.
- `failed conversion -> source stays active`: при сбое encode, copy или verification target отбрасывается, а metadata state не меняется.

## Policy layer
Policy layer здесь не бинарный, а многофакторный.

- Температура данных оценивается по истории обращений на фиксированном окне, как в hot/cold literature.
- Decision engine работает по ordered guard rules: сначала проверяется, не должен ли объект остаться в current state из-за recent writes, access spike или незавершённой migration; затем проверяется наличие допустимого target layout по placement, reliability и capacity; затем сравнивается conversion benefit с conversion cost; только после этого выбирается следующий state.
- Границы между режимами задаются не только temperature class, но и глобальной заполненностью дисков.
- Если disk group показывает неблагоприятный reliability profile, policy может не переводить туда самые чувствительные cold stripes.
- Для demand-skewed workloads policy может выбирать разные EC parameters для разных tiers, а не один глобальный code.
- Переход в EC разрешается только тогда, когда expected savings превышают conversion cost.
- Для EC-to-EC переходов policy опирается на convertible-code style constraints, чтобы не выбирать заведомо дорогой target.
- Для archival переводов policy может использовать pipelined migration path, если он дешевле центрального re-encode.

## Метрики и план оценки
Оценка должна быть построена в духе object-storage benchmarking и migration-aware evaluation.

- `storage overhead` по tier'ам и по всему corpus of objects;
- `upload latency`, `download latency`, `delete latency`;
- `waiting time` на переходы и фоновые конверсии;
- `repair latency` и `repair traffic`;
- `network traffic` при миграции и реконструкции;
- `degraded-read latency`;
- `availability / fault tolerance` на моделируемых отказах;
- `fraction of objects matched to their actual temperature`;
- `transition abort / rollback rate`;
- `conversion efficiency`: сколько I/O и сети съел переход относительно ожидаемой экономии.

План сравнения:

- против 3-way replication;
- против static RS / LRC;
- против simple hot/cold split без многошагового pipeline;
- против hybrid storage без explicit conversion-cost model.

## Trade-offs, risks, assumptions
- Более горячий слой улучшает latency, но повышает storage overhead.
- Более холодный слой экономит место, но делает repair и degraded reads дороже.
- Слишком частые переходы могут съесть выигрыш от экономии storage.
- Слишком грубая temperature policy может неправильно классифицировать объекты и ухудшить performance.
- Конверсионно-ориентированные коды и layouts помогают, но требуют заранее допустимых target configurations.
- В реальном кластере placement и failure domains могут ограничить допустимые схемы сильнее, чем сама алгебра кода.
- Объектные обновления здесь трактуются как rewrite текущего authoritative state; система не предполагает in-place partial mutation внутри уже перекодируемого объекта.
- Архитектура предполагает, что monitoring и background conversion доступны в runtime, а не только офлайн.

## Source map
Direct baselines:

- `benchmarking_ec_object_storage_fgcs_2025`: задаёт метрики `upload/download/delete/waiting time`, fault tolerance и testbed-логику для object storage.
- `ec_store_icdcs_2018`: даёт control plane для latency-aware EC access planning, chunk movement и statistics-driven decisions.
- `f4_osdi_2014`: подтверждает наличие warm tier как отдельной производственной стадии между hot и cold.
- `identifying_hot_cold_icde_2013`: даёт базовую классификацию hot/cold и признаки для temperature metric.
- `lrc_convertible_arxiv_2023`: обосновывает дешёвые EC-to-EC transitions для cold / archive tiers.
- `rapidraid_arxiv_2012`: показывает, как удешевить перевод replicated data в EC через pipelined archival.
- `ec_survey_tos_2024`: задаёт общий словарь EC trade-off, repair/update overhead и redundancy transitioning.
- `azure_ec_atc_2012`: подтверждает поток `replicate first, EC later` и важность cheap reconstruction.
- `xoring_elephants_arxiv_2013`: даёт locality-based repair baseline для cold EC.
- `wide_lrc_fast_2023`: показывает, что cold LRC choices зависят от placement, locality и maintenance robustness.
- `er_store_scientific_programming_2021`: поддерживает трёхуровневую policy `hot / warm / cold` и temperature conversion table.
- `hyres_arxiv_2025`: даёт formal hybrid redundancy baseline для сравнения storage cost, file loss probability и repair traffic.
- `morph_sosp_2024`: объясняет file-lifetime pipeline и дешёвый first transition от hybrid redundancy к EC.
- `elect_fast_2024`: подтверждает selective replication-to-EC transitioning на уровне data strata и background offloading.
- `hsm_ieee_access_2024`: добавляет global disk utilization как второй управляющий сигнал к temperature-aware policy.
- `zebra_iwqos_2016`: даёт demand-aware tiering и формальную настройку EC parameters по tiers.
- `convertible_codes_it_2022`: вводит access cost как формальную метрику conversion.
- `heart_fast_2019`: добавляет infrastructure reliability as a gating signal for redundancy selection.

Inferred synthesis from several sources:

- `warm` as explicit hybrid staging state: соединяет `ER-Store`, `Morph` и `HyRES`, но в корпусе нет одного источника, который бы задавал ровно такую object-storage реализацию.
- `decision engine` with ordered guards and hysteresis: собран из `HSM`, `Identifying hot/cold`, `ER-Store` и `Heart`, а не взят из одной работы целиком.
- `stateful transition orchestration` with atomic metadata commit and rollback-safe shadow target: это композиция идей про first-class transitions, migration cost и background offloading.
