# Janus: Optimal Flash Provisioning for Cloud Storage Workloads

## 1. Библиографическая карточка
- ID: `janus_atc_2013`
- Авторы: Christoph Albrecht, Arif Merchant, Murray Stokely, Muhammad Waliji, François Labelle, Nate Coehlo, Xudong Shi, C. Eric Schrock
- Год: 2013
- Тип: conference paper
- Ссылка: https://www.usenix.org/conference/atc13/technical-sessions/presentation/albrecht

## 2. Зачем этот источник нужен для диплома
- Роль источника: practical system paper
- Для каких разделов диплома полезен: related work по workload-aware tiering, раздел про policy-движок распределения быстрого tier (как шаблон orchestration), раздел про cost/performance trade-off, раздел про operational constraints миграций.
- Какой главный вопрос диплома он помогает закрыть: как на уровне политики распределять ограниченный быстрый слой между heterogeneous workload-ами, опираясь на измеряемую «температуру» (age/locality) и ограничения по write-rate/износу.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| Abstract | 1 | Постановка: двухуровневое хранилище (flash+disk), per-workload allocation, optimization, итоговый выигрыш 47-76% по flash hit rate | Высокая |
| 1 Introduction | 1 | Мотивация: flash дорогой, workload-ы сильно различаются; нужны не равные доли, а оптимальное распределение | Высокая |
| 2 Related Work | 2 | Контекст по HSM/multi-tier/caching и отличие Janus (cloud-scale provisioning + monitoring + optimization) | Средняя |
| 3 System Description | 2-3 | Архитектура Janus в Colossus: insertion-on-write, per-workload partitioning, offline solver, контур интеграции с ФС | Очень высокая |
| 4 Workload Characterization | 3 | Эмпирика по возрасту данных и чтений, вариативность workload-ов | Очень высокая |
| 4.1 Cacheability Functions | 3-4 | Определение cacheability-функции, построение из двух гистограмм, связь с FIFO/LRU | Очень высокая |
| 5 Economics and Provisioning | 4-5 | Экономическая модель (IOPS/$ и GiB/$), break-even анализ и user-level выбор flash объёма | Высокая |
| 6 Optimizing the Flash Allocation for Workloads | 5-6 | Формализация weighted max reads под ограничением суммарного flash, LP-постановка | Очень высокая |
| 7 Optimization with Bounded Write Rates | 5-7 | Добавление ограничения write-rate, write probability, лагранжиан, линеаризация и greedy | Очень высокая |
| 8 Evaluation | 7-11 | Production и trace-based оценка в Colossus; сравнение policy-вариантов FIFO/LRU и bounded writes | Очень высокая |
| 8.1 File Placement in Colossus | 7 | Практическая реализация placement/eviction через TTL и scanner | Очень высокая |
| 8.2 Datasets and definitions | 7-8 | Датасеты, train/eval окна, метрики hit/size/write | Высокая |
| 8.3 Does the Past Predict the Future? | 8 | Стабильность прогнозов между train и eval (обычно в пределах 7%) | Высокая |
| 8.4 Janus Deployment | 8-9 | Результаты deployment в 4 cell, сравнение predicted vs measured | Очень высокая |
| 8.5 Comparing Alternative Allocation Methods | 9 | Сравнение optimized FIFO vs proportional/single FIFO; вклад workload-level дисбалансов | Очень высокая |
| 8.6 Impact of Bounded Flash Write Percentage | 10 | Компромисс между write-bound и flash hit rate/TTL | Высокая |
| 8.7 Evaluation of LRU Eviction | 10-11 | LRU age/censoring-модель, upper/lower bounds, выигрыш LRU и его operational overhead | Очень высокая |
| 8.7.1 LRU Cacheability Functions and Censoring | 10 | Формализация LRU age, проблема цензурирования трасс и построение bounds для cacheability | Очень высокая |
| 8.7.2 Evaluation of LRU using Multi-User Cell Dataset | 10-11 | Количественное сравнение single/optimized FIFO/LRU и вклад конкретных workload-ов | Очень высокая |
| 9 Conclusions | 11 | Итоги: flash стал экономически уместным, Janus даёт практический policy-инструмент | Высокая |
| Acknowledgments | 12 | Благодарности и контекст внедрения | Низкая |
| References | 12 | Библиография источников, на которые опирается paper | Низкая |

