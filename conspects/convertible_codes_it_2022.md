# Convertible Codes: Enabling Efficient Conversion of Coded Data in Distributed Storage

## 1. Библиографическая карточка
- ID: `convertible_codes_it_2022`
- Авторы: Francisco Maturana, K. V. Rashmi
- Год: 2022
- Тип: journal article
- Ссылка: https://www.cs.cmu.edu/~rvinayak/papers/Convertible_Codes_ITT_2022.pdf

## 2. Зачем этот источник нужен для диплома
- Роль источника: `theoretical foundation`
- Для каких разделов диплома полезен: формализация conversion cost, related work по переходам между EC-схемами, раздел про критерии выгодной перекодировки
- Какой главный вопрос диплома помогает закрыть: как формально оценивать стоимость перехода между двумя схемами erasure coding и почему такие переходы нельзя считать бесплатными

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `1. Introduction` | 1-3 | Постановка задачи code conversion и системная мотивация | Очень важен |
| `2. Setup and Preliminaries` | 3-6 | Формальная модель conversion и базовые определения | Критически важен |
| `3. Lower Bound on Access Cost` | 6-8 | Нижние границы на read/write access cost | Критически важен |
| `4. Initial Construction for Merge Regime` | 8-12 | Базовая конструкция convertible codes для merge regime | Очень важен |
| `5. Access-Optimal Constructions` | 12-16 | Улучшенные access-optimal конструкции | Критически важен |
| `6. Conversions to Multiple Final Parameters` | 16-19 | Как поддерживать несколько target configurations | Важен |
| `7. Related Work / Discussion / Conclusion` | 19-20 | Позиционирование и финальные выводы | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: вводит задачу `code conversion` как отдельную проблему distributed storage, отличную от простого re-encoding и отличную от elastic scaling.
- Ключевые тезисы / аргументы: параметры кода полезно менять во времени из-за меняющихся failure rates, reliability goals и storage constraints; naive conversion создаёт высокий IO load, который мешает и самой миграции, и обслуживанию клиентских запросов.
- Важные механизмы / модель / архитектура: вводится класс `convertible codes` как коды, специально позволяющие resource-efficient conversion между двумя redundancy configurations.
- Числа, метрики, результаты: paper ещё не даёт полные theorem-level результаты, но на мотивационном примере показывает уменьшение conversion overhead по сравнению с default re-encoding.
- Что отсюда брать в диплом: системную мотивацию для того, чтобы учитывать conversion cost в policy выбора схем хранения.
- Ограничения или оговорки: статья ставит задачу на уровне кодов и conversion procedures, а не на уровне полной temperature-aware storage architecture.

### 4.2 Setup and Preliminaries
- Что делает этот раздел: формализует модель conversion между исходным `[nI, kI]` и финальным `[nF, kF]` кодами.
- Ключевые тезисы / аргументы: чтобы корректно сравнивать conversion procedures, нужна отдельная метрика `access cost`, распадающаяся на read и write access costs.
- Важные механизмы / модель / архитектура: `initial codewords`, `final codewords`, `merge regime`, `split regime`, systematic and linear MDS assumptions, stable convertible codes.
- Числа, метрики, результаты: ключевая метрика - сумма read и write accesses, а не просто число арифметических операций.
- Что отсюда брать в диплом: формальную основу для раздела про migration/transcode cost.
- Ограничения или оговорки: модель абстрагируется от placement, metadata orchestration и фоновых кластерных процессов.

### 4.3 Lower Bound on Access Cost
- Что делает этот раздел: доказывает фундаментальные нижние границы на conversion cost.
- Ключевые тезисы / аргументы: для линейных MDS codes существуют строгие пределы того, насколько дешёвой может быть conversion в merge regime; значит, нельзя ожидать произвольного уменьшения I/O.
- Важные механизмы / модель / архитектура: theorem-level lower bounds отдельно на read access cost и write access cost.
- Числа, метрики, результаты: для linear MDS convertible codes в merge regime read access cost ограничен снизу величиной вида `ς min{kI, rF}`, а write cost - `rF`.
- Что отсюда брать в диплом: опору для аргумента, что выбор соседних схем в pipeline должен учитывать достижимую, а не воображаемую дешевизну перехода.
- Ограничения или оговорки: это нижние границы в абстрактной модели, а не полный ответ на вопрос, как orchestrate transitions в реальном storage system.

