# Glossary for `design_17`

Этот файл расшифровывает основные понятия, сущности и термины из [design_17.md](./design_17.md).

## 1. Общая идея и framing

- `design_17` - вариант дипломной архитектуры, где lifecycle-controller управляет схемой избыточности на уровне `sealed extents`, а сами переходы исполняются только через явный stripe-level protocol.
- `NIR-aligned extent lifecycle controller` - краткое имя варианта.
  Оно подчёркивает, что дизайн намеренно выровнен с НИР по пайплайну состояний, температурной логике и роли заполненности дисков.
- `study-plan-driven` - режим проектирования, где структура варианта выводится из кластеров чтения в `study-plan.md`, а не из произвольного набора идей.
- `core -> policy/transitions/orchestration -> evaluation` - основной каркас рассуждения в `design_17`.
  Сначала фиксируется substrate и pipeline состояний, затем правила выбора и допустимые переходы, затем исполнимый protocol, и только после этого метрики и план оценки.
- `NIR-match` - приоритет совпадения с логикой НИР над архитектурной экзотикой.
  В `design_17` это означает сохранение связки `temperature + disk utilization + multi-step pipeline + safe transition protocol`.
- `operational mapping` - единственный рабочий контекст, в котором интерпретируется весь дизайн.
  Здесь это `Azure-like stream/object storage` с `sealed extents` как lifecycle-единицей после ingest.
- `one substrate` / `single substrate` - принцип, по которому у варианта нет конкурирующих runtime-моделей.
  ELECT, f4, ER-Store и Cocytus используются как источники ограничений и vocabulary, но не как альтернативные substrate.
- `lifecycle-controller` - логика, которая определяет, в каком redundancy state должен жить каждый `SRU`, и переводит его туда только через проверяемую оркестрацию.
- `evaluation lens` - способ смотреть на систему не только как на storage optimization, но и как на объект с transition cost, stalls, aborts, stability и protocol overhead.
- `safe transition protocol` - обязательная последовательность `prepare -> verify -> metadata flip -> retire`, через которую проходит любой committed переход.

## 2. Базовые сущности и metadata

- `sealed extent` - базовая immutable единица данных после завершения активной записи.
  Именно с этого момента данные становятся объектом lifecycle policy.
- `sealed prefix` - уже закрытая часть логического объекта, состоящая из одного или нескольких immutable sealed extents.
- `active tail` - текущая mutable часть логического объекта, в которую ещё разрешён `Append`.
- `object as sealed prefix + active tail` - базовая пользовательская модель данных в `design_17`.
  Пользователь работает с одним логическим объектом, а система внутри делит его на уже sealed часть и текущий mutable хвост.
- `SRU` / `Sealed Redundancy Unit` - policy-unit дизайна.
  В `design_17` один `SRU` равен одному `sealed extent` фиксированного size-class.
- `policy unit` - минимальная единица, для которой policy вычисляет `desired_state`.
  Здесь это всегда один `SRU`.
- `stripe` - execution-unit перехода и кодовая группа.
  Это группа совместимых `SRU`, которые вместе образуют один coded layout и коммитятся атомарно как одна `generation`.
- `execution unit` - в упрощённой терминологии `design_17` то же, что и `stripe`.
- `parity fragments` - производные фрагменты избыточности для конкретного stripe.
  Они не являются отдельными lifecycle-units и не участвуют в policy сами по себе.
- `state` - текущий committed redundancy state конкретного `SRU`.
- `desired_state` - состояние, которое policy считает желательным, но которое ещё может не быть материализовано.
- `current_state` - фактический текущий state unit в момент policy- или orchestration-решения.
- `policy_epoch` - версия policy-решения.
  Она входит в ключ stripe assembly и помогает отличать устаревшие решения от актуальных.
- `state_epoch` - версия committed состояния.
  Меняется, когда authoritative layout реально переключается на новый state.
- `generation_id` - идентификатор конкретной physical generation layout.
  Нужен, чтобы различать старую, staging и новую committed генерации.
- `pending_job` - ссылка на текущую активную transition/repair/promotion работу по unit или stripe.
- `abort_reason` - причина, по которой переход был остановлен до commit.
- `waiting_window` - максимальный интервал, в течение которого orchestration пытается добрать полный stripe до того, как сочтёт переход отложенным или неудачным.
- `waiting_deadline` - дедлайн, до которого системе разрешено ждать наполнения stripe.
- `objects` - object-level registry по `object_id`.
  Хранит пользовательские metadata, version pointer, deletion state и ссылку на current active tail.
