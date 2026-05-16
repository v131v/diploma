# Implementation Notes for `design_17`

Этот файл хранит практическую конкретику по реализации [design_17.md](./design_17.md): MVP-упрощения, структуры данных, последовательности операций и инженерные допущения. Это companion-документ к архитектурному дизайну, а не его замена.

## 1. Назначение

- Зафиксировать, как `design_17` можно реализовывать поэтапно, не теряя связь с исходной архитектурой.
- Отделить `target architecture` от `MVP implementation`.
- Держать в одном месте:
- конкретные API-операции;
- in-memory модели данных;
- упрощения для симулятора/прототипа;
- ограничения первой версии;
- открытые вопросы перед кодом.

## 2. Scope

Этот файл описывает:

- кодовый `MVP` с `single-node in-memory metadata layer`;
- `trace-driven/discrete-event` или service-like prototype;
- object-facing API и внутренние lifecycle steps;
- минимальный набор сущностей для проверки policy и orchestration.

Этот файл пока не описывает:

- production-grade distributed metadata quorum;
- low-level EC/LRC codec implementation;
- полноценный object storage runtime;
- сеть, auth, multi-tenant isolation, billing.

## 3. MVP vs Target

### 3.1 Target architecture

- Пользовательская модель: `append-oriented object/blob storage`.
- Внутренний substrate: `Azure-like extent-level stream/object storage`.
- Metadata layer: отдельный replicated quorum-based control plane.
- Data plane: отдельные storage nodes с replicas/fragments.
- Policy и transitions: `prepare -> verify -> metadata flip -> retire`.

### 3.2 MVP implementation

- Один process.
- Один `in-memory metadata store`.
- Данные можно хранить:
- либо тоже in-memory;
- либо в локальных файлах/каталогах для удобства отладки;
- но `source of truth` для lifecycle state в MVP остаётся в памяти.
- Никакого настоящего quorum/consensus.
- Атомарность:
- на уровне одного процесса;
- через локи / serial event loop / transaction-like critical sections.
- Цель MVP:
- проверить object mapping;
- проверить `CreateObject -> Append -> auto-seal -> FinalizeObject -> SRU(R3) -> transition`;
- проверить stripe assembly;
- проверить логику `desired_state` и transition gates;
- проверить `metadata flip` как логическую commit point.

## 4. User-Facing API

### 4.1 Minimal external API

- `CreateObject(object_id, metadata)`
- `Append(object_id, chunk)`
- `FinalizeObject(object_id)`
- `Read(object_id)`
- `ReadRange(object_id, offset, length)`
- `WriteNewVersion(object_id, data_or_chunks)`
- `Delete(object_id)`

### 4.2 Semantics

- `CreateObject`:
- создаёт логический объект;
- создаёт `active tail`;
- подготавливает metadata для первой записи.
- `Append`:
- принимает payload целиком, без streaming и без явного лимита на размер чанка в рамках MVP assumptions;
- пишет данные в текущий `active tail`;
- если текущий extent переполняется, сам делает `seal` этого extent и автоматически продолжает запись в новый active extent;
- не меняет уже sealed extents.
- `FinalizeObject`:
- завершает запись объекта;
- seal'ит текущий `active tail`, даже если он неполный;
- создаёт финальный `SRU` для последнего extent;
- запрещает дальнейший `Append` в этот `object_id`.
- `Read`:
- возвращает весь логический объект.
- `ReadRange`:
- работает в координатах логического объекта;
- `offset` и `length` задаются в байтах от начала объекта;
- пользователь не знает ничего про extents, SRU или fragments.
- `WriteNewVersion`:
- нужен, если надо изменить уже записанные байты, а не просто дописать хвост.

## 5. Object Model

### 5.1 Mental model

- Логический объект внутри выглядит как:
- `sealed prefix`;
- `active tail`.

То есть:

- старые части объекта immutable;
- в них можно только читать;
- дописывать можно только в текущий mutable tail;
- при переполнении active extent система сама seal'ит его и открывает следующий active tail;
- после `FinalizeObject` объект закрыт для дальнейшей записи.

### 5.2 Key terms for the MVP

- `active tail` - логическая роль внутри объекта.
  Это текущий хвост объекта, куда ещё разрешён `Append`.
- `active extent` - конкретный внутренний extent, который в данный момент реализует `active tail`.
- Для простого `MVP` их можно практически отождествить:
  - у объекта ровно один `active tail`;
  - он реализован ровно одним `active extent`;
  - значит, `activeTailExtentId` и есть ссылка на текущий active extent.
- `object_extent_index` - object-level mapping от логического объекта к ordered sequence extent-ов с их логическими диапазонами.
  Он нужен, чтобы резолвить `ReadRange(object_id, offset, length)` в координатах логического объекта, а не через знание `SRU` или fragments.
- `write context` - runtime-состояние текущей записи в active extent.
  Для первого `MVP` это не обязан быть distributed write descriptor с node placement; достаточно локального in-process контекста записи.
- `SRU` - один sealed extent фиксированного размера, который в MVP трактуется как один data block для coded layouts.
- `R3` - первый post-seal state одного `SRU`; никакой stripe для него не нужен.
- `stripe` - группа `SRU`, над которой строятся parity fragments и выполняется transition, начиная с `Hy`.
- `fixed stripe membership` - состав stripes считается заранее определённым и стабильным для coded layouts.
- `TransitionCandidate` - policy/execution object в MVP.
  Он описывает один готовый stripe или фиксированную группу stripes, для которых уже можно посчитать реальный transition benefit и которые можно положить в wait queue.

### 5.3 Why immutability is useful

- Разводит ingest и background transitions.
- Упрощает recoding.
- Убирает in-place mutation поверх coded fragments.
- Упрощает repair, checksum validation и GC.

## 6. In-Memory Metadata Model

### 6.1 Required registries

MVP можно построить на следующих in-memory registries:

- `objects: Map<ObjectId, ObjectRecord>`
- `extents: Map<ExtentId, ExtentRecord>`
- `objectExtentIndex: Map<ObjectId, Vec<ObjectExtentRef>>`
- `sruRegistry: Map<SruId, SruRecord>`
- `stripeRegistry: Map<StripeId, StripeRecord>`
- `transitionCandidateRegistry: Map<CandidateId, TransitionCandidate>`
- `generationRegistry: Map<GenerationId, GenerationRecord>`
- `transitionRegistry: Map<TransitionKey, TransitionRule>`
- `placementRecords: Map<(GenerationId, FragmentId), PlacementRecord>`
- `writeContexts: Map<ObjectId, WriteContext>`

### 6.2 Suggested record shapes

```ts
type ObjectRecord = {
  objectId: string;
  metadata: Record<string, string>;
  state: "open" | "finalized" | "deleted";
  currentVersion: number;
  activeTailExtentId: string | null;
  createdAt: number;
  updatedAt: number;
};

type ExtentRecord = {
  extentId: string;
  objectId: string;
  version: number;
  logicalOffsetStart: number;
  logicalOffsetEndExclusive: number;
  status: "active" | "sealed" | "retired";
  sizeBytes: number;
  maxSizeBytes: number;
  checksum?: string;
  backingRef?: string;
};

type ObjectExtentRef = {
  extentId: string;
  logicalOffsetStart: number;
  logicalOffsetEndExclusive: number;
};

type SruRecord = {
  sruId: string;
  extentId: string;
  state: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  policyEpoch: number;
  stateEpoch: number;
  generationId: string;
  pendingJobId: string | null;
  heatEwma: number;
  lifetimeStage: "hot" | "warm" | "cold" | "deep-cold";
};

type StripeRecord = {
  stripeId: string;
  memberSruIds: string[];
  state: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  generationId: string;
  stripeHeat: number;
  avgSruHeat: number;
  reviewAt: number;
};

type TransitionCandidate = {
  candidateId: string;
  stripeIds: string[];
  sourceState: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  targetState: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  desiredState: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  status: "waiting" | "launching" | "committed" | "aborted" | "expired";
  createdAt: number;
  launchDeadline: number | null;
  benefitScore: number;
  spaceGainBytes: number;
  transitionIoCostOps: number;
  aggregatedHeat: number;
};

type GenerationRecord = {
  generationId: string;
  status: "staging" | "committed" | "retiring";
  state: "R3" | "HY" | "RS" | "LRC12" | "LRC24";
  sruIds: string[];
  fragmentManifest: string[];
  placementVersion: number;
};

type WriteContext = {
  objectId: string;
  extentId: string;
  nextOffset: number;
  isOpen: boolean;
};
```

