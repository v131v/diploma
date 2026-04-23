# PACEMAKER: Avoiding HeART attacks in storage clusters with disk-adaptive redundancy

## 1. Библиографическая карточка
- ID: `pacemaker_osdi_2020`
- Авторы: Saurabh Kadekodi, Francisco Maturana, Suhas Jayaram Subramanya, Juncheng Yang, K. V. Rashmi, Gregory R. Ganger
- Год: 2020
- Тип: conference paper
- Ссылка: https://arxiv.org/abs/2103.08191

## 2. Зачем этот источник нужен для диплома
- Роль источника: `practical system paper` + baseline по безопасной orchestration переходов между redundancy-схемами.
- Для каких разделов диплома полезен: постановка проблемы transition overload, дизайн policy-движка, архитектура migration/transition, раздел про ограничения и риски при adaptive redundancy.
- Какой главный вопрос диплома он помогает закрыть: как делать adaptive/hybrid redundancy в реальном кластере так, чтобы переходы между схемами не перегружали IO и не оставляли данные under-protected.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `Abstract` | 1 | Постановка проблемы transition overload, вклад и итоговые метрики | Очень важен |
| `1 Introduction` | 1-2 | Почему disk-adaptive redundancy полезна, но ломается из-за transition IO | Критически важен |
| `2 Whither disk-adaptive redundancy` | 2-3 | Ограничения one-size-fits-all и HeART; почему переходы нельзя игнорировать | Очень важен |
| `3 Longitudinal production trace analyses` | 3-5 | Анализ логов 5.3M дисков и причины transition overload | Критически важен |
| `3.1 Causes of transition overload` | 4 | Trickle/step deployments и почему оба паттерна дают urgent mass transitions | Критически важен |
| `3.2 Informing a solution` | 4-5 | Наблюдения для дизайна: gradual AFR growth, multiple useful-life phases, short infancy | Очень важен |
| `4 Design goals` | 5-6 | Формализация lifecycle, Rgroups/Dgroups, 3 ключевых decision-вопроса и IO-ограничения | Критически важен |
| `5 Design of PACEMAKER` | 6-10 | Архитектура orchestrator и логика `when/which/how` переходов | Критически важен |
| `5.1 Proactive-transition-initiator` | 7-8 | Proactive RDn/RUp для trickle и step deployments | Критически важен |
| `5.2 Rgroup-planner` | 8-9 | Выбор target scheme и решение о создании/очистке Rgroups | Очень важен |
| `5.3 Transition-executor` | 9-10 | Type 1 / Type 2 transition techniques и rate-limiting per Rgroup | Критически важен |
| `6 Implementation of PACEMAKER in HDFS` | 10-11 | Прототип в HDFS: DNMgr-per-Rgroup, decommission-based transitions | Очень важен |
| `7 Evaluation` | 11-14 | Симуляция на 4 production-кластерах и PoC-эксперименты в HDFS | Критически важен |
| `7.1 PACEMAKER on Google Cluster1 in-depth` | 11-12 | Подробная динамика IO/AFR/space-savings и отсутствие transition overload | Очень важен |
| `7.2 PACEMAKER on the other three clusters` | 12-13 | Сопоставление с HeART на Google Cluster2/3 и Backblaze | Очень важен |
| `7.3 Sensitivity analyses and ablation studies` | 13 | Чувствительность к peak-IO-cap и threshold-AFR, вклад multiple phases и Type1/Type2 | Очень важен |
| `7.4 Evaluating HDFS + PACEMAKER` | 13-14 | Поведение throughput при DN failure и при Rgroup transition | Важен |
| `8 Related work` | 14 | Отличия от HeART и ограниченность существующих code-transition подходов | Важен |
| `9 Conclusion` | 14 | Финальный вывод по practical feasibility и эффектам | Важен |
| `A Failure rate estimation details` | 15 | Формальная методика AFR/hazard estimation | Умеренно важен |
| `B Detailed cluster evaluations` | 15-19 | Расширенные графики/кейсы по кластерам | Умеренно важен |
| `References` | 20-23 | База ссылок по reliability, coding и storage systems | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: формулирует разрыв между обещанной выгодой disk-adaptive redundancy и её практической неприменимостью из-за переходов между схемами.
- Ключевые тезисы / аргументы:
  - Кластеры гетерогенны по makes/models и AFR, но обычно используют one-size-fits-all redundancy.
  - Это ведёт к завышенному overhead, потому что схема выбирается под самые “плохие” диски.
  - Переходы между кодами при росте AFR создают огромный urgent IO, который может занять весь кластерный bandwidth.