## 4. Подробный конспект по разделам
### 4.1 Abstract и Introduction (раздел 1)
- Что делает этот раздел:
  - Формулирует проблему распределения ограниченного flash-tier в облачной ФС между множеством неоднородных workload-ов.
  - Задает high-level pipeline: characterization -> optimization -> deployment.
- Ключевые тезисы / аргументы:
  - Простое «равное деление flash» неэффективно из-за сильной меж-workload неоднородности.
  - Нужна policy-level оптимизация с учётом cacheability и эксплуатационных ограничений (в т.ч. write-rate).
- Важные механизмы / модель / архитектура:
  - Двухуровневое хранение: flash + disk.
  - Новые файлы при создании могут помещаться в flash; далее они вытесняются (FIFO/LRU) в disk.
  - Для оператора: оптимизация общей offload-доли чтений; для владельца workload: оценка экономически целесообразного объёма flash.
- Числа, метрики, результаты:
  - Введение заявляет: до 28% чтений обслуживаются из flash при ~1% данных на flash.
  - Заявленный выигрыш: 47-76% по flash hit rate относительно «единого неразделённого flash tier».
- Что отсюда брать в диплом:
  - Формулировку проблемы как allocation-политики между конкурирующими workload-ами.
  - Мотивацию, почему «температура» должна быть workload-specific, а не глобальной.
- Ограничения или оговорки:
  - Уже во введении явно сказано, что способ формирования workload-групп и assignment приоритетов остаются вне статьи.

### 4.2 Related Work (раздел 2)
- Что делает этот раздел:
  - Позиционирует Janus относительно HSM/multi-tier систем, storage design tools и работ по caching/prefetching.
- Ключевые тезисы / аргументы:
  - Ранее известные подходы не закрывают cloud-scale задачу совместного provisioning + monitoring + per-workload allocation в распределённой среде.
  - В отличие от hint-based подходов (напр. TIP), Janus делает автоматическую оценку cacheability по наблюдаемым трассам.
- Важные механизмы / модель / архитектура:
  - Janus опирается на sampled RPC traces и статистические агрегаты, что критично при масштабе дата-центра.
- Числа, метрики, результаты:
  - Количественных результатов в разделе нет; это mainly conceptual differentiation.
- Что отсюда брать в диплом:
  - Каркас related work: Janus как practical policy engine поверх multi-tier storage, а не новая кодовая схема избыточности.
- Ограничения или оговорки:
  - Сравнение с related work качественное; нет единого head-to-head benchmark с внешними системами.

### 4.3 System Description (раздел 3)
- Что делает этот раздел:
  - Даёт операционную схему Janus в Colossus и объясняет, почему выбран insertion-on-write.
- Ключевые тезисы / аргументы:
  - Insertion-on-read для их архитектуры дороже: данные читаются клиентом напрямую с chunkserver, не каждый chunkserver имеет flash; при read-miss пришлось бы делать дополнительное чтение и сетевую запись в flash.
  - Главная цель оператора: максимизировать долю чтений, снятых с disk, при фиксированном суммарном flash.
- Важные механизмы / модель / архитектура:
  - Workload как абстракция (user/app/group of files).
  - Пер-workload priority weight и bounds.
  - Offline solver запускается периодически и обновляет рекомендации при изменении поведения workload-ов.
  - Для solver нужны два профиля по возрасту/локальности: distribution данных и distribution чтений.
- Числа, метрики, результаты:
  - Конкретные цифры появляются позже, но здесь заданы оптимизируемые показатели: read offload, weighted reads, write-rate constraints.
