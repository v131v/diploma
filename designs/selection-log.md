# Selection Log

## Seed

- `subset_seed`: `20260420`

## Corpus Snapshot

- `conspects_count`: 18
- minimum subset size at 30%: 6

## Rounds

### Round 1

- status: subsets_fixed
- candidates:
  - `design_01`: `azure_ec_atc_2012`, `ec_survey_tos_2024`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `xoring_elephants_arxiv_2013`, `zebra_iwqos_2016`
  - `design_02`: `convertible_codes_it_2022`, `elect_fast_2024`, `heart_fast_2019`, `hsm_ieee_access_2024`, `morph_sosp_2024`, `wide_lrc_fast_2023`
  - `design_03`: `benchmarking_ec_object_storage_fgcs_2025`, `ec_store_icdcs_2018`, `f4_osdi_2014`, `identifying_hot_cold_icde_2013`, `lrc_convertible_arxiv_2023`, `rapidraid_arxiv_2012`
  - `design_04`: `convertible_codes_it_2022`, `ec_store_icdcs_2018`, `hyres_arxiv_2025`, `identifying_hot_cold_icde_2013`, `lrc_convertible_arxiv_2023`, `zebra_iwqos_2016`
  - `design_05`: `azure_ec_atc_2012`, `elect_fast_2024`, `heart_fast_2019`, `hsm_ieee_access_2024`, `morph_sosp_2024`, `wide_lrc_fast_2023`
  - `design_06`: `benchmarking_ec_object_storage_fgcs_2025`, `ec_survey_tos_2024`, `er_store_scientific_programming_2021`, `f4_osdi_2014`, `rapidraid_arxiv_2012`, `xoring_elephants_arxiv_2013`
  - `design_07`: `benchmarking_ec_object_storage_fgcs_2025`, `f4_osdi_2014`, `hsm_ieee_access_2024`, `hyres_arxiv_2025`, `identifying_hot_cold_icde_2013`, `morph_sosp_2024`
  - `design_08`: `convertible_codes_it_2022`, `ec_survey_tos_2024`, `elect_fast_2024`, `er_store_scientific_programming_2021`, `lrc_convertible_arxiv_2023`, `xoring_elephants_arxiv_2013`
  - `design_09`: `azure_ec_atc_2012`, `ec_store_icdcs_2018`, `heart_fast_2019`, `rapidraid_arxiv_2012`, `wide_lrc_fast_2023`, `zebra_iwqos_2016`
  - `design_10`: `benchmarking_ec_object_storage_fgcs_2025`, `er_store_scientific_programming_2021`, `hyres_arxiv_2025`, `identifying_hot_cold_icde_2013`, `morph_sosp_2024`, `xoring_elephants_arxiv_2013`
- round_1_scores:
  - `design_01`: `71`
  - `design_02`: `76`
  - `design_03`: `76`
  - `design_04`: `68`
  - `design_05`: `70`
  - `design_06`: `72`
  - `design_07`: `70`
  - `design_08`: `73`
  - `design_09`: `70`
  - `design_10`: `75`
- top_6_after_round_1:
  - `design_02`
  - `design_03`
  - `design_10`
  - `design_08`
  - `design_06`
  - `design_01`

### Round 2

- status: subsets_fixed
- new_candidates:
  - `design_11`: `convertible_codes_it_2022`, `ec_store_icdcs_2018`, `heart_fast_2019`, `lrc_convertible_arxiv_2023`, `wide_lrc_fast_2023`, `zebra_iwqos_2016`
  - `design_12`: `azure_ec_atc_2012`, `ec_survey_tos_2024`, `elect_fast_2024`, `f4_osdi_2014`, `hsm_ieee_access_2024`, `rapidraid_arxiv_2012`
  - `design_13`: `azure_ec_atc_2012`, `convertible_codes_it_2022`, `ec_store_icdcs_2018`, `f4_osdi_2014`, `hsm_ieee_access_2024`, `identifying_hot_cold_icde_2013`
  - `design_14`: `ec_survey_tos_2024`, `elect_fast_2024`, `hyres_arxiv_2025`, `lrc_convertible_arxiv_2023`, `morph_sosp_2024`, `xoring_elephants_arxiv_2013`
- candidate_scores:
  - `design_01`: `91`, `pass`
  - `design_02`: `89`, `pass`
  - `design_03`: `90`, `pass`
  - `design_06`: `88`, `pass`
  - `design_08`: `88`, `pass`
  - `design_10`: `92`, `pass`
  - `design_11`: `77`, `revise`
  - `design_12`: `71`, `revise`
  - `design_13`: `72`, `revise`
  - `design_14`: `79`, `revise`

### Final Top-5

- status: selected
- finalists:
  - `design_10`
  - `design_01`
  - `design_03`
  - `design_02`
  - `design_06`
- notes:
  - `design_08` также прошёл strict gate, но уступил `design_06` по tie-break и общему ранжированию.
  - все финалисты имеют `pass` и не содержат `critical` или `major` замечаний.

### Post-Competition Round: `design_15`

- status: full_corpus_completed
- mode:
  - `design_15`: `full-corpus synthesis`
- review_chain:
  - `design_15`: `83`, `revise`, `Critical 0 / Major 2 / Minor 2`
  - `design_15_round2`: `89`, `revise`, `Critical 0 / Major 1 / Minor 2`
  - `design_15_round3`: `94`, `pass`, `Critical 0 / Major 0 / Minor 2`
- ranking_update:
  - `design_15` сравнен с текущими финалистами и запасным вариантом по той же рубрике из `rubric.md`
  - по score `94` и при отсутствии `critical/major` он входит в новый top-5
  - weakest finalist `design_06` смещается в reserve pool
- updated_top_5:
  - `design_15`
  - `design_10`
  - `design_01`
  - `design_03`
  - `design_02`
- reserve_pool:
  - `design_06`
  - `design_08`
- notes:
  - `design_15` - единственный вариант в режиме `full-corpus synthesis`; все предыдущие конкурсные дизайны строились в режиме `accent_subset`.
  - tie-break rules не менялись; их не пришлось применять против текущего top-5, потому что `design_15` вошёл по более высокому score.

### Post-Competition Round: `design_16`

- status: study_plan_driven_completed
- mode:
  - `design_16`: `study-plan-driven`
- review_chain:
  - `design_16`: `85`, `revise`, `Critical 0 / Major 2 / Minor 2`
  - `design_16_round2`: `93`, `pass`, `Critical 0 / Major 0 / Minor 2`
- ranking_update:
  - `design_16` сравнен с текущим top-5 и reserve pool по той же рубрике из `rubric.md`
  - по score `93` и при отсутствии `critical/major` он входит в новый top-5
  - weakest finalist `design_02` смещается в reserve pool
- updated_top_5:
  - `design_15`
  - `design_16`
  - `design_10`
  - `design_01`
  - `design_03`
- reserve_pool:
  - `design_02`
  - `design_06`
  - `design_08`
- notes:
  - `design_16` - первый вариант в режиме `study-plan-driven`; он использует весь корпус, но его архитектурный каркас и evaluation lens задаются reading clusters из `study-plan.md`.
  - tie-break rules не менялись; их не пришлось применять против текущего top-5, потому что `design_16` вошёл по более высокому score.
