from pyspark import pipelines as dp
from pyspark.sql import functions as F


@dp.materialized_view(
    comment="""
        Gold-layer district population risk indicators derived from NFHS-5.
        These indicators represent population burden and healthcare utilization;
        they do not independently establish facility capability gaps or confirmed
        care deserts.
    """,
    schema="""
        district_name STRING NOT NULL,
        state_ut STRING NOT NULL,
        households_surveyed DOUBLE,
        women_15_49_interviewed DOUBLE,

        maternal_neonatal_institutional_birth_pct DOUBLE,
        maternal_neonatal_csection_pct DOUBLE,
        maternal_neonatal_anc_visits_pct DOUBLE,
        maternal_neonatal_skilled_birth_pct DOUBLE,
        maternal_neonatal_access_score DOUBLE,
        maternal_neonatal_skilled_attendance_gap DOUBLE,
        maternal_neonatal_csection_access_flag STRING,
        maternal_neonatal_risk STRING,

        diabetes_care_high_blood_sugar_pct DOUBLE,
        diabetes_care_risk STRING,

        hypertension_care_high_bp_pct DOUBLE,
        hypertension_care_risk STRING,

        nutrition_services_underweight_pct DOUBLE,
        nutrition_services_risk STRING,

        cancer_screening_cervical_pct DOUBLE,
        cancer_screening_breast_pct DOUBLE,
        cancer_screening_oral_pct DOUBLE,
        cancer_screening_score DOUBLE,
        cancer_screening_risk STRING,

        overall_care_desert_risk STRING,

        PRIMARY KEY(district_name, state_ut)
    """
)
def care_desert_indicators():
    df = spark.read.table("nfhs_cleaned")

    institutional_birth = F.col("institutional_birth_5y_pct")
    skilled_birth = F.col("births_attended_by_skilled_hp_5y_10_pct")
    csection = F.col("births_delivered_by_csection_5y_pct")

    # Access score uses measures where higher utilization generally indicates
    # stronger access to formal and skilled maternity care.
    maternal_access_score = (
        F.when(
            institutional_birth.isNotNull() & skilled_birth.isNotNull(),
            (institutional_birth + skilled_birth) / 2.0
        )
    )

    # Positive values indicate institutional births exceed skilled attendance.
    # A large gap may indicate inconsistent access to skilled personnel.
    skilled_attendance_gap = (
        F.when(
            institutional_birth.isNotNull() & skilled_birth.isNotNull(),
            institutional_birth - skilled_birth
        )
    )

    # C-section utilization is evaluated separately because higher is not
    # inherently better. These are planning heuristics, not clinical standards.
    csection_access_flag = (
        F.when(csection.isNull(), F.lit("Unknown"))
        .when(csection < 10, F.lit("Potentially Limited Access"))
        .when(csection < 15, F.lit("Monitor Access"))
        .when(csection <= 20, F.lit("Expected Range"))
        .otherwise(F.lit("Elevated Utilization"))
    )

    # Maternal risk combines overall maternity utilization with the gap between
    # institutional delivery and skilled attendance. A low C-section rate is
    # used only as a potential access signal.
    maternal_risk = (
        F.when(
            maternal_access_score.isNull(),
            F.lit("Unknown")
        )
        .when(
            (maternal_access_score < 70)
            | (skilled_attendance_gap > 15)
            | (csection < 10),
            F.lit("High Risk")
        )
        .when(
            (maternal_access_score < 85)
            | (skilled_attendance_gap > 5)
            | (csection < 15),
            F.lit("Medium Risk")
        )
        .otherwise(F.lit("Low Risk"))
    )

    cancer_score = (
        F.when(
            F.col(
                "women_age_30_49_years_ever_undergone_a_cervical_screen_pct"
            ).isNotNull()
            & F.col(
                "women_age_30_49_years_ever_undergone_a_breast_exam_pct"
            ).isNotNull()
            & F.col(
                "women_age_30_49_years_ever_undergone_an_oral_cancer_exam_pct"
            ).isNotNull(),
            (
                F.col(
                    "women_age_30_49_years_ever_undergone_a_cervical_screen_pct"
                )
                + F.col(
                    "women_age_30_49_years_ever_undergone_a_breast_exam_pct"
                )
                + F.col(
                    "women_age_30_49_years_ever_undergone_an_oral_cancer_exam_pct"
                )
            ) / 3.0
        )
    )

    diabetes_value = F.col(
        "w15_plus_with_high_or_very_high_gt_140_mg_dl_blood_sugar_or_pct"
    )

    diabetes_risk = (
        F.when(diabetes_value.isNull(), F.lit("Unknown"))
        .when(diabetes_value > 15, F.lit("High Risk"))
        .when(diabetes_value > 10, F.lit("Medium Risk"))
        .otherwise(F.lit("Low Risk"))
    )

    hypertension_value = F.col(
        "w15_plus_with_high_bp_sys_gte_140_mmhg_and_or_dia_gte_90_mm_pct"
    )

    hypertension_risk = (
        F.when(hypertension_value.isNull(), F.lit("Unknown"))
        .when(hypertension_value > 20, F.lit("High Risk"))
        .when(hypertension_value > 15, F.lit("Medium Risk"))
        .otherwise(F.lit("Low Risk"))
    )

    nutrition_value = F.col(
        "women_age_15_49_years_whose_bmi_bmi_is_underweight_bmi_lt_1_pct"
    )

    nutrition_risk = (
        F.when(nutrition_value.isNull(), F.lit("Unknown"))
        .when(nutrition_value > 25, F.lit("High Risk"))
        .when(nutrition_value > 20, F.lit("Medium Risk"))
        .otherwise(F.lit("Low Risk"))
    )

    cancer_risk = (
        F.when(cancer_score.isNull(), F.lit("Unknown"))
        .when(cancer_score < 30, F.lit("High Risk"))
        .when(cancer_score < 50, F.lit("Medium Risk"))
        .otherwise(F.lit("Low Risk"))
    )

    risk_values = F.array(
        maternal_risk,
        diabetes_risk,
        hypertension_risk,
        nutrition_risk,
        cancer_risk
    )

    overall_risk = (
        F.when(
            F.array_contains(risk_values, "High Risk"),
            F.lit("High Risk")
        )
        .when(
            F.array_contains(risk_values, "Medium Risk"),
            F.lit("Medium Risk")
        )
        .when(
            F.array_contains(risk_values, "Unknown"),
            F.lit("Unknown")
        )
        .otherwise(F.lit("Low Risk"))
    )

    return df.select(
        "district_name",
        "state_ut",
        "households_surveyed",
        "women_15_49_interviewed",

        institutional_birth.alias(
            "maternal_neonatal_institutional_birth_pct"
        ),
        csection.alias("maternal_neonatal_csection_pct"),
        F.col(
            "mothers_who_had_at_least_4_anc_visits_lb5y_pct"
        ).alias("maternal_neonatal_anc_visits_pct"),
        skilled_birth.alias("maternal_neonatal_skilled_birth_pct"),
        maternal_access_score.alias("maternal_neonatal_access_score"),
        skilled_attendance_gap.alias(
            "maternal_neonatal_skilled_attendance_gap"
        ),
        csection_access_flag.alias(
            "maternal_neonatal_csection_access_flag"
        ),
        maternal_risk.alias("maternal_neonatal_risk"),

        diabetes_value.alias("diabetes_care_high_blood_sugar_pct"),
        diabetes_risk.alias("diabetes_care_risk"),

        hypertension_value.alias("hypertension_care_high_bp_pct"),
        hypertension_risk.alias("hypertension_care_risk"),

        nutrition_value.alias("nutrition_services_underweight_pct"),
        nutrition_risk.alias("nutrition_services_risk"),

        F.col(
            "women_age_30_49_years_ever_undergone_a_cervical_screen_pct"
        ).alias("cancer_screening_cervical_pct"),
        F.col(
            "women_age_30_49_years_ever_undergone_a_breast_exam_pct"
        ).alias("cancer_screening_breast_pct"),
        F.col(
            "women_age_30_49_years_ever_undergone_an_oral_cancer_exam_pct"
        ).alias("cancer_screening_oral_pct"),
        cancer_score.alias("cancer_screening_score"),
        cancer_risk.alias("cancer_screening_risk"),

        overall_risk.alias("overall_care_desert_risk")
    )