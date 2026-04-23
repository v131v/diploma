# Enabling Efficient and Reliable Transition from Replication to Erasure Coding for Clustered File Systems

## 1. Библиографическая карточка
- ID: `tpds17_ear_2017`
- Авторы: Runhui Li, Yuchong Hu, Patrick P. C. Lee
- Год: 2017
- Тип: journal article
- Ссылка: https://www.cse.cuhk.edu.hk/~pclee/www/pubs/tpds17ear.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `baseline` + `practical system paper`
- Для каких разделов диплома полезен: постановка проблемы перехода `replication -> erasure coding`, архитектура transition-пайплайна, policy выбора placement перед кодированием, экспериментальные сравнения с `RR` (random replication)
- Какой главный вопрос диплома он помогает закрыть: как организовать переход от репликации к EC так, чтобы снизить cross-rack трафик и не потерять отказоустойчивость после удаления лишних реплик

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `Abstract` | 1 | Формулировка задачи и вклад EAR | Критически важен |
| `1. Introduction` | 1-2 | Мотивация асинхронного кодирования и проблемы RR | Критически важен |
| `2. Problem` (`2.1 System Model`, `2.2 Issues of RR`) | 2-3 | Модель CFS, encoding pipeline, почему RR создаёт cross-rack download и relocation | Критически важен |
| `3. Design` (`3.1`-`3.5`) | 3-7 | Дизайн EAR: core rack, max-flow/matching ограничения, алгоритм placement, вариант для recovery и расширение на LRC | Критически важен |
| `4. Implementation` (`4.1`, `4.2`) | 7-8 | Интеграция EAR в Facebook HDFS/HDFS-RAID с минимальными изменениями | Очень важен |
| `5. Evaluation` (`5.1`-`5.3`) | 8-12 | Testbed + simulation + load-balancing анализ, количественные gains | Критически важен |
| `6. Related Work` | 12-13 | Контекст по EC в CFS и placement-политикам | Важен |
| `7. Conclusions` | 13 | Итог по вкладу и границам применимости | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: вводит проблему асинхронного перехода от репликации к EC в clustered file systems и объясняет, почему placement реплик до кодирования влияет на стоимость и безопасность transition.
- Ключевые тезисы / аргументы: CFS используют replication для свежих данных и позже фоновое encoding для экономии места; при этом обычная random replication не учитывает будущую группировку блоков в stripe.
- Важные механизмы / модель / архитектура: вводится `EAR (encoding-aware replication)` как placement-политика, которая должна одновременно решить три задачи: убрать cross-rack downloads при encoding, избежать post-encoding relocation и сохранить load balancing как у RR.
- Числа, метрики, результаты: в intro/abstract заявлены значимые throughput-gains EAR, включая случаи более 100% прироста encoding throughput.
- Что отсюда брать в диплом: сильная постановка именно transition-проблемы, а не только сравнения replication vs EC.
- Ограничения или оговорки: в intro нет temperature model и нет policy “когда кодировать” по температуре; фокус на “как кодировать безопасно и дёшево по сети”.

### 4.2 Problem: system model и encoding pipeline
- Что делает этот раздел: формализует CFS-модель (узлы, стойки, дефицит cross-rack bandwidth) и описывает стандартный async encoding pipeline.
- Ключевые тезисы / аргументы: узким местом считается cross-rack трафик; CFS append-only, файлы разбиваются на fixed-size blocks.
- Важные механизмы / модель / архитектура: encoding состоит из трёх шагов: скачать по одной реплике каждого из `k` data blocks, сгенерировать `n-k` parity blocks, удалить лишние реплики после записи parity.
- Числа, метрики, результаты: конкретизируется, что для `(n,k)`-кодов после encoding нужно корректно выдержать node/rack fault tolerance, иначе потребуется relocation.
- Что отсюда брать в диплом: базовый process view для раздела о переходе между схемами избыточности.
- Ограничения или оговорки: модель исходит из того, что cross-rack bottleneck доминирует; это может не совпасть с каждым production-кластером.

