from pyspark import pipelines as dp
from pyspark.sql import functions as F

@dp.materialized_view(
    comment="Cleaned NFHS-5 data with relevant columns for care desert analysis"
)
def nfhs_cleaned():
    df = spark.read.table("nfhs_raw")
    
    # Helper function to convert string percentages to double
    def clean_pct(col_name):
        return F.when(
            F.trim(F.col(col_name)).rlike("^\\(.*\\)$"),  # Values in parentheses are estimates
            F.regexp_replace(F.trim(F.col(col_name)), "[\\(\\) ]", "").cast("double")
        ).when(
            F.col(col_name) == "*",  # Asterisks indicate suppressed/unavailable data
            F.lit(None).cast("double")
        ).otherwise(
            F.regexp_replace(F.trim(F.col(col_name)), " ", "").cast("double")
        )
    
    return df.select(
        # Geographic identifiers
        "district_name",
        "state_ut",
        
        # Survey coverage
        "households_surveyed",
        "women_15_49_interviewed",
        
        # Maternal & Neonatal Care indicators
        "institutional_birth_5y_pct",
        "births_delivered_by_csection_5y_pct",
        clean_pct("mothers_who_had_at_least_4_anc_visits_lb5y_pct").alias("mothers_who_had_at_least_4_anc_visits_lb5y_pct"),
        "births_attended_by_skilled_hp_5y_10_pct",
        
        # Diabetes Care indicators
        "w15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct",
        
        # Hypertension Care indicators
        "w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct",
        
        # Nutrition Services indicators
        "women_age_15_49_years_whose_bmi_bmi_is_underweight_bmi_lt_1_pct",
        
        # Cancer Screening indicators
        "women_age_30_49_years_ever_undergone_a_cervical_screen_pct",
        "women_age_30_49_years_ever_undergone_a_breast_exam_pct",
        "women_age_30_49_years_ever_undergone_an_oral_cancer_exam_pct",
        
        # Trust & Healthcare Utilization indicators
        "hh_member_covered_health_insurance_pct",
        "institutional_birth_in_public_facility_5y_pct",
        clean_pct("births_in_a_public_fac_that_were_delivered_by_csection_5y_pct").alias("births_in_a_public_fac_that_were_delivered_by_csection_5y_pct"),
        clean_pct("births_in_a_private_fac_that_were_delivered_by_csection_5y_pct").alias("births_in_a_private_fac_that_were_delivered_by_csection_5y_pct"),
        clean_pct("average_out_of_pocket_expenditure_per_delivery_in_a_public_fac").alias("average_out_of_pocket_expenditure_per_delivery_in_a_public_fac"),
        "health_worker_ever_talked_to_female_non_users_about_family_pct",
        clean_pct("children_with_diarrhoea_2wk_taken_to_a_health_facility_or_h_pct").alias("children_with_diarrhoea_2wk_taken_to_a_health_facility_or_h_pct"),
        clean_pct("children_with_fever_or_symptoms_of_ari_2wk_taken_to_a_healt_pct").alias("children_with_fever_or_symptoms_of_ari_2wk_taken_to_a_healt_pct"),
        
        # Facility Capability indicators
        clean_pct("child_12_23m_fully_vaccinated_based_on_information_from_eit_pct").alias("child_12_23m_fully_vaccinated_based_on_information_from_eit_pct"),
        clean_pct("child_12_23m_who_received_most_of_their_vaccinations_in_a_p_pct").alias("child_12_23m_who_received_most_of_their_vaccinations_in_a_p_pct"),
        clean_pct("mothers_who_consumed_ifa_for_100_days_or_more_when_they_wer_pct").alias("mothers_who_consumed_ifa_for_100_days_or_more_when_they_wer_pct"),
        clean_pct("mothers_who_consumed_ifa_for_180_days_or_more_when_they_wer_pct").alias("mothers_who_consumed_ifa_for_180_days_or_more_when_they_wer_pct"),
        clean_pct("registered_pregnancies_for_which_the_mother_received_a_mcp_pct").alias("registered_pregnancies_for_which_the_mother_received_a_mcp_pct"),
        clean_pct("mothers_who_had_an_anc_visit_in_the_first_trimester_lb5y_pct").alias("mothers_who_had_an_anc_visit_in_the_first_trimester_lb5y_pct"),
        clean_pct("mothers_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwif_pct").alias("mothers_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwif_pct"),
        clean_pct("children_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwi_pct").alias("children_who_received_pnc_from_a_doctor_nurse_lhv_anm_midwi_pct"),
        
        # Outcome indicators
        clean_pct("child_u5_who_are_stunted_height_for_age_18_pct").alias("child_u5_who_are_stunted_height_for_age_18_pct"),
        clean_pct("child_u5_who_are_wasted_weight_for_height_18_pct").alias("child_u5_who_are_wasted_weight_for_height_18_pct"),
        "non_pregnant_w15_49_who_are_anaemic_lt_12_0_g_dl_22_pct",
        "all_w15_49_who_are_anaemic_pct",
        
        # Infrastructure Context indicators
        "hh_electricity_pct",
        "hh_improved_water_pct",
        "hh_use_improved_sanitation_pct",
        "women_age_15_49_who_are_literate_pct",
        "population_below_age_15_years_pct",
        
        # Risk Factors
        "women_age_15_49_years_who_are_overweight_obese_bmi_gte_25_0_pct",
        "w15_plus_who_use_any_kind_of_tobacco_pct",
        "w15_plus_who_consume_alcohol_pct"
    )
