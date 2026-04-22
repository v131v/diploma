# Locally Repairable Convertible Codes with Optimal Access Costs

## 1. Библиографическая карточка
- ID: `lrc_convertible_arxiv_2023`
- Авторы: Xiangliang Kong
- Год: 2023
- Тип: preprint
- Ссылка: https://arxiv.org/pdf/2308.06802

## 2. Краткая суть источника
Источник исследует задачу code conversion для locally repairable codes в merge regime, когда несколько исходных кодовых слов объединяются в одно итоговое. Автор выводит нижнюю оценку на access cost и строит MDS convertible codes и LRCC, достигающие оптимального access cost в рассматриваемой модели. Главная ценность работы в том, что она формально связывает locality и conversion cost, а не рассматривает их по отдельности. Для диплома это сильный теоретический базис именно для дешёвых переходов между EC/LRC-схемами, а не для всей логики hybrid replication + EC.

Для мотивации важно, что paper решает не просто алгебраическую задачу, а проблему дешевле менять redundancy scheme по мере изменения storage requirements. Прямой re-encoding слишком дорог, а для LRC дополнительно критично не потерять locality и не раздувать access cost. Работа отдельно подчёркивает, что предыдущие результаты по information locality не закрывали all-symbol locality, поэтому здесь есть реальный теоретический разрыв, а не только частное улучшение.

## 3. Карта статьи
| Раздел paper | Стр. | О чём раздел | Насколько важен для диплома |
|---|---:|---|---|
| `1. Introduction` | 1-3 | Постановка code conversion для LRC, merge regime, all-symbol locality и поле линейного размера | Очень важен |
| `2. Constructions of MDS Convertible Codes` | 4-9 | Пример, общая конструкция, explicit family и optimal access cost для MDS | Очень важен |
| `3. Constructions of Locally Repairable Convertible Codes` | 10-17 | Good polynomials, LRCC-конструкции, same-locality requirement и explicit family | Критически важен |
| `4. Lower Bounds` | 18-22 | Общий lower bound для convertible codes с final LRC и частный MDS-case | Критически важен |
| `5. Conclusion and Further Research` | 22-23 | Сводка вклада и открытые вопросы: split regime, разные locality, smaller field size | Умеренно важен |

## 4. Подробный конспект по разделам
### 4.1 Introduction
- Что делает этот раздел: задаёт задачу code conversion для LRC и объясняет, почему именно merge regime и all-symbol locality важны для практики.
- Ключевые тезисы / аргументы: у статических кодов со временем меняются требования к storage efficiency и failure tolerance; naive re-encoding слишком дорог по I/O; для LRC важно одновременно удержать locality и access cost.
- Важные механизмы / модель / архитектура: вводятся initial code, final code, merge regime и access cost как главная метрика conversion.
- Что отсюда брать в диплом: теоретическую постановку задачи, где выгодность перехода между EC-схемами оценивается через число прочитанных и записанных символов.
- Ограничения или оговорки: paper сразу ограничивает постановку merge regime и не пытается решать temperature-aware policy на уровне системы.

### 4.2 Constructions of MDS Convertible Codes
- Что делает этот раздел: строит явные MDS convertible codes с optimal access cost, сначала на примере, а затем в общем виде.
- Ключевые тезисы / аргументы: конверсию удобно задавать как алгебраическое отображение `T` между пространствами полиномов; часть символов можно оставить без чтения, если согласовать evaluation points и матрицы преобразования.
- Важные механизмы / модель / архитектура: используются GRS codes, annihilator polynomials, матрицы `M` и карта `T`, которая превращает несколько initial codewords в один final codeword.
- Числа, метрики, результаты: Theorem II.1 и II.2 дают оптимальные MDS convertible codes; explicit family достигается over finite field size linear in `nI`.
- Что отсюда брать в диплом: базовый шаблон дешёвого EC-to-EC перехода, который показывает, что conversion cost можно проектировать заранее.
- Ограничения или оговорки: это алгебраическая конструкция для merge regime, а не системный transcode pipeline.

