# Cluster Storage Systems Gotta Have HeART: Improving Storage Efficiency by Exploiting Disk-Reliability Heterogeneity

## 1. Библиографическая карточка
- ID: `heart_fast_2019`
- Авторы: Saurabh Kadekodi, K. V. Rashmi, Gregory R. Ganger
- Год: 2019
- Тип: conference paper
- Ссылка: https://www.usenix.org/system/files/fast19-kadekodi.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + `baseline`
- Для каких разделов диплома полезен: постановка проблемы, related work по adaptive redundancy, архитектура control plane, аргументация выбора схемы хранения по состоянию инфраструктуры
- Какой главный вопрос диплома помогает закрыть: как учитывать не только температуру данных, но и надежность конкретных disk groups при выборе redundancy scheme
- Что важно сразу зафиксировать: это не temperature-aware migration paper, а online tuning tool для disk-reliability heterogeneity

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `Abstract` + `1. Introduction` | 345-347 | Мотивация, heterogeneity дисков, формулировка HeART и главные результаты | Критически важен |
| `2. Having HeART can make you rich` | 346-349 | Backblaze dataset, группировка дисков, оценка экономии на heterogeneous AFR | Критически важен |
| `3. The ways of the HeART` | 349-351 | Challenges, architecture, anomaly detection, change point detection | Критически важен |
| `4. Measuring HeART` | 351-355 | Реализация компонентов, evaluation на Backblaze, sensitivity analysis | Очень важен |
| `5. Changes of the HeART (discussion)` | 355 | Data placement, redistribution, sample size, operational constraints | Очень важен |
| `6. HeART-less alternatives (related work)` | 355-356 | Related work по disk reliability, failure prediction и redundancy selection | Важен |
| `7. Conclusion` | 356 | Краткое резюме вклада и ограничений | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: задаёт проблему one-scheme-for-all redundancy в cluster storage systems и объясняет, почему разные make/model disks нельзя считать одинаково надежными.
- Ключевые тезисы / аргументы: даже внутри одного класса HDD AFR может сильно отличаться; если выбирать redundancy только по worst case, система теряет место, а если по average case, можно недозащитить более слабые disk groups.
- Важные механизмы / модель / архитектура: вводится HeART как online tuning tool, который по observed failure data определяет полезную стадию жизни disk group и подбирает наиболее space-efficient redundancy option под заданный reliability target.
- Числа, метрики, результаты: в abstract заявлены >`100,000` HDD в Backblaze, различия AFR более чем в `3.5x`, экономия `11-33%` по числу дисков относительно one-scheme-for-all baseline.
- Что отсюда брать в диплом: очень удобная формулировка того, что инфраструктурная надежность может быть вторым управляющим сигналом наряду с температурой данных.
- Ограничения или оговорки: paper не строит temperature-aware data lifecycle policy и не предлагает собственный механизм file/object migration.

### 4.2 Having HeART can make you rich
- Что делает этот раздел: показывает на production dataset, что disk-reliability heterogeneity реально существует и дает измеримую экономию.
- Ключевые тезисы / аргументы: анализ строится на Backblaze dataset с более чем `5` годами статистики; авторы группируют диски по make/model, а не только по capacity, потому что grouping by capacity скрывает различия AFR.
- Важные механизмы / модель / архитектура: disk groups должны быть достаточно крупными для статистической уверенности; HeART ориентируется на six make/model groups, которые покрывают >`90%` Backblaze deployment.
- Числа, метрики, результаты: для H-4A paper показывает `14%` space reduction при default `(14, 10)` и `16%` при `(9, 6)`; для 3-way replication экономия достигает `33%`; в целом по dataset savings лежат примерно в диапазоне `11-16%` для популярных EC baseline и до `33%` для replication.
- Что отсюда брать в диплом: этот раздел можно использовать как фактологическую опору для тезиса, что policy выбора redundancy должна учитывать различия между storage pools, а не только тип данных.
- Ограничения или оговорки: результаты опираются на Backblaze и на disk groups с достаточно большой выборкой, поэтому перенос на другой cluster требует проверки.