- Важные механизмы / модель / архитектура:
  - Вводится проблема `transition overload` как отдельный operational bottleneck.
  - Вводится идея proactive orchestration: заранее подготовить layout и заранее инициировать transitions.
- Числа, метрики, результаты:
  - В traces показаны периоды, когда существующий подход требует до `100%` cluster IO для transitions.
  - Заявленный эффект PACEMAKER: transition IO держится под cap `5%` (в среднем `0.2–0.4%`), space-savings `14–20%`.
- Что отсюда брать в диплом: сильную постановку, что в hybrid/temperature-aware системе оптимизировать нужно не только steady-state схему, но и стоимость и безопасность переходов.
- Ограничения или оговорки: раздел декларативный; детальные механизмы появляются только в §§5-7.

### 4.2 Whither disk-adaptive redundancy
- Что делает этот раздел: объясняет, почему классическая логика “просто подбирать код по AFR” без transition-cost модели не работает.
- Ключевые тезисы / аргументы:
  - High-level MTTDL-guided выбор схемы при worst-case AFR приводит к избыточной консервативности.
  - Универсальный переход на very-wide codes тоже не спасает из-за роста reconstruction IO и tail latencies.
  - HeART как близкий baseline концептуально полезен, но недооценивает IO-стоимость transitions.
- Важные механизмы / модель / архитектура:
  - Формально обсуждаются `k-of-n`, MTTDL, MTTR, tolerated AFR.
  - Показано, что реактивные RUp transitions (после фактического AFR-роста) оставляют окно under-protection.
- Числа, метрики, результаты:
  - Пример из paper: `6-of-9` против `6-of-8` может давать ~`10000x` разницу MTTDL, а против `7-of-10` — только `1.5x`, что усложняет “мелкие” адаптации только parity-count.
- Что отсюда брать в диплом: теоретическое обоснование, почему policy выбора redundancy нельзя отделять от механизма перехода.
- Ограничения или оговорки: это аналитический раздел, без новой архитектуры исполнения переходов.

### 4.3 Longitudinal production trace analyses
- Что делает этот раздел: строит эмпирическую основу дизайна PACEMAKER на реальных много-летних логах.
- Ключевые тезисы / аргументы:
  - Показаны два паттерна deployment: `trickle` (малые регулярные добавления) и `step` (большие батчи).
  - Оба паттерна приводят к массовым синхронным transitions, но по разным причинам.
  - AFR-кривые обычно растут постепенно, без резкого wearout-step, что делает proactive действия реалистичными.
- Важные механизмы / модель / архитектура:
  - Анализирует Dgroups (make/model), динамику AFR по возрасту, и статистические требования к “достаточному” числу дисков для уверенной оценки AFR.
  - Формирует архитектурные следствия: canary-подход для trickle и threshold-раннее предупреждение для step.
- Числа, метрики, результаты:
  - Анализ основан на логах `5.3M` HDD из Google, NetApp, Backblaze.
  - Наблюдаемая кластерная шкала в evaluation-кейсах: ~`110K` до `450K` дисков.
  - Для точной AFR-оценки требуется порядок “нескольких тысяч” дисков одного make/model.
- Что отсюда брать в диплом: методологию связывать policy с эмпирикой deployment/failure, а не только с абстрактной моделью нагрузки.
- Ограничения или оговорки: данные конкретных организаций; переносимость на другие среды требует валидации на локальных traces.

### 4.4 Design goals
- Что делает этот раздел: переводит наблюдения в формальные design-цели и операционные ограничения.
- Ключевые тезисы / аргументы:
  - Для каждого диска lifecycle проходит через `Rgroup0` (unspecialized) и затем specialized Rgroups.
  - Для orchestration всегда нужно отвечать на три вопроса: `when`, `which`, `how` transition.
  - Transition IO становится first-class ограничением наряду с reliability и failure-reconstruction IO.
- Важные механизмы / модель / архитектура:
  - Вводятся сущности `Dgroup`, `Rgroup`, `RDn`, `RUp`, `tolerated-AFR`, `threshold-AFR`, `canary disks`.
  - Вводятся 2 управляющих лимита: `average-IO constraint` и `peak-IO-cap`.
- Числа, метрики, результаты:
  - Иллюстрация из раздела: при peak cap `5%` transition, занимавший 1 день на 100% IO, растягивается минимум до ~20 дней.