- Что отсюда брать в диплом:
  - Структуру control loop: monitoring -> model build -> optimization -> policy deployment.
  - Обоснование отделения policy-plane от data-plane.
- Ограничения или оговорки:
  - Формирование workload-ов и выбор весов приоритета explicitly оставлены вне scope.

### 4.4 Workload Characterization (раздел 4)
- Что делает этот раздел:
  - Показывает, что workload-ы в проде радикально различаются по возрасту читаемых данных и hotness.
  - Вводит age-based представление, которое станет входом оптимизации.
- Ключевые тезисы / аргументы:
  - Нельзя выводить политику из агрегированной «средней температуры»: разные workload-ы читают данные с возрастом от минут до года.
  - Нужна функция, которая для каждого workload сопоставляет объём flash и ожидаемый read hit rate.
- Важные механизмы / модель / архитектура:
  - FIFO age: время с создания файла.
  - LRU age: прокси temporal locality (максимальный gap между чтениями).
  - Сбор метаданных возраста данных через scan file metadata.
  - Сбор age-of-read через Dapper sampling RPC-трафика.
  - Одинаковые границы age-бинов в двух гистограммах позволяют их объединять.
- Числа, метрики, результаты:
  - На примере (Fig.2): ~50% хранимых данных моложе недели, но это >90% read-активности для конкретного workload.
- Что отсюда брать в диплом:
  - Конструкцию workload-specific «температуры» через распределения возраста данных и чтений.
  - Идею, что policy должен работать не по одному scalar-feature, а по профилю (кривой).
- Ограничения или оговорки:
  - Для LRU simple Dapper sampling недостаточен; авторам потребовался отдельный механизм sampling-by-file-id с capture всех I/O выбранных файлов.

### 4.5 Cacheability Functions (раздел 4.1)
- Что делает этот раздел:
  - Формально определяет cacheability function и способ её вычисления.
- Ключевые тезисы / аргументы:
  - `phi(x)` = число read operations, попадающих в самые «молодые» `x` байт workload-а.
  - При stationarity распределений это даёт ожидаемый flash read hit rate для allocation `x`.
- Важные механизмы / модель / архитектура:
  - Из гистограмм строятся cumulative функции `f` (байты моложе возраста) и `g` (чтения к данным моложе возраста).
  - Ключевая композиция: `phi(x) = (g o f^{-1})(x)`.
  - Линейная интерполяция между бинами делает `phi` piecewise linear.
- Числа, метрики, результаты:
  - На примере Fig.3 виден steep начальный участок кривой: небольшой flash может дать большой прирост hit rate.
- Что отсюда брать в диплом:
  - Формализацию «ценности flash/быстрого слоя» как функции allocated capacity.
  - Подход к построению кривой из дискретных production-трасс.
- Ограничения или оговорки:
  - Предположение stationarity; при резкой смене паттернов accuracy снижается.

### 4.6 Economics and Provisioning (раздел 5)
- Что делает этот раздел:
  - Переводит cacheability в money-level решение: сколько flash экономически оправдано.
- Ключевые тезисы / аргументы:
  - Break-even задаётся через `Id/Gf` (IOPS/$ диска и GiB/$ flash).
  - При их оценках порог ~1.5 IOPS/GiB (существенно ниже historical ~60), поэтому для части workload-ов all-flash уже выгоден.
- Важные механизмы / модель / архитектура:
  - Cost-модель для workload: диск+flash с учётом `phi(x)` в уменьшении disk IOPS demand.
  - Поиск `x`, минимизирующего стоимость.
- Числа, метрики, результаты:
  - Пример из Table 1:
    - Workload 1: 5.2 PiB, 1172k ops/s, Janus savings 29%, flash 0.42%.
    - Workload 2: 6.1 PiB, 2214k ops/s, Janus savings 12%, flash 2.1%.
  - Вывод: более «горячий в среднем» workload не обязательно получает больше относительной выгоды; важна форма кривой cacheability.