### 4.3 The ways of the HeART
- Что делает этот раздел: формулирует три основных вызова и собирает архитектуру HeART в единую control loop.
- Ключевые тезисы / аргументы: HeART должен работать online, быстро реагировать на изменения AFR и не путать bulk failure anomalies с настоящим ростом failure rate.
- Важные механизмы / модель / архитектура: архитектура состоит из disk health monitoring input, anomaly detector, online change point detector и redundancy tuner; baseline redundancy `rdef` используется в infancy и wearout, а `rDG` только в useful life.
- Числа, метрики, результаты: для change point detection paper использует первый `90`-day interval как conservative burn-in, далее смотрит на `30`-day sliding windows; anomaly detector на H-4B успешно отфильтровывает bulk failures и не ломает useful-life estimate.
- Что отсюда брать в диплом: это почти готовый шаблон control loop для любой adaptive redundancy policy: `monitor -> filter anomalies -> detect phase change -> retune`.
- Ограничения или оговорки: архитектура определяет один useful-life AFR на disk group и не моделирует внутригрупповую неоднородность во времени.

### 4.4 Measuring HeART
- Что делает этот раздел: показывает, что HeART можно реализовать на существующих инструментах и что он действительно дает savings на Backblaze.
- Ключевые тезисы / аргументы: anomaly detection реализована через RRCF, change point detection - через window-based algorithm и `Ruptures`; HeART работает с monthly sliding windows и conservative thresholds.
- Важные механизмы / модель / архитектура: useful-life AFR берется как AFR на конце infancy плюс tunable buffer; target reliability сравнивается через `MTTDL`, который выводится из `MTTF` и `MTTR`, причем `MTTR` авторы approximated by disk failure detection time.
- Числа, метрики, результаты: H-4B получает `5` anomalies и более чем `5x` расширение identified useful-life period после фильтрации bulk failures; overall space reduction по Backblaze составляет около `6-7.5%` при max dimension `2x` default и `10-12%` при `4x`.
- Что отсюда брать в диплом: можно заимствовать идею, что conservative tuning и buffer around useful-life AFR нужны, если система должна не только экономить место, но и сохранять reliability margin.
- Ограничения или оговорки: более длинные codes улучшают savings, но увеличивают reconstruction bandwidth, поэтому HeART consciously limits the maximum code length in evaluation.

### 4.5 Changes of the HeART (discussion)
- Что делает этот раздел: честно проговаривает операционные последствия применения HeART в реальном cluster storage system.
- Ключевые тезисы / аргументы: все `n` chunks of a stripe должны находиться внутри одного disk group, иначе scheme selection и safe transitions становятся несовместимыми с некоторыми placement policies вроде CRUSH.
- Важные механизмы / модель / архитектура: переходы между `rdef` и `rDG` требуют data redistribution, но на rolling deployment это амортизируется; bulk changes не должны быть нужны, потому что disk groups вводятся постепенно.
- Числа, метрики, результаты: для достижения `99%` confidence на S-4 по Chernoff-Hoeffding авторы оценивают нужную выборку примерно в `4,000` disks.
- Что отсюда брать в диплом: этот раздел очень полезен как список operational constraints для любой adaptive policy, где решения принимаются по группам, а не по отдельным файлам.
- Ограничения или оговорки: HeART не решает проблему placement across arbitrary failure domains и не дает универсального ответа на вопрос, как встроить его в любую storage substrate без адаптации.

### 4.6 HeART-less alternatives (related work)
- Что делает этот раздел: группирует related work в три лагеря - characterization, failure prediction и automated redundancy selection.
- Ключевые тезисы / аргументы: предыдущие работы либо измеряли disk reliability heterogeneity, либо предсказывали disk failures, либо строили systems for proactive redundancy, но не собирали это в online per-disk-group tuning loop.
- Важные механизмы / модель / архитектура: HeART отличается тем, что использует observed reliability data в runtime и автоматически переключает redundancy settings по life-cycle stage дисковой группы.
- Что отсюда брать в диплом: полезная формулировка новизны - не просто prediction, а policy engine для choosing redundancy by infrastructure state.
- Ограничения или оговорки: related work section короткий и не заменяет полноценный обзор по temperature-aware storage, поэтому его надо дополнять другими источниками.