- Что отсюда брать в диплом: формализацию constraints для policy-движка в гибридной системе (надёжность, background IO budget, скорость переходов).
- Ограничения или оговорки: цели сформулированы вокруг дискового AFR-адаптива, а не вокруг file/request-level temperature-модели.

### 4.5 Design of PACEMAKER
- Что делает этот раздел: даёт целостную архитектуру orchestrator и алгоритмы выбора/исполнения transitions.
- Ключевые тезисы / аргументы:
  - Архитектура раскладывается на три компонента, соответствующие трём decision-вопросам.
  - Переходы должны быть proactive, а не реактивными, иначе надёжность и IO-лимиты конфликтуют.
  - Для разных deployment-паттернов нужны разные правила и механики transitions.
- Важные механизмы / модель / архитектура:
  - `Proactive-transition-initiator`: решает время RDn/RUp.
  - `Rgroup-planner`: выбирает target scheme и политику создания/очистки Rgroups.
  - `Transition-executor`: выбирает технику перехода (Type 1 или Type 2) и rate-limits transition.
  - Дополнительно: metadata, rate-limiter, AFR-curve learner, change-point detector.
- Числа, метрики, результаты:
  - Для trickle Dgroups используются canary disks с `C` в low-thousands (например, `3000`).
  - Type 1 (“emptying disks”) даёт IO до `2×disk-capacity` и как минимум `k_cur` раз дешевле conventional re-encoding.
  - Type 2 (bulk parity recalculation) при переходе целого Rgroup даёт как минимум `n_cur` раз меньше IO, чем conventional re-encoding.
  - В симулированных крупных кластерах число Rgroups оставалось небольшим (до порядка `10`).
- Что отсюда брать в диплом:
  - Конструкцию policy-engine как `when/which/how` pipeline.
  - Разделение “planning” и “execution” слоёв.
  - Идею выбирать transition-technique по доле дисков, переходящих одновременно.
- Ограничения или оговорки:
  - Дизайн предполагает постепенные AFR-тренды; при резком всплеске предусмотрен safety valve (игнор IO-лимитов ради надёжности).
  - Система ориентирована на single storage service поверх кластера; multi-tenant bandwidth coordination оставлена вне scope.

### 4.6 Implementation of PACEMAKER in HDFS
- Что делает этот раздел: показывает implementability в существующей production-подобной ФС с минимальными архитектурными изменениями.
- Ключевые тезисы / аргументы:
  - Прототип реализован на `HDFS 3.2.0`.
  - Rgroups реализуются через `DNMgr per Rgroup` в NameNode.
  - Type 1 transitions переиспользуют стандартный HDFS decommissioning-процесс.
- Важные механизмы / модель / архитектура:
  - Логическое file-view не меняется; меняется mapping block->DN в inode.
  - Block placement policy HDFS не переписывается; интеграция идёт ниже block layer через DNMgr.
  - Corner case чтений во время transition закрывается повторным запросом inode клиентом.
- Числа, метрики, результаты:
  - Ожидаемое число Rgroups в больших кластерах — low tens, поэтому рост служебных NN threads считается приемлемым.
- Что отсюда брать в диплом: практический паттерн “минимально инвазивной” интеграции orchestration-слоя в существующую storage систему.
- Ограничения или оговорки: в прототипе есть упрощающее предположение, что диски DN принадлежат одному Dgroup и деплоятся вместе.

### 4.7 Evaluation
- Что делает этот раздел: количественно проверяет, что подход снимает transition overload без потери reliability и с высоким сохранением potential savings.
- Ключевые тезисы / аргументы:
  - PACEMAKER удерживает transition/load под cap и избегает периодов 100% IO, характерных для HeART.
  - Сохраняет почти весь “идеальный” выигрыш по ёмкости при реальных rate limits.
  - Устойчив к изменению ключевых параметров (`peak-IO-cap`, `threshold-AFR`) в рабочем диапазоне.
- Важные механизмы / модель / архитектура:
  - Основная оценка — chronological simulation на production logs четырёх кластеров.
  - Дополнительно — PoC эксперименты на HDFS-кластере (21 node) для operational-проверки.
- Числа, метрики, результаты:
  - Transition IO: всегда <= `5%` cap, в среднем ~`0.2–0.4%`.
  - Space-savings относительно one-size-fits-all: `14–20%`.
  - Потеря относительно “идеального мгновенного transition” — < `3%` (то есть >`97%` idealized savings сохраняется).
  - Вклад transition techniques: снижение total transition IO на `92–96%` относительно naive re-encoding.
  - В HDFS-эксперименте transition вызывает меньшую интерференцию, чем failure reconstruction; throughput после событий показывает ожидаемые ~`5%` эффекты уровня “одного DN”.