### 4.4 Initial Construction for Merge Regime
- Что делает этот раздел: даёт первую явную конструкцию convertible codes в merge regime.
- Ключевые тезисы / аргументы: conversion можно организовать так, чтобы избежать полного чтения всех исходных message symbols и полного пересчёта нового codeword.
- Важные механизмы / модель / архитектура: конкретная конструкция преобразования между несколькими initial codewords и одним final codeword.
- Числа, метрики, результаты: в показательных примерах paper снижает read access cost по сравнению с default approach.
- Что отсюда брать в диплом: не только теорему о существовании cheaper conversion, но и саму идею проектировать коды с учётом будущих transitions.
- Ограничения или оговорки: базовая конструкция ещё не во всех режимах оптимальна.

### 4.5 Access-Optimal Constructions
- Что делает этот раздел: усиливает предыдущий результат и строит access-optimal схемы.
- Ключевые тезисы / аргументы: для merge regime можно достичь нижних границ на access cost, то есть paper даёт не просто improved conversion, а оптимальный по доступам conversion.
- Важные механизмы / модель / архитектура: access-optimal convertible codes, устойчивые конструкции и уменьшение field-size requirements.
- Числа, метрики, результаты: главный результат раздела - достижимость ранее выведенных lower bounds.
- Что отсюда брать в диплом: этот раздел особенно полезен для формализации критерия, когда pipeline transition между кодами имеет смысл.
- Ограничения или оговорки: оптимальность доказана внутри узкой математической модели и не подменяет system-level evaluation.

### 4.6 Conversions to Multiple Final Parameters
- Что делает этот раздел: показывает, как одна и та же исходная схема может поддерживать несколько возможных target configurations.
- Ключевые тезисы / аргументы: полезно проектировать conversion-aware codes так, чтобы они не жёстко замыкались на один-единственный future target.
- Важные механизмы / модель / архитектура: конструкции для нескольких final parameters и обсуждение компромисса между гибкостью и оптимальностью.
- Числа, метрики, результаты: paper показывает, что multi-target support достижим, но design space становится сложнее.
- Что отсюда брать в диплом: аргумент в пользу того, что storage pipeline может требовать не одну позднюю схему, а несколько допустимых переходов.
- Ограничения или оговорки: это всё ещё кодовый, а не orchestration-level результат.

### 4.7 Related Work / Discussion / Conclusion
- Что делает этот раздел: отделяет задачу conversion от adjacent problems вроде scaling, rebuilding и generic re-encoding.
- Ключевые тезисы / аргументы: conversion - самостоятельная проблема с собственной метрикой и своими lower bounds; paper закрывает важную теоретическую дыру в storage literature.
- Важные механизмы / модель / архитектура: позиционирование относительно prior work и краткая фиксация главного вклада.
- Числа, метрики, результаты: новых чисел мало; важнее рамка применимости результатов.
- Что отсюда брать в диплом: аккуратную формулировку, что работа полезна именно как база для анализа EC-to-EC transitions, а не как готовая температура-зависимая политика.
- Ограничения или оговорки: статья почти не обсуждает replicas, metadata, placement и full storage stack.

## 5. Архитектура и устройство системы / метода
- Paper не описывает полноценную storage system architecture, поэтому здесь нужно честно говорить не о full system design, а об устройстве метода и формализации conversion.
- Назначение метода: формально описать и оптимизировать переход от одной EC-схемы к другой без полного re-encoding.
- Главные сущности и их роли:
  - `initial codewords` - уже закодированные данные в исходной схеме;
  - `final codeword(s)` - целевая закодированная форма после conversion;
  - `conversion procedure` - алгоритм, который читает часть исходных symbols и записывает финальные symbols;
  - `access cost` - главная метрика ресурсоёмкости conversion.
- Где находятся `data / parity / metadata`: статья мыслит на уровне символов и codewords; она не задаёт полноценную filesystem/database metadata plane и не разбирает physical placement по узлам.
- Как проходят операции:
  - `write/read` как полноценные system-level client paths не являются главным предметом paper;
  - центральная операция - `conversion`, то есть чтение нужных исходных symbols и запись финальных symbols;
  - `repair`, `migration orchestration` и `policy triggers` обсуждаются только как мотивация, а не как детально описанный subsystem.