### 4.3 Constructions of Locally Repairable Convertible Codes
- Что делает этот раздел: переносит идею MDS-conversion на LRC через `good polynomials`.
- Ключевые тезисы / аргументы: если код уже устроен как optimal LRC, то можно построить LRCC так, чтобы conversion сохраняла locality и достигала оптимального access cost.
- Важные механизмы / модель / архитектура: paper использует encoding polynomials вида `f_m(x)` и строит конструкции III и IV; ключевой технический момент - согласовать базовую трансформацию с structure of local groups.
- Числа, метрики, результаты: для LRCC получаются семейства `(nI, kr, r; nF, ζkr, r)` с write access cost `lF(r + 1)` и read access cost `ζ lF r`; при `lI = lF = l` это даёт `l(r + 1)` и `ζ l r`.
- Что отсюда брать в диплом: формальное обоснование того, что locality не обязательно мешает дешёвой конверсии, если код спроектирован конверсионно-ориентированно.
- Ограничения или оговорки: в собственной LRCC-конструкции initial code и final code должны иметь одинаковую locality.

### 4.4 Lower Bounds
- Что делает этот раздел: доказывает общий lower bound на access cost, когда final code является linear LRC.
- Ключевые тезисы / аргументы: locality финального кода ограничивает, насколько мало символов можно прочитать; значит, lower bound на conversion cost задаётся не только размерностью, но и структурой LRC.
- Важные механизмы / модель / архитектура: theorem IV.4 сначала даёт bound для общего convertible code с final LRC, а theorem IV.5 возвращает MDS-bound как частный случай.
- Числа, метрики, результаты: read access cost для `(nI, k; nF, ζk)` convertible code ограничен снизу `ζ min{k, nF - ζk}`, write access cost - `nF - ζk`; если `nI - k < nF - ζk`, read cost не меньше `ζk`.
- Что отсюда брать в диплом: именно этот блок даёт честную границу того, насколько дешевым вообще может быть EC-to-EC transition.
- Ограничения или оговорки: lower bound доказан в теоретической модели и не включает placement, scheduling и runtime orchestration.

### 4.5 Conclusion and Further Research
- Что делает этот раздел: суммирует вклад статьи и перечисляет open questions.
- Ключевые тезисы / аргументы: paper закрывает задачу optimal access-cost conversions для merge regime, но оставляет несколько направлений для продолжения.
- Важные механизмы / модель / архитектура: отдельно упомянуты split regime, разные locality у initial/final code, уменьшение field size и другие варианты LRC.
- Что отсюда брать в диплом: это хорошее место для честной формулировки границ применимости результата.
- Ограничения или оговорки: paper не даёт complete system design и не отвечает на вопрос, когда именно переводить данные между температурными слоями.

## 5. Архитектура и устройство системы / метода
- Paper не описывает полноценную storage system architecture, поэтому здесь честно разбирается не system design, а устройство метода и его алгебраической "архитектуры".
- Главные сущности и их роли:
  - `initial codewords` - уже закодированные данные в исходной схеме;
  - `final codeword` - целевая форма после conversion;
  - `conversion map T` - алгебраическое отображение, которое переиспользует часть символов и вычисляет новые;
  - `annihilator polynomials` и матрицы `M / M_i` - технический механизм, который делает map `T` совместимой с RS/GRS и LRC-конструкциями;
  - `access cost` - целевая метрика, в терминах которой проверяется оптимальность метода.
- Где находятся `data / parity / metadata`: статья работает на уровне code symbols, evaluation points и coefficient vectors; отдельной metadata plane, placement policy или storage service здесь нет.
- Как проходят основные операции:
  - `encode`: исходные message symbols кодируются в initial codewords;
  - `convert`: map `T` читает нужные symbols, часть из них оставляет без изменений, а новые symbols получает линейной алгеброй;
  - `preserve locality`: для LRCC структура local groups сохраняется за счёт выбора good polynomials и согласованных evaluation sets;
  - `prove optimality`: lower bound в разделе IV показывает, что достигнутый access cost не случайный, а оптимальный в модели.