### 4.3 Issues of Random Replication (RR)
- Что делает этот раздел: показывает, почему RR ухудшает и производительность, и доступность в последующем encoding.
- Ключевые тезисы / аргументы: при случайном placement блоков encoding-узел почти неизбежно тянет часть data blocks из других стоек; после удаления реплик stripe может нарушить rack-level fault tolerance.
- Важные механизмы / модель / архитектура: приводится пример с `(5,4)` и 5 стойками; после encoding возможна необходимость relocation для восстановления rack-level свойства.
- Числа, метрики, результаты: дана аналитическая оценка вероятности нарушения rack-level fault tolerance (Eq.1); например, для `k=12, R=16` вероятность около `0.97`.
- Что отсюда брать в диплом: прямое обоснование, что “нейтральный” replication placement не нейтрален для будущего EC-transition.
- Ограничения или оговорки: анализ строится на упрощённых предпосылках о placement и равномерности выбора стоек.

### 4.4 Design goals и preliminary EAR (3.1)
- Что делает этот раздел: формулирует цели EAR и вводит идею `core rack`.
- Ключевые тезисы / аргументы: если обеспечить, что для каждого будущего stripe по одному экземпляру всех `k` data blocks есть в одной стойке, encoding можно выполнить без cross-rack downloads.
- Важные механизмы / модель / архитектура: первая реплика каждого блока идёт в core rack; остальные размещаются случайно в других стойках для fault tolerance и balancing.
- Числа, метрики, результаты: количественно здесь нет итоговых gains; ключевой результат — elimination cross-rack download в принципе.
- Что отсюда брать в диплом: структурную идею “encoding-locality-aware placement” до момента кодирования.
- Ограничения или оговорки: preliminary-версия не гарантирует отсутствие post-encoding relocation.

### 4.5 Preserving availability without relocation (3.2)
- Что делает этот раздел: добавляет строгие ограничения, чтобы после кодирования не пришлось переносить блоки.
- Ключевые тезисы / аргументы: для stripe задаётся параметр `c` — максимум блоков stripe в одной стойке; при этом требуется `R >= n/c`, а стойко-уровневая отказоустойчивость оценивается как `floor((n-k)/c)`.
- Важные механизмы / модель / архитектура: placement формулируется как maximum matching в двудольном графе и эквивалентная задача maximum flow; проверка выполнимости — `max flow = k`.
- Числа, метрики, результаты: дана конструкция графа с источником/стоком и capacities на уровнях block-node-rack.
- Что отсюда брать в диплом: формализацию policy-ограничений для безопасного transition.
- Ограничения или оговорки: метод опирается на корректный подбор `(n,k,c)` и достаточное число стоек.

### 4.6 Algorithm (3.3)
- Что делает этот раздел: даёт operational loop для placement каждого следующего data block в stripe.
- Ключевые тезисы / аргументы: реплики размещаются “как можно случайнее” (близко к RR), но только среди вариантов, где после добавления i-го блока выполняется `max flow = i`.
- Важные механизмы / модель / архитектура: если условие нарушено, layout для текущего блока перегенерируется; по завершении строится matching для “какие реплики оставить после encoding”.
- Числа, метрики, результаты: авторы отмечают, что ожидаемое число итераций подбора допустимого layout обычно мало.
- Что отсюда брать в диплом: практический механизм, как совмещать randomness и жёсткие fault-tolerance constraints.
- Ограничения или оговорки: алгоритм placement усложняет control plane по сравнению с RR.

### 4.7 Improving recovery performance (3.4)
- Что делает этот раздел: показывает trade-off между rack-failure tolerance и cross-rack recovery traffic.
- Ключевые тезисы / аргументы: при `c>1` можно держать больше блоков stripe в одной стойке, снижая cross-rack traffic при repair.
- Важные механизмы / модель / архитектура: вводятся `R'` target racks (`R' < R`), в flow-графе к sink остаются только target-стойки; требуется `R' >= n/c`.
- Числа, метрики, результаты: пример `(6,3)` при `R=6`, `c=3`, `R'=2` — все data/parity можно разместить в target racks.
- Что отсюда брать в диплом: явный knob для policy “дешевле recover vs выше rack-failure tolerance”.
- Ограничения или оговорки: уменьшение числа задействованных стоек снижает максимальную стойко-уровневую отказоустойчивость.

