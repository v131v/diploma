# A Survey of the Past, Present, and Future of Erasure Coding for Storage Systems

## 1. Библиографическая карточка
- ID: `ec_survey_tos_2024`
- Авторы: Zhirong Shen, Yuhui Cai, Keyun Cheng, Patrick P. C. Lee, Xiaolu Li, Yuchong Hu, Jiwu Shu
- Год: 2024
- Тип: survey
- Ссылка: https://keyuncheng.github.io/files/publications/tos24ecsurvey.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `related work` + `theoretical foundation`
- Для каких разделов диплома полезен: введение, обзор литературы, постановка trade-off, раздел про переходы между схемами избыточности
- Какой главный вопрос диплома помогает закрыть: почему при проектировании гибридной системы нельзя смотреть только на storage overhead, а нужно одновременно учитывать performance, reliability и стоимость переходов между схемами

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `1. Introduction` | 1-3 | Постановка общей проблемы и трёхстороннего trade-off: storage efficiency, performance, reliability | Очень важен |
| `2. Background of Erasure Coding` | 4-7 | База по RS, stripe, adoption EC и ключевым deployment challenges | Очень важен |
| `3. New Constructions of Erasure Coding` | 8-14 | Обзор семейств кодов, которые улучшают repair, update или storage properties | Важен |
| `4. Algorithmic Techniques for Erasure Coding` | 15-23 | Ускорение операций, repair/update algorithms, consensus, redundancy transitioning, reliability evaluation | Критически важен |
| `5. Erasure Coding for Emerging Architectures` | 24-27 | Как EC адаптируется к flash, in-memory, programmable switches, edge-cloud и другим средам | Важен |
| `6. Open Problems and Future Directions` | 27-28 | Набор будущих направлений, включая AI-driven management | Умеренно важен |
| `7. Summary and Conclusions` | 28 | Финальное сжатое обобщение всей классификации | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: задаёт системную рамку статьи и объясняет, почему erasure coding давно перестал быть чисто теоретической темой.
- Ключевые тезисы / аргументы: EC экономичнее replication по избыточности, но добавляет существенные издержки по repair, updates, bandwidth и I/O; центральный вопрос состоит в балансе трёх измерений, а не в поиске "лучшего" кода вообще.
- Важные механизмы / модель / архитектура: авторы явно делят литературу на три главные группы: новые конструкции кодов, алгоритмические техники и EC для новых архитектур.
- Числа, метрики, результаты: обзор строится по корпусу из 285 работ за 2002 - август 2023; 76.1% работ укладываются в три главные исследовательские линии.
- Что отсюда брать в диплом: это удобная рамка для введения и related work, где можно сразу показать, что тема диплома лежит на пересечении EC design, redundancy transitioning и архитектурных ограничений.
- Ограничения или оговорки: раздел формирует карту области, но не предлагает temperature-aware политику и не отвечает на вопрос, как именно строить гибридный pipeline хранения.

### 4.2 Background of Erasure Coding
- Что делает этот раздел: даёт минимально необходимую системную базу по RS-кодам, stripe model, coding rate, deployment history и challenges.
- Ключевые тезисы / аргументы: авторы объясняют, почему RS-коды настолько популярны в практике, а затем показывают, что реальные deployment issues начинаются не на уровне "можно ли восстановить данные", а на уровне repair cost, update cost, degraded reads и управления redundancy.
- Важные механизмы / модель / архитектура: вводятся понятия `stripe`, `coding rate`, `data chunks`, `parity chunks`, MDS-свойства; затем отдельно обсуждается adoption EC в RAID, академических distributed storage systems и production deployments.
- Числа, метрики, результаты: чисел в этом разделе немного, но он фиксирует сами метрики, которыми затем живёт весь обзор: bandwidth, I/O cost, update overhead, fault tolerance.
- Что отсюда брать в диплом: этот раздел подходит для теоретического слоя диплома, чтобы аккуратно ввести терминологию и показать, почему plain replication и plain EC являются недостаточными крайностями.
- Ограничения или оговорки: раздел объясняет фон, но не помогает напрямую выбрать конкретный pipeline `replication -> hybrid -> EC`.