- Где принимаются решения:
  - paper не вводит controller, scheduler или trigger, который решает, когда переводить данные;
  - решение о том, что conversion нужен, считается внешним по отношению к статье;
  - сама статья отвечает только за то, как выполнить переход дешевле.
- Что важно для диплома: это хороший theoretical building block для более широкой hybrid system, где temperature-aware policy выбирает переход, а convertible/LRC layer минимизирует цену самого перехода.
- Ограничения, assumptions и неясности:
  - рассматривается merge regime;
  - для конструктивной LRCC-части initial code и final code имеют одинаковую locality;
  - полноценный runtime flow, repair service и data placement в статье отсутствуют.

## 6. Сквозные выводы по статье
- Проблема: смена EC-параметров в distributed storage полезна, но naive re-encoding слишком дорог по I/O.
- Основная идея / вклад: ввести `convertible codes` и формально оптимизировать conversion через метрику `access cost`.
- Что нового относительно известных подходов: paper отделяет conversion как самостоятельную задачу и выводит нижние границы плюс конструкции, достигающие этих границ.
- Ключевые trade-off: выигрыш по conversion cost зависит от режима параметров и структуры кодов; гибкость по final targets усложняет дизайн.
- Главные ограничения статьи: это теоретическая работа про кодовые переходы, а не про полную architecture of a hybrid temperature-aware storage system; в ней нет policy layer, placement layer и runtime orchestration.

## 7. Что использовать в дипломе
- Взять `access cost` как формальную основу для оценки EC-to-EC transitions.
- Использовать paper как theoretical foundation для критерия, когда переход между двумя соседними EC-схемами действительно выгоден.
- Опереться на него в архитектуре диплома как на внутренний механизм дешёвой conversion после того, как внешняя temperature-aware policy уже решила переводить данные.
- Не переносить из paper без оговорок system-level claims: он не даёт готовой replica-vs-EC policy, не описывает metadata plane и не решает orchestration transitions в production cluster.

## 8. Полезные цитаты
- "we focus on LRCs with all-symbol locality"
  Стр.: 2
  Зачем нужна: коротко фиксирует ключевое отличие этой работы от предшествующего результата по information locality.
- "our construction in Section III requires the initial code and the final code have the same locality"
  Стр.: 22
  Зачем нужна: фиксирует главное ограничение конструктивной части, которое важно не потерять в архитектурной интерпретации.

## 9. Термины и понятия
- `LRC` - erasure code с locality, то есть любой символ восстанавливается по небольшому числу других символов.
- `LRCC` - locally repairable convertible code, то есть convertible code, где и initial code, и final code являются LRC.
- `convertible code` - пара кодов и процедура, которая переводит данные из одной кодировки в другую без полного re-encode.
- `access cost` - сумма read access cost и write access cost при conversion.
- `merge regime` - режим, где несколько initial codewords объединяются в одно final codeword.
- `good polynomial` - полином из конструкции optimal LRC, который помогает задать locality через разбиение множества точек.
- `GRS code` - generalized Reed-Solomon code, используемый как удобная алгебраическая база для MDS convertible codes.

## 10. Итог в одном абзаце
Источник даёт строгую теоретическую основу для дешёвой перекодировки locally repairable codes в merge regime. Работа важна тем, что не ограничивается описанием конструкции, а выводит нижнюю границу на access cost и затем строит коды, которые эту границу достигают. Для диплома это стоит использовать как математическое обоснование оптимизации переходов между EC/LRC-схемами по read/write cost, а не как источник готовой temperature-aware или hybrid replication + EC политики. Особенно полезно то, что автор связывает conversion и locality в одной модели и показывает, как не потерять repair efficiency при смене кода. В результате источник хорошо подходит как theoretical foundation для раздела про оптимальные переходы между соседними EC-состояниями и про стоимость перекодировки.