Комментарий по состоянию extent:

- для `MVP` лучше хранить состояние extent как явное поле в `ExtentRecord`;
- предпочтительно `status: "active" | "sealed" | "retired"`, а не отдельное множество sealed extent-ов;
- это упрощает отладку, переходы и инварианты.

Комментарий по `write context`:

- в первом `MVP` он хранит только логическое состояние записи;
- информация о конкретной physical node для записи не обязательна;
- если позже появится настоящий distributed write path, туда можно будет добавить `target_nodes`, `placement_epoch`, `ack_state`.

## 7. Data Storage in MVP

Допущение для простоты первого MVP:

- `Append` нестриминговый;
- payload одного вызова целиком materialize'ится в памяти процесса;
- явного `MAX_APPEND_SIZE` нет;
- предполагается, что учебные тестовые данные гарантированно помещаются в доступную RAM;
- hardening для больших запросов, backpressure и transport-level limits оставляется на следующие итерации.

### 7.1 Simplest option

- Data payload тоже держать в памяти:
- `Map<ExtentId, Uint8Array>`

Плюсы:

- проще всего реализовать;
- легко моделировать `ReadRange`;
- удобно для тестов.

Минусы:

- большие объёмы быстро съедят RAM;
- неудобно переживать restart.

### 7.2 Slightly more practical option

- Metadata в памяти.
- Extent payload в локальных файлах:
- например, `./mvp-data/objects/<object_id>/<extent_id>.bin`

Плюсы:

- меньше pressure на RAM;
- удобнее отладка;
- можно руками смотреть содержимое.

Минусы:

- всё ещё single-node;
- restart recovery для metadata нужно делать отдельно.

## 8. First-Order Operation Flows

### 8.1 CreateObject

После `CreateObject(object_id, metadata)`:

1. Создать `ObjectRecord`.
2. Создать новый mutable `ExtentRecord` с `status="active"`, `sizeBytes=0` и фиксированным `maxSizeBytes` для выбранного extent size-class.
3. Привязать его как `activeTailExtentId`.
4. Создать пустую запись в `objectExtentIndex`.
5. Создать `WriteContext` для нового active extent.
6. Данные ещё не становятся `SRU`.

Практически это значит:

- в metadata появляются новые почти пустые записи;
- логический объект уже существует в namespace;
- у него открыт current active tail;
- но lifecycle policy ещё не стартует, потому что ничего не sealed.

### 8.2 Append

После `Append(object_id, chunk)`:

1. Найти `activeTailExtentId`.
2. Пока в `chunk` остаются ещё не записанные байты:
3. Если в active extent хватает места, дописать в него очередную часть payload.
4. Если места не хватает, дописать остаток до `maxSizeBytes`, затем перевести extent в `status="sealed"`, добавить его в `objectExtentIndex`, создать `SruRecord` и открыть новый active tail.
5. После полного завершения append обновить `updatedAt` у объекта и `WriteContext.nextOffset`.

Создание `SruRecord` в MVP:

- sealed extent сначала регистрируется как `SRU` со `state="R3"` и `desiredState="R3"`;
- для него сразу можно обслуживать normal reads по replica-first path;
- переход в `HY` происходит позже как отдельная background transition-задача, а не inline внутри append.