### 4.3 New Constructions of Erasure Coding
- Что делает этот раздел: систематизирует семейства кодов, которые меняют свойства базовых RS-кодов ради более выгодных характеристик в конкретных операциях.
- Ключевые тезисы / аргументы: разные классы кодов оптимизируют разные стороны системы; локальность, стоимость repair, storage optimality и устойчивость к sector failures не совпадают автоматически.
- Важные механизмы / модель / архитектура: рассматриваются XOR-based RAID codes, regenerating codes, LRC, sector-disk codes и piggybacking codes; особенно важно, что LRC и repair-aware constructions возникают как ответ на практические ограничения repair traffic и degraded-mode cost.
- Числа, метрики, результаты: раздел не даёт единой численной метрики для всех кодов, но очень ясно показывает, какие параметры обычно сравнивают: repair bandwidth, number of chunks contacted, storage overhead, locality.
- Что отсюда брать в диплом: полезен для выбора холодного или позднего слоя pipeline и для related work по альтернативам к классическому RS.
- Ограничения или оговорки: сам по себе этот раздел не говорит, когда именно и по каким сигналам надо переключаться между кодами.

### 4.4 Algorithmic Techniques for Erasure Coding
- Что делает этот раздел: показывает, что улучшать storage system можно не только новыми кодовыми конструкциями, но и алгоритмами поверх существующих кодов.
- Ключевые тезисы / аргументы: значительная часть практической ценности EC определяется тем, насколько эффективно реализованы encode/decode, repair, updates, consensus и change of coding parameters.
- Важные механизмы / модель / архитектура: авторы разбирают acceleration algorithms, repair-efficient и update-efficient techniques, consensus for EC, reliability evaluation и отдельно `redundancy transitioning`.
- Числа, метрики, результаты: здесь нет одной сводной цифры, но раздел формализует язык, на котором следует обсуждать migration cost: network traffic, I/O overhead, re-encoding work, data redistribution.
- Что отсюда брать в диплом: это самый полезный раздел обзора для нашей темы, потому что он связывает EC с реальной стоимостью смены схемы хранения; определение `redundancy transitioning` и его издержек напрямую пригодно для архитектурного раздела и выбора метрик.
- Ограничения или оговорки: обзор перечисляет техники и компромиссы, но не предлагает end-to-end policy, которая автоматически связывала бы hotness данных с моментом и направлением перехода.

### 4.5 Erasure Coding for Emerging Architectures
- Что делает этот раздел: переносит разговор из классических disk clusters в среды, где меняются ограничения по latency, memory footprint, network RTT или устройствам хранения.
- Ключевые тезисы / аргументы: одна и та же EC-логика по-разному проявляется в flash, in-memory storage, disaggregated memory, programmable switches и edge-cloud storage; архитектура определяет, какие издержки становятся главным bottleneck.
- Важные механизмы / модель / архитектура: обсуждаются hybrid и popularity-aware решения для in-memory и edge-cloud сред, кеширующие и tiered architectures, а также offloading части логики в сеть или память.
- Числа, метрики, результаты: раздел не сводится к одной таблице чисел, но вводит важные метрики вне классического storage overhead, например cache hit ratio, access latency, synchronization traffic и memory efficiency.
- Что отсюда брать в диплом: он помогает не абсолютизировать результаты классических файловых систем и показывает, что temperature-aware/hybrid ideas уже появляются в смежных архитектурах.
- Ограничения или оговорки: для диплома этот раздел скорее расширяет горизонт related work, чем даёт готовый design pattern.

### 4.6 Open Problems and Future Directions
- Что делает этот раздел: отмечает направления, где EC-исследования ещё не стабилизировались.
- Ключевые тезисы / аргументы: authors считают перспективными AI-driven code management, proactive reliability management и новые носители вроде DNA storage.
- Важные механизмы / модель / архитектура: особенно интересна мысль о переходе от reactive к proactive management, когда система не только чинит последствия событий, но и заранее меняет redundancy.
- Числа, метрики, результаты: раздел концептуальный, без жёстких численных результатов.
- Что отсюда брать в диплом: можно использовать как аккуратный мост к будущим улучшениям собственной системы, например к прогнозированию температуры или proactive transitions.
- Ограничения или оговорки: это future work section, а не подтверждённый baseline для основной архитектуры диплома.