- Что отсюда брать в диплом:
  - Идею сочетать performance-метрику и экономическую модель в едином policy framework.
- Ограничения или оговорки:
  - Цены и break-even чувствительны ко времени/рынку; значения статьи нельзя переносить без пересчёта.

### 4.7 Optimizing the Flash Allocation (раздел 6)
- Что делает этот раздел:
  - Даёт базовую оптимизационную постановку распределения flash по workload-ам.
- Ключевые тезисы / аргументы:
  - Цель: максимизировать суммарный weighted flash read rate при ограничении общей flash capacity.
  - При concave piecewise-linear `phi_i` задача редуцируется к LP.
- Важные механизмы / модель / архитектура:
  - Variables: `x_i` (flash allocation per workload), `y_i` (линеаризация objective).
  - Ограничения: `0 <= x_i <= d_i`, `sum x_i <= F`, `y_i <= a_{i,j}+b_{i,j}x_i`.
- Числа, метрики, результаты:
  - Явных эмпирических цифр в разделе мало; ключевой результат - solvable LP-представление.
- Что отсюда брать в диплом:
  - Прямую формулировку allocation-policy как оптимизации под capacity-budget.
- Ограничения или оговорки:
  - Конкавность обычно верна, но не всегда; авторы отдельно разбирают эту проблему в разделе 7.

### 4.8 Optimization with Bounded Write Rates (раздел 7)
- Что делает этот раздел:
  - Добавляет практическое ограничение write pressure на flash (износ + latency effects).
- Ключевые тезисы / аргументы:
  - Write-bound вводится через per-workload write probability `p_i`: не каждый новый файл пишется в flash.
  - Снижение `p_i` может увеличить read benefit при фиксированном flash (данные дольше живут в flash), особенно при non-concave cacheability.
- Важные механизмы / модель / архитектура:
  - Objective: `sum p_i * phi_i(x_i/p_i)` при ограничениях `sum p_i w_i <= W`, `sum x_i <= F`.
  - Лагранжева релаксация write-bound (`lambda`) + бинарный поиск `lambda`.
  - Преобразование в функцию `h_i^lambda(x)` и дальнейшая линеаризация.
  - Решение LP greedy-алгоритмом с оценкой сложности `O(n k log k)`.
- Числа, метрики, результаты:
  - В тексте показан illustrative пример (Fig.5), где fractional writes увеличивают flash read rate при том же flash size.
- Что отсюда брать в диплом:
  - Важный для гибридной replication/EC системы принцип: policy должен учитывать не только «где хранить», но и transition/write pressure.
- Ограничения или оговорки:
  - Для non-concave случаев используют concave upper bound; оптимальность приближённая, хотя ошибка ограничивается последним шагом greedy.

### 4.9 Evaluation Setup и Production Integration (разделы 8, 8.1, 8.2)
- Что делает этот раздел:
  - Проверяет, как формулы и policy работают в production Colossus.
- Ключевые тезисы / аргументы:
  - Реализация встроена в мастер Colossus: при create выбирается flash vs disk по доступному quota + `p_i`.
  - Eviction реализован через TTL и scanner process (approximate FIFO).
- Важные механизмы / модель / архитектура:
  - Datasets:
    - Dapper: 37 дней, 10 cells, train 30 / eval 7.
    - Janus deployment: 4 cells, limited prod rollouts.
    - Multi-user cell: 1 неделя, 407 workloads.
    - Single-user cell: 30 минут full trace, 541 workloads, >10k machines.
  - Метрики: flash hit rate, normalized hit/size, write percentage, TTL.
- Числа, метрики, результаты:
  - Definition-level аккуратность: логический размер workload без overhead replication/EC.
- Что отсюда брать в диплом:
  - Практическую схему, как policy-рекомендации превращаются в runtime placement decisions.