- `extents` - extent-level registry по `extent_id`.
  Хранит принадлежность к объекту, logical offset range, seal status и size/checksum attributes.
- `object_extent_index` - ordered index отображения логического объекта на последовательность extents.
  Он нужен, чтобы `ReadRange(object_id, offset, length)` резолвился в логических координатах объекта, а не через знание `SRU` или coded fragments.
- `sru_registry` - metadata-реестр по каждому `SRU`: state, desired_state, epochs, generation и operational flags.
- `stripe_registry` - metadata-реестр по stripe-объектам, их составу, статусу протокола и generations.
- `transition_registry` - реестр допустимых переходов и их operational parameters.
- `generation_registry` - registry по committed/staging/retiring generations.
  Хранит manifests, placement version, checksum domain и lifecycle status конкретного layout generation.
- `placement_records` - metadata о физическом размещении replicas/fragments по node/rack/fault/maintenance domains.
- `metadata / control plane` - слой, который хранит все реестры и оркестрационные состояния, но не выполняет сам перенос пользовательских данных.
- `hot replicated control-plane` - assumption, что control metadata хранится на надёжном и горячем replicated слое, а не внутри холодных EC-layout.
- `metadata layer` - физическая реализация control plane как отдельного strongly-consistent metadata store.
  Он хранит namespace, mappings, transition state и placement metadata, но не хранит сами большие payload-данные.
- `metadata nodes` - отдельные узлы quorum metadata layer.
  Для `design_17` естественный deployment-профиль - `3` или `5` metadata-нод.
- `quorum metadata deployment` - модель, в которой metadata переживает отказ отдельной ноды за счёт consensus/quorum semantics.
- `authoritative truth` - каноническая правда о том, какой object mapping, `generation_id` и redundancy state сейчас committed.
  В `design_17` source of truth для этого находится именно в metadata layer, а не на storage nodes.
- `atomic metadata flip` - атомарное обновление authoritative metadata с переводом stripe на новый committed generation.
- `target metadata architecture` - целевой вариант metadata layer для полной архитектуры.
  Это replicated quorum-based control plane, а не локальная структура данных внутри одного процесса.
- `MVP metadata layer` - упрощённый вариант для первой кодовой реализации.
  Это single-node in-memory registries без настоящего consensus/quorum, достаточные для проверки lifecycle logic и transition protocol.

## 3. Reference substrate и операциональная модель

- `Azure-like stream/object storage` - reference substrate дизайна.
  Это объектно-потоковый контекст с seal-then-recode логикой, background materialization и metadata-controlled layout switch.
- `extent-level stream substrate` - уточнение operational mapping.
  Дизайн моделирует систему на уровне extents, а не файлов, объектов высокого уровня или произвольных block groups.
- `pre-seal` - фаза, где данные ещё находятся в mutable ingest path и не участвуют в lifecycle policy.
- `post-seal` - фаза, где данные уже стали immutable `SRU` и могут двигаться по pipeline состояний.
- `immutable after sealing` - одно из ключевых допущений дизайна.
  После sealing unit больше не обновляется in-place; новые версии уходят в новый ingest path.
- `extent semantics` - модель, где жизненный цикл, размещение, перекодировка и repair объясняются через завершённые extent-единицы.
- `fault domain` - домен отказа, который система учитывает при раскладке fragments.
- `rack domain` - уровень размещения, на котором запрещается опасная коллокация fragments одной stripe.
- `maintenance zone` - operational domain, который особенно важен для раскладки локальных групп в LRC-состояниях.
- `placement diversity` - требуемое разнообразие размещения по node/rack/fault/maintenance domains.
  Это assumption дизайна и одновременно обязательное условие для `placement_gate`.

## 4. Состояния lifecycle pipeline

- `R3-Active` - горячее пред-политическое состояние с тремя репликами.
  Здесь обслуживается ingest; само это состояние в `design_17` находится вне post-seal lifecycle policy.
- `pre-seal stage` - то же, что `R3-Active` как рабочая область до появления `SRU`.
- `R3-Sealed` / `R3` - первый post-seal state.
  После sealing extent становится `SRU` в pure replicated layout и ещё не обязан немедленно входить в coded stripe.
