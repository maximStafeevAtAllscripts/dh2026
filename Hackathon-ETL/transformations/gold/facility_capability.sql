-- Facility Capability Assessment
-- Evaluates each facility's capability across five health service categories:
-- maternal/neonatal care, diabetes care, hypertension care, nutrition services, and cancer screening

CREATE OR REFRESH MATERIALIZED VIEW facility_capability
COMMENT "Detailed assessment of facility capabilities across health service categories with location data for joins"
AS

WITH facility_input AS (
  SELECT
    unique_id,
    name,
    address_city,
    address_stateOrRegion,
    latitude,
    longitude,
    description,
    specialties,
    equipment,
    procedure,
    capability,

    CONCAT(
      'Assess this medical facility using only the documented information provided. ',
      'Determine its ability to address each population health risk category. ',

      '\n\nRules:',
      '\n- Evaluate documented capability, not clinical quality or outcomes.',
      '\n- Do not invent staff, services, equipment, procedures, or capacity.',
      '\n- Use unknown when evidence is insufficient.',
      '\n- Use limited when the facility appears able to provide basic screening, routine care, stabilization, or referral support.',
      '\n- Use capable only when multiple fields consistently support meaningful diagnostic or treatment capability.',
      '\n- Use not_capable only when the data explicitly indicates the service cannot be provided.',
      '\n- Keep evidence concise and grounded in the supplied fields.',

      '\n\nAllowed capability values: capable, limited, not_capable, unknown.',
      '\nAllowed confidence values: high, medium, low.',

      '\n\nCategories:',
      '\n- maternal_neonatal_care: antenatal care, delivery, emergency obstetrics, C-section, neonatal stabilization, and newborn care.',
      '\n- diabetes_care: glucose testing, diagnosis, medication management, monitoring, and complication management.',
      '\n- hypertension_care: blood-pressure screening, diagnosis, medication management, monitoring, and complication management.',
      '\n- nutrition_services: malnutrition screening, BMI or growth assessment, anemia services, counseling, supplementation, and referral.',
      '\n- cancer_screening: cervical, breast, and oral cancer screening, pathology access, and diagnostic referral.',

      '\n\nAlso rate overall data confidence based on completeness, specificity, and internal consistency.',

      '\n\nFacility name: ', COALESCE(name, 'unknown'),
      '\nDescription: ', COALESCE(description, 'none'),
      '\nSpecialties: ', COALESCE(specialties, 'none'),
      '\nEquipment: ', COALESCE(equipment, 'none'),
      '\nProcedures: ', COALESCE(procedure, 'none'),
      '\nCapabilities: ', COALESCE(capability, 'none')
    ) AS assessment_prompt

  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
),