### 4.7 Conclusion
- Что делает этот раздел: сжимает вклад HeART до одного тезиса - adaptive redundancy по disk-reliability heterogeneity экономит место без потери reliability target.
- Ключевые тезисы / аргументы: paper еще раз подчеркивает, что HeART делает possible to exploit per-group reliability differences и тем самым обойти one-size-fits-all scheme.
- Важные механизмы / модель / архитектура: итоговая идея держится на robust AFR estimation, phase detection и per-group redundancy tuning.
- Что отсюда брать в диплом: хорошая финальная формула для related work и для обоснования второго управляющего сигнала в гибридной storage policy.
- Ограничения или оговорки: conclusion не расширяет scope системы - HeART остается tool for redundancy tuning, а не полной lifecycle-management платформой.

## 5. Архитектура и устройство системы / метода
- HeART - это control-plane tool поверх существующего cluster storage system, а не новая data plane storage engine. Он не меняет client-facing read/write semantics, а выбирает и переключает redundancy settings для disk groups.
- Входы системы: disk health monitoring/logging data, observed failure events, S.M.A.R.T. statistics и текущая default redundancy scheme. Авторы явно предполагают, что мониторинг уже есть в кластере.
- Главные компоненты и их роли:
  - `Anomaly detector` фильтрует bulk failures и прочие всплески, которые не должны считаться настоящим ростом AFR.
  - `Change point detector` ищет границы между infancy, useful life и wearout по cumulative AFR curve.
  - `Redundancy tuner` сравнивает candidate `(n, k)` schemes и выбирает наиболее space-efficient scheme, которая не хуже `rdef` по `MTTDL` и tolerates at least as many failures.
  - `Disk health monitoring` поставляет поток событий и статистики в HeART.
- Где находятся `data / parity / replicas / metadata`:
  - paper не вводит отдельный storage layout service или new metadata format;
  - HeART оперирует на уровне disk groups и redundancy settings, а не на уровне отдельных chunk placement protocols;
  - для безопасной работы all `n` chunks of a stripe must reside within the same disk group.
- Как проходит принятие решений:
  - в infancy и wearout используется `rdef`, то есть baseline scheme, уже допустимая для кластера;
  - после завершения infancy HeART вычисляет useful-life AFR, добавляя tunable buffer, и ищет `rDG`;
  - при первом AFR выше determined useful-life value система объявляет wearout и возвращается к `rdef`.
- Как выглядят `read / write / repair / migration / transition`:
  - read/write path не изобретается заново, HeART только меняет redundancy configuration, под которую underlying system already knows how to store and reconstruct data;
  - repair в оценке моделируется через `MTTR`, approximated by failure detection time;
  - migration/transition происходят как redistribution внутри существующего storage stack, а не как специализированный new protocol;
  - paper прямо обсуждает, что bulk transitions не должны делаться одномоментно, лучше полагаться на rolling deployment.
- Консервативные assumptions:
  - target `MTTDL` задается по default scheme на самом unreliable disk group, то есть policy deliberately conservative;
  - HeART рассматривает disk-group-level reliability, а не intra-group per-disk model;
  - current architecture does not handle changes in the intra-disk-group reliability distribution over time.
- Почему этот блок адекватен типу paper:
  - здесь есть ясно восстанавливаемый control loop, входы, decision point и выходы;
  - при этом честно зафиксировано, что paper не описывает полноценный storage service with custom data plane, а только online redundancy tuning layer.

