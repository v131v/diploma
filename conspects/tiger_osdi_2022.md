# Tiger: Disk-Adaptive Redundancy Without Placement Restrictions

## 1. Библиографическая карточка
- ID: `tiger_osdi_2022`
- Авторы: Saurabh Kadekodi, Francisco Maturana, Sanjith Athlur, Arif Merchant, K. V. Rashmi, Gregory R. Ganger
- Год: 2022
- Тип: conference paper (OSDI '22)
- Ссылка: https://www.usenix.org/conference/osdi22/presentation/kadekodi

## 2. Зачем этот источник нужен для диплома
- Роль источника: practical system paper + related work.
- Для каких разделов диплома полезен: обзор adaptive redundancy; архитектура гибридной/адаптивной избыточности; раздел про безопасные transitions между схемами; раздел про policy без жёстких placement constraints.
- Какой главный вопрос диплома он помогает закрыть: как адаптировать избыточность к "температуре/надёжности" носителей без архитектурной ломки системы и без взрывного transition IO.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| Abstract | 413 | Проблема placement restrictions у prior disk-adaptive systems и идея eclectic stripes | Высокая |
| 1. Introduction | 413-414 | Мотивация, adoption hurdles Pacemaker/HeART, вклад Tiger и ключевые результаты | Очень высокая |
| 2. Background and Motivation | 414-415 | База по EC/MTTDL/AFR и контекст disk-adaptive redundancy | Высокая |
| 2.1 Existing designs are impractical | 415-416 | Детальный разбор проблем Rgroup-подхода | Очень высокая |
| 3. Eclectic Stripes and their challenges | 416 | Формулировка eclectic stripe и design-требований к системе | Очень высокая |
| 4. Mechanisms to enable eclectic stripes | 416-419 | Модель надёжности, аппроксимация MTTDL, critical AFR, eclectic volumes | Очень высокая |
| 5. Design and working of Tiger | 419-422 | Полная архитектура компонентов и lifecycle stripe/volume | Критически важная |
| 6. Evaluation of Tiger (6.1-6.4) | 422-425 | Placement flexibility, risk-diversity, space-savings, transition IO, challenging cases | Критически важная |
| 7. Additional Related Work | 425 | Смежные работы по AFR и EC transitions | Средняя |
| 8. Conclusion | 426 | Синтез результата: практичность disk-adaptive redundancy без placement limits | Высокая |
| Appendix A | 426-427 | Вывод формулы аппроксимации MTTDL | Средняя (теоретическая опора) |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: ставит проблему для крупных storage-кластеров с гетерогенными AFR и объясняет, почему subcluster/Rgroup-подходы тормозят внедрение.
- Ключевые тезисы / аргументы: one-scheme-fits-all EC переизбыточен по capacity; disk-adaptive redundancy даёт экономию, но текущие решения ограничивают размещение и повышают операционный риск.
- Важные механизмы / модель / архитектура: вводится понятие eclectic stripe, где схема избыточности выбирается под набор AFR конкретно выбранных дисков, а не под однородный Rgroup.
- Числа, метрики, результаты: заявлено ускорение оценки MTTDL на 2-4 порядка; точность аппроксимации >95% (в среднем >99.5%); по 4 production-кластерам transition IO у Tiger не выше 0.5% в среднем.
- Что отсюда брать в диплом: framing проблемы "гибкость placement vs. adaptive redundancy", плюс аргумент, что ограничения на placement сами становятся риском.
- Ограничения или оговорки: введение агрегирует результаты симуляции и не даёт деталей реализации отдельных background-компонентов (их раскрывают позже).

### 4.2 Background and Motivation
- Что делает этот раздел: даёт минимально необходимую базу по EC, MTTDL и AFR для понимания адаптации схем избыточности.
- Ключевые тезисы / аргументы: в холодных данных EC доминирует replication по эффективности хранения; AFR сильно неоднороден (по make/model и времени жизни), значит статическая схема теряет эффективность.
- Важные механизмы / модель / архитектура: классическая CTMC-модель для MTTDL однородной полосы, связь AFR и отказов, trade-off между шириной stripe и reconstruction cost.
- Числа, метрики, результаты: цитируется ожидаемая экономия >20% от disk-adaptive подходов на больших кластерах; обсуждаются прошлые результаты HeART (до ~20% для EC и ~33% для replication).
- Что отсюда брать в диплом: терминологическую и математическую основу для раздела "метрики надёжности" и мотивацию, почему policy должна учитывать гетерогенность.
- Ограничения или оговорки: здесь нет новой архитектуры; раздел в основном контекстный и опирается на prior work.

### 4.3 Existing designs are impractical (Section 2.1)
- Что делает этот раздел: формально доказывает практические проблемы существующих disk-adaptive систем.
- Ключевые тезисы / аргументы: Rgroup-модель вводит жёсткие placement constraints, снижает risk-diversity, делает систему зависимой от раннего AFR-prediction и требует all-or-nothing adoption.
- Важные механизмы / модель / архитектура: сравнение Tiger/Pacemaker через метрики viable disks и risk-diversity; логика "если stripe должен оставаться внутри Rgroup, то cross-domain placement сильно сужается".
- Числа, метрики, результаты: для Pacemaker более 30% дисков могут быть невалидны для более широких схем (за счёт требований MTTDL внутри Rgroup).
- Что отсюда брать в диплом: сильный аргумент против архитектур, где policy выбирается на уровне крупных однородных групп; особенно важно для главы про transitions и эксплуатационные риски.
- Ограничения или оговорки: сравнение ориентировано на конкретную архитектуру Pacemaker и выбранные operational assumptions.

### 4.4 Eclectic Stripes and their challenges (Section 3)
- Что делает этот раздел: формулирует абстракцию eclectic stripe и требования к системе, которая должна её поддержать.
- Ключевые тезисы / аргументы: eclectic stripe структурно не отличается от обычной EC stripe по размещению chunk'ов, но учитывает AFR каждого диска при оценке надёжности и выборе схемы.
- Важные механизмы / модель / архитектура: пять требований к дизайну: быстрая и точная оценка надёжности; эффективное обслуживание при изменении AFR; совместимость с существующими placement policies; сохранение выгод disk-adaptive подхода; adoption-friendly дизайн для кластеров разного масштаба.
- Числа, метрики, результаты: численных итогов тут почти нет, но задаётся критерий успеха через low transition IO + space-savings + reliability target.
- Что отсюда брать в диплом: checklist проектных требований для собственной гибридной системы (особенно пункты про policy compatibility и incremental adoption).
- Ограничения или оговорки: раздел задаёт цели, а не демонстрирует реализацию.

### 4.5 Mechanisms to enable eclectic stripes (Section 4)
- Что делает этот раздел: даёт математическую и операционную базу, позволяющую практично работать с eclectic stripes.
- Ключевые тезисы / аргументы: точный расчёт MTTDL для heterogeneous stripe слишком дорогой; нужна аппроксимация, которая достаточно точная и радикально быстрее.
- Важные механизмы / модель / архитектура: обобщённая Markov-цепь для heterogeneous AFR; аппроксимация через Poisson-binomial; вывод ключевого практического теста "average AFR < critical AFR" для быстрого safety-check; концепт eclectic volume как группировки stripes с одинаковой схемой и набором дисков.
- Числа, метрики, результаты: Markov-цепь 10-of-14 eclectic stripe имеет 1472 состояния против 6 у homogeneous; ошибка аппроксимации MTTDL в тестах не больше 5%, средняя <0.5%; вычисление ускоряется на 2-4 порядка; default размер eclectic volume 1 TB; метаданные EVDirectory <100 MB даже при 100K дисков и 20 TB на диск.
- Что отсюда брать в диплом: практичную идею двухуровневой проверки надёжности (cheap precheck по critical AFR + точный расчёт по необходимости), и идею агрегирования контроля надёжности на уровне volume для сокращения metadata/scan overhead.
- Ограничения или оговорки: аппроксимация валидна при типичном для систем условии высокой скорости repair относительно failure rate; в extracted тексте формулы местами зашумлены типографикой, поэтому для формулировок лучше проверять PDF.

### 4.6 Design and working of Tiger (Section 5)
- Что делает этот раздел: описывает полный рабочий pipeline Tiger и взаимодействие компонентов с существующим storage stack.
- Ключевые тезисы / аргументы: Tiger минимально вторгается в существующие placement-политики и reused-компоненты (AFR learner/change-point/rate limiter), но меняет granularity управления избыточностью на stripe/volume.
- Важные механизмы / модель / архитектура: ESAllocator строит stripe с целевым MTTDL, при необходимости сужая ширину; EVManager группирует stripes в eclectic volumes и ведёт EVDirectory; EVHInspector отслеживает AFR/failures; ESReorganizer выполняет реконструкции и transitions с приоритизацией по риску.
- Числа, метрики, результаты: порядок задач ESReorganizer: reconstruction -> increase redundancy near-risk -> decommission move -> redundancy reduction; ожидаемая частота EVDirectory updates в очень больших кластерах остаётся низкой (порядка <1000/день по оценке авторов).
- Что отсюда брать в диплом: архитектурный шаблон, как встроить adaptive EC в существующую систему без полной переделки placement logic.
- Ограничения или оговорки: paper не детализирует latency/CPU overhead каждого компонента в production-реализации, фокус на reliability/capacity/transition IO.

### 4.7 Evaluation of Tiger (Section 6)
- Что делает этот раздел: проверяет, выполняет ли Tiger заявленные design goals на реальных логах больших кластеров.
- Ключевые тезисы / аргументы: Tiger снимает placement ограничения, повышает risk-diversity, даёт сопоставимую или лучшую экономию места и избегает срочных IO-всплесков.
- Важные механизмы / модель / архитектура: trace-driven simulation на 4 production-кластерах (Google + Backblaze), сравнение с Pacemaker при одинаковых ограничениях/инструментах.
- Числа, метрики, результаты: Tiger имеет >75% viable disks для всех схем на всех кластерах; минимум risk-diversity у Tiger 60% и рост к 100% на широких схемах; до 5% дополнительной space-savings относительно Pacemaker; average transition IO не более 0.5% (peak <5%); пример из paper: Pacemaker для некоторых сценариев требовал бы 196% дискового IO в сутки и ~40 дней форы по предсказанию AFR, тогда как Tiger избегает таких всплесков.
- Что отсюда брать в диплом: метрики сравнения policy (viable disks, risk-diversity, transition IO burstiness, distance to MTTDL target), и важный тезис про снижение срочности transitions.
- Ограничения или оговорки: оценка в основном симуляционная; авторы отдельно признают тяжёлые сценарии (массовые отказы, кластер с одним step-deployed make/model), где возможности адаптации ограничены.

### 4.8 Additional Related Work + Conclusion
- Что делает этот раздел: ставит Tiger среди работ по AFR modeling/failure prediction/EC transitions и формулирует итоговый вклад.
- Ключевые тезисы / аргументы: Tiger ортогонален многим кодовым оптимизациям transitions и может с ними сочетаться; ключевая инновация именно в снятии placement restrictions при сохранении disk-adaptive выгод.
- Важные механизмы / модель / архитектура: архитектурная новизна (eclectic stripe + volume-level management), а не новый код EC как таковой.
- Числа, метрики, результаты: в conclusion суммируются два основных эффекта снижения риска: рост disk-type diversity внутри stripe и снижение burstiness/urgency transition IO.
- Что отсюда брать в диплом: позиционирование своего подхода относительно классов работ (кодовые оптимизации, tiering-policy, adaptive redundancy engines).
- Ограничения или оговорки: related work обзорный, без углублённого head-to-head со всеми альтернативами вне Pacemaker/HeART.

## 5. Архитектура и устройство системы / метода
- Назначение системы или метода: делать disk-adaptive redundancy практичной без Rgroup-ограничений размещения, сохраняя target reliability (MTTDL), снижая storage overhead и сглаживая transition IO.
- Главные компоненты и их роли: `ESManager` (контур управления stripe lifecycle) включает `ESAllocator`, `ESMTTDLEngine`, `ESReorganizer`; `ESAllocator` выбирает диски и схему, начиная с максимально широкой и сужая stripe при недоборе MTTDL; `ESMTTDLEngine` выполняет проверку надёжности (быстрый precheck через critical AFR + расчёт MTTDL); `ESReorganizer` исполняет reconstruction и transitions; `EVManager` управляет eclectic volumes; `EVHInspector` отслеживает disk failures и AFR change points; `EVDirectory` хранит volume->disks и disk->volume IDs; reused-сервисы: placement policy, AFR learner, change-point detector, rate limiter.
- Где находятся data / parity / replicas / metadata: data/parity chunks хранятся как обычные EC-stripes на дисках кластера; eclectic volume объединяет stripes с одинаковыми `(scheme, disk set)`; metadata Tiger хранится в `EVDirectory` и локальных маппингах `stripe ID -> volume ID` на дисках; paper поддерживает coexistence eclectic/homogeneous stripes (incremental adoption), но не описывает отдельный replication plane как часть Tiger.
- Как проходят read / write / update / repair / migration / transition: read path и клиентский write protocol в статье не переопределяются (Tiger встраивается в существующий data plane); при аллокации write `ESAllocator` берёт кандидатов от текущей placement policy, проверяет MTTDL и при необходимости уменьшает ширину stripe; при disk failure `EVManager` через `EVDirectory` находит затронутые stripes, `ESReorganizer` инициирует reconstruction, сначала пытаясь заменить только проблемный chunk на подходящий диск, иначе делает re-allocation в новый eclectic stripe; при AFR increase запускается переход к более безопасной избыточности/дискам; при AFR decrease сначала проверяется возможность parity deletion, иначе выполняется миграция в менее избыточную схему; несрочные переходы throttling-ятся rate limiter'ом.
- Где принимаются policy-решения: placement-доменные решения остаются во внешней placement policy; Tiger принимает redundancy-решения на уровне stripe/volume на базе `(target MTTDL, critical AFR, текущие AFR)`; очередь работ `ESReorganizer` приоритизируется как reconstruction -> near-risk increase -> decommission move -> redundancy reduction.
- Что с temperature classification / tiering / orchestration: в статье нет классификации данных по температуре и нет многоуровневого tiering-оркестратора; Tiger принимает решения только по надёжности дисков (AFR) и целевому MTTDL.
- Какие ограничения, assumptions и неясности остаются: сильная зависимость от AFR estimation/change-point quality; аппроксимация опирается на режим `mu >> lambda`; paper не раскрывает детали отказоустойчивости/репликации самого `EVDirectory`; read path, конкуренция с другими background jobs и latency/CPU overhead control-plane компонентов даны ограниченно.

## 6. Сквозные выводы по статье
- Проблема: существующие disk-adaptive системы экономят ёмкость, но делают это ценой жёстких placement boundaries и потенциально опасных transition bursts.
- Основная идея / вклад: eclectic stripes позволяют адаптировать схему избыточности для произвольного набора дисков без Rgroup partitioning.
- Что нового относительно известных подходов: переход от group-level к stripe-level адаптации + volume-level управление метаданными и health-check; практичная MTTDL-аппроксимация для heterogeneous stripes.
- Ключевые trade-off: Tiger выигрывает в гибкости размещения и risk-diversity, но в некоторых конфигурациях имеет немного больший средний transition IO, чем Pacemaker.
- Главные ограничения статьи: акцент на симуляциях по логам, а не на полной production-оценке latency/throughput; отдельные экстремальные сценарии (bulk failures, отсутствие аппаратного разнообразия) остаются сложными.

## 7. Что использовать в дипломе
- Что paper даёт напрямую: stripe-level disk-adaptive EC без Rgroup-ограничений; практический критерий безопасности `average AFR < critical AFR` с дорасчётом MTTDL; architecture pattern `allocator + volume manager + health inspector + reorganizer`; проверенные метрики сравнения (`viable disks`, `risk-diversity`, transition IO, space-savings).
- Что является нашей интерпретацией применимости: перенос AFR-driven policy на гибрид EC+replication и связка с температурой данных; сопоставление "AFR risk" и "temperature class" в едином policy engine; использование идей Tiger для межрежимных переходов replica->EC и EC->replica.
- Роль источника в дипломе: это прежде всего practical system paper и baseline для сравнения с group-constrained adaptive redundancy (Pacemaker/HeART lineage); вторично это theoretical foundation для reliability-check блока (critical AFR + MTTDL approximation).
- Что нельзя переносить без оговорок: абсолютные числа из evaluation (`up to 5%` savings, `<=0.5%` average transition IO, конкретные burst-сценарии) и допущение, что read/write data plane unchanged, если в дипломной реализации меняется протокол записи/миграции.

## 8. Полезные цитаты
- "Tiger is a new disk-adaptive redundancy system that efficiently avoids adoption-blocking placement constraints, while also providing higher space-savings and lower risk relative to prior designs."
  Стр.: 413
  Зачем нужна: точная формулировка основного вклада статьи для постановки задачи в дипломе.

- "Tiger’s stripe-by-stripe disk-adaptive redundancy approach enables incremental adoption by allowing data to be stored either as an eclectic stripe or a homogeneous stripe."
  Стр.: 419
  Зачем нужна: обоснование практической совместимости и поэтапного внедрения.

- "Despite all its eclectic stripes being above the MTTDL threshold, Tiger has least storage overhead."
  Стр.: 424
  Зачем нужна: аккуратно формулирует баланс надёжности и экономии места, важный для сравнения policy в дипломе.

- "Tiger is able to achieve up to 5% higher space-savings compared to Pacemaker."
  Стр.: 424
  Зачем нужна: компактный количественный результат для сравнительного блока.

- "Tiger enables disk-adaptive redundancy without the placement restrictions and associated problems that plague prior designs."
  Стр.: 426
  Зачем нужна: итоговая формулировка главного системного вклада статьи.

## 9. Термины и понятия
- Disk-adaptive redundancy: динамический выбор схемы избыточности по текущей надёжности дисков (AFR).
- Eclectic stripe: EC-stripe на дисках с разными AFR, где надёжность считается с учётом каждого диска.
- Rgroup (redundancy group): подгруппа дисков с похожим AFR в prior-системах, внутри которой ограничивается размещение stripe.
- MTTDL: mean time to data loss, целевая метрика долговечности данных.
- AFR: annualized failure rate, годовая частота отказов дисков.
- Critical AFR: порог AFR для конкретной k-of-n схемы при заданном MTTDL target.
- Eclectic volume: логическая группа eclectic stripes с одинаковыми дисками и схемой EC для эффективного мониторинга и transitions.
- Transition IO: фоновый IO на перестройку/миграцию данных при смене схем избыточности.
- Risk-diversity: степень распределения chunks stripe по разным make/model (устойчивость к correlated failures).

## 10. Итог в одном абзаце
Tiger показывает, как сделать disk-adaptive redundancy эксплуатационно реализуемой без жёсткой привязки stripe к AFR-однородным подгруппам дисков. Ключевой шаг статьи - переход к eclectic stripes и вычислительно дешёвой оценке их надёжности, что снимает главный барьер совместимости с существующими placement-политиками. Для диплома источник особенно ценен тем, что даёт не только идею, но и цельную control-plane архитектуру: allocator, manager, reorganization pipeline, volume-level metadata и мониторинг AFR change points. На уровне результатов работа демонстрирует улучшение risk-diversity, сопоставимые или лучшие space-savings и низкий средний transition IO на реальных логах крупных кластеров. Одновременно авторы честно фиксируют пределы подхода в экстремальных сценариях типа массовых отказов и слабой аппаратной диверсификации. Поэтому место статьи в дипломе - опорный system paper для разделов про архитектуру адаптивной избыточности, policy transitions и инженерные trade-off между безопасностью, стоимостью и операционной сложностью.