- Что отсюда брать в диплом: метрики и формат оценки для собственного прототипа/симулятора (`transition IO`, `space-savings`, `safety/MTTDL`, sensitivity).
- Ограничения или оговорки:
  - Долгосрочные эффекты оцениваются в основном симуляцией, а не многолетним live deployment.
  - HDFS PoC демонстрирует feasibility, но не заменяет полноразмерную production-валидацию.

### 4.8 Related work
- Что делает этот раздел: позиционирует PACEMAKER относительно HeART, multi-scheme systems и code-conversion literature.
- Ключевые тезисы / аргументы:
  - Главное отличие от HeART: явный учёт transition IO и механизм предотвращения overload.
  - Существующие code-level работы часто покрывают частные типы parameter transitions, а не полный спектр реальных cluster transitions.
- Важные механизмы / модель / архитектура:
  - Вклад PACEMAKER системный: orchestration + constraints + deployment-aware grouping, а не только новый код.
- Числа, метрики, результаты:
  - Раздел опирается на результаты из §7, где HeART показывает overload, а PACEMAKER удерживает IO в cap.
- Что отсюда брать в диплом: аккуратное позиционирование собственного решения как policy/orchestration вклада поверх coding-level инструментов.
- Ограничения или оговорки: related work концентрирован на близком контуре и не заменяет широкий обзор temperature-aware hybrid систем.

### 4.9 Conclusion
- Что делает этот раздел: сжимает вклад статьи в operational-формулу “adaptive redundancy без overload”.
- Ключевые тезисы / аргументы:
  - Проактивная организация layout + проактивный запуск transitions снижают суммарный transition IO.
  - Это позволяет жёстко rate-limit transitions, не нарушая reliability-цели.
- Важные механизмы / модель / архитектура:
  - Подчёркивается, что подход интегрируем в существующие scalable storage implementations (показано на HDFS).
- Числа, метрики, результаты:
  - Итоговые заявленные диапазоны сохраняются: `14–20%` space-savings, transition IO <`0.4%` average и bounded cap.
- Что отсюда брать в диплом: финальный тезис для раздела “практическая реализуемость policy-aware transitions”.
- Ограничения или оговорки: paper решает orchestration для disk-AFR адаптива; temperature model уровня файлов/объектов в статье не развёрнута.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода:
  - PACEMAKER — это не новый erasure code и не файловая система, а orchestration-layer для disk-adaptive redundancy в больших storage clusters.
  - Его цель: переводить диски между redundancy-конфигурациями без transition overload и без нарушения reliability constraints.

- Главные компоненты и их роли:
  - `Proactive-transition-initiator`: решает `when` переходить (RDn/RUp) по AFR-кривым, deployment-паттерну и IO constraints.
  - `Rgroup-planner`: решает `which` target Rgroup/scheme выбрать, стоит ли создавать новый Rgroup, когда purging необходим.
  - `Transition-executor`: решает `how` выполнить переход с минимальным IO (Type 1/Type 2) и как rate-limit.
  - `PACEMAKER metadata`: хранит конфигурацию, deployment-информацию, состояние Rgroups и данные для планирования.
  - `Rate-limiter`: применяет peak-IO-cap/average-IO-policy к transition IO.
  - Внешние входы: `AFR curve learner`, `change point detector`, disk health monitoring service, cluster metadata service.

- Где находятся data / parity / replicas / metadata:
  - Data/parity stripes физически размещаются на дисках внутри конкретного `Rgroup`; stripe не должен пересекать Rgroups.
  - При systematic codes data chunks остаются в неизменённой форме, что позволяет Type 2 переходам пересчитывать/добавлять parity без полного rewrite data.
  - Metadata о расположении и принадлежности к Rgroups хранится в metadata subsystem кластера и в metadata PACEMAKER.
  - В HDFS-прототипе mapping block->DN отражается в inode; Rgroups реализованы через отдельные DNMgr-пулы.