### 4.8 Extension for LRC (3.5)
- Что делает этот раздел: расширяет EAR с MDS на non-MDS Local Reconstruction Codes.
- Ключевые тезисы / аргументы: для LRC нужно одновременно удовлетворять global и local conditions recovery, а не только global.
- Важные механизмы / модель / архитектура: строятся два flow graph (`Gglobal`, `Glocal`), затем объединяются по минимуму capacities; для следующего substripe capacities в `Gglobal` уменьшаются на уже использованный flow.
- Числа, метрики, результаты: разобран пример `(14,10,2)` LRC с двумя substripes.
- Что отсюда брать в диплом: идею compositional constraints, когда кодовая схема сложнее классического MDS.
- Ограничения или оговорки: из-за дополнительных ограничений у LRC меньше свобода placement и обычно выше cross-rack traffic.

### 4.9 Implementation on Facebook HDFS (Section 4)
- Что делает этот раздел: переводит design в рабочую систему с минимальными изменениями HDFS/HDFS-RAID.
- Ключевые тезисы / аргументы: EAR добавляется в NameNode; RaidNode и MapReduce scheduling слегка модифицируются для core-rack execution.
- Важные механизмы / модель / архитектура: NameNode возвращает placement реплик, состав stripe и набор реплик для удаления; добавлен `pre-encoding store` со списками блоков по stripe; для encoding map tasks задаётся preferred node из core rack.
- Числа, метрики, результаты: авторы подчеркивают “minimal modifications”, но без LOC-метрики.
- Что отсюда брать в диплом: реалистичный путь интеграции policy-модуля без переписывания data plane.
- Ограничения или оговорки: стандартная locality scheduler не гарантирует запуск в core rack, поэтому понадобилась явная Boolean-метка encoding job.

### 4.10 Evaluation (Section 5)
- Что делает этот раздел: даёт многоуровневую проверку: testbed, large-scale simulation, load balancing.
- Ключевые тезисы / аргументы: EAR систематически выигрывает у RR по encoding throughput и часто по write latency/throughput, особенно при сетевых ограничениях.
- Важные механизмы / модель / архитектура: отдельные эксперименты для flat topology, oversubscribed topology, разных `(n,k)`, bandwidth, write rates, rack-failure tolerance и числа реплик; отдельно проверяется extension для LRC.
- Числа, метрики, результаты:
- `Exp1`: gain encoding throughput растёт `19.9% -> 59.7%` при `k: 4 -> 10`; при инжекции UDP-трафика `57.5% -> 119.7%` (0 -> 800Mb/s).
- `Exp2`: во время encoding write response time снижается на `12.4%`, общее encoding time на `31.6%`.
- `Exp3`: MapReduce performance до encoding у EAR и RR практически совпадает.
- `Exp4` (oversubscribed): gain `36.0% -> 91.8%` при `k: 6 -> 12`; при oversubscription `2:1 -> 20:1` gain `31.0% -> 63.6%`.
- `Exp6` (simulation, 400 узлов): при `k=12` gains `78.7%` (encode) и `36.8%` (write); при 0.2Gb/s link encoding gain до `165.2%`; при снижении tolerable rack failures в EAR `4 -> 1` gains `70.1% -> 82.1%` (encode) и `26.3% -> 48.3%` (write).
- `Exp7` (LRC): для single-rack tolerance gains `78.0%` (encode) и `35.6%` (write).
- `Exp8-9`: storage/read balancing сопоставимы с RR (доли по стойкам `4.1%-5.9%`, hotness index почти идентичен).
- Что отсюда брать в диплом: таблицу эмпирических baseline-чисел для раздела оценки transition cost и network sensitivity.
- Ограничения или оговорки: в simulation для RR не учитывали relocation после encoding, то есть RR оценён оптимистично (и EAR в таком сравнении не “подыгран”).