### 4.7 Summary and Conclusions
- Что делает этот раздел: компактно собирает итоговую классификацию обзора.
- Ключевые тезисы / аргументы: EC в storage systems развивается по трём основным направлениям: новые кодовые конструкции, алгоритмические техники и адаптация к emerging architectures.
- Важные механизмы / модель / архитектура: авторы ещё раз связывают эти три направления с конкретными улучшениями в encode/decode, repair, storage efficiency и deployment.
- Числа, метрики, результаты: новых чисел не вводится; ценность раздела в аккуратной финальной рамке.
- Что отсюда брать в диплом: удобно использовать как финальную опору для структуры related work.
- Ограничения или оговорки: это summary, поэтому все practically important детали нужно брать из предыдущих разделов.

## 5. Архитектура и устройство системы / метода
- Paper не описывает единую storage system architecture, поэтому здесь важно честно фиксировать не полный system design, а устройство обзорного метода и набор архитектурных контекстов, которые он сравнивает.
- Как устроен метод статьи: авторы делают DBLP-based corpus study по 285 работам за 2002 - август 2023, затем группируют литературу в три крупных направления и отдельно разбирают deployment settings для emerging architectures.
- Какие архитектурные блоки реально различаются в статье:
  - `flash storage` - ограничения по erase count, FTL и WOM/LDPC-подходам;
  - `in-memory storage` - granularity объектов, metadata overhead, skewed accesses, hybrid replication + EC, update efficiency и object redistribution;
  - `disaggregated memory` - RDMA, сетевой bandwidth, pipelining encoding с передачей данных;
  - `programmable switches` - ограниченная on-chip memory и простые арифметические операции, из-за чего важны in-network aggregation и repair pipelines;
  - `edge-cloud storage` - разделение edge cache и cloud persistence, synchronization traffic и hybrid redundancy across tiers.
- Где находятся `data / parity / metadata`:
  - paper обсуждает их только в рамках конкретных архитектурных контекстов, а не как единую global data plane;
  - для in-memory storage отдельно подчёркивается, что small objects создают metadata overhead;
  - для edge-cloud storage различаются cached chunks на edge и coded chunks в cloud;
  - единой общей схемы размещения chunks, parity и metadata в статье нет.
- Как проходят операции:
  - article обсуждает `encoding`, `decoding`, `repair`, `update`, `redundancy transitioning` и `cache/placement decisions` как family of techniques;
  - при этом нет универсального write/read path, потому что каждая архитектура меняет bottleneck и placement constraints;
  - управление переходами в survey фиксируется как research topic, а не как реализованный controller.
- Где принимаются policy-решения:
  - авторы показывают, что на выбор схемы влияют access skew, network latency, memory footprint, repair cost и reliability requirements;
  - но сама статья не предлагает одной temperature-aware policy, которая бы решала, когда именно и куда переводить данные.
- Что важно для диплома:
  - survey полезен как честная карта архитектурных ограничений, на которые должна опираться любая temperature-aware hybrid system;
  - особенно важно, что статья показывает: EC меняется не только по кодовым параметрам, но и по среде deployment, поэтому архитектурный контекст нельзя игнорировать.
- Ограничения и неясности:
  - нет full system design, единого metadata plane и унифицированной orchestration logic;
  - статья описывает family of architectures и associated trade-offs, а не одну цельную реализованную систему.

## 6. Сквозные выводы по статье
- Проблема: современным storage systems нужна более дешёвая по памяти отказоустойчивость, чем replication, но практическое применение EC упирается в performance overhead, repair/update costs и reliability trade-off.
- Основная идея / вклад: статья даёт не новый код и не новую систему, а системную карту области, в которой EC рассматривается как набор практических компромиссов, а не как одна формула кодирования.
- Что нового относительно известных подходов: обзор объединяет не только code constructions, но и algorithmic techniques и emerging architectures, то есть связывает теорию кодов с реальным deployment context.
- Ключевые trade-off: storage efficiency против repair/update cost, latency и reliability; дополнительный важный слой для диплома - стоимость `redundancy transitioning`.
- Главные ограничения статьи: обзор не проектирует целостную гибридную систему `replication + EC`, не задаёт temperature-aware policy и не предлагает конкретный алгоритм переключения схем хранения.