- Ограничения или оговорки:
  - Eviction policy в имплементации «приближённый FIFO» (TTL не обновляется после назначения).

### 4.10 Evaluation Results (разделы 8.3-8.7 и 9)
- Что делает этот раздел:
  - Даёт количественную валидацию точности рекомендаций и выигрышей относительно baseline-политик.
- Ключевые тезисы / аргументы:
  - Прогноз train->eval достаточно стабилен: per-workload flash hit rate обычно в пределах ~7%.
  - Реальный deployment согласуется с оценками: average estimated 22.8% vs measured 23.5%.
  - Оптимизация по workload-ам существенно лучше «single FIFO» и proportional heuristics.
  - LRU потенциально даёт ещё выше hit rate, но с заметным operational overhead.
- Важные механизмы / модель / архитектура:
  - Сравнение allocation methods: optimized FIFO, proportional read rate, single FIFO, proportional size.
  - Write-bound trade-off: при ужесточении write cap hit rate сначала падает медленно, потом резко (ниже ~60% bound).
  - LRU с цензурированными трассами: upper/lower bounds cacheability через две крайние гипотезы о пропущенной истории.
- Числа, метрики, результаты:
  - Multi-user cell: 19% -> 28% (single FIFO -> optimized FIFO), +47% relative.
  - Single-user cell: 42% -> 74%, +76% relative.
  - При 1% flash size: single FIFO 19%, single LRU 36-40%; optimized FIFO 28%, optimized LRU 44-48%.
  - В некоторых cell без write-bound оптимизированный flash write percentage >90%.
- Что отсюда брать в диплом:
  - Набор baseline-сравнений для policy-level evaluation.
  - Аргумент, что workload-aware allocation может давать кратный выигрыш без увеличения общего flash объёма.
  - Аргумент о цене более сложной политики (LRU) в distributed environment.
- Ограничения или оговорки:
  - Часть результатов trace-based, а не полный always-on production A/B.
  - Для LRU есть неопределённость из-за censoring и необходимость bounds-интервалов.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода:
  - Janus - policy engine для двухуровневого хранения (flash+disk), который вычисляет, сколько flash выделить каждому workload-у и с какой вероятностью писать новые файлы в flash, чтобы максимизировать чтения из flash при ограничениях по ёмкости и write-rate.

- Главные компоненты и их роли:
  - `Metadata scanner` (плоскость наблюдения): строит по каждому workload гистограмму объёма данных по возрасту (FIFO age) из метаданных ФС.
  - `Trace collection`:
    - Dapper-сэмплирование RPC даёт гистограмму read-операций по возрасту для FIFO-модели.
    - Отдельный sampling-by-file-id (для LRU) собирает все I/O выбранных файлов, чтобы оценивать интервалы между чтениями.
  - `Cacheability builder`: объединяет две гистограммы с одинаковыми age-бинами и строит `phi_i(x) = g_i(f_i^{-1}(x))` (piecewise linear cacheability curve).
  - `Offline optimizer`:
    - Базовый режим: решает weighted max reads allocation (`x_i`) при ограничении `sum x_i <= F`.
    - Расширенный режим: добавляет bounded writes и вычисляет `p_i` (write probability) через лагранжеву релаксацию + линеаризацию + greedy.
  - `Colossus integration`:
    - Master на `create` использует `x_i` и `p_i`, чтобы выбрать placement (flash или disk) для нового файла.
    - Scanner process реализует выталкивание из flash по `TTL` (approximate FIFO), перемещая файл в disk по истечении времени.

- Где находятся data / parity / replicas / metadata:
  - Data: горячие новые файлы размещаются в flash-tier, затем переходят в disk-tier.
  - Metadata: create time файла и служебные атрибуты используются для возрастных гистограмм; решения по placement принимаются на уровне master.
  - Replicas/parity: paper явно не раскрывает внутренний layout репликации/EC Colossus; метрики размера/скоростей считаются в логических байтах без replication/EC overhead.

