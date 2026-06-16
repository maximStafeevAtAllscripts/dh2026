# Care Desert Indicators — Population Risk Calculation Guide

This pipeline uses NFHS-5 district-level survey data to identify population health risks across India.

The indicators represent disease burden, maternal service utilization, nutrition status, and cancer-screening utilization. They do not directly measure facility capability, staffing, equipment, capacity, or geographic access.

These outputs should be combined with facility capability and location data to determine whether a district may be underserved.

## Output Table

The pipeline creates the following materialized view:

```text
workspace.default.care_desert_indicators
```

| Column                                      | Description                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `district_name`                             | District name                                                                              |
| `state_ut`                                  | State or union territory                                                                   |
| `households_surveyed`                       | Number of households included in the NFHS-5 survey                                         |
| `women_15_49_interviewed`                   | Number of women aged 15–49 interviewed                                                     |
| `maternal_neonatal_institutional_birth_pct` | Percentage of births occurring in a medical institution                                    |
| `maternal_neonatal_csection_pct`            | Percentage of births delivered by C-section                                                |
| `maternal_neonatal_anc_visits_pct`          | Percentage of mothers receiving at least four antenatal visits                             |
| `maternal_neonatal_skilled_birth_pct`       | Percentage of births attended by skilled health personnel                                  |
| `maternal_neonatal_access_score`            | Average of institutional birth and skilled birth attendance percentages                    |
| `maternal_neonatal_skilled_attendance_gap`  | Institutional birth percentage minus skilled birth attendance percentage                   |
| `maternal_neonatal_csection_access_flag`    | Contextual classification of C-section utilization                                         |
| `maternal_neonatal_risk`                    | Maternal and neonatal population-risk classification                                       |
| `diabetes_care_high_blood_sugar_pct`        | Percentage of women aged 15+ with elevated blood sugar or using diabetes medication        |
| `diabetes_care_risk`                        | Diabetes population-risk classification                                                    |
| `hypertension_care_high_bp_pct`             | Percentage of women aged 15+ with elevated blood pressure or using hypertension medication |
| `hypertension_care_risk`                    | Hypertension population-risk classification                                                |
| `nutrition_services_underweight_pct`        | Percentage of women aged 15–49 with BMI below 18.5                                         |
| `nutrition_services_risk`                   | Nutrition population-risk classification                                                   |
| `cancer_screening_cervical_pct`             | Percentage of women aged 30–49 reporting cervical cancer screening                         |
| `cancer_screening_breast_pct`               | Percentage of women aged 30–49 reporting a breast examination                              |
| `cancer_screening_oral_pct`                 | Percentage of women aged 30–49 reporting an oral cancer examination                        |
| `cancer_screening_score`                    | Average of cervical, breast, and oral cancer screening percentages                         |
| `cancer_screening_risk`                     | Cancer-screening utilization risk                                                          |
| `overall_care_desert_risk`                  | Highest-severity result across the five risk categories                                    |

## Risk Calculations

| Risk category              | Calculation                                                                                                                                           | High Risk                                                                                   | Medium Risk                                                             | Low Risk                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `maternal_neonatal_risk`   | Average of institutional birth percentage and skilled birth attendance percentage, combined with the skilled-attendance gap and C-section access flag | Access score below 70%, skilled-attendance gap above 15 points, or C-section rate below 10% | Access score below 85%, gap above 5 points, or C-section rate below 15% | Access score at least 85%, gap no greater than 5 points, and C-section rate at least 15% |
| `diabetes_care_risk`       | Uses elevated blood sugar or diabetes medication prevalence directly                                                                                  | Above 15%                                                                                   | Above 10% through 15%                                                   | 10% or below                                                                             |
| `hypertension_care_risk`   | Uses elevated blood pressure or hypertension medication prevalence directly                                                                           | Above 20%                                                                                   | Above 15% through 20%                                                   | 15% or below                                                                             |
| `nutrition_services_risk`  | Uses underweight prevalence directly                                                                                                                  | Above 25%                                                                                   | Above 20% through 25%                                                   | 20% or below                                                                             |
| `cancer_screening_risk`    | Average of cervical, breast, and oral screening percentages                                                                                           | Below 30%                                                                                   | 30% through below 50%                                                   | 50% or higher                                                                            |
| `overall_care_desert_risk` | Uses the most severe category-level result                                                                                                            | At least one category is High Risk                                                          | No High Risk category and at least one Medium Risk category             | All categories are Low Risk                                                              |

Missing source values produce an `Unknown` classification rather than being treated as Low Risk.

## Maternal and Neonatal Calculation

The maternal score no longer averages the C-section rate with institutional births and skilled attendance.

Institutional birth and skilled birth attendance are both utilization measures where higher values generally indicate stronger access to formal maternity care.

```text
maternal_neonatal_access_score =
    (institutional_birth_pct + skilled_birth_pct) / 2
```

The pipeline also calculates the difference between institutional delivery and skilled attendance:

```text
maternal_neonatal_skilled_attendance_gap =
    institutional_birth_pct - skilled_birth_pct
```

A large positive gap may indicate that women are reaching institutions but are not consistently receiving skilled birth attendance.

The C-section rate is evaluated separately because a higher rate is not automatically better.

| C-section rate   | Flag                         |
| ---------------- | ---------------------------- |
| Missing          | `Unknown`                    |
| Below 10%        | `Potentially Limited Access` |
| 10% to below 15% | `Monitor Access`             |
| 15% to 20%       | `Expected Range`             |
| Above 20%        | `Elevated Utilization`       |

These thresholds are planning heuristics and should not be interpreted as clinical standards.

## Interpretation

The table identifies districts with elevated population burden or low service-utilization signals.

It does not establish that a district lacks capable facilities.

A fuller care-desert assessment should combine:

| Component                | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| Population risk          | Identifies where demand or burden may be elevated                 |
| Facility capability      | Identifies which services nearby facilities can support           |
| Geographic access        | Measures distance or travel time to capable facilities            |
| Facility data confidence | Measures whether facility information is complete enough to trust |
| Population affected      | Estimates the number of people potentially underserved            |

## Example Query

```sql
SELECT
  state_ut,
  district_name,
  maternal_neonatal_access_score,
  maternal_neonatal_skilled_attendance_gap,
  maternal_neonatal_csection_access_flag,
  maternal_neonatal_risk,
  diabetes_care_risk,
  hypertension_care_risk,
  nutrition_services_risk,
  cancer_screening_risk,
  overall_care_desert_risk
FROM workspace.default.care_desert_indicators
WHERE overall_care_desert_risk IN ('High Risk', 'Medium Risk')
ORDER BY
  CASE overall_care_desert_risk
    WHEN 'High Risk' THEN 1
    WHEN 'Medium Risk' THEN 2
    ELSE 3
  END,
  state_ut,
  district_name;
```

## Data Source

National Family Health Survey-5, 2019–2021
Ministry of Health and Family Welfare, Government of India

The current selected indicators primarily represent maternal populations and women in specific age groups. The broader NFHS-5 dataset also contains indicators for men, children, and households.