facility_assessment AS (
  SELECT
    unique_id,
    name,
    address_city,
    address_stateOrRegion,
    latitude,
    longitude,
    description,
    specialties,
    equipment,
    procedure,
    capability,

    ai_query(
      'gpt55',
      assessment_prompt,

      responseFormat => '{
        "type": "json_schema",
        "json_schema": {
          "name": "facility_capability_assessment",
          "schema": {
            "type": "object",
            "properties": {
              "data_confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"]
              },
              "data_confidence_reason": {
                "type": "string"
              },
              "maternal_neonatal_care": {
                "type": "object",
                "properties": {
                  "capability": {
                    "type": "string",
                    "enum": ["capable", "limited", "not_capable", "unknown"]
                  },
                  "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"]
                  },
                  "evidence": {
                    "type": "array",
                    "items": {"type": "string"}
                  },
                  "limitation": {
                    "type": "string"
                  }
                },
                "required": ["capability", "confidence", "evidence", "limitation"],
                "additionalProperties": false
              },
              "diabetes_care": {
                "type": "object",
                "properties": {
                  "capability": {
                    "type": "string",
                    "enum": ["capable", "limited", "not_capable", "unknown"]
                  },
                  "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"]
                  },
                  "evidence": {
                    "type": "array",
                    "items": {"type": "string"}
                  },
                  "limitation": {
                    "type": "string"
                  }
                },
                "required": ["capability", "confidence", "evidence", "limitation"],
                "additionalProperties": false
              },
              "hypertension_care": {
                "type": "object",
                "properties": {
                  "capability": {
                    "type": "string",
                    "enum": ["capable", "limited", "not_capable", "unknown"]
                  },
                  "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"]
                  },
                  "evidence": {
                    "type": "array",
                    "items": {"type": "string"}
                  },
                  "limitation": {
                    "type": "string"
                  }
                },
                "required": ["capability", "confidence", "evidence", "limitation"],
                "additionalProperties": false
              },
              "nutrition_services": {
                "type": "object",
                "properties": {
                  "capability": {
                    "type": "string",
                    "enum": ["capable", "limited", "not_capable", "unknown"]
                  },
                  "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"]
                  },
                  "evidence": {
                    "type": "array",
                    "items": {"type": "string"}
                  },
                  "limitation": {
                    "type": "string"
                  }
                },
                "required": ["capability", "confidence", "evidence", "limitation"],
                "additionalProperties": false
              },
              "cancer_screening": {
                "type": "object",
                "properties": {
                  "capability": {
                    "type": "string",
                    "enum": ["capable", "limited", "not_capable", "unknown"]
                  },
                  "confidence": {
                    "type": "string",
                    "enum": ["high", "medium", "low"]
                  },
                  "evidence": {
                    "type": "array",
                    "items": {"type": "string"}
                  },
                  "limitation": {
                    "type": "string"
                  }
                },
                "required": ["capability", "confidence", "evidence", "limitation"],
                "additionalProperties": false
              }
            },
            "required": [
              "data_confidence",
              "data_confidence_reason",
              "maternal_neonatal_care",
              "diabetes_care",
              "hypertension_care",
              "nutrition_services",
              "cancer_screening"
            ],
            "additionalProperties": false
          },
          "strict": true
        }
      }'
    ) AS assessment

  FROM facility_input
)

SELECT
  unique_id,
  name,
  address_city,
  address_stateOrRegion,
  latitude,
  longitude,
  description,
  specialties,
  equipment,
  procedure,
  capability,
  
  -- Overall data confidence
  assessment:data_confidence::string AS data_confidence,
  assessment:data_confidence_reason::string AS data_confidence_reason,
  
  -- Maternal/Neonatal Care
  assessment:maternal_neonatal_care.capability::string AS maternal_neonatal_capability,
  assessment:maternal_neonatal_care.confidence::string AS maternal_neonatal_confidence,
  array_join(from_json(assessment:maternal_neonatal_care.evidence::string, 'array<string>'), '; ') AS maternal_neonatal_evidence,
  assessment:maternal_neonatal_care.limitation::string AS maternal_neonatal_limitation,
  
  -- Diabetes Care
  assessment:diabetes_care.capability::string AS diabetes_capability,
  assessment:diabetes_care.confidence::string AS diabetes_confidence,
  array_join(from_json(assessment:diabetes_care.evidence::string, 'array<string>'), '; ') AS diabetes_evidence,
  assessment:diabetes_care.limitation::string AS diabetes_limitation,
  
  -- Hypertension Care
  assessment:hypertension_care.capability::string AS hypertension_capability,
  assessment:hypertension_care.confidence::string AS hypertension_confidence,
  array_join(from_json(assessment:hypertension_care.evidence::string, 'array<string>'), '; ') AS hypertension_evidence,
  assessment:hypertension_care.limitation::string AS hypertension_limitation,
  
  -- Nutrition Services
  assessment:nutrition_services.capability::string AS nutrition_capability,
  assessment:nutrition_services.confidence::string AS nutrition_confidence,
  array_join(from_json(assessment:nutrition_services.evidence::string, 'array<string>'), '; ') AS nutrition_evidence,
  assessment:nutrition_services.limitation::string AS nutrition_limitation,
  
  -- Cancer Screening
  assessment:cancer_screening.capability::string AS cancer_screening_capability,
  assessment:cancer_screening.confidence::string AS cancer_screening_confidence,
  array_join(from_json(assessment:cancer_screening.evidence::string, 'array<string>'), '; ') AS cancer_screening_evidence,
  assessment:cancer_screening.limitation::string AS cancer_screening_limitation

FROM facility_assessment;