- Как проходят read / write / update / repair / migration / transition:
  - Read: клиент читает напрямую с chunkserver; выигрыш Janus проявляется как рост доли чтений, попадающих во flash-tier.
  - Write (new file): при создании master делает probabilistic admission по `p_i`; если условие проходит и есть flash space workload-а, файл идёт в flash, иначе сразу в disk.
  - Update: отдельный протокол обновлений в статье не описан; аналитика строится вокруг потока новых записей и последующей эвикции.
  - Repair: процедуры восстановления после отказов в paper не специфицированы.
  - Migration/transition:
    - Основной переход - `flash -> disk` по TTL в scanner.
    - Обратный путь `disk -> flash` как реакция на read-hit/miss в runtime не реализован (система опирается на insertion-on-write, а не insertion-on-read).
    - При заполненном flash master принудительно пишет новый файл в disk, даже если по `p_i` выбрал бы flash.

- Где принимаются policy-решения:
  - Offline-плоскость: периодический solver по историческим данным выдаёт `x_i` (flash allocation) и `p_i` (write probability) для workload-ов.
  - Online-плоскость: master применяет policy на каждом create, scanner применяет policy на эвикции.
  - Temperature classification в Janus не задаётся как дискретные классы hot/cold: используется непрерывная cacheability-кривая из age-гистограмм, и именно она определяет выгодность выделения flash.
  - Выбора схемы избыточности (replication/EC) в Janus нет; paper не описывает оркестрацию между этими схемами.

- Какие ограничения, assumptions и неясности остаются:
  - Предполагается достаточная стационарность workload-ов между train/eval окнами.
  - Формирование workload-групп и назначение приоритетов находятся вне scope статьи.
  - Реальный FIFO приближённый: TTL после назначения не обновляется.
  - Полноценная архитектура для переходов replication <-> EC и для repair не дана; фокус Janus ограничен flash/disk tiering.

## 6. Сквозные выводы по статье
- Проблема:
  - Ограниченный и дорогой flash в cloud storage нельзя эффективно распределять «поровну» между workload-ами с разной температурой и локальностью.
- Основная идея / вклад:
  - Построить workload-specific cacheability curves из production traces и решать allocation как формальную оптимизацию (с расширением на bounded writes).
- Что нового относительно известных подходов:
  - Не просто tiering rules, а policy framework: characterization + LP/greedy optimization + production deployment loop.
  - Учет write-rate ограничений через probabilistic insertion и лагранжеву релаксацию.
- Ключевые trade-off:
  - Выше flash hit rate vs выше сложность policy и мониторинга.
  - LRU даёт больше hit rate, но дороже operationally (больше состояния и cross-chunkserver сбора информации).
  - Строгий write-bound уменьшает износ/нагрузку записи, но режет hit rate.
- Главные ограничения статьи:
  - Нет детальной проработки отказоустойчивости и repair-поведения.
  - Не обсуждается полный lifecycle переходов между replication и EC (фокус на flash/disk tiering).
  - Часть результатов trace-based; переносимость зависит от структуры workload-ов и актуальных цен.

## 7. Что использовать в дипломе
- Что paper даёт напрямую:
  - Cacheability-кривая как измеримая метрика «ценности быстрого tier» для каждого workload-а.
  - Оптимизационная постановка распределения ресурса под ограничениями `capacity`, `write-rate`, `priority`.
  - Практический контур внедрения: offline computation рекомендаций + online enforcement в master/scanner.
- Что является нашей интерпретацией применимости:
  - Использовать этот подход как шаблон policy-orchestration для гибридной replication+EC системы, где вместо flash/disk могут быть разные схемы избыточности.
  - Перенести идею bounded writes/TTL как аналог контроля стоимости переходов между режимами хранения.
- Роль источника в дипломе:
  - `Related work`: workload-aware tiering и практическая эксплуатация policy-engine в production.
  - `Theoretical foundation`: формализация через cacheability-функции и constrained optimization.
  - `Practical system paper / baseline`: сравнения optimized allocation против простых heuristics.