## 7. Что использовать в дипломе
- Взять как основную обзорную рамку для related work: сначала типы кодов, затем алгоритмические техники, затем архитектурный контекст.
- Опереться на раздел про `redundancy transitioning` в теоретической постановке migration/transcode cost и в выборе метрик для сравнения.
- Использовать как источник строгой терминологии: `stripe`, `coding rate`, `repair-efficient`, `update-efficient`, `reliability evaluation`, `emerging architectures`.
- Не переносить из этого источника готовую policy выбора схемы хранения: обзор полезен как карта области и как обоснование trade-off, но не как blueprint целевой системы.

## 8. Полезные цитаты
- "Erasure coding is a known redundancy technique that has been popularly deployed in modern storage systems to protect against failures."
  Стр.: 1
  Зачем нужна: это короткое и сильное подтверждение, что EC давно является практической, а не только теоретической техникой.

- "How to resolve the tensions among storage efficiency, performance, and reliability has been the major research direction in the literature for decades."
  Стр.: 1
  Зачем нужна: формулирует центральный trade-off, вокруг которого удобно строить постановку задачи диплома.

- "We focus on the papers that are published from 2002 to August 2023, and collected 285 papers in total."
  Стр.: 3
  Зачем нужна: показывает объём корпуса литературы, на котором построен обзор, и усиливает его статус как опорного survey paper.

- "We observe that 76.1% of all collected papers can be classified into three topics: (i) erasure coding constructions, (ii) algorithmic techniques for erasure coding (e.g., the algorithms for accelerating the encoding, repair, and update operations), and (iii) erasure coding for emerging architectures."
  Стр.: 3
  Зачем нужна: даёт готовую типологию литературы, полезную для структуры related work.

- "By redundancy transitioning, we refer to adjusting the erasure coding parameters and re-encoding the existing coded data with new coding parameters."
  Стр.: 21
  Зачем нужна: даёт аккуратное определение redundancy transitioning, на которое можно опираться в дипломе.

- "Albeit the benefits, redundancy transitioning often incurs substantial network traffic and I/O overheads in a distributed setting, especially in re-encoding the existing data and re-distributing the newly coded data."
  Стр.: 21
  Зачем нужна: фиксирует ключевое системное ограничение любых переходов между схемами избыточности.

## 9. Термины и понятия
- `Erasure coding`: схема избыточности, при которой исходные данные кодируются в набор chunks так, чтобы оригинал восстанавливался из достаточного их подмножества.
- `Stripe`: кодовое слово в storage-system смысле, то есть набор data chunks и parity chunks, которые кодируются и восстанавливаются совместно.
- `Coding rate`: отношение `k/n`, показывающее долю полезных данных относительно общего объёма закодированного stripe.
- `LRC`: locally repairable codes, которые уменьшают стоимость восстановления за счёт локальности, жертвуя частью storage efficiency.
- `Redundancy transitioning`: изменение параметров EC и перекодирование уже сохранённых данных под новую схему.

## 10. Итог в одном абзаце
Этот обзор полезен для диплома прежде всего как карта всей предметной области. Он помогает аккуратно показать, что задача не сводится к сравнению replication и EC по памяти, а требует одновременно учитывать repair, updates, latency, reliability и стоимость переходов между схемами. Самая ценная часть для нашей темы - раздел про algorithmic techniques, особенно `redundancy transitioning`, потому что он напрямую связывает EC с migration/transcode cost. Разделы про новые коды и emerging architectures тоже важны, но скорее как расширение related work и как источник альтернативных design choices. При этом обзор не даёт готового ответа, как именно строить temperature-aware pipeline хранения. Поэтому в дипломе его лучше использовать как теоретико-обзорную основу перед более прикладными paper про hybrid redundancy, file lifetime и hot/cold-aware switching.