- Как проходят read / write / update / repair / migration / transition:
  - `read`: PACEMAKER напрямую не меняет клиентский API чтения. В HDFS клиент читает у DN; при переходе DN между Rgroups возможен miss по устаревшему inode, после чего клиент запрашивает обновлённый inode у NN и продолжает чтение.
  - `write`: foreground write path не перепроектируется в статье; PACEMAKER действует как background redundancy orchestrator.
  - `update`: отдельного алгоритма small-update parity maintenance paper не вводит; фокус на lifecycle transitions между schemes.
  - `repair`: восстановление отказов остаётся задачей базовой storage системы; PACEMAKER учитывает repair cost через constraint `AFR × k × disk-capacity` и MTTR-границы при выборе схем.
  - `migration/transition`:
    - RDn: обычно в конце infancy, переход из `Rgroup0` в более ёмкостно-эффективный Rgroup.
    - RUp: при росте AFR или при purging малого Rgroup.
    - Type 1 (few disks): сначала emptying (копирование данных на другие диски текущего Rgroup), затем перевод опустошённых дисков в новый Rgroup.
    - Type 2 (bulk): для крупных одновременных переходов пересчитываются/дозаписываются parity, часто без rewrite data chunks.

- Где принимаются policy-решения:
  - `When`: proactive-transition-initiator (canaries для trickle; threshold-AFR раннее предупреждение для step).
  - `Which`: Rgroup-planner (фильтрация viable schemes по reliability/reconstruction/MTTR/stripe constraints + оценка “worth transitioning” через disk-days под IO limits).
  - `How`: transition-executor (Type 1 vs Type 2 + rate limit per Rgroup, с safety valve при внезапном AFR-росте).

- Какие ограничения, assumptions и неясности остаются:
  - Предполагается single storage service; межсервисная координация bandwidth вне scope.
  - Для step deployments эффективность опирается на постепенность AFR-роста.
  - В HDFS-прототипе сделано упрощение про однородность Dgroup внутри DN.
  - Paper почти не раскрывает влияние orchestration на write-heavy/update-heavy workload latency вне показанных экспериментов.

## 6. Сквозные выводы по статье
- Проблема: disk-adaptive redundancy без управления transition IO в реальном масштабе приводит к перегрузке и окнам under-protection.
- Основная идея / вклад: вынести transitions в отдельный orchestration pipeline (`when/which/how`) с proactive planning и жёсткими IO constraints.
- Что нового относительно известных подходов:
  - Системная связка deployment-aware grouping + proactive initiation + IO-aware transition execution.
  - Две специализированные transition-техники (Type 1/Type 2) вместо универсального re-encoding.
- Ключевые trade-off:
  - Чем ниже peak cap, тем меньше влияние на foreground IO, но выше риск слишком медленных RUp при неблагоприятной динамике AFR.
  - Дополнительные Rgroups улучшают space efficiency, но усиливают placement constraints и сложность управления.
- Главные ограничения статьи:
  - Дизайн основан на disk-AFR адаптации, а не на fine-grained temperature модели данных.
  - Большая часть long-term результатов получена симуляцией по traces.

## 7. Что использовать в дипломе
- Что paper даёт напрямую:
  - Системный orchestration-дизайн `when/which/how` для переходов между redundancy-схемами.
  - Формализация ограничений `reliability + failure-reconstruction IO + peak/average transition IO`.
  - Подтверждённые на evaluation диапазоны (`14–20%` space-savings, transition IO в cap `<=5%`, в среднем `0.2–0.4%`).
- Что является нашей интерпретацией применимости:
  - Перенос тех же принципов orchestration на переходы `replication <-> EC` по температуре данных.
  - Использование AFR-driven trigger logic как шаблона для temperature-driven trigger/policy, а не как готового механизма.
- Роль источника в структуре диплома:
  - `practical system paper` и baseline по безопасной orchestration transitions.
  - Не theoretical foundation temperature-модели и не универсальный design для multi-tenant/multi-service систем.
- Какие 2-4 идеи стоит взять напрямую:
  - Идея `transition IO as first-class constraint` при выборе/смене redundancy схем.
  - Разделение policy на `when/which/how` с отдельными компонентами планирования и исполнения.
  - Deployment-aware стратегии переходов (trickle vs step) и проактивный запуск RUp до crossing tolerated-AFR.
  - Выбор техники migration по доле одновременно переходящих дисков (emptying vs bulk parity recalculation).
- Для какого раздела диплома каждая идея нужна:
  - Постановка задачи и архитектура policy-engine.
  - Раздел про migration/transcode pipeline и контроль рисков under-protection.
  - Экспериментальный раздел (метрики IO cap, savings, sensitivity).