- Какие метрики / формулировки / сравнения можно опереть на этот источник:
  - Метрики: flash hit rate, normalized flash hit rate, flash size %, flash write %, TTL, predicted vs measured gap.
  - Сравнения: optimized allocation vs single shared tier / proportional heuristics.
  - Формулировки trade-off: write-bound vs hit-rate; FIFO simplicity vs LRU effectiveness.
- Что нельзя переносить в диплом без оговорок:
  - Нельзя напрямую переносить абсолютные ценовые break-even значения (рынок изменился).
  - Нельзя трактовать Janus как готовый механизм выбора между replication и EC: этого в статье нет.
  - Нельзя обобщать LRU-результаты без учёта overhead сбора истории чтений в распределённой системе.

## 8. Полезные цитаты
- "Janus is a system for partitioning the flash storage tier between workloads in a cloud-scale distributed file system with two tiers, flash storage and disk."
  Стр.: 1
  Зачем нужна: чёткая формулировка system scope и объекта оптимизации (tier partitioning между workload-ами).

- "The file is tagged with an eviction time (TTL), which is computed from the flash allocated to that workload and the workload’s write rate."
  Стр.: 7
  Зачем нужна: ключевой практический механизм, связывающий policy-выходы (`allocation`, `write-rate`) с runtime migration flash -> disk.

- "This system has been in use at Google for 6 months."
  Стр.: 11
  Зачем нужна: подтверждает, что paper описывает не только модель, но и уже эксплуатируемый production-процесс.

- "In our trace-based estimates, flash hit rates using the optimized recommendations are 47-76% higher than the option of using the flash as an unpartitioned tier."
  Стр.: 11
  Зачем нужна: компактный итоговый результат для мотивации workload-aware policy в разделе эффективности.

## 9. Термины и понятия
- Cacheability function (`phi(x)`): функция, показывающая ожидаемый flash read rate при выделении workload-у `x` объёма flash.
- FIFO age: время с момента создания файла; используется для FIFO eviction модели.
- LRU age: proxy temporal locality как максимум интервалов между чтениями файла.
- Flash hit rate: доля read operations, обслуженных flash tier.
- Normalized flash hit rate: вклад workload-а в cell-wide flash hit rate относительно суммарного read rate cell.
- Write probability (`p_i`): вероятность, с которой новый файл workload-а будет записан в flash.
- TTL eviction: вытеснение по времени жизни файла в flash, реализующее approximate FIFO.
- Weighted max reads allocation: задача максимизации взвешенного объёма чтений из flash при ограничении flash capacity.
- Bounded write optimization: постановка, где дополнительно ограничивается суммарная скорость записи на flash.
- Censoring (для LRU): неполнота истории чтений, из-за которой cacheability оценивается интервалом (lower/upper bounds).

## 10. Итог в одном абзаце
Janus - это production-ориентированный policy framework для распределения flash tier между workload-ами в cloud-scale файловой системе, где ключом служит workload-specific characterization по возрасту данных и чтений. Статья особенно ценна тем, что соединяет измерения из реальной эксплуатации, формальную оптимизацию и практическую интеграцию в Colossus через `write probability` и TTL-based eviction. Для диплома по гибридной replication+EC системе это сильный шаблон именно policy-уровня: как превращать «температуру» в вычислимое решение распределения ресурсов и как учитывать операционные ограничения миграции. Количественно paper даёт убедимые ориентиры по выигрышу от workload-aware allocation (до 47-76% относительно неразделённого tier). Важный инженерный урок - выгода более сложной политики (например, LRU) приходит вместе с заметным operational overhead сбора и обработки истории обращений. Пределы статьи в том, что она не проектирует полный lifecycle отказоустойчивости/repair и не покрывает переходы replication <-> EC, поэтому её нужно использовать как основу policy orchestration, а не как готовый redundancy design end-to-end.