## 6. Сквозные выводы по статье
- Проблема: единая схема redundancy для всех disk groups одновременно либо лишает систему space efficiency, либо снижает reliability margin.
- Основная идея / вклад: HeART использует observed AFR curves, anomaly filtering и change point detection, чтобы подбирать per-group redundancy scheme для useful life period.
- Что нового относительно известных подходов: в отличие от статических one-scheme-for-all настроек, HeART делает redundancy tuning online и завязывает его на lifecycle stage конкретной дисковой группы.
- Ключевые trade-off: экономия места достигается ценой conservative thresholds, необходимости накопить статистику и возможной cost of redistribution при смене схемы.
- Главные ограничения статьи: нет temperature-aware migration, нет fine-grained policy по отдельным файлам, нет решения для arbitrary placement topologies без адаптации.

## 7. Что использовать в дипломе
- Взять как аргумент, что policy выбора redundancy должна учитывать не только temperature of data, но и infrastructure state, например reliability heterogeneity disk groups.
- Использовать архитектурный паттерн `monitor -> anomaly filter -> change point detection -> retune redundancy` как шаблон control loop для собственной гибридной системы.
- Опереться на `MTTDL`-based decision rule и на conservative baseline scheme as reference point, если понадобится формализовать safe selection criteria.
- Не переносить из HeART без оговорок его disk-group granularity: paper не решает temperature-aware migration between replication and EC и не описывает полноценный lifecycle manager.

## 8. Полезные цитаты
- "HeART suggests the most space-efficient redundancy option allowed that will achieve the specified target data reliability."
  Стр.: 345
  Зачем нужна: коротко фиксирует главную функцию HeART как online tuner redundancy.
- "HeART assumes the existence of a disk health monitoring/logging mechanism already in place."
  Стр.: 350
  Зачем нужна: показывает, что HeART - control layer поверх существующего мониторинга, а не самостоятельный storage engine.
- "all n chunks (data and parity chunks) of a stripe must be stored on disks within the same group."
  Стр.: 355
  Зачем нужна: важное ограничение на placement и transitions, без которого решение нельзя безопасно внедрить.
- "HeART enables more cost-effective data reliability for cluster storage systems."
  Стр.: 356
  Зачем нужна: короткая финальная формулировка вклада статьи.

## 9. Термины и понятия
- `AFR` - annualized failure rate, годовая вероятность fail-stop отказа диска.
- `MTTDL` - mean time to data loss, метрика надежности схемы избыточности.
- `MTTF` - mean time to failure, среднее время до отказа.
- `MTTR` - mean time to repair, время восстановления данных после отказа.
- `Infancy` - ранняя стадия жизни disk group с повышенной нестабильностью отказов.
- `Useful life` - стабильная стадия, где AFR относительно ровный и пригоден для tuning.
- `Wearout` - стадия старения, когда риск отказа растет.
- `Anomaly detector` - механизм, отделяющий кратковременные bulk failures от настоящего роста AFR.
- `Change point detector` - механизм, который находит границы между стадиями жизни disk group.
- `rdef` - default redundancy scheme, используемая в infancy и wearout.
- `rDG` - scheme, выбранная HeART для конкретной disk group в useful life.

## 10. Итог в одном абзаце
HeART показывает, что в cluster storage systems схему redundancy можно адаптировать не только к данным, но и к надежности конкретных disk groups. Работа аккуратно формализует жизненный цикл дисковой группы через AFR, `MTTDL`, anomaly detection и change point detection, а затем использует это для подбора более экономичной схемы в useful life period. Для диплома это ценно как baseline по second control signal: infrastructure reliability, а не только data temperature, может определять выбор storage policy. Особенно полезен архитектурный паттерн `monitor -> filter -> detect -> retune`, который хорошо ложится на гибридную систему erasure coding и replication. При этом у paper есть пределы: HeART не решает temperature-aware migration, не строит полноценный lifecycle manager и работает на уровне disk groups, а не отдельных файлов или объектов. Поэтому в дипломе его лучше использовать как strong supporting baseline и как пример того, как безопасно встраивать adaptive redundancy в существующий storage stack.