- Какие метрики / формулировки / сравнения можно опереть на этот источник:
  - `peak transition IO`, `average transition IO`, `space-savings vs one-size-fits-all`, доля от idealized savings, `MTTDL constraint satisfaction`, вклад transition techniques.
  - Сравнение с реактивным baseline (типа HeART) как с источником overload-риска.
- Что нельзя переносить в диплом без оговорок:
  - Прямое использование AFR-эвристик вместо temperature-модели данных.
  - HDFS-specific детали (`DNMgr per Rgroup`, decommission semantics) как универсальный рецепт для object store/DB.
  - Предположение о плавном AFR-росте как всегда верное.

## 8. Полезные цитаты
- "transition IO under existing approaches can consume 100% cluster IO continuously for several weeks."
  - Стр.: 1
  - Зачем нужна: компактно фиксирует масштаб проблемы transition overload.
- "PACEMAKER treats transition IO as a first class citizen by taking it into account for each of its three key decisions."
  - Стр.: 6
  - Зачем нужна: центральная формулировка архитектурной идеи paper.
- "PACEMAKER labels the first C deployed disks of a Dgroup as canary disks, where C is a configurable, high enough number of disks to yield statistically significant AFR observations."
  - Стр.: 7
  - Зачем нужна: подтверждает конкретный механизм proactive-планирования для trickle deployments.
- "By proactively keeping step-deployed disks in distinct Rgroups and using specialized transitioning schemes whenever possible, instead of using simple re-encoding for all transitions, PACEMAKER reduces total transition IO by 92–96% for the four clusters."
  - Стр.: 13
  - Зачем нужна: ключевой количественный результат по эффективности transition execution.
- "PACEMAKER orchestrates disk-adaptive redundancy without transition overload, allowing use in real-world clusters."
  - Стр.: 14
  - Зачем нужна: ёмкая формулировка итогового системного вклада статьи.

## 9. Термины и понятия
- `Disk-adaptive redundancy`: подбор redundancy-схемы в зависимости от AFR-профиля дисков.
- `Transition overload`: ситуация, когда переходы между схемами избыточности потребляют непропорционально большой IO budget кластера.
- `Dgroup`: группа дисков одного make/model.
- `Rgroup`: группа дисков с общей redundancy scheme и placement-ограничением “stripe внутри группы”.
- `Rgroup0`: базовая one-size-fits-all группа с дефолтной redundancy.
- `Unspecialized disks`: диски в Rgroup0.
- `Specialized disks`: диски вне Rgroup0.
- `RDn transition`: переход в схему с меньшей избыточностью (более space-efficient).
- `RUp transition`: переход в схему с большей избыточностью (ради reliability).
- `Canary disks`: первые C дисков trickle Dgroup, используемые для обучения AFR-кривой.
- `Tolerated-AFR`: максимальный AFR, при котором текущая схема ещё удовлетворяет reliability target.
- `Threshold-AFR`: порог раннего срабатывания proactive RUp для step deployments.
- `Peak-IO-cap`: верхний предел мгновенного transition IO.
- `Average-IO constraint`: долгосрочный лимит доли IO на transitions.
- `Type 1 transition (emptying disks)`: переход через освобождение дисков и перевод их в новый Rgroup без full re-encoding.
- `Type 2 transition (bulk parity recalculation)`: массовый переход целого Rgroup с перерасчётом parity.

## 10. Итог в одном абзаце
PACEMAKER ценен для диплома как системный источник, который переводит идею adaptive redundancy из уровня “выбрать код по AFR” на уровень полноценной orchestration-архитектуры переходов. Работа показывает, что главное узкое место в реальных кластерах — не только выбор схемы хранения, но и переход между схемами под жёсткими IO и reliability ограничениями. Ключевой практический вклад — pipeline из трёх decision-компонентов (`when/which/how`) плюс deployment-aware техники перехода (Type 1/Type 2), что позволяет убрать transition overload и сохранить значимый capacity выигрыш. Для темы гибридной системы replication+EC это особенно важно, потому что любые temperature-driven решения тоже упираются в стоимость и безопасность transitions. Статья также даёт воспроизводимый набор метрик для оценки policy-движка и показывает реальную интеграцию в HDFS без радикальной перестройки data path. Пределы источника в том, что он ориентирован на disk-AFR адаптацию и опирается на определённые предпосылки по динамике отказов и deployment-паттернам. Поэтому в дипломе его нужно использовать как архитектурный baseline orchestration-слоя, дополняя собственной моделью температуры данных и правилами перехода между replication и EC.