- `Hy(1,RS(6,3))` - второй post-seal state.
  Он означает гибридный layout: у данных сохраняется одна replica component и одновременно материализуется EC-компонент, связанный с `RS(6,3)`.
- `RS(6,3)` - чистый Reed-Solomon state с 6 data fragments и 3 parity fragments.
- `LRC(12,2,2)` - более холодный locally repairable state с 12 data fragments, 2 global parity и 2 local groups.
- `LRC(24,4,2)` - ещё более холодный и более широкий archival LRC-state.
- `wide LRC` - shorthand для последнего холодного состояния `LRC(24,4,2)`, где растёт ширина stripe и приоритет storage efficiency.
- `post-seal pipeline` - основной cooling path после sealing:
  `R3 -> Hy(1,RS(6,3)) -> RS(6,3) -> LRC(12,2,2) -> LRC(24,4,2)`.
- `adjacent transition graph` - правило, что policy может выбирать только соседний шаг по заранее зафиксированному графу переходов.
- `reheating` - ситуация, когда данные, уже охлаждённые в `LRC`, снова требуют более горячего режима.
- `promote-copy` - единственный допустимый способ reheating.
  Система создаёт новый hotter layout как отдельную materialization-задачу, а не пытается делать in-place обратную конверсию committed stripe.
- `authoritative layout` - layout, который в текущий момент считается главным для reads, repair и metadata truth.
- `staging layout` - ещё не committed target layout, построенный на этапе `prepare`.
- `retired layout` - старый layout после успешного `metadata flip`, который ещё может временно существовать до завершения `retire`.

## 5. Нотация family и code pipeline

- `family/pipeline notation` - способ коротко описывать последовательность совместимых redundancy layouts и допустимые переходы между ними.
  В `design_17` family не оформлено как отдельный `family_id`, но pipeline всё равно играет роль фиксированного reference family.
- `R3 -> Hy -> RS -> LRC -> wide LRC` - словесное имя для пайплайна `design_17`.
- `RS(k,r)` - нормализованная нотация Reed-Solomon в `design_17`.
  Первый параметр - число data fragments `k`, второй - число parity fragments `r`.
- `LRC(k,g,l)` - нормализованная нотация LRC в `design_17`.
  Здесь `k` - число data fragments, `g` - число global parity, `l` - число local groups.
- `Hy(1,RS(k,r))` - shorthand для hybrid state, где replica component имеет кратность 1, а EC-компонент совместим с указанным `RS(k,r)`.
- `NIR notation` - запись из НИР вида `Hy(1, RS(6,9)) -> RS(6,9) -> LRC(12,2,2) -> LRC(24,4,2)`.
- `notation normalization` - пояснение, как дизайн согласует свою запись с НИР.
  В `design_17` `RS(6,3)` трактуется как тот же смысловой кодовый шаг, который в НИР был записан как `RS(6,9)`, где второй параметр фактически интерпретировался как полная ширина `n=9`, а не как число parity.
- `same semantic pipeline` - тезис, что различие между `RS(6,9)` и `RS(6,3)` в документах относится к нотации, а не к смене архитектурного смысла pipeline.
- `cheap early transition` - ранний переход `Hy -> RS`, который сохраняет логику НИР о дешёвом выходе из гибридного состояния.
- `RS -> LRC` - самый спорный и потенциально дорогой участок пайплайна.
  Поэтому в `design_17` он дополнительно защищён debt-check и budget gates.
- `stripe_width` - сколько `SRU` нужно для формирования stripe данного state.
  В `design_17` это 6 для `RS(6,3)`, 12 для `LRC(12,2,2)` и 24 для `LRC(24,4,2)`.
- `fragment_size_class` - класс размера fragments/chunks.
  Он входит в ключ совместимости stripe и участвует в sensitivity sweep.
- `placement_class` - класс ограничений размещения, с которым unit может быть включён в stripe.
- `size-class` - фиксированный класс размера `SRU`.
  Для v1 симулятора в дизайне предлагается использовать, например, 1 GiB.
- `stripe as coded layout` - набор data/parity fragments, принадлежащих одному coded layout.
- `SRU as data unit` - инженерное упрощение `design_17`, в котором один `SRU` трактуется как один fixed-size data block внутри stripe.
- `R3 as single-SRU state` - важное уточнение модели.
  `R3` не требует stripe assembly и существует для одного `SRU`; stripe нужен, начиная с `Hy`, `RS` и `LRC`.