### 8.3 FinalizeObject

После `FinalizeObject(object_id)`:

1. Проверить, что объект ещё открыт для записи.
2. Найти текущий active extent.
3. Если active extent содержит данные, перевести его в `status="sealed"`, добавить в `objectExtentIndex` и создать `SruRecord`.
4. Если active extent пустой, его можно удалить без создания `SRU`.
5. Сбросить `activeTailExtentId` и закрыть `WriteContext`.
6. Перевести объект в состояние `finalized`, где дальнейший `Append` запрещён.

### 8.4 ReadRange

При `ReadRange(object_id, offset, length)`:

1. Найти extent refs в `objectExtentIndex`, пересекающиеся с нужным диапазоном.
2. Если диапазон захватывает текущий active tail, включить и его.
3. Прочитать нужные поддиапазоны из extent payload.
4. Склеить ответ в один byte buffer.

### 8.5 Transition

Для перехода `R3 -> HY`, `HY -> RS`, `RS -> LRC12`, `LRC12 -> LRC24`:

1. Policy обновляет `heat_ewma` на уровне `SRU`.
2. Heat агрегируется в `stripeHeat = sum(member heat)` и `avgSruHeat` на уровне `StripeRecord`.
3. Decision layer строит `TransitionCandidate` для готового stripe или фиксированной группы stripes.
4. Для candidate считаются `benefitScore`, `spaceGainBytes` и `transitionIoCostOps`.
5. Candidate попадает в wait queue.
6. При запуске пишется staging generation.
7. Выполняется `verify`.
8. Делается атомарный `metadata flip`.
9. Старый generation помечается `retiring`.

Специально для `R3 -> HY`:

1. Fixed stripe membership уже определяет группу из `6` `R3`-`SRU` одинакового size-class.
2. Одна existing replica от каждого `SRU` используется как source data block.
3. Materializer пишет `6` data fragments для `RS`-компонента и `3` parity fragments.
4. У каждого `SRU` сохраняется одна replica component, поэтому target layout становится `Hy(1,RS(6,3))`.
5. После `metadata flip` stripe получает `state="HY"` и новый committed `generationId`.

### 8.6 Simplified Dataplane Cost Model for MVP

Для первой версии симулятора полезно зафиксировать упрощённую coarse-grained модель dataplane I/O.
Она нужна не для точного production accounting, а для сравнения transition candidates и для policy tuning.

Предположения этой модели:

- одна операция чтения целой replica-копии считается как `1 read`;
- одна операция записи целой replica-копии считается как `1 write`;
- чтение одного fragment/chunk считается как `1 read`;
- запись одного fragment/chunk считается как `1 write`;
- ленивые удаления и пометка layout как free не считаются dataplane I/O;
- для переходов `RS <-> LRC12` предполагается наличие совместимого conversion-aware code family, поэтому используется optimistic conversion model, а не full re-encode.
- для `R3 -> HY` и `HY -> R3` таблица ниже остаётся stripe-normalized:
  source reads/writes по всем `6` `SRU` считаются как одна логическая replica-операция над целым stripe, чтобы сохранить сопоставимость с уже выбранной coarse model.

Условные обозначения:

- `R3` = три полные реплики одного `SRU`;
- `HY` = `Hy(1,RS(6,3))`;
- `RS` = `RS(6,3)`;
- `LRC12` = `LRC(12,2,2)`.

Для group transitions ниже считается, что:

- `R3 -> HY` работает на stripe из `6` `SRU`;
- один `SRU` имеет фиксированный size-class, например `64 KiB`, `1 MiB` или `1 GiB`;
- один data block в `RS/LRC` равен одному `SRU`.

Оценка transition cost и space effect:

| Transition | Read ops | Write ops | Total ops | Space before -> after | Relative space delta |
|---|---:|---:|---:|---|---:|
| `R3 -> HY` | 1 | 9 | 10 | `18 -> 15` | `-1/6` |
| `HY -> R3` | 1 | 2 | 3 | `15 -> 18` | `+3/15` |
| `HY -> RS` | 0 | 0 | 0 | `15 -> 9` | `-6/15` |
| `RS -> HY` | 6 | 1 | 7 | `9 -> 15` | `+6/9` |
| `2 * RS -> 1 * LRC12` | 4 | 2 | 6 | `18 -> 16` | `-2/18` |
| `1 * LRC12 -> 2 * RS` | 8 | 4 | 12 | `16 -> 18` | `+2/16` |

Пояснения:

- `R3 -> HY`: на stripe из `6` `R3`-`SRU` читается по одной existing replica с каждого `SRU`, затем materialize'ятся `6` data fragments и `3` RS parity fragments;
- `HY -> R3`: existing replica в `HY` используется как source, после чего дореплицируются ещё две копии;
- `HY -> RS`: replica-component просто retire'ится без дополнительного data rewrite;
- `RS -> HY`: из `6` RS data fragments собирается одна replica;
- `2 * RS -> 1 * LRC12`: в optimistic model два RS-stripe объединяются в один LRC stripe с дешёвой conversion;
- `1 * LRC12 -> 2 * RS`: inverse split из `LRC12` обратно в две `RS(6,3)` groups.

Условная стоимость normal full read:

| Layout | Full-read ops | Comment |
|---|---:|---|
| `R3` | 1 | чтение из любой healthy replica |
| `HY` | 1 | replica-first path, пока replica component доступен |
| `HY` degraded | 6 | fallback по `6` data fragments при потере replica component |
| `RS` | 6 | чтение полного payload через `6` data fragments |
| `LRC12` | 12 | чтение полного payload через `12` data fragments |

Важная оговорка по read-cost:

- `RS` и `LRC12` здесь нельзя сравнивать напрямую по числу fragments без нормализации по объёму полезных данных;
- один `RS(6,3)` stripe несёт `6` data units, а один `LRC(12,2,2)` stripe несёт `12` data units;
- поэтому `12` reads у `LRC12` соответствуют чтению payload вдвое большего объёма;
- при нормализации на одинаковый объём пользовательских данных steady-state read fanout у `RS` и `LRC12` оказывается одного порядка, но `LRC12` всё равно шире и сложнее по orchestration/placement.

### 8.7 MVP Policy Sketch

Для `design_17` полезно разделять две задачи:

- `heat accounting` - обновление и агрегация температуры;
- `desired-state selection` - выбор желаемого layout для fixed stripe или stripe-group;
- `transition scheduling` - выбор, какие уже готовые `TransitionCandidate` реально выполнять сейчас.

Это согласуется с архитектурным разделением `Decision engine` и `Transition orchestration`.

#### 8.7.1 Inputs

На каждом policy cycle decision layer использует:

- `heat_ewma` каждого `SRU`;
- `stripeHeat` и `avgSruHeat` каждого `StripeRecord`;
- `current_state` каждого `StripeRecord`;
- `global_utilization = used_space / total_space`;
- `available_transition_io`, то есть сколько budget на transitions свободно в текущем окне;
- при желании `recent_heat_history` для very-lightweight hysteresis;
- без обязательных recovery/reliability signals в первой версии MVP.

#### 8.7.2 Desired-state selection

`desired_state` лучше вычислять в основном по `heat + space pressure`, а не по моментному I/O.
Иначе policy начнёт дёргаться от кратковременных всплесков background load.

Для первого MVP допустимо сознательно отказаться от `reliability_band` и `repair_pressure`.
Тогда selector решает только задачу adaptive transcoding под рабочую нагрузку и давление на пространство.

Упрощённый алгоритм:

1. Посчитать `H = N / T` за текущее окно и обновить `heat_ewma`.
2. Агрегировать heat в фиксированные `StripeRecord`:
   - `stripeHeat = sum(heat_ewma of member SRU)`
   - `avgSruHeat = stripeHeat / stripe_width`