- Где принимаются policy-решения: paper не предлагает controller, который решает, когда переводить данные в другую схему; он только даёт инструмент, как сделать сам переход дешевле.
- Что важно для диплома: этот источник полезен как building block внутри более широкой архитектуры, где temperature-aware policy сначала решает, что нужен переход, а conversion-aware EC design уменьшает стоимость его выполнения.
- Ограничения, assumptions и неясности:
  - рассматриваются linear MDS codes;
  - сильнейшие результаты даны для `merge regime`;
  - полноценная архитектура storage service, placement policy и runtime orchestration в статье отсутствуют.

## 6. Сквозные выводы по статье
- Проблема: смена EC-параметров в distributed storage полезна, но naive re-encoding слишком дорог по I/O.
- Основная идея / вклад: ввести `convertible codes` и формально оптимизировать conversion через метрику `access cost`.
- Что нового относительно известных подходов: paper отделяет conversion как самостоятельную задачу и выводит нижние границы плюс конструкции, достигающие этих границ.
- Ключевые trade-off: выигрыш по conversion cost зависит от режима параметров и структуры кодов; гибкость по final targets усложняет дизайн.
- Главные ограничения статьи: это теоретическая работа про кодовые переходы, а не про полную architecture of a hybrid temperature-aware storage system.

## 7. Что использовать в дипломе
- Взять `access cost` как формальную основу для оценки EC-to-EC transitions.
- Использовать paper как theoretical foundation для критерия, когда переход между двумя соседними EC-схемами действительно выгоден.
- Опереться на него в архитектуре диплома как на внутренний механизм дешёвой conversion после того, как внешняя temperature-aware policy уже решила переводить данные.
- Не переносить из paper без оговорок system-level claims: он не даёт готовой replica-vs-EC policy, не описывает metadata plane и не решает orchestration transitions в production cluster.

## 8. Полезные цитаты
- "We then introduce convertible codes, a new class of codes that allow for code conversions in a resource-efficient manner."
  Стр.: 1
  Зачем нужна: фиксирует главную новизну статьи и сам объект исследования.

- "High IO load is problematic for such conversions because it slows down conversion as well as other important cluster processes, such as serving client requests."
  Стр.: 2
  Зачем нужна: показывает, почему conversion cost релевантен именно для системной постановки, а не только для алгебры кодов.

- "The access cost of a conversion procedure is the sum of its read and write access costs."
  Стр.: 6
  Зачем нужна: даёт точное определение базовой метрики, на которой строятся все дальнейшие результаты.

- "For all linear MDS (nI , k I ; nF , k F = ςk I ) convertible codes, the read access cost of conversion is at least ς min{k I , rF } and the write access cost is at least rF."
  Стр.: 7
  Зачем нужна: это ключевая нижняя граница, которая помогает не завышать ожидания от дешёвой перекодировки.

## 9. Термины и понятия
- `Code conversion`: перевод уже закодированных данных из одной схемы `[nI, kI]` в другую `[nF, kF]`.
- `Access cost`: сумма чтений и записей, необходимых для conversion.
- `Merge regime`: класс conversion, где несколько исходных codewords объединяются в один финальный codeword.
- `Stable convertible code`: convertible code, который использует максимальное число unchanged symbols.
- `Linear MDS code`: линейный MDS-код, широко используемый в storage systems из-за простоты и свойств надёжности.
- `Default approach`: полное re-encoding с чтением исходных message symbols и записью нового codeword.
- `Systematic code`: код, у которого часть символов сообщения сохраняется явно в codeword.

## 10. Итог в одном абзаце
Эта работа даёт строгую теоретическую основу для дешёвой перекодировки между схемами erasure coding в распределённом хранилище. Её главная ценность для диплома в том, что она формально вводит `access cost` и показывает, где переход между кодами можно удешевить, а где улучшения уже не будет. Для гибридной системы хранения на основе температуры данных это особенно полезно: когда данные остывают и их нужно перевести в более ёмкую схему, важно заранее понимать цену такого перехода. При этом статья не описывает полноценную архитектуру storage system и не предлагает temperature-aware policy; она даёт именно теоретический строительный блок для проектирования таких переходов. Поэтому её лучше использовать как theoretical foundation для EC-to-EC transitions, а не как полный системный baseline.