- `local group` - локальная группа внутри LRC-layout, для которой возможен более дешёвый local repair.

## 6. Компоненты архитектуры

- `Decision engine` - часть control plane, которая вычисляет `desired_state` для каждого `SRU`.
- `signal priority` - фиксированный приоритет сигналов в decision engine:
  `reliability/repair veto -> temperature class -> utilization accelerator -> transition debt check`.
- `Storage nodes / data plane` - слой, где реально лежат реплики и coded fragments, и где выполняются materialization, repair и migration I/O.
- `replica ingest workers` - исполнители горячего replicated ingest path.
- `hybrid materializer` - worker или подсистема, которая строит `Hy(1,RS(6,3))` layout как первый coded step после `R3`.
- `RS workers` - data-plane исполнители для materialization или recoding в `RS(6,3)`.
- `LRC workers` - data-plane исполнители для materialization или recoding в `LRC` states.
- `repair workers` - подсистема восстановления после отказов.
  В `design_17` repair имеет более высокий приоритет, чем migration.
- `Temperature analysis` - подсистема batch-оценки температуры данных.
- `inline-path не нагружается` - принцип, что расчёт температуры выведен из критического пути клиентского доступа.
- `stripe_assembler` - компонент orchestration, который собирает совместимые `SRU` в один stripe.
- `commit_coordinator` - координатор, который ведёт stripe через стадии `prepare -> verify -> metadata flip -> retire`.
- `cleanup_daemon` - фоновой исполнитель, который удаляет abandoned staging artefacts и retired layouts после grace period.

## 7. Data flow и operational paths

- `ingest` - путь записи новых данных в `R3-Active`.
- `sealing` - момент завершения mutable жизни extent, после которого создаётся `SRU`.
- `first post-seal commit` - переход `R3-Active -> R3`.
  Он не требует coded materialization: extent просто становится immutable `SRU` и регистрируется в metadata как replicated unit.
- `Seal(object_id)` / `Close(object_id)` - внешняя операция, которая завершает текущий `active tail`, но не обязана навсегда закрывать весь логический объект.
- `initial materialization` - построение первого coded layout `Hy(1,RS(6,3))` после того, как `SRU` уже успел побыть в `R3`.
- `metadata flip after initial materialization` - commit-точка, после которой `SRU` официально считается принадлежащим stripe в состоянии `Hy(1,RS(6,3))`.
- `read path` - логика чтения, которая зависит от текущего state.
- `replica-first` - для `R3` и `Hy` чтение предпочитает replica component.
- `systematic-read` - чтение данных напрямую из data fragments без полного decode, когда кодовый layout здоров.
- `degraded-read` - чтение в условиях потери fragment/node, когда нужен decode или local-repair path.
- `decode path` - путь чтения или repair через полноценное восстановление из кодового layout.
- `local-repair path` - более дешёвый путь восстановления в LRC, когда отказ локален и может быть закрыт внутри local group.
- `update` - изменение данных как пользовательское действие.
  Для `SRU` inline update запрещён.
- `mutable ingest path` - место, куда пишутся новые версии данных вместо изменения уже sealed `SRU`.
- `append after seal` - допустим на уровне логического объекта, но не на уровне уже sealed extent.
  После sealing старого extent система просто открывает новый active tail.
- `rewrite sealed bytes` - недопустим как in-place операция.
  Если нужно изменить уже записанные байты, это оформляется как новая версия объекта или отдельный rewrite path.
- `obsolescence/GC` - этап, когда старый `SRU` после появления новой версии со временем может быть собран garbage collection.
- `repair` - восстановление утраченных replicas/fragments.
- `cheapest repair path` - правило, что сначала используется самый дешёвый доступный способ восстановления для текущего state, и только потом full decode.
- `full decode` - наиболее дорогой repair/read path, который используется, когда локальные или более дешёвые варианты недоступны.
- `migration` / `transition` - фоновые операции смены redundancy state.

## 8. Temperature model и state classification

- `temperature model` - формальный контур, по которому `design_17` решает, горячи или холодны данные.
- `H=N/T` - базовая формула температуры из НИР и HSM framing.
  Здесь `N` - число обращений на окне, `T` - длительность окна наблюдения.