3. Построить `TransitionCandidate` для:
   - одного stripe в unary-переходах (`HY <-> RS`);
   - фиксированной группы stripes в merge/split-переходах (`RS <-> LRC12`, `LRC12 <-> LRC24`).
4. По `current_state` и temperature class выбрать только соседний target по transition graph.
5. Применить `utilization accelerator`:
   - при низкой заполненности не форсировать cooling;
   - при средней заполненности разрешать более агрессивный one-step cooling;
   - при высокой заполненности поднимать приоритет cooling для cold/deep-cold candidates.
6. Посчитать настоящий `benefitScore` уже на уровне candidate stripe/group:
   - `benefit = alpha * space_gain - beta * expected_extra_read_io - gamma * transition_cost`
7. Если переход оправдан, записать `desired_state` в `TransitionCandidate`; иначе candidate не создавать или помечать как `expired`.

Практическая эвристика для MVP:

- `utilization <= 30%`: `space_pressure = 0`
- `30% < utilization <= 60%`: `space_pressure = 0.5`
- `utilization > 60%`: `space_pressure = 1.0`

Практическая рекомендация по temperature thresholds:

- не фиксировать “вечные” абсолютные пороги в запросах/сек;
- задавать temperature classes относительно наблюдаемого распределения `stripeHeat` или `avgSruHeat` по stripes в текущем или недавнем окне.

Простой вариант:

- top `20%` по `stripeHeat` -> `hot`
- следующие `30%` -> `warm`
- следующие `30%` -> `cold`
- нижние `20%` -> `deep-cold`

Это лучше переносится между разными днями и workload profiles, чем жёсткие абсолютные границы.

Практическая рекомендация по hysteresis:

- для MVP hysteresis можно сделать опциональным, а не обязательным;
- самый простой режим: вообще без hysteresis, если хочется увидеть “чистую” реакцию policy на heat/load;
- безопасный компромисс: лёгкий hysteresis вида “нужно 2 окна подряд”, если появится слишком много oscillation.

То есть FIFO scheduler не заменяет hysteresis, но для MVP можно сознательно начать без него и посмотреть, реально ли дрожание мешает.

#### 8.7.3 Transition scheduling

После того как `desired_state` уже выставлены, scheduler должен работать не по отдельным `SRU`, а по actual transition candidates:

- один stripe для unary transitions;
- фиксированная группа stripes для merge/split transitions.

Для каждого candidate можно оценить:

- `space_gain_bytes`
- `io_cost_ops`
- `cooling_urgency`
- `promotion_urgency`
- `io_headroom = available_transition_io / transition_budget`

Простая формула score для cooling-перехода:

```text
score_cool =
  io_headroom *
  (w_space * normalized_space_gain + w_temp * cooling_urgency)
  / (1 + w_io * normalized_io_cost)
```

Простая формула score для promotion-перехода:

```text
score_promote =
  io_headroom *
  (w_temp * promotion_urgency + w_sla * degraded_read_risk)
  / (1 + w_io * normalized_io_cost)
```

Практический смысл:

- чем больше выигрыш по space, тем выше score на cooling;
- чем hotter data или хуже degraded-read SLA, тем выше score на promotion;
- чем дороже transition по coarse I/O model, тем ниже score;
- если `io_headroom` мал, почти все expensive transitions автоматически тормозятся.

#### 8.7.4 Recommended separation of responsibilities

Для MVP лучше держать три разных слоя логики:

- `temperature classifier`:
  - считает `H`, обновляет `heat_ewma`, агрегирует `stripeHeat`;
- `desired-state selector`:
  - выбирает `desired_state` и `benefitScore` для `TransitionCandidate` по `stripeHeat` и `global_utilization`;
- `transition scheduler`:
  - сортирует уже разрешённые `TransitionCandidate` по `space_gain / io_cost` under current `io_headroom`.

Такое разделение делает систему проще для отладки:

- ошибки temperature model не смешиваются с execution throttling;
- можно отдельно изучать quality of `desired_state` и отдельно quality of scheduler;
- легче прогонять sensitivity sweep по `window`, `alpha`, `transition_budget` и coarse I/O assumptions.

#### 8.7.5 Why `global_utilization` belongs in selector but `available_transition_io` mostly does not

- `global_utilization` - медленный и стратегический сигнал.
  Он отражает долгосрочное давление на пространство и поэтому влияет на то, в каком layout данным в принципе лучше жить.
- `available_transition_io` - быстрый и операционный сигнал.
  Он отражает, можем ли мы исполнять переход прямо сейчас, но не обязательно меняет долгосрочную целевую схему хранения.

Поэтому:

- `global_utilization` используется внутри `desired_state selector`;
- `available_transition_io` в основном используется внутри `transition scheduler`.

Исключение:

- если в будущем понадобится, можно добавить сглаженный signal вроде `transition_io_pressure_ewma`;
- такой медленный aggregated congestion metric уже можно частично использовать и в selector;
- но сырое “свободно ли сейчас I/O” лучше не смешивать с долгосрочной целью `desired_state`.

#### 8.7.6 Stripe-first policy/execution model for MVP

Для первого MVP удобнее считать, что:

- `SRU` нужен как физическая member-unit и источник heat;
- `StripeRecord` нужен как fixed layout object;
- `TransitionCandidate` нужен как policy/execution object.

Это даёт более чистую семантику:

- состав stripe фиксирован;
- `desired_state` живёт не на отдельном `SRU`, а на candidate stripe/group;
- в wait queue лежат только полные executable candidates;
- timeout означает "попробовать запустить или выбросить candidate", а не "закоммитить partial cohort".

Практический цикл:

1. Обновить heat всех `SRU`, попавших в текущий telemetry batch.
2. Пересчитать `stripeHeat` для затронутых stripes.
3. Построить готовые `TransitionCandidate` для допустимых соседних transitions.
4. Для каждого candidate посчитать `benefitScore`.
5. Положить candidate в wait queue.
6. Если budget позволяет - запускать сразу.
7. Если candidate дожил до timeout - сделать re-check и затем либо запустить, либо пометить `expired`.

## 9. MVP Simplifications

Первая кодовая версия может честно упростить:

- один storage node вместо многих;
- fake placement без реального rack/fault topology;
- отсутствие `repairPressure` и `reliabilityBand` в decision logic первой версии;
- простые utilization bands;
- опциональный hysteresis;
- `desired_state` и `benefitScore` хранятся на `TransitionCandidate`, а не на отдельных `SRU`;
- нестриминговый `Append` без явного лимита на размер одного вызова;
- отсутствие настоящих RS/LRC codecs:
- можно моделировать fragments логически;
- а не реализовывать математическое кодирование сразу;
- `metadata flip` как атомарное обновление in-memory maps.

Это всё ещё валидный MVP, если сохраняются:

- object model;
- sealed extent lifecycle;
- `SRU` / `stripe` / `TransitionCandidate` distinction;
- adjacency-only transitions;
- `prepare -> verify -> metadata flip -> retire`.

## 10. What Should Not Be Simplified Away

Даже в MVP не стоит выбрасывать:

- `desired_state` отдельно от committed `state`;
- stripe-level commit scope;
- `abort` до flip;
- `retire` после flip;
- `ReadRange` в координатах логического объекта;
- distinction between sealed prefix and active tail;
- distinction between `SRU`, `StripeRecord` и `TransitionCandidate`.

Если это убрать, получится уже не `design_17`, а другая, слишком упрощённая система.

## 11. Open Questions

- Хотим ли в MVP хранить payload целиком в памяти или вынести в локальные файлы?
- Хотим ли в первой версии моделировать реальные RS/LRC fragments или только symbolic generations/state transitions?
- Нужен ли `snapshot/journal` для metadata recovery между рестартами уже в первой итерации?