### 4.11 Related Work + Conclusion
- Что делает этот раздел: позиционирует EAR среди работ по EC в CFS и replica placement.
- Ключевые тезисы / аргументы: новизна не в новом коде, а в placement-политике, оптимизированной именно под async encoding transition.
- Важные механизмы / модель / архитектура: акцент на том, что EAR совместим с разными кодами (MDS и LRC extension) и дополняет существующие EC-системы.
- Числа, метрики, результаты: в заключении фиксируется выигрыш throughput и сохранение равномерности распределения реплик.
- Что отсюда брать в диплом: аккуратное позиционирование как system baseline для design-space “policy-aware transition”.
- Ограничения или оговорки: paper не решает политику hot/cold классификации и не задаёт end-to-end lifecycle manager.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода: EAR — это policy/control-layer для перехода от репликации к erasure coding в CFS, а не новый standalone storage engine.
- Главные компоненты и их роли:
- `NameNode + EAR module`: вычисляет placement реплик на этапе записи, формирует stripe-группы для будущего encoding, определяет какие реплики удалить после encoding без нарушения rack-level требований.
- `Pre-encoding store (в NameNode)`: хранит для каждого stripe список block IDs до запуска encoding job.
- `RaidNode (HDFS-RAID)`: получает metadata, собирает stripe’ы и запускает map-only encoding job.
- `JobTracker/TaskTracker (MapReduce)`: исполняют encoding map tasks; в EAR map task привязывается к preferred node в core rack.
- `DataNodes`: хранят реплики до encoding и data/parity blocks после encoding.
- Где находятся data / parity / replicas / metadata:
- До transition: каждый data block хранится репликами (2-way/3-way в зависимости от настройки), причём EAR старается положить по одной “обязательной” реплике всех k блоков будущего stripe в core rack.
- Во время/после encoding: для stripe остаются `k` data blocks + `n-k` parity blocks; удаляются лишние реплики data blocks по плану NameNode.
- Metadata о stripe composition и placement держится в NameNode + pre-encoding store.
- Как проходят read / write / update / repair / migration / transition:
- `Write`: блок приходит в CFS, NameNode через EAR выбирает конкретные DataNodes для реплик с учётом будущего encoding и ограничений `(n,k,c)`.
- `Read (до encoding)`: обслуживается с реплик как в RR; по оценке paper load balancing не хуже RR.
- `Transition (replication -> EC)`: RaidNode запускает map-only job; map task читает `k` блоков, кодирует `n-k` parity, записывает parity, затем удаляются лишние реплики data blocks.
- `Encoding placement decision`: при формировании layout EAR проверяет max-flow constraints; допустим только layout с требуемым flow.
- `Repair`: в MDS recovery требует чтения `k` блоков; параметр `c`/target racks (`R'`) может уменьшать cross-rack recovery traffic ценой меньшей rack-failure tolerance. Для LRC recovery учитывает global+local conditions.
- `Update`: в paper принята append-only модель; отдельный update protocol не проектируется (лишь отмечается общая дороговизна updates в EC).
- `Migration/Relocation`: дизайн EAR нацелен сделать так, чтобы после encoding relocation не требовался; в RR такая необходимость возможна.
- Где принимаются policy-решения:
- На этапе replica placement в NameNode (EAR algorithm + max-flow проверка).
- На этапе конфигурирования схемы: выбор `(n,k)` и параметра `c`, а также `R'` для режима с target racks.
- Для LRC: отдельное policy-ограничение через объединение `Gglobal` и `Glocal`.
- Какие ограничения, assumptions и неясности остаются:
- Предполагается дефицит cross-rack bandwidth и append-only workload.
- Не описана temperature-aware логика “когда переводить набор данных из replication в EC”.
- Не дана полная экономика control-plane overhead (стоимость поддержания pre-encoding state и вычислений placement на больших масштабах).
- Не раскрыт единый production policy engine, объединяющий выбор кода, момент transition и управление горячестью данных.

## 6. Сквозные выводы по статье
- Проблема: стандартный RR удобен для записи, но не оптимален для последующего async encoding и может требовать дорогого межстоечного трафика и relocation.
- Основная идея / вклад: EAR делает replica placement “encoding-aware”, чтобы заранее сформировать удобный для кодирования layout и не потерять отказоустойчивость после удаления реплик.
- Что нового относительно известных подходов: акцент не на новом erasure code, а на placement policy + flow-ограничениях для надёжного transition.
- Ключевые trade-off: больше ограничений на placement и сложнее control plane в обмен на меньше cross-rack traffic, выше encoding throughput и better write behavior during encoding.
- Главные ограничения статьи: не решается temperature-aware lifecycle; переход рассматривается в основном как техническая операция encoding, а не как full data-tiering policy.