- `policy window` - временное окно, на котором измеряется температура и пересчитывается policy.
- `EWMA` - экспоненциальное сглаживание, применяемое поверх измерений температуры.
- `heat_ewma` - сглаженная температура, которая напрямую подаётся в decision engine.
- `hysteresis` - защита от частых колебаний состояний.
  В `design_17` policy требует устойчивого подтверждения сигнала на нескольких окнах.
- `temperature class` - дискретный класс температуры, а не голое непрерывное число.
- `hot`, `warm`, `cold`, `deep-cold` - четыре температурных класса в `design_17`.
- `lifetime_stage` - дополнительный сигнал о стадии жизни данных.
  Он помогает отличать просто новые данные от действительно остывших.
- `global_utilization` - глобальная заполненность хранилища как отдельный управляющий сигнал.
- `utilization bands` - диапазоны `<=30%`, `30-60%`, `>60%`, которые используются как accelerator для adjacent cooling step.
- `repair_pressure` - текущая нагрузка от recovery/repair, которая может запрещать новые cooling transitions.
- `reliability_band` - дискретизированное представление текущего состояния надёжности инфраструктуры.
- `safe band` - область значений reliability, внутри которой downgrade считается допустимым.
- `batch-wise policy` - assumption, что policy работает периодически по окнам, а не on every request.
- `degraded-read SLA` - operational threshold по задержке degraded reads.
  Его превышение может стать отдельным promotion trigger.

## 9. Policy rules и safety gates

- `scheme selection` - выбор следующего состояния хранения.
  В `design_17` policy выбирает только соседнее состояние из графа переходов.
- `arbitrary jumps forbidden` - запрет на перескоки через pipeline.
  Например, policy не должна сразу переводить `Hy` в `LRC(24,4,2)`.
- `cooling trigger` - условие охлаждения:
  два подряд policy windows ниже нужного порога и отсутствие veto.
- `promotion trigger` - условие reheating:
  два окна выше hot-threshold или превышение degraded-read SLA.
- `utilization accelerator` - модификатор policy, который позволяет ускорить cooling под давлением заполненности.
  Важное ограничение: он может ускорять только один adjacent step и не может ломать граф переходов.
- `veto` - сильный стоп-фактор, который не даёт policy инициировать cooling, даже если температура низкая.
- `reliability/repair veto` - верхний приоритет в decision engine.
  Если инфраструктура ненадёжна или repair backlog слишком велик, остальные сигналы уже не рассматриваются как разрешение на downgrade.
- `transition debt` - стоимость самого перехода: `prepare + network + waiting + repair-interference`.
- `transition debt check` - проверка, что ожидаемая экономия от перехода действительно окупает этот долг.
- `H_eval` - горизонт оценки, на котором сравниваются будущая экономия и цена перехода.
- `repair-interference` - вклад перехода в ухудшение repair-ситуации или конкуренцию за ресурсы с recovery jobs.
- `I/O change threshold` - дополнительный порог для перехода `RS -> LRC`, вдохновлённый НИР-логикой о допустимом изменении I/O-цены.
- `reliability_gate` - hard gate, запрещающий downgrade вне safe reliability band.
- `repair_gate` - hard gate, запрещающий downgrade при backlog выше лимита.
- `stripe_gate` - правило, что partial stripe не может быть committed.
- `placement_gate` - проверка, что target layout соблюдает ограничения по node/rack/fault/maintenance domains.
- `budget_gate` - проверка, что transition укладывается в отдельный IO/network quota.
- `transition_budget` - выделенный budget на migration/transition jobs.
  Это ограничение защищает foreground workload и repair path от агрессивной фоновой перекодировки.
- `desync_gate` - правило обработки рассогласований `desired_state`.
  До `prepare` stripe пересобирается, после `prepare` переход abortится.
- `adjacency` - свойство графа переходов, по которому каждому state разрешён только фиксированный набор соседей.
- `downgrade` - переход в более холодное и обычно более экономичное состояние.
- `promotion` - переход в более горячее состояние через `promote-copy`.

## 10. Orchestration protocol

- `Transition orchestration` - слой исполнения переходов как контролируемого и наблюдаемого протокола.
- `persisted state machine` - ключевое свойство протокола в `design_17`.
  Стадии перехода и их промежуточные результаты явно отражены в metadata, а не держатся только в оперативном состоянии воркеров.
- `stripe compatibility key` - правило, по которому `stripe_assembler` набирает stripe:
  `{current_state, desired_state, fragment_size_class, placement_class, policy_epoch}`.
- `prepare` - стадия, на которой записываются target fragments и progress journal.
- `progress journal` - зафиксированная информация о ходе materialization, достаточная для проверки и cleanup.
- `verify` - стадия проверки completeness, checksum correctness, placement constraints и budget compliance.
- `metadata flip` - атомарное переключение всего stripe на новый `generation_id`.
  Именно после этой стадии новый layout становится authoritative.
- `retire` - стадия удаления старого layout после grace period.
- `grace period` - безопасный интервал после flip, когда старый layout ещё сохраняется.
- `abort` - остановка перехода до commit.
  В этом случае authoritative layout не меняется.
- `cleanup` - удаление временных или частично построенных artefacts после `abort` либо после завершения `retire`.
- `abort + cleanup` - типовая реакция на ошибку до `metadata flip`.
- `partial stripe` - stripe, который не набрал полный требуемый состав.
  В `design_17` такой stripe может ждать, но не может коммититься.
- `desync before prepare` - случай, когда цели внутри stripe разошлись ещё до materialization.
  Тогда stripe пересобирается.
- `desync after prepare` - случай, когда `desired_state` изменился уже после начала materialization.
  Тогда переход abortится, чтобы не коммитить устаревший план.
- `rollback/cleanup semantics` - общая идея, что неуспешный переход не должен менять authoritative truth и должен оставлять систему в чистом состоянии.

## 11. Метрики и план оценки

- `storage overhead` - дополнительный объём хранения относительно полезных данных.
- `read/write latency hot path` - задержка клиентских операций в горячем режиме.
- `degraded-read latency` - задержка чтения при отказе fragments или nodes.
- `repair traffic/time` - стоимость и длительность восстановлений.
- `transition IO` - дисковая цена transition jobs.
- `transition network` - сетевой трафик, создаваемый переходами.
- `state accuracy` - насколько выбранный state соответствует фактической температуре и operational context данных.
- `policy stability` - насколько редко policy дёргает состояния, отменяет решения или создаёт oscillation.
- `fault-tolerance proxy` - практические показатели устойчивости к отказам вместо одной абстрактной метрики.
- `stripe_wait_time` - сколько времени unit или stripe ждёт до начала commit-ready transition.
- `stripe_fill_rate` - скорость и успешность набора полного stripe.
- `abort_rate` - доля переходов, завершившихся abort.
- `flip_retry_rate` - частота повторных попыток на commit-стадии.
- `cleanup_lag` - сколько времени старые или временные layout artefacts живут до фактической очистки.
- `time_in_state` - длительность пребывания данных в конкретном redundancy state.
- `promotion_penalty` - цена reheating-перехода обратно в более горячий layout.
- `sensitivity sweep` - серия экспериментов, где варьируются operational parameters, а не только workload.
- `stripe_width`, `waiting_window`, `fragment_size_class`, `transition_budget`, `utilization thresholds`, `hysteresis width` - основные параметры чувствительности в `design_17`.
- `trace replay` - прогон hot/warm/cold/deep-cold access traces через decision + simulator loop.
- `utilization sweep` - серия экспериментов по разным уровням заполненности и pressure.
- `failure/repair storm injection` - сценарии, где системе искусственно создают тяжёлую recovery-нагрузку.
- `topology sensitivity` - проверка поведения на перекосах racks, maintenance events и других topology effects.
- `protocol stress` - сценарии с desync, partial stripe, abort/retry и прочими отказами именно orchestration-логики.

## 12. Baselines и boundary prototype/simulator

- `3x replication only` - baseline, где все данные остаются в трёх репликах и никакого lifecycle pipeline нет.
- `static RS only` - baseline, где используется один фиксированный RS-layout без температурного управления.
- `simple hot/cold (HSM-like) without multi-step pipeline` - baseline с грубым двуклассным разделением и без промежуточных состояний `Hy -> RS -> LRC`.
- `hybrid without orchestration gates` - baseline, который проверяет, что дают именно safety gates и protocol discipline, а не только выбор схем.
- `same pipeline but all EC transitions as full re-encode` - baseline, где тот же pipeline сохраняется, но без попытки bounded/structured transition cost.
- `decision + control protocol prototype` - то, что действительно входит в реализацию v1.
  Прототипируется логика выбора состояний и исполнения transition protocol.