## 7. Что использовать в дипломе
- Идея 1: policy “placement-before-transition matters” — размещение реплик до кодирования определяет стоимость и риск перехода.
- Для какого раздела диплома: постановка задачи и related work по hybrid replication+EC.
- Идея 2: формализация ограничений через `max-flow/matching` для guarantee “без relocation после encoding”.
- Для какого раздела диплома: архитектура и формальные ограничения control plane.
- Идея 3: параметр `c` как рычаг компромисса между rack-failure tolerance и cross-rack recovery traffic.
- Для какого раздела диплома: раздел trade-off и policy tuning.
- Идея 4: практическая интеграция через минимальные изменения (NameNode policy + RaidNode scheduling + flag для map tasks).
- Для какого раздела диплома: практическая реализация прототипа и раздел engineering feasibility.
- Какие метрики / формулировки / сравнения можно опереть на этот источник: encoding throughput gains, write response impact during encoding, network-sensitivity under oversubscription, load-balancing parity with RR.
- Что нельзя переносить в диплом без оговорок: утверждения о temperature-aware оптимальности (paper этого не делает), а также предположение, что cross-rack всегда главный bottleneck в любом кластере.

## 8. Полезные цитаты
- "We propose encoding-aware replication, which carefully places the replicas so as to (i) eliminate cross-rack downloads of data blocks during the encoding operation, (ii) preserve availability without data relocation after the encoding operation, and (iii) maintain load balancing across replicas as in random replication before the encoding operation."
  Стр.: 1
  Зачем нужна: это точная формулировка трёх центральных целей EAR.

- "The encoding operation comprises three steps: (i) the node downloads one replica of each of the k data blocks; (ii) it transforms the downloaded blocks into n − k parity blocks and uploads the parity blocks to other nodes; and (iii) it keeps one replica of each data block and deletes the other replicas."
  Стр.: 3
  Зачем нужна: фиксирует полный transition data flow, который нужен для архитектурного раздела диплома.

- "If and only if the maximum flow of the flow graph is k , we can find a maximum matching and further determine the replica placement."
  Стр.: 5
  Зачем нужна: ключевая формальная проверка корректности placement в EAR.

- "If the flag is true, then the JobTracker only assigns map tasks to the nodes within the core rack."
  Стр.: 8
  Зачем нужна: важная implementation-деталь, как в реальной системе удерживают encoding в core rack.

- "the gain increases from 57.5% to 119.7% when the UDP sending rate increases from 0 to 800Mb/s."
  Стр.: 8
  Зачем нужна: сильное численное подтверждение, что EAR особенно полезен в сетево-ограниченных условиях.

## 9. Термины и понятия
- `RR (Random Replication)`: случайная политика размещения реплик без учёта будущего encoding.
- `EAR (Encoding-Aware Replication)`: placement-политика, учитывающая будущую кодировку stripe.
- `Core rack`: стойка, где заранее гарантируется по одной реплике каждого data block будущего stripe.
- `Stripe`: набор `k` data blocks и `n-k` parity blocks.
- `Cross-rack download`: скачивание блока между разными стойками во время encoding/recovery.
- `Block relocation`: перенос блока после encoding для восстановления rack-level fault tolerance.
- `Parameter c`: максимум блоков одного stripe в одной стойке после encoding.
- `Maximum matching / maximum flow`: формальная основа выбора допустимого replica layout.
- `Target racks (R')`: подмножество стоек для размещения stripe при снижении recovery traffic.
- `LRC (Local Reconstruction Codes)`: non-MDS коды с local+global условиями восстановления.
- `Pre-encoding store`: структура в NameNode со списками блоков по stripe до encoding.
- `Map-only encoding job`: фоновая операция кодирования в HDFS-RAID без reduce-фазы.

## 10. Итог в одном абзаце
Статья даёт очень сильный системный baseline для темы перехода от репликации к erasure coding: главный вклад в том, что авторы оптимизируют именно transition-процесс, а не только выбор кода. EAR показывает, что корректный placement до кодирования может одновременно убрать значимую часть cross-rack трафика, сократить длительность encoding и сохранить отказоустойчивость без постфактум relocation. Для диплома особенно ценны формальные ограничения через max-flow/matching и инженерная интеграция в HDFS с минимальными изменениями control plane. Эксперименты на testbed и в симуляции дают устойчивые количественные выигрыши, особенно в сетево-ограниченных режимах, что хорошо ложится на аргументацию про practical viability. При этом работа не решает задачу temperature-aware lifecycle и не описывает policy “когда переводить данные между схемами”, поэтому её место в дипломе — как фундамент transition design, который нужно дополнить источниками про data temperature и глобальный policy engine.