- `trace-driven discrete-event extent simulator` - симулятор, который моделирует extent-level lifecycle, transitions, failures и topology во времени.
- `prototype/simulator boundary` - явная граница между тем, что диплом реально реализует, и тем, что оставляет за пределами v1.
- `not a full filesystem/object store` - в рамки диплома не входит создание полноценной промышленной ФС или полного object storage runtime.
- `no low-level codec optimization` - в рамки диплома также не входит низкоуровневая оптимизация RS/LRC-кодеков.
- `Azure-like extent semantics for v1` - operational assumption симулятора.
  Он должен воспроизводить именно extent-level semantics, а не произвольную абстрактную storage model.
- `failure/topology scenarios` - управляемые сценарии отказов и ограничений размещения, которые подаются в симулятор.

## 13. Роли referenced systems and papers внутри дизайна

- `Morph` / `morph_sosp_2024` - даёт hybrid-first lifecycle, дешёвый ранний переход и transcode-aware pipeline intuition.
- `HSM` / `hsm_ieee_access_2024` - даёт формулу `H=N/T`, utilization bands и общую heat-aware policy intuition.
- `Azure` / `azure_ec_atc_2012` - задаёт reference substrate с sealed extents, background EC и metadata-controlled switch после verify.
- `convertible_codes_it_2022` - даёт vocabulary для conversion/access cost и помогает обосновывать, что не каждый переход выгоден.
- `lrc_convertible_arxiv_2023` - ограничивает optimism вокруг LRC-конверсий и напоминает о трудности locality-preserving transitions.
- `ER-Store` / `er_store_scientific_programming_2021` - усиливает идею periodic reclassification и metadata-driven switching.
- `HyRes` / `hyres_arxiv_2025` - поддерживает vocabulary по trade-off между storage, repair и reliability.
- `Zebra` / `zebra_iwqos_2016` - даёт framing bounded migration и tiering по нескольким классам данных.
- `RapidRAID` / `rapidraid_arxiv_2012` - подсказывает смотреть на migration path как на отдельный оптимизируемый объект.
- `EAR` / `tpds17_ear_2017` - подчёркивает важность topology-aware placement до запуска conversion.
- `Pacemaker` / `pacemaker_osdi_2020` - даёт framing `when/which/how`, safety-first switching и ограничения по transition IO cap.
- `Tiger` / `tiger_osdi_2022` - поддерживает идею disk/reliability-aware gates и risk-aware adaptation.
- `HARD` / `hard_jbigdata_2019` - напоминает, что снижение redundancy без учёта heterogeneity и locality опасно.
- `HEART` / `heart_fast_2019` - усиливает использование reliability heterogeneity как hard signal поверх temperature.
- `EC-Store` / `ec_store_icdcs_2018` - поддерживает separation of control plane и data plane, а также throttled movement model.
- `identifying_hot_cold_icde_2013` - даёт low-overhead batch hot/cold classification и smoothing patterns.
- `greenhdfs_hotpower_2010` - поддерживает anti-oscillation policy и двусторонние temperature-driven migrations.
- `Janus` / `janus_atc_2013` - даёт constrained optimization framing для allocation/transition decisions.
- `CBase-EC` / `cbase_ec_electronics_2021` - поддерживает двусторонний взгляд на `replicas <-> EC` transitions и periodic skew-aware policy.
- `ELECT` / `elect_fast_2024` - даёт vocabulary для immutable group-level metadata и background transition semantics.
- `f4` / `f4_osdi_2014` - усиливает separation of control/migration responsibilities в warm lifecycle systems.
- `Cocytus` / `cocytus_fast_2016` - напоминает о split between metadata and data и о рисках update-heavy workloads для hybrid redundancy.
- `Xoring Elephants` / `xoring_elephants_arxiv_2013` - подсказывает смотреть на repair I/O и network как на ключевые cold-tier metrics.
- `wide_lrc_fast_2023` - обосновывает wide archival LRC через maintenance robustness и дисциплину local-group layout.
- `ec_survey_tos_2024` - даёт общую taxonomy, где redundancy transitioning становится самостоятельным объектом анализа.
- `benchmarking_ec_object_storage_fgcs_2025` - задаёт benchmark vocabulary и форму экспериментальной отчётности.
- `plank_fast_2009` - напоминает изолировать coding cost от постороннего I/O-noise при оценке EC-подходов.
